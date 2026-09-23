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


  const agentEmoji = {
    orchestrator: '👔',
    researcher: '🕵️',
    strategist: '🧠',
    copywriter: '✍️',
    reviewer: '👷',
    'distribution-manager': '🌍',
    visual: '🎨',
    analytics: '📊',
    'router-parser': '🧩',
  };

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function crewHeaders() {
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-telegram-init-data': window.Telegram?.WebApp?.initData || '',
    };
  }

  async function crewApi(path, { method = 'GET', body } = {}) {
    const response = await fetch(`/api/hyper-crew${path}`, {
      method,
      headers: crewHeaders(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || payload?.error || `Hyper Crew request failed (${response.status})`);
    return payload;
  }

  function renderAgentRow(agent) {
    const aliases = (agent.aliases || []).slice(0, 3).join(' · ');
    const title = agent.title || agent.role || agent.id;
    return `<button class="crew-agent-row" data-agent-id="${esc(agent.id)}">
      <span class="crew-agent-row__emoji">${agentEmoji[agent.id] || '🤖'}</span>
      <span class="crew-agent-row__body">
        <strong>${esc(agent.name || agent.id)}</strong>
        <span>${esc(title)}</span>
        <small>${esc(agent.mention || '')}${aliases ? ` · ${esc(aliases)}` : ''}</small>
      </span>
      <span class="crew-agent-row__status ${agent.enabled === false ? 'is-off' : ''}">${agent.enabled === false ? 'Off' : 'Active'}</span>
      <span class="quick-action__arrow">›</span>
    </button>`;
  }

  function renderAgentList(root, agents) {
    const core = agents.filter(agent => agent.wave !== 'next');
    const next = agents.filter(agent => agent.wave === 'next');
    root.innerHTML = `
      <div class="crew-agent-head">
        <div><h3>Manage Agents</h3><p>Names, jobs and Russian/English call signs.</p></div>
        <button class="crew-agent-close" data-agent-close aria-label="Close">×</button>
      </div>
      <div class="crew-agent-section"><span class="crew-agent-section__label">CORE CREW</span>${core.map(renderAgentRow).join('')}</div>
      ${next.length ? `<div class="crew-agent-section"><span class="crew-agent-section__label">NEXT WAVE</span>${next.map(renderAgentRow).join('')}</div>` : ''}
      <p class="crew-agent-note">System IDs stay fixed. You can rename the people and their call signs without breaking the workflow.</p>`;
  }

  function renderAgentEditor(root, agent, onBack) {
    const aliases = (agent.aliases || []).join(', ');
    root.innerHTML = `
      <div class="crew-agent-head">
        <button class="crew-agent-back" data-agent-back>‹ Agents</button>
        <button class="crew-agent-close" data-agent-close aria-label="Close">×</button>
      </div>
      <div class="crew-agent-profile">
        <div class="crew-agent-profile__avatar">${agentEmoji[agent.id] || '🤖'}</div>
        <div><h3>${esc(agent.name || agent.id)}</h3><p>${esc(agent.role || agent.title || agent.id)} · ${esc(agent.id)}</p></div>
      </div>
      <form class="crew-agent-form" data-agent-form>
        <label>Name<input name="name" maxlength="80" value="${esc(agent.name || '')}" required></label>
        <label>Job title<input name="title" maxlength="80" value="${esc(agent.title || agent.role || '')}" required></label>
        <label>What this agent does<textarea name="description" maxlength="500" rows="3">${esc(agent.description || '')}</textarea></label>
        <label>Call signs / aliases<textarea name="aliases" rows="4" placeholder="юки, yuki, юки пиксель">${esc(aliases)}</textarea></label>
        <small>Examples: «юки сделай обложку», «Серёга перепиши», «Кевин собери команду».</small>
        <label class="crew-agent-toggle"><input type="checkbox" name="enabled" ${agent.enabled === false ? '' : 'checked'}><span>Agent enabled</span></label>
        <div class="crew-agent-message" data-agent-message></div>
        <button class="sheet__close crew-agent-save" type="submit">Save agent</button>
      </form>`;

    root.querySelector('[data-agent-back]').addEventListener('click', onBack);
    root.querySelector('[data-agent-form]').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('.crew-agent-save');
      const message = form.querySelector('[data-agent-message]');
      button.disabled = true;
      message.textContent = 'Saving…';
      try {
        const values = new FormData(form);
        const payload = {
          name: String(values.get('name') || '').trim(),
          title: String(values.get('title') || '').trim(),
          description: String(values.get('description') || '').trim(),
          aliases: String(values.get('aliases') || '').split(/[,\n]/).map(item => item.trim()).filter(Boolean),
          enabled: form.elements.enabled.checked,
        };
        const result = await crewApi(`/agents/${encodeURIComponent(agent.id)}`, { method: 'PATCH', body: payload });
        message.textContent = 'Saved ✓';
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
        setTimeout(() => onBack(result.agent), 350);
      } catch (error) {
        message.textContent = error.message;
        message.classList.add('is-error');
        button.disabled = false;
      }
    });
  }

  async function openManageAgents() {
    document.querySelector('.sheet-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML = `<section class="sheet crew-agents-sheet" role="dialog" aria-modal="true" aria-label="Manage Agents">
      <div class="sheet__handle"></div>
      <div class="crew-agent-loading">Loading crew…</div>
    </section>`;
    document.body.appendChild(backdrop);
    const root = backdrop.querySelector('.crew-agents-sheet');
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });

    async function loadList() {
      root.innerHTML = '<div class="sheet__handle"></div><div class="crew-agent-loading">Loading crew…</div>';
      try {
        const payload = await crewApi('/agents');
        renderAgentList(root, payload.agents || []);
        root.querySelector('[data-agent-close]').addEventListener('click', close);
        root.querySelectorAll('[data-agent-id]').forEach(button => {
          button.addEventListener('click', () => {
            const agent = (payload.agents || []).find(item => item.id === button.dataset.agentId);
            if (!agent) return;
            renderAgentEditor(root, agent, loadList);
            root.querySelector('[data-agent-close]').addEventListener('click', close);
          });
        });
      } catch (error) {
        root.innerHTML = `<div class="sheet__handle"></div><div class="crew-agent-head"><div><h3>Manage Agents</h3><p class="crew-agent-error">${esc(error.message)}</p></div><button class="crew-agent-close" data-agent-close>×</button></div>`;
        root.querySelector('[data-agent-close]').addEventListener('click', close);
      }
    }

    await loadList();
  }


  const CREW_CHAT_STORAGE_KEY = 'astel.crew-chat.v1';

  function loadCrewChatHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(CREW_CHAT_STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.slice(-40) : [];
    } catch (_error) {
      return [];
    }
  }

  function saveCrewChatHistory(history) {
    const persistable = history.slice(-40).map(item => ({
      role: item.role,
      text: item.text,
      agentId: item.agentId || null,
      agentName: item.agentName || null,
      agentTitle: item.agentTitle || null,
    }));
    localStorage.setItem(CREW_CHAT_STORAGE_KEY, JSON.stringify(persistable));
  }

  function renderCrewArtifacts(artifacts) {
    return (Array.isArray(artifacts) ? artifacts : [])
      .filter(artifact => artifact?.type === 'image' && /^data:image\/(png|jpeg|webp);base64,/.test(String(artifact.dataUrl || '')))
      .map(artifact => `<div class="crew-chat-artifact">
        <img src="${artifact.dataUrl}" alt="Generated visual by Yuki Pixel">
        <span>Generated visual · ${esc(artifact.model || 'image model')}</span>
      </div>`)
      .join('');
  }

  function crewChatMessage(item) {
    if (item.role === 'user') {
      return `<div class="crew-chat-message is-user"><div class="crew-chat-bubble">${esc(item.text)}</div></div>`;
    }
    const agentId = item.agentId || 'orchestrator';
    const name = item.agentName || 'Kevin CEO';
    const title = item.agentTitle || 'Orchestrator';
    const artifacts = renderCrewArtifacts(item.artifacts);
    return `<div class="crew-chat-message is-agent">
      <div class="crew-chat-agent">${agentEmoji[agentId] || '🤖'} <strong>${esc(name)}</strong><span>${esc(title)}</span></div>
      <div class="crew-chat-bubble">${esc(item.text).replaceAll('\n','<br>')}${artifacts}</div>
    </div>`;
  }

  function openCrewChat() {
    document.querySelector('.sheet-backdrop')?.remove();
    document.querySelector('.crew-chat-overlay')?.remove();

    const overlay = document.createElement('section');
    overlay.className = 'crew-chat-overlay';
    overlay.setAttribute('aria-label', 'Crew Chat');
    overlay.innerHTML = `
      <header class="crew-chat-header">
        <button class="crew-chat-back" data-chat-back>‹ Crew</button>
        <div><strong>Crew Chat</strong><span>Kevin routes by default · call anyone by name</span></div>
        <button class="crew-chat-clear" data-chat-clear>Clear</button>
      </header>
      <div class="crew-chat-chips">
        <button data-chat-preset="Кевин ">👔 Kevin</button>
        <button data-chat-preset="Томми ">🕵️ Tommy</button>
        <button data-chat-preset="Серёга ">✍️ Sergio</button>
        <button data-chat-preset="Юки ">🎨 Yuki</button>
        <button data-chat-preset="Эдик ">📊 Eddie</button>
      </div>
      <main class="crew-chat-list" data-chat-list></main>
      <form class="crew-chat-composer" data-chat-form>
        <textarea data-chat-input rows="1" maxlength="4000" placeholder="Напиши: «Юки сделай обложку»"></textarea>
        <button type="submit" aria-label="Send">↑</button>
      </form>`;
    document.body.appendChild(overlay);

    const list = overlay.querySelector('[data-chat-list]');
    const input = overlay.querySelector('[data-chat-input]');
    const form = overlay.querySelector('[data-chat-form]');
    let history = loadCrewChatHistory();

    function renderHistory() {
      if (!history.length) {
        list.innerHTML = `<div class="crew-chat-welcome">
          <div class="crew-chat-welcome__avatar">👔</div>
          <strong>Kevin CEO</strong>
          <p>Пиши мне без имени — я отвечу как orchestrator. Или обращайся напрямую: «Юки…», «Томми…», «Серёга…», «Эдик…».</p>
        </div>`;
      } else {
        list.innerHTML = history.map(crewChatMessage).join('');
      }
      list.scrollTop = list.scrollHeight;
    }

    overlay.querySelector('[data-chat-back]').addEventListener('click', () => {
      overlay.remove();
      openCrew();
    });
    overlay.querySelector('[data-chat-clear]').addEventListener('click', () => {
      history = [];
      saveCrewChatHistory(history);
      renderHistory();
    });
    overlay.querySelectorAll('[data-chat-preset]').forEach(button => {
      button.addEventListener('click', () => {
        input.value = button.dataset.chatPreset;
        input.focus();
      });
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      const priorHistory = history.slice(-12).map(item => ({
        role: item.role,
        text: item.text,
        agentId: item.agentId || null,
      }));

      history.push({ role: 'user', text });
      saveCrewChatHistory(history);
      input.value = '';
      renderHistory();

      const pending = document.createElement('div');
      pending.className = 'crew-chat-message is-agent is-pending';
      pending.innerHTML = '<div class="crew-chat-agent">✦ <strong>Hyper Crew</strong><span>thinking…</span></div><div class="crew-chat-bubble">…</div>';
      list.appendChild(pending);
      list.scrollTop = list.scrollHeight;
      form.querySelector('button').disabled = true;
      input.disabled = true;

      try {
        const result = await crewApi('/chat', {
          method: 'POST',
          body: { text, projectId: 'astel-business', history: priorHistory },
        });
        pending.remove();
        history.push({
          role: 'assistant',
          text: result.reply || '',
          agentId: result.target?.id || 'orchestrator',
          agentName: result.target?.name || 'Kevin CEO',
          agentTitle: result.target?.title || 'Orchestrator',
          artifacts: Array.isArray(result.artifacts) ? result.artifacts : [],
        });
        saveCrewChatHistory(history);
        renderHistory();
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
      } catch (error) {
        pending.remove();
        history.push({
          role: 'assistant',
          text: `Ошибка Crew Chat: ${error.message}`,
          agentId: 'orchestrator',
          agentName: 'Kevin CEO',
          agentTitle: 'System',
        });
        saveCrewChatHistory(history);
        renderHistory();
      } finally {
        form.querySelector('button').disabled = false;
        input.disabled = false;
        input.focus();
      }
    });

    renderHistory();
    input.focus();
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
    backdrop.querySelector('[data-crew-chat]').addEventListener('click', openCrewChat);
    backdrop.querySelector('[data-crew-agents]').addEventListener('click', openManageAgents);
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