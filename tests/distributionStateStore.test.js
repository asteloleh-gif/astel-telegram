const test=require('node:test');
const assert=require('node:assert/strict');
const {createDistributionStateStore}=require('../distribution/stateStore');
test('notification state is fail-closed before provisioning and uses atomic conflict handling',async()=>{
 const queries=[];const rows=new Map();const pool={async query(sql,args){queries.push(sql);
  if(sql.startsWith('CREATE'))return {};
  if(sql.startsWith('SELECT'))return {rows:rows.has(args[0])?[{state_value:rows.get(args[0])}]:[]};
  if(sql.startsWith('DELETE'))return {rowCount:rows.delete(args[0])?1:0};
  if(sql.includes('DO NOTHING')&&rows.has(args[0]))return {rowCount:0};
  rows.set(args[0],args[1]);return {rowCount:1};
 }};
 const store=createDistributionStateStore({pool});await assert.rejects(()=>store.get('cursor'),/NOT_READY/);await store.init();
 assert.equal(await store.set('notice','reserved',{NX:true}),'OK');assert.equal(await store.set('notice','reserved',{NX:true}),null);
 await store.set('cursor','8');const restart=createDistributionStateStore({pool});await restart.init();assert.equal(await restart.get('cursor'),'8');
 assert.ok(queries.some(q=>q.includes('ON CONFLICT(state_key) DO NOTHING')));assert.ok(queries.every(q=>!q.includes('DROP')&&!q.includes('TRUNCATE')));
});
test('missing or unavailable PostgreSQL never falls back to volatile state',async()=>{
 const missing=createDistributionStateStore({});assert.equal(missing.isConfigured(),false);await assert.rejects(()=>missing.init(),/NOT_CONFIGURED/);
 const down=createDistributionStateStore({pool:{async query(){throw Error('database unavailable');}}});await assert.rejects(()=>down.init());await assert.rejects(()=>down.get('cursor'),/NOT_READY/);
});
