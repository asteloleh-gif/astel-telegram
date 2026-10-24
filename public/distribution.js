(() => {
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  async function api(path, body) {
    const init = window.Telegram?.WebApp?.initData;
    if (!init) throw Error('Открой Astel из Telegram, чтобы увидеть очередь.');
    const response = await fetch('/api/distribution/' + path, { method: body ? 'POST' : 'GET', headers: {'content-type':'application/json','x-telegram-init-data':init}, ...(body ? {body:JSON.stringify(body)} : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(response.status === 503 ? 'Связь с Hub пока недоступна. Решение не отправлено.' : 'Не удалось выполнить действие. Обнови статус перед повтором.');
    return data;
  }
  function safeUrl(raw) { try {const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';} catch (_) {return '';} }
  function shell() {
    const root = document.querySelector('#app');
    root.innerHTML = '<div class="topbar"><button class="topbar__back" id="distribution-back">‹ Назад</button></div><section class="setup-hero"><h1>Дистрибуция</h1><p>Запасной канал управления Astel</p></section><p id="distribution-message" role="status"></p><section id="distribution-metrics"></section><button class="sheet__close" id="distribution-youtube" hidden>YouTube · Astel Family</button><section id="distribution-content"></section><button class="sheet__close" id="distribution-more" hidden>Загрузить ещё</button>';
    root.querySelector('#distribution-back').onclick = () => window.render();
    return root;
  }
  async function youtube() {
    const root=shell(),message=root.querySelector('#distribution-message'),content=root.querySelector('#distribution-content');
    message.textContent='Загрузка Astel Family…';
    try{
      const account=await api('youtube/account');
      content.innerHTML=`<h2>${esc(account.title)}</h2><p>${esc(account.customUrl)} · Подписчики: ${esc(account.statistics?.subscriberCount)} · Просмотры: ${esc(account.statistics?.viewCount)}</p><p>Подключено чтение канала и аналитики. Публикация через это подключение пока недоступна.</p><label>С даты <input type="date" id="youtube-start"></label><label>По дату <input type="date" id="youtube-end"></label><button class="sheet__close" id="youtube-report">Показать аналитику</button><section id="youtube-report-content"></section><section id="youtube-video-list"></section>`;
      const end=new Date();end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCDate(start.getUTCDate()-27);
      content.querySelector('#youtube-start').value=start.toISOString().slice(0,10);content.querySelector('#youtube-end').value=end.toISOString().slice(0,10);
      const reportButton=content.querySelector('#youtube-report');reportButton.onclick=async()=>{
        reportButton.disabled=true;const target=content.querySelector('#youtube-report-content');target.textContent='Загрузка отчёта…';
        try{const dates=new URLSearchParams({startDate:content.querySelector('#youtube-start').value,endDate:content.querySelector('#youtube-end').value});const report=await api('youtube/analytics?'+dates);target.innerHTML=report.rows.length?'<div style="overflow:auto"><table><thead><tr>'+report.columnHeaders.map(h=>'<th>'+esc(h.name)+'</th>').join('')+'</tr></thead><tbody>'+report.rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'За выбранный период данных пока нет.';}catch(error){target.textContent=error.message;}finally{reportButton.disabled=false;}
      };
      const videos=await api('youtube/videos');content.querySelector('#youtube-video-list').innerHTML=`<h3>Видео: ${esc(videos.count)}</h3>`+videos.items.map(v=>`<p>${/^[A-Za-z0-9_-]{11}$/.test(v.videoId||'')?'<a target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/watch?v='+encodeURIComponent(v.videoId)+'">'+esc(v.title)+'</a>':esc(v.title)} · ${esc(v.privacyStatus)}</p>`).join('');message.textContent='';
    }catch(error){message.textContent=error.message;}
  }
  async function details(id) {
    const root = shell(),message=root.querySelector('#distribution-message');
    message.textContent='Загрузка точной версии…';
    try {
      const plan = await api('plans/'+encodeURIComponent(id));
      const input=plan.input;
      root.querySelector('#distribution-content').innerHTML = `<h2>${esc(input.brandId)} · версия ${esc(input.revision)}</h2><p>Режим: ${esc(input.mode || 'не указан')}</p><p id="distribution-plan-state">Статус: ${esc(plan.state)}</p>`+
        Object.entries(input.variants).map(([key,v])=>`<h3>${esc(key)}</h3><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(v.text)}</pre>`).join('')+
        input.assets.map(a=>{const url=safeUrl(a.url);return `<div>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Открыть медиа</a>`:''}<p style="overflow-wrap:anywhere">${esc(a.kind)} · ${esc(a.revision)}<br>${esc(a.digest)}</p>${url&&a.kind==='image'?`<img src="${esc(url)}" alt="Материал публикации" style="max-width:100%;border-radius:12px">`:''}</div>`;}).join('')+
        input.destinations.map(t=>`<p><strong>${esc(t.platform)} · ${esc(t.accountKey)}</strong><br>Вариант: ${esc(t.variant)}<br>${esc(t.scheduledAt)} · ${esc(t.timezone)}</p>`).join('')+
        plan.deliveries.map(d=>`<p>${esc(d.state)} · ${esc(d.receipt?.platformPostId || 'Platform ID ещё не подтверждён')}${safeUrl(d.receipt?.permalink)?`<br><a href="${esc(safeUrl(d.receipt.permalink))}" target="_blank" rel="noopener noreferrer">Открыть публикацию</a>`:''}</p>`).join('')+
        `<p style="overflow-wrap:anywhere">Версия согласования: ${esc(plan.digest)}</p>`+
        (plan.state==='NEEDS_APPROVAL'?'<button class="sheet__close" id="distribution-approve">Согласовать эту версию</button>':'')+
        '<p>Согласование сохраняет решение. Отправка в Buffer выполняется отдельно.</p>';
      message.textContent='';
      const button=root.querySelector('#distribution-approve');
      if(button)button.onclick=async()=>{
        button.disabled=true;message.textContent='Сохраняем решение…';
        try{const approved=await api('approve',{planId:plan.id,digest:plan.digest});root.querySelector('#distribution-plan-state').textContent='Статус: '+approved.state;message.textContent='Согласование сохранено. Публикация этим действием не запускалась.';button.remove();}
        catch(error){message.textContent=error.message;/* Refresh exact state before another decision. */}
      };
    } catch(error){message.textContent=error.message;}
  }
  async function renderDistribution() {
    const root=shell(),message=root.querySelector('#distribution-message'),content=root.querySelector('#distribution-content'),more=root.querySelector('#distribution-more');
    let cursor=null;
    async function page(){
      more.disabled=true;message.textContent='Загрузка очереди…';
      try{
        const data=await api('inbox'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
        for(const item of data.items){
          const button=document.createElement('button');button.className='quick-action';
          button.innerHTML=`<span><strong>${esc(item.brandId)} · ${esc(item.contentId)}</strong><span>${esc(item.state)} · версия ${esc(item.revision)}</span></span><span>›</span>`;
          button.onclick=()=>details(item.planId);content.appendChild(button);
        }
        cursor=data.nextCursor;more.hidden=!cursor;message.textContent=content.childElementCount?'':'Очередь пуста.';
      }catch(error){message.textContent=error.message;}finally{more.disabled=false;}
    }
    try{const features=await api('features');if(features.youtubeRead){const button=root.querySelector('#distribution-youtube');button.hidden=false;button.onclick=youtube;}}catch(_){}
    more.onclick=page;
    await page();
    try{const metrics=await api('metrics');root.querySelector('#distribution-metrics').textContent=`В очереди: ${metrics.pending} · Ошибки: ${metrics.failed} · Требуют проверки: ${metrics.ambiguous} · Подтверждено: ${metrics.confirmedSuccess}`;}catch(_){}
  }
  window.renderDistribution=renderDistribution;
  if(new URLSearchParams(location.search).get('distribution')==='1')renderDistribution();
})();
