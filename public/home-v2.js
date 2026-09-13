(() => {
  const crewIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M5.6 5.6l2.8 2.8M18.4 5.6l-2.8 2.8"/><circle cx="12" cy="13" r="4"/><path d="M4 20c1.7-2.3 4.3-3.5 8-3.5s6.3 1.2 8 3.5"/></svg>';
  const checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';

  function card(id, title, description, svg, bg, fg, badge='') {
    return `<button class="module-card" data-home-v2="${id}" aria-label="Open ${title}">
      <span class="module-card__icon" style="--icon-bg:${bg};--icon-fg:${fg}">${svg}</span>
      ${badge ? `<span class="module-card__badge">${badge}</span>` : ''}
      <h2>${title}</h2><p>${description}</p><span class="module-card__chevron">›</span>
    </button>`;
  }

  function openCrew() {
    const existing = document.querySelector('.sheet-backdrop');
    if (existing) existing.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML = `<section class="sheet" role="dialog" aria-modal="true" aria-label="Hyper Crew">
      <div class="sheet__handle"></div><h3>Hyper Crew</h3>
      <p>Your AI team workspace. Chat with the crew, manage agents, or inspect active runs.</p>
      <div class="hypercrew-menu">
        <button class="quick-action" data-crew-chat><span><strong>💬 Crew Chat</strong><span>Talk with your AI team</span></span><span class="quick-action__arrow">›</span></button>
        <button class="quick-action" data-crew-agents><span><strong>🤖 Manage Agents</strong><span>Roles, tools & permissions</span></span><span class="quick-action__arrow">›</span></button>
        <button class="quick-action" data-crew-tasks><span><strong>📋 Tasks & Runs</strong><span>Active and completed workflows</span></span><span class="quick-action__arrow">›</span></button>
      </div><button class="sheet__close" style="margin-top:14px">Close</button>
    </section>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.sheet__close').addEventListener('click', close);
    backdrop.querySelector('[data-crew-chat]').addEventListener('click', () => alert('Crew Chat — next implementation step'));
    backdrop.querySelector('[data-crew-agents]').addEventListener('click', () => alert('Manage Agents — next implementation step'));
    backdrop.querySelector('[data-crew-tasks]').addEventListener('click', () => alert('Tasks & Runs — next implementation step'));
  }

  function upgradeHome() {
    const grid = document.querySelector('.module-grid');
    if (!grid || grid.dataset.v2 === '1') return;
    grid.dataset.v2 = '1';

    const current = [...grid.querySelectorAll('.module-card')];
    const byId = Object.fromEntries(current.map(el => [el.dataset.module, el]));
    if (byId.status) {
      byId.status.querySelector('h2').textContent = 'Activity';
      byId.status.querySelector('p').textContent = 'Track tasks, runs and system activity';
    }

    const hyper = document.createElement('div');
    hyper.innerHTML = card('hypercrew','Hyper Crew','Run and manage your AI team',crewIcon,'#eee8ff','#694ce4','NEW');
    const approvals = document.createElement('div');
    approvals.innerHTML = card('approvals','Approvals','Review and approve AI actions',checkIcon,'#e5f8ee','#169b67');

    grid.innerHTML = '';
    ['skills','leads','research','think'].forEach(id => byId[id] && grid.appendChild(byId[id]));
    grid.appendChild(hyper.firstElementChild);
    grid.appendChild(approvals.firstElementChild);
    byId.status && grid.appendChild(byId.status);
    byId.settings && grid.appendChild(byId.settings);

    grid.querySelector('[data-home-v2="hypercrew"]')?.addEventListener('click', openCrew);
    grid.querySelector('[data-home-v2="approvals"]')?.addEventListener('click', () => alert('Approvals — existing approval flow will be connected here'));

    const nav = document.querySelector('.bottom-nav');
    if (nav) nav.innerHTML = `
      <button class="nav-item is-active" data-nav-v2="home"><b>⌂</b>Home</button>
      <button class="nav-item" data-nav-v2="research"><b>⌕</b>Research</button>
      <button class="nav-item" data-nav-v2="crew"><b>✦</b>Crew</button>
      <button class="nav-item" data-nav-v2="activity"><b>▥</b>Activity</button>`;
    nav?.querySelector('[data-nav-v2="crew"]')?.addEventListener('click', openCrew);
    nav?.querySelector('[data-nav-v2="research"]')?.addEventListener('click', () => byId.research?.click());
    nav?.querySelector('[data-nav-v2="activity"]')?.addEventListener('click', () => byId.status?.click());
  }

  const observer = new MutationObserver(() => upgradeHome());
  observer.observe(document.querySelector('#app'), {childList:true, subtree:false});
  upgradeHome();
})();