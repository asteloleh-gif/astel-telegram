(() => {
  const tg = window.Telegram?.WebApp;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function requestHeaders() {
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-telegram-init-data': tg?.initData || '',
    };
  }

  async function apiRequest(path, body) {
    if (!tg?.initData) throw new Error('Open Astel from the Telegram bot to use Telegram Research.');
    const response = await fetch(path, {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
    return payload;
  }

  function searchTelegram({ query, periodHours, limit = 20 }) {
    return apiRequest('/api/telegram-research/search', { query, periodHours, limit });
  }

  function aiSearchTelegram({ goal, languages, periodHours = 168, limit = 30, preview = false }) {
    return apiRequest('/api/telegram-research/ai-search', { goal, languages, periodHours, limit, preview });
  }

  function formatDate(value) {
    if (!value) return 'Unknown date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function resultCard(item, index) {
    const title = item.chatTitle || (item.chatUsername ? `@${item.chatUsername}` : 'Telegram');
    const meta = `${formatDate(item.date)}${item.chatUsername ? ` · @${item.chatUsername}` : ''}`;
    const link = item.url
      ? `<button type="button" class="setup-secondary" style="width:auto;margin:10px 8px 0 0;padding:8px 12px;" data-result-link="${escapeHtml(item.url)}">Open message</button>`
      : '';
    const matches = Array.isArray(item.matchedQueries) && item.matchedQueries.length
      ? `<small style="display:block;margin-top:8px;opacity:.68;">Matched: ${escapeHtml(item.matchedQueries.slice(0, 3).join(' · '))}</small>`
      : '';

    return `
      <article class="setup-card" style="margin-top:12px;">
        <strong style="display:block;margin-bottom:4px;">${escapeHtml(title)}</strong>
        <small style="display:block;margin-bottom:10px;">${escapeHtml(meta)}</small>
        <p id="telegram-result-${index}" data-collapsed="true" style="white-space:pre-wrap;margin:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;">${escapeHtml(item.text || '')}</p>
        ${matches}
        <div>
          ${link}
          <button type="button" class="setup-secondary" style="width:auto;margin:10px 0 0;padding:8px 12px;" data-expand-result="telegram-result-${index}">Show more</button>
        </div>
      </article>`;
  }

  function bindResultActions(root) {
    root.querySelectorAll('[data-result-link]').forEach((button) => {
      button.addEventListener('click', () => {
        const url = button.dataset.resultLink;
        if (!url) return;
        if (tg?.openLink) tg.openLink(url);
        else window.open(url, '_blank', 'noopener,noreferrer');
      });
    });

    root.querySelectorAll('[data-expand-result]').forEach((button) => {
      button.addEventListener('click', () => {
        const node = document.querySelector(`#${button.dataset.expandResult}`);
        if (!node) return;
        const collapsed = node.dataset.collapsed === 'true';
        node.dataset.collapsed = collapsed ? 'false' : 'true';
        node.style.display = collapsed ? 'block' : '-webkit-box';
        node.style.webkitLineClamp = collapsed ? 'unset' : '4';
        button.textContent = collapsed ? 'Show less' : 'Show more';
      });
    });
  }

  function renderResults(root, payload) {
    const items = Array.isArray(payload.results) ? payload.results : [];
    if (!items.length) {
      root.innerHTML = '<p class="setup-footnote">No matching messages in this period.</p>';
    } else {
      root.innerHTML = items.map(resultCard).join('');
      bindResultActions(root);
    }

    if (Array.isArray(payload.errors) && payload.errors.length) {
      const errorText = payload.errors.slice(0, 8).map((item) => `${item.source || item.query || 'search'}: ${item.error}`).join(' · ');
      root.insertAdjacentHTML('beforeend', `<p class="setup-footnote">Search notes: ${escapeHtml(errorText)}</p>`);
    }
  }

  function queryChips(queries, { targetInputId = null } = {}) {
    if (!Array.isArray(queries) || !queries.length) return '';
    return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">${queries.map((item) => `
      <button type="button" class="setup-secondary" style="width:auto;margin:0;padding:8px 10px;font-size:12px;" data-query-chip="${escapeHtml(item.query)}" ${targetInputId ? `data-query-target="${escapeHtml(targetInputId)}"` : ''}>
        ${escapeHtml((item.language || '').toUpperCase())} · ${escapeHtml(item.query)}
      </button>`).join('')}</div>`;
  }

  function bindQueryChips(root) {
    root.querySelectorAll('[data-query-chip]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.queryTarget ? document.querySelector(`#${button.dataset.queryTarget}`) : null;
        if (target) {
          target.value = button.dataset.queryChip || '';
          target.focus();
          tg?.HapticFeedback?.impactOccurred?.('light');
        }
      });
    });
  }

  function renderResearchHub() {
    const app = document.querySelector('#app');
    if (!app) return;
    app.innerHTML = `
      <div class="topbar">
        <button class="topbar__back" data-home-search>‹ Home</button>
        <span class="setup-badge">Read only</span>
      </div>
      <section class="setup-hero">
        <span class="setup-hero__icon">⌕</span>
        <h1>Telegram Research</h1>
        <p>Search the Telegram groups and channels saved in Sources. Railway stays under the hood.</p>
      </section>
      <section class="quick-list">
        <button class="quick-action" data-open-telegram-search>
          <span><strong>Search Telegram</strong><span>Manual keywords or multilingual AI Search</span></span>
          <span class="quick-action__arrow">›</span>
        </button>
        <button class="quick-action" data-open-sources-search>
          <span><strong>Sources</strong><span>Add or remove Telegram groups and channels</span></span>
          <span class="quick-action__arrow">›</span>
        </button>
        <button class="quick-action" data-open-account-search>
          <span><strong>Account</strong><span>Research account connection and authorization</span></span>
          <span class="quick-action__arrow">›</span>
        </button>
        <button class="quick-action" data-collector-search-soon>
          <span><strong>Group Collector</strong><span>Source discovery comes next</span></span>
          <span class="quick-action__arrow">›</span>
        </button>
      </section>`;

    app.querySelector('[data-home-search]').addEventListener('click', () => window.render?.());
    app.querySelector('[data-open-telegram-search]').addEventListener('click', renderTelegramSearch);
    app.querySelector('[data-open-sources-search]').addEventListener('click', () => window.renderTelegramSources?.());
    app.querySelector('[data-open-account-search]').addEventListener('click', () => window.renderTelegramSetup?.());
    app.querySelector('[data-collector-search-soon]').addEventListener('click', () => {
      window.showSheet?.('Group Collector', 'Next module: discover and classify Telegram groups, then add selected sources into Research.');
    });
  }

  function languagePicker() {
    const languages = [
      ['auto', 'Auto'], ['uk', 'UA'], ['ru', 'RU'], ['en', 'EN'], ['pl', 'PL'], ['de', 'DE'], ['zh', '中文'],
    ];
    return `<div id="ai-language-picker" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">${languages.map(([code, label]) => `
      <label style="display:flex;align-items:center;gap:6px;border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:7px 10px;font-size:13px;">
        <input type="checkbox" value="${code}" data-ai-language ${code === 'auto' ? 'checked' : ''}> ${label}
      </label>`).join('')}</div>`;
  }

  function selectedLanguages(app) {
    const selected = [...app.querySelectorAll('[data-ai-language]:checked')].map((node) => node.value);
    return selected.length ? selected : ['auto'];
  }

  function bindLanguagePicker(app) {
    app.querySelectorAll('[data-ai-language]').forEach((node) => {
      node.addEventListener('change', () => {
        if (!node.checked) return;
        if (node.value === 'auto') {
          app.querySelectorAll('[data-ai-language]').forEach((other) => { if (other !== node) other.checked = false; });
        } else {
          const auto = app.querySelector('[data-ai-language][value="auto"]');
          if (auto) auto.checked = false;
        }
      });
    });
  }

  function renderManualMode(app) {
    const body = app.querySelector('#telegram-search-body');
    body.innerHTML = `
      <section class="setup-card">
        <div id="telegram-search-message" class="setup-message"></div>
        <form id="telegram-search-form">
          <label for="telegram-search-query">Keyword / phrase</label>
          <input id="telegram-search-query" type="text" autocomplete="off" placeholder="тканина, пошив, looking for supplier..." required>
          <label for="telegram-search-period" style="margin-top:12px;">Period</label>
          <select id="telegram-search-period" class="setup-input" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:transparent;">
            <option value="24">Last 24 hours</option>
            <option value="168" selected>Last 7 days</option>
            <option value="720">Last 30 days</option>
          </select>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            <button type="submit" class="setup-primary" style="flex:1;min-width:150px;margin:0;">Search Telegram</button>
            <button type="button" class="setup-secondary" style="flex:1;min-width:150px;margin:0;" data-suggest-keywords>✨ Suggest keywords</button>
          </div>
        </form>
        <div id="telegram-keyword-suggestions"></div>
      </section>
      <section style="margin-top:16px;">
        <div class="section-head" style="margin-bottom:8px;">
          <h3>Results</h3>
          <span id="telegram-search-count">—</span>
        </div>
        <div id="telegram-search-results"></div>
      </section>`;

    body.querySelector('#telegram-search-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      const message = body.querySelector('#telegram-search-message');
      const results = body.querySelector('#telegram-search-results');
      const count = body.querySelector('#telegram-search-count');
      const query = body.querySelector('#telegram-search-query').value.trim();
      const periodHours = Number(body.querySelector('#telegram-search-period').value || 168);

      button.disabled = true;
      message.className = 'setup-message';
      message.textContent = 'Searching Telegram…';
      results.innerHTML = '';
      count.textContent = '…';
      try {
        const payload = await searchTelegram({ query, periodHours, limit: 20 });
        const items = Array.isArray(payload.results) ? payload.results : [];
        count.textContent = String(payload.count ?? items.length);
        message.className = 'setup-message is-success';
        message.textContent = `Searched ${Array.isArray(payload.sources) ? payload.sources.length : 0} source(s).`;
        renderResults(results, payload);
      } catch (error) {
        count.textContent = '0';
        message.className = 'setup-message is-error';
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });

    body.querySelector('[data-suggest-keywords]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const query = body.querySelector('#telegram-search-query').value.trim();
      const message = body.querySelector('#telegram-search-message');
      const suggestions = body.querySelector('#telegram-keyword-suggestions');
      if (!query) {
        message.className = 'setup-message is-error';
        message.textContent = 'Type a topic first, for example “auto business”.';
        return;
      }
      button.disabled = true;
      message.className = 'setup-message';
      message.textContent = 'AI is building multilingual keywords…';
      suggestions.innerHTML = '';
      try {
        const payload = await aiSearchTelegram({ goal: query, languages: ['auto'], preview: true });
        message.className = 'setup-message is-success';
        message.textContent = `AI suggested ${payload.queries?.length || 0} search phrases.`;
        suggestions.innerHTML = `<small style="display:block;margin-top:12px;">Tap a phrase to use it in Manual Search.</small>${queryChips(payload.queries, { targetInputId: 'telegram-search-query' })}`;
        bindQueryChips(suggestions);
      } catch (error) {
        message.className = 'setup-message is-error';
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  function renderAiMode(app) {
    const body = app.querySelector('#telegram-search-body');
    body.innerHTML = `
      <section class="setup-card">
        <div id="telegram-ai-message" class="setup-message"></div>
        <form id="telegram-ai-form">
          <label for="telegram-ai-goal">Describe what you want to find</label>
          <input id="telegram-ai-goal" type="text" autocomplete="off" placeholder="buyers looking for auto parts from the USA" required>
          <label style="margin-top:12px;">Languages</label>
          ${languagePicker()}
          <small>Auto lets AI choose the most useful languages for the goal.</small>
          <label for="telegram-ai-period" style="margin-top:12px;">Period</label>
          <select id="telegram-ai-period" class="setup-input" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:transparent;">
            <option value="24">Last 24 hours</option>
            <option value="168" selected>Last 7 days</option>
            <option value="720">Last 30 days</option>
          </select>
          <button type="submit" class="setup-primary" style="margin-top:14px;">✨ Generate & Search</button>
        </form>
        <div id="telegram-ai-plan"></div>
      </section>
      <section style="margin-top:16px;">
        <div class="section-head" style="margin-bottom:8px;">
          <h3>AI Results</h3>
          <span id="telegram-ai-count">—</span>
        </div>
        <div id="telegram-ai-results"></div>
      </section>`;

    bindLanguagePicker(body);
    body.querySelector('#telegram-ai-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      const message = body.querySelector('#telegram-ai-message');
      const results = body.querySelector('#telegram-ai-results');
      const count = body.querySelector('#telegram-ai-count');
      const plan = body.querySelector('#telegram-ai-plan');
      const goal = body.querySelector('#telegram-ai-goal').value.trim();
      const periodHours = Number(body.querySelector('#telegram-ai-period').value || 168);
      const languages = selectedLanguages(body);

      button.disabled = true;
      message.className = 'setup-message';
      message.textContent = 'AI is generating multilingual searches and checking Telegram…';
      results.innerHTML = '';
      plan.innerHTML = '';
      count.textContent = '…';
      try {
        const payload = await aiSearchTelegram({ goal, languages, periodHours, limit: 30, preview: false });
        count.textContent = String(payload.count || 0);
        message.className = 'setup-message is-success';
        message.textContent = `AI ran ${payload.queries?.length || 0} searches in ${(payload.languages || []).map((item) => item.toUpperCase()).join(', ')}.`;
        plan.innerHTML = `<small style="display:block;margin-top:12px;">Generated searches</small>${queryChips(payload.queries)}`;
        renderResults(results, payload);
      } catch (error) {
        count.textContent = '0';
        message.className = 'setup-message is-error';
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  function renderTelegramSearch() {
    const app = document.querySelector('#app');
    if (!app) return;
    app.innerHTML = `
      <div class="topbar">
        <button class="topbar__back" data-search-back>‹ Research</button>
        <span class="setup-badge">All Sources</span>
      </div>
      <section class="setup-hero">
        <span class="setup-hero__icon">⌕</span>
        <h1>Search Telegram</h1>
        <p>Use exact keywords or let AI create multilingual searches from a business goal.</p>
      </section>
      <section style="display:flex;gap:8px;margin-bottom:14px;">
        <button type="button" class="setup-primary" style="flex:1;margin:0;" data-search-mode="manual">Manual Search</button>
        <button type="button" class="setup-secondary" style="flex:1;margin:0;" data-search-mode="ai">✨ AI Search</button>
      </section>
      <div id="telegram-search-body"></div>`;

    app.querySelector('[data-search-back]').addEventListener('click', renderResearchHub);
    const manualButton = app.querySelector('[data-search-mode="manual"]');
    const aiButton = app.querySelector('[data-search-mode="ai"]');

    manualButton.addEventListener('click', () => {
      manualButton.className = 'setup-primary';
      aiButton.className = 'setup-secondary';
      Object.assign(manualButton.style, { flex: '1', margin: '0' });
      Object.assign(aiButton.style, { flex: '1', margin: '0' });
      renderManualMode(app);
    });
    aiButton.addEventListener('click', () => {
      aiButton.className = 'setup-primary';
      manualButton.className = 'setup-secondary';
      Object.assign(manualButton.style, { flex: '1', margin: '0' });
      Object.assign(aiButton.style, { flex: '1', margin: '0' });
      renderAiMode(app);
    });

    renderManualMode(app);
  }

  window.renderTelegramResearch = renderResearchHub;
  window.renderTelegramSearch = renderTelegramSearch;
})();
