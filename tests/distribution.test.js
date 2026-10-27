const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const {createDistributionController} = require('../distribution/controller');
const {createDistributionHubClient} = require('../connectors/distributionHubClient');
const {createTelegramWebAppGuard} = require('../setup/telegramWebAppGuard');
const {createFakeRedisClient} = require('./helpers/fakeRedisClient');
const planId='a'.repeat(64),digest='b'.repeat(64);
const env={TELEGRAM_OWNER_ID:'7',TELEGRAM_WEBHOOK_SECRET:'fixture',TELEGRAM_BOT_TOKEN:'fixture-bot-token',PUBLIC_BASE_URL:'https://astel.test'};
function signed(user=7){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:user})});
 const data=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(env.TELEGRAM_BOT_TOKEN).digest();
 p.set('hash',crypto.createHmac('sha256',secret).update(data).digest('hex'));return p.toString();
}
function fixture(options={}){
 const redis=options.redis||createFakeRedisClient(),calls=[],sent=[];
 const plan={id:planId,digest,state:'NEEDS_APPROVAL',input:{destinations:[{scheduledAt:'2035-01-01T00:00:00Z'}]}};
 const client={projectId:'copilot',enabled:()=>true,approvalsEnabled:()=>true,async call(action,args){calls.push([action,args]);
  if(action==='status')return structuredClone(plan);
  if(action==='approve'){plan.state='APPROVED';return structuredClone(plan);}
  if(action==='events')return {events:[{sequence:1,projectId:'copilot',planId,state:'NEEDS_APPROVAL',brandId:'ua',contentId:'prepared',revision:1}].filter(e=>e.sequence>args.after)};
  if(action==='inbox')return {items:[]};if(action==='metrics')return {pending:1,failed:0,ambiguous:0,confirmedSuccess:0};
 },...options.client};
 const telegram={async sendMessage(value){sent.push(value);if(options.lostAck)throw Error('lost acknowledgement');return {message_id:sent.length};}};
 return {redis,calls,sent,plan,client,telegram,controller:createDistributionController({redis,telegram,env,client})};
}
async function server(t,f){const app=express();app.use(express.json());f.controller.mount(app,{webAppGuard:createTelegramWebAppGuard({botToken:env.TELEGRAM_BOT_TOKEN,ownerUserId:'7'})});
 const s=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});t.after(()=>new Promise(resolve=>s.close(resolve)));return `http://127.0.0.1:${s.address().port}`;
}
test('Mini App requires actual signed owner identity; no backend access for strangers',async t=>{
 const f=fixture(),origin=await server(t,f);
 for(const auth of ['',signed(99),'user=7&hash=bad'])assert.equal((await fetch(origin+'/api/distribution/inbox',{headers:{'x-telegram-init-data':auth}})).status,401);
 assert.equal(f.calls.length,0);assert.equal((await fetch(origin+'/api/distribution/inbox',{headers:{'x-telegram-init-data':signed()}})).status,200);
});
test('owner approval binds current digest, rejects replay and never schedules',async t=>{
 const f=fixture(),origin=await server(t,f);
 const approve=d=>fetch(origin+'/api/distribution/approve',{method:'POST',headers:{'content-type':'application/json','x-telegram-init-data':signed()},body:JSON.stringify({planId,digest:d})});
 assert.equal((await approve('c'.repeat(64))).status,409);assert.equal((await approve(digest)).status,200);assert.equal((await approve(digest)).status,409);
 assert.equal(f.calls.filter(([a])=>a==='approve').length,1);assert.ok(!f.calls.some(([a])=>a==='schedule'));
});
test('overdue material is not approved by a stale Telegram card',async t=>{
 const f=fixture();f.plan.input.destinations[0].scheduledAt='2020-01-01T00:00:00Z';const origin=await server(t,f);
 const r=await fetch(origin+'/api/distribution/approve',{method:'POST',headers:{'content-type':'application/json','x-telegram-init-data':signed()},body:JSON.stringify({planId,digest})});assert.equal(r.status,409);assert.ok(!f.calls.some(([a])=>a==='approve'));
});
test('notification cursor and dedupe survive a restarted controller independently of Kevin',async()=>{
 const f=fixture();assert.equal((await f.controller.poll()).checked,1);assert.equal(f.sent.length,1);
 const restart=createDistributionController({redis:f.redis,telegram:f.telegram,env,client:f.client});await restart.poll();assert.equal(f.sent.length,1);assert.equal(await f.redis.get('astel:distribution:v1:copilot:cursor'),'1');
});
test('lost Telegram acknowledgement is recorded and never blindly replayed',async()=>{
 const f=fixture({lostAck:true});await f.controller.poll();await createDistributionController({redis:f.redis,telegram:f.telegram,env,client:f.client}).poll();
 assert.equal(f.sent.length,1);assert.equal(JSON.parse(await f.redis.get('astel:distribution:v1:copilot:notice:1')).status,'unconfirmed');
});
test('Hub outage notifies once; recovery is separate; no provider operations',async()=>{
 let down=true;const f=fixture({client:{async call(){if(down)throw Error('secret upstream');return {events:[]};}}});
 await assert.rejects(()=>f.controller.poll());await assert.rejects(()=>f.controller.poll());assert.equal(f.sent.length,1);assert.ok(!f.sent[0].text.includes('secret'));
 down=false;await f.controller.poll();assert.equal(f.sent.length,2);assert.match(f.sent[1].text,/восстановлена/);
});
test('/distribution is owner-only, deterministic and deduplicated',async()=>{
 const f=fixture();const update=id=>({update_id:10,message:{message_id:1,text:'/distribution',from:{id},chat:{id,type:'private'}}});
 await f.controller.handle(update(99));assert.equal(f.sent.length,0);await f.controller.handle(update(7));await f.controller.handle(update(7));assert.equal(f.sent.length,1);assert.deepEqual(f.calls.map(([a])=>a),['metrics']);
});
test('server client fixes origin/project, separates reader/owner keys and forbids scheduling',async()=>{
 const requests=[];const config={DISTRIBUTION_HUB_ENABLED:'true',DISTRIBUTION_HUB_URL:'https://hub.test',DISTRIBUTION_HUB_READER_TOKEN:'r'.repeat(32),DISTRIBUTION_HUB_OWNER_TOKEN:'o'.repeat(32)};
 const c=createDistributionHubClient({env:config,fetchImpl:async(url,o)=>{requests.push({url,...o});return new Response('{}',{status:200});}});
 await c.call('inbox',{projectId:'foreign'});await c.call('approve',{planId,digest});assert.equal(JSON.parse(requests[0].body).projectId,'copilot');assert.equal(requests[0].headers.authorization,'Bearer '+'r'.repeat(32));assert.equal(requests[1].headers.authorization,'Bearer '+'o'.repeat(32));
 await assert.rejects(()=>c.call('schedule',{}),/ACTION_DENIED/);assert.equal(requests.length,2);
 assert.equal(createDistributionHubClient({env:{...config,DISTRIBUTION_HUB_URL:'https://user:password@hub.test'}}).enabled(),false);
});
test('Redis failure prevents notification sends and decisions are unavailable if connector disabled',async()=>{
 const f=fixture();f.redis.setDown(true);await assert.rejects(()=>f.controller.poll());assert.equal(f.sent.length,0);
 const disabled=createDistributionController({redis:f.redis,telegram:f.telegram,env});assert.equal(disabled.active(),false);assert.equal(disabled.start(),null);
});
test('YouTube panel is flag-gated and signed-owner-only; forwards only scoped reads and valid dates',async t=>{
 const f=fixture({client:{async call(action,args){f.calls.push([action,args]);return action==='youtubeaccount'?{channelId:'family'}:{rows:[]};}}});
 f.controller=createDistributionController({redis:f.redis,telegram:f.telegram,env:{...env,DISTRIBUTION_YOUTUBE_ENABLED:'true'},client:f.client});const origin=await server(t,f);const headers={'x-telegram-init-data':signed()};
 assert.equal((await fetch(origin+'/api/distribution/youtube/account')).status,401);assert.equal(f.calls.length,0);
 assert.equal((await fetch(origin+'/api/distribution/youtube/account',{headers})).status,200);assert.equal(f.calls[0][0],'youtubeaccount');
 for(const query of ['startDate=bad&endDate=2026-10-23','startDate=2026-10-24&endDate=2026-10-23','startDate=2026-13-99&endDate=2026-10-23'])assert.equal((await fetch(origin+'/api/distribution/youtube/analytics?'+query,{headers})).status,400);
 assert.equal(f.calls.length,1);assert.equal((await fetch(origin+'/api/distribution/youtube/analytics?startDate=2026-10-01&endDate=2026-10-23&projectId=foreign',{headers})).status,200);assert.deepEqual(f.calls.at(-1),['youtubeanalytics',{startDate:'2026-10-01',endDate:'2026-10-23'}]);assert.equal((await fetch(origin+'/api/distribution/youtube/upload',{headers})).status,404);
});
test('YouTube disabled flag leaves existing panel operation unchanged and makes no Google/Hub reads',async t=>{const f=fixture(),origin=await server(t,f);const headers={'x-telegram-init-data':signed()};assert.equal((await fetch(origin+'/api/distribution/youtube/account',{headers})).status,404);assert.deepEqual(await (await fetch(origin+'/api/distribution/features',{headers})).json(),{youtubeRead:false,youtubeAsapTeam:false});assert.equal(f.calls.length,0);});
test('YouTube connector read uses reader credential rather than owner approval credential',async()=>{const requests=[];const c=createDistributionHubClient({env:{DISTRIBUTION_HUB_ENABLED:'true',DISTRIBUTION_HUB_URL:'https://hub.test',DISTRIBUTION_HUB_READER_TOKEN:'r'.repeat(32),DISTRIBUTION_HUB_OWNER_TOKEN:'o'.repeat(32)},fetchImpl:async(url,o)=>{requests.push({url,...o});return new Response('{}');}});await c.call('youtubeaccount');assert.equal(requests[0].headers.authorization,'Bearer '+'r'.repeat(32));await assert.rejects(()=>c.call('youtubeupload'),/ACTION_DENIED/);assert.equal(requests.length,1);});

test('ASAP reads are separately gated, whitelist account keys and preserve Family default',async t=>{
 const f=fixture({client:{async call(action,args){f.calls.push([action,args]);return {channelId:args.accountKey||'family'};}}});
 f.controller=createDistributionController({redis:f.redis,telegram:f.telegram,env:{...env,DISTRIBUTION_YOUTUBE_ENABLED:'true',DISTRIBUTION_YOUTUBE_ASAP_TEAM_ENABLED:'true'},client:f.client});
 const origin=await server(t,f),headers={'x-telegram-init-data':signed()};
 assert.equal((await fetch(origin+'/api/distribution/youtube/account?accountKey=asap-team',{headers})).status,200);
 assert.deepEqual(f.calls.at(-1),['youtubeaccount',{accountKey:'asap-team'}]);
 assert.equal((await fetch(origin+'/api/distribution/youtube/account?accountKey=foreign',{headers})).status,400);
 assert.equal(f.calls.length,1);
 assert.equal((await fetch(origin+'/api/distribution/youtube/account',{headers})).status,200);
 assert.deepEqual(f.calls.at(-1),['youtubeaccount',{}]);
});
test('subteam panel is signed-owner-only and uses its fixed project; approvals never schedule or cross to Copilot',async t=>{
 const calls=[];const plan={id:planId,digest,state:'NEEDS_APPROVAL',input:{projectId:'subteam',destinations:[{scheduledAt:'2035-01-01T00:00:00Z'}]}};
 const config={...env,DISTRIBUTION_HUB_ENABLED:'true',DISTRIBUTION_HUB_URL:'https://hub.test',DISTRIBUTION_HUB_READER_TOKEN:'r'.repeat(40),DISTRIBUTION_HUB_OWNER_TOKEN:'o'.repeat(40),DISTRIBUTION_SUBTEAM_ENABLED:'true'};
 const original=globalThis.fetch;globalThis.fetch=async(url,o)=>{if(!String(url).startsWith('https://hub.test'))return original(url,o);const body=JSON.parse(o.body);calls.push({action:String(url).split('/').at(-1),body,authorization:o.headers.authorization});return new Response(JSON.stringify(String(url).endsWith('/status')?plan:String(url).endsWith('/approve')?{...plan,state:'APPROVED'}:{items:[]}));};t.after(()=>{globalThis.fetch=original;});
 const f=fixture();f.controller=createDistributionController({redis:f.redis,telegram:f.telegram,env:config});const origin=await server(t,f),headers={'x-telegram-init-data':signed()};
 assert.equal((await fetch(origin+'/api/distribution/subteam/inbox')).status,401);assert.equal(calls.length,0);
 assert.equal((await fetch(origin+'/api/distribution/subteam/inbox?projectId=foreign',{headers})).status,200);assert.equal(calls[0].body.projectId,'subteam');
 assert.equal((await fetch(origin+'/api/distribution/subteam/approve',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({planId,digest})})).status,200);
 assert.deepEqual(calls.map(c=>c.action),['inbox','status','approve']);assert.ok(calls.every(c=>c.body.projectId==='subteam'));assert.equal(calls.at(-1).authorization,'Bearer '+'o'.repeat(40));
});
