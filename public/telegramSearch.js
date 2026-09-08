(() => {
  const tg = window.Telegram?.WebApp;
  const SETTINGS_KEY = 'astel.telegramResearch.searchSettings.v2';
  const LANGUAGES = [
    { code: 'uk', short: 'UA', label: 'Українська', flag: '🇺🇦' },
    { code: 'ru', short: 'RU', label: 'Русский', flag: '🇷🇺' },
    { code: 'en', short: 'EN', label: 'English', flag: '🇺🇸' },
    { code: 'pl', short: 'PL', label: 'Polski', flag: '🇵🇱' },
    { code: 'de', short: 'DE', label: 'Deutsch', flag: '🇩🇪' },
    { code: 'zh', short: 'ZH', label: '中文', flag: '🇨🇳' },
  ];
  const DEFAULT_SETTINGS = {
    languages: ['uk', 'ru'],
    smartLanguageSelection: true,
    periodHours: 168,
  };

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

  function normalizeSettings(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const languages = Array.isArray(raw.languages)
      ? raw.languages.filter((code) => LANGUAGES.some((item) => item.code === code))
      : DEFAULT_SETTINGS.languages;
    const period = Number(raw.periodHours);
    return {
      languages: languages.length ? [...new Set(languages)] : [...DEFAULT_SETTINGS.languages],
      smartLanguageSelection: raw.smartLanguageSelection !== false,
      periodHours: [24, 168, 720].includes(period) ? period : DEFAULT_SETTINGS.periodHours,
    };
  }

  function loadSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) return normalizeSettings(JSON.parse(stored));
    } catch (_error) {}
    return { ...DEFAULT_SETTINGS, languages: [...DEFAULT_SETTINGS.languages] };
  }

  function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
    } catch (_error) {}
    try {
      tg?.CloudStorage?.setItem?.(SETTINGS_KEY, JSON.stringify(normalized), () => {});
    } catch (_error) {}
    return normalized;
  }

  function searchLanguages(settings) {
    const base = settings.languages.length ? [...settings.languages] : ['uk', 'ru'];
    if (settings.smartLanguageSelection && !base.includes('auto')) base.push('auto');
    return base;
  }

  function languageMeta(code) {
    return LANGUAGES.find((item) => item.code === code) || { code, short: String(code || '').toUpperCase(), label: code, flag: '🌐' };
  }

  function languageSummary(settings) {
    const labels = settings.languages.map((code) => languageMeta(code).short).join(', ');
    return `${labels || 'UA, RU'}${settings.smartLanguageSelection ? ' + Smart' : ''}`;
  }

  function periodLabel(hours) {
    if (Number(hours) === 24) return 'Last 24 hours';
    if (Number(hours) === 720) return 'Last 30 days';
    return 'Last 7 days';
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

  function ensureResearchStyles() {
    if (document.querySelector('#astel-research-v2-styles')) return;
    const style = document.createElement('style');
    style.id = 'astel-research-v2-styles';
    style.textContent = `
      .research-v2 { padding-bottom: 86px; }
      .research-tabs { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:5px; border-radius:22px; background:rgba(233,239,250,.78); margin:4px 0 18px; }
      .research-tab { border:0; border-radius:17px; padding:13px 10px; font:inherit; font-weight:750; color:#53617b; background:transparent; }
      .research-tab.is-active { color:white; background:#11162e; box-shadow:0 8px 20px rgba(17,22,46,.14); }
      .research-info { border:1px solid rgba(92,126,214,.12); background:linear-gradient(135deg,rgba(237,244,255,.96),rgba(250,252,255,.96)); border-radius:20px; padding:16px; margin-bottom:16px; }
      .research-info strong { display:block; margin-bottom:5px; color:#17213c; }
      .research-info p { margin:0; color:#687690; line-height:1.45; font-size:14px; }
      .research-card { background:rgba(255,255,255,.92); border:1px solid rgba(24,34,62,.08); box-shadow:0 14px 35px rgba(70,92,140,.08); border-radius:24px; padding:20px; margin-bottom:16px; }
      .research-card label { display:block; font-weight:800; color:#131a31; margin-bottom:8px; }
      .research-textarea { width:100%; min-height:104px; resize:vertical; border:1px solid rgba(21,31,57,.14); background:#fff; color:#11182e; border-radius:18px; padding:15px 16px; font:inherit; box-sizing:border-box; outline:none; }
      .research-textarea:focus, .research-input:focus, .research-select:focus { border-color:rgba(41,124,255,.55); box-shadow:0 0 0 3px rgba(41,124,255,.09); }
      .research-input, .research-select { width:100%; border:1px solid rgba(21,31,57,.14); background:#fff; color:#11182e; border-radius:16px; padding:13px 14px; font:inherit; box-sizing:border-box; outline:none; }
      .research-examples { display:flex; flex-wrap:wrap; gap:8px; margin-top:11px; }
      .research-chip { border:0; background:#edf3ff; color:#53627e; border-radius:999px; padding:8px 11px; font:inherit; font-size:12px; cursor:pointer; }
      .research-primary { width:100%; border:0; border-radius:18px; padding:15px 16px; color:white; background:#11162e; font:inherit; font-weight:800; margin-top:16px; }
      .research-primary:disabled, .research-secondary:disabled { opacity:.5; }
      .research-secondary { border:0; border-radius:14px; padding:10px 13px; background:#edf2fb; color:#42516c; font:inherit; font-weight:700; }
      .research-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 0; border-top:1px solid rgba(24,34,62,.08); }
      .research-row:first-child { border-top:0; padding-top:0; }
      .research-row:last-child { padding-bottom:0; }
      .research-row__copy { min-width:0; }
      .research-row__copy strong { display:block; color:#151b31; }
      .research-row__copy small { display:block; margin-top:3px; color:#7a879f; line-height:1.35; }
      .research-link { border:0; background:transparent; color:#1675ff; font:inherit; font-weight:750; padding:0; }
      .research-status { border-radius:18px; padding:13px 15px; margin-bottom:14px; font-weight:650; }
      .research-status.is-success { color:#148154; background:#e9f8f0; }
      .research-status.is-error { color:#ad3340; background:#fff0f1; }
      .research-status.is-loading { color:#53627e; background:#eef3fb; }
      .query-list { display:grid; gap:8px; margin-top:10px; }
      .query-item { display:flex; align-items:center; gap:10px; min-width:0; padding:10px 12px; border:1px solid rgba(24,34,62,.09); border-radius:14px; background:#fbfcff; }
      .query-item button { flex:1; min-width:0; border:0; background:transparent; text-align:left; padding:0; font:inherit; color:#27314b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .lang-tag { flex:0 0 auto; border-radius:999px; padding:5px 8px; font-size:11px; font-weight:800; background:#eaf2ff; color:#2368c4; }
      .results-head { display:flex; align-items:center; justify-content:space-between; margin:20px 4px 9px; }
      .results-head h3 { margin:0; }
      .result-card-v2 { background:rgba(255,255,255,.94); border:1px solid rgba(24,34,62,.08); border-radius:22px; padding:16px; margin:10px 0; box-shadow:0 9px 26px rgba(70,92,140,.07); }
      .result-card-v2__top { display:flex; gap:10px; align-items:flex-start; justify-content:space-between; }
      .result-card-v2__source { min-width:0; }
      .result-card-v2__source strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .result-card-v2__source small { display:block; margin-top:3px; color:#7a879f; }
      .result-card-v2__text { margin:13px 0 0; white-space:pre-wrap; line-height:1.45; color:#242d45; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:4; overflow:hidden; }
      .result-tags { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
      .result-tag { border-radius:999px; padding:5px 8px; font-size:11px; background:#f0f3f8; color:#66738b; }
      .result-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
      .settings-language { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 0; border-bottom:1px solid rgba(24,34,62,.08); }
      .settings-language:last-child { border-bottom:0; }
      .settings-language__label { display:flex; gap:10px; align-items:center; font-weight:700; }
      .research-switch { position:relative; width:48px; height:29px; flex:0 0 auto; }
      .research-switch input { opacity:0; width:0; height:0; }
      .research-switch span { position:absolute; inset:0; background:#dfe5ef; border-radius:999px; transition:.18s; }
      .research-switch span:after { content:''; position:absolute; width:23px; height:23px; top:3px; left:3px; background:#fff; border-radius:50%; box-shadow:0 2px 8px rgba(0,0,0,.14); transition:.18s; }
      .research-switch input:checked + span { background:#1684ff; }
      .research-switch input:checked + span:after { transform:translateX(19px); }
      .research-bottom-nav { position:sticky; bottom:0; display:grid; grid-template-columns:repeat(4,1fr); margin:22px -4px -4px; padding:10px 8px calc(10px + env(safe-area-inset-bottom)); background:rgba(248,250,255,.94); backdrop-filter:blur(18px); border-top:1px solid rgba(24,34,62,.08); z-index:10; }
      .research-nav { border:0; background:transparent; color:#7b88a0; padding:6px 2px; font:inherit; font-size:11px; font-weight:700; }
      .research-nav span { display:block; font-size:19px; margin-bottom:3px; }
      .research-nav.is-active { color:#157cff; }
      .research-section-title { margin:0 0 12px; color:#11182e; }
      .research-muted { color:#7a879f; font-size:13px; line-height:1.45; }
      @media (max-width:390px) {
        .research-card { padding:17px; }
        .research-tab { font-size:14px; }
      }
    `;
    document.head.appendChild(style);
  }

  function bottomNav(active = 'search') {
    return `
      <nav class="research-bottom-nav">
        <button class="research-nav ${active === 'search' ? 'is-active' : ''}" data-rnav="search"><span>⌕</span>Search</button>
        <button class="research-nav ${active === 'sources' ? 'is-active' : ''}" data-rnav="sources"><span>▦</span>Sources</button>
        <button class="research-nav ${active === 'collector' ? 'is-active' : ''}" data-rnav="collector"><span>♧</span>Collector</button>
        <button class="research-nav ${active === 'settings' ? 'is-active' : ''}" data-rnav="settings"><span>⚙</span>Settings</button>
      </nav>`;
  }

  function bindBottomNav(root) {
    root.querySelectorAll('[data-rnav]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.rnav;
        if (target === 'search') return renderTelegramSearch();
        if (target === 'sources') return window.renderTelegramSources?.();
        if (target === 'settings') return renderSearchSettings();
        window.showSheet?.('Group Collector', 'Next module: collect and classify Telegram groups, then add selected groups into Sources.');
      });
    });
  }

  function resultCard(item, index) {
    const title = item.chatTitle || (item.chatUsername ? `@${item.chatUsername}` : 'Telegram');
    const meta = `${formatDate(item.date)}${item.chatUsername ? ` · @${item.chatUsername}` : ''}`;
    const tags = [];
    for (const language of item.matchedLanguages || []) tags.push(languageMeta(language).short);
    for (const query of (item.matchedQueries || []).slice(0, 2)) tags.push(query);
    return `
      <article class="result-card-v2">
        <div class="result-card-v2__top">
          <div class="result-card-v2__source">
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(meta)}</small>
          </div>
        </div>
        <p id="telegram-result-${index}" class="result-card-v2__text" data-collapsed="true">${escapeHtml(item.text || '')}</p>
        ${tags.length ? `<div class="result-tags">${tags.map((tag) => `<span class="result-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        <div class="result-actions">
          ${item.url ? `<button type="button" class="research-secondary" data-result-link="${escapeHtml(item.url)}">Open message</button>` : ''}
          <button type="button" class="research-secondary" data-expand-result="telegram-result-${index}">Show more</button>
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
      root.innerHTML = '<p class="research-muted">No matching messages in this period.</p>';
    } else {
      root.innerHTML = items.map(resultCard).join('');
      bindResultActions(root);
    }
    if (Array.isArray(payload.errors) && payload.errors.length) {
      const errorText = payload.errors.slice(0, 6).map((item) => `${item.source || item.query || 'search'}: ${item.error}`).join(' · ');
      root.insertAdjacentHTML('beforeend', `<p class="research-muted">Search notes: ${escapeHtml(errorText)}</p>`);
    }
  }

  function queryList(queries, { targetInputId = null } = {}) {
    if (!Array.isArray(queries) || !queries.length) return '';
    return `<div class="query-list">${queries.map((item) => {
      const meta = languageMeta(item.language);
      return `<div class="query-item">
        <button type="button" data-query-value="${escapeHtml(item.query)}" ${targetInputId ? `data-query-target="${escapeHtml(targetInputId)}"` : ''}>${escapeHtml(item.query)}</button>
        <span class="lang-tag">${escapeHtml(meta.short)}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function bindQueryList(root) {
    root.querySelectorAll('[data-query-value]').forEach((button) => {
      button.addEventListener('click', () => {
        const targetId = button.dataset.queryTarget;
        if (!targetId) return;
        const target = document.querySelector(`#${targetId}`);
        if (!target) return;
        target.value = button.dataset.queryValue || '';
        target.focus();
        tg?.HapticFeedback?.impactOccurred?.('light');
      });
    });
  }

  function searchSettingsSummary() {
    const settings = loadSettings();
    return `
      <div class="research-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px;">
          <h3 class="research-section-title" style="margin:0;">Search settings</h3>
          <button type="button" class="research-link" data-open-search-settings>⚙ Customize</button>
        </div>
        <div class="research-row">
          <div class="research-row__copy"><strong>🌐 Languages</strong><small>${escapeHtml(languageSummary(settings))}</small></div>
          <span>›</span>
        </div>
        <div class="research-row">
          <div class="research-row__copy"><strong>🗓 Period</strong><small>${escapeHtml(periodLabel(settings.periodHours))}</small></div>
          <span>›</span>
        </div>
      </div>`;
  }

  function bindSettingsLinks(root) {
    root.querySelectorAll('[data-open-search-settings]').forEach((button) => button.addEventListener('click', renderSearchSettings));
  }

  function renderManualMode(app) {
    const settings = loadSettings();
    const body = app.querySelector('#telegram-search-body');
    body.innerHTML = `
      <section class="research-info">
        <strong>Exact search when you already know the word.</strong>
        <p>Type a keyword like “тканина”, “пошив” or “BMW”. Use AI suggestions if you want phrases that people actually write in groups and chats.</p>
      </section>
      <section class="research-card">
        <div id="telegram-search-message"></div>
        <form id="telegram-search-form">
          <label for="telegram-search-query">Keyword or phrase</label>
          <input id="telegram-search-query" class="research-input" type="text" autocomplete="off" placeholder="тканина" required>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px;">
            <button type="submit" class="research-primary" style="margin:0;">Search exact</button>
            <button type="button" class="research-secondary" data-suggest-keywords>✨ Suggest phrases</button>
          </div>
        </form>
        <div id="telegram-keyword-suggestions"></div>
      </section>
      ${searchSettingsSummary()}
      <section>
        <div class="results-head"><h3>Results</h3><span id="telegram-search-count">—</span></div>
        <div id="telegram-search-results"></div>
      </section>`;

    bindSettingsLinks(body);
    body.querySelector('#telegram-search-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const query = body.querySelector('#telegram-search-query').value.trim();
      const message = body.querySelector('#telegram-search-message');
      const results = body.querySelector('#telegram-search-results');
      const count = body.querySelector('#telegram-search-count');
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      message.className = 'research-status is-loading';
      message.textContent = 'Searching Telegram…';
      results.innerHTML = '';
      count.textContent = '…';
      try {
        const payload = await searchTelegram({ query, periodHours: settings.periodHours, limit: 20 });
        count.textContent = String(payload.count ?? payload.results?.length ?? 0);
        message.className = 'research-status is-success';
        message.textContent = `Searched ${Array.isArray(payload.sources) ? payload.sources.length : 0} source(s).`;
        renderResults(results, payload);
      } catch (error) {
        count.textContent = '0';
        message.className = 'research-status is-error';
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });

    body.querySelector('[data-suggest-keywords]').addEventListener('click', async (event) => {
      const query = body.querySelector('#telegram-search-query').value.trim();
      const message = body.querySelector('#telegram-search-message');
      const suggestions = body.querySelector('#telegram-keyword-suggestions');
      const button = event.currentTarget;
      if (!query) {
        message.className = 'research-status is-error';
        message.textContent = 'Type a topic first — for example “тканина”.';
        return;
      }
      button.disabled = true;
      message.className = 'research-status is-loading';
      message.textContent = 'AI is thinking like a Telegram search engine…';
      suggestions.innerHTML = '';
      try {
        const payload = await aiSearchTelegram({
          goal: query,
          languages: searchLanguages(settings),
          periodHours: settings.periodHours,
          preview: true,
        });
        message.className = 'research-status is-success';
        message.textContent = `Suggested ${payload.queries?.length || 0} phrases. Tap one to use it.`;
        suggestions.innerHTML = `<h4 style="margin:16px 0 6px;">Search phrases people may actually write</h4>${queryList(payload.queries, { targetInputId: 'telegram-search-query' })}`;
        bindQueryList(suggestions);
      } catch (error) {
        message.className = 'research-status is-error';
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  function renderAiMode(app) {
    const settings = loadSettings();
    const body = app.querySelector('#telegram-search-body');
    body.innerHTML = `
      <section class="research-info">
        <strong>✨ AI Search turns a topic into real Telegram search phrases.</strong>
        <p>You can type one word like “тканина” or describe a goal. Astel expands it into phrases people actually use, searches your Sources and removes duplicate messages.</p>
      </section>
      <section class="research-card">
        <div id="telegram-ai-message"></div>
        <form id="telegram-ai-form">
          <label for="telegram-ai-goal">What do you want to find?</label>
          <textarea id="telegram-ai-goal" class="research-textarea" autocomplete="off" placeholder="тканина" maxlength="500" required></textarea>
          <div class="research-examples">
            <button type="button" class="research-chip" data-ai-example="найти поставщиков ткани">Найти поставщиков ткани</button>
            <button type="button" class="research-chip" data-ai-example="купить ткань оптом">Купить ткань оптом</button>
            <button type="button" class="research-chip" data-ai-example="ищу фабрику для пошива одежды">Ищу фабрику для пошива</button>
          </div>
          <button type="submit" class="research-primary">✨ Generate Keywords & Search</button>
        </form>
      </section>
      ${searchSettingsSummary()}
      <section id="telegram-ai-plan-wrap" hidden>
        <div class="results-head"><h3>Generated search queries</h3><span id="telegram-ai-query-count">—</span></div>
        <div class="research-card" id="telegram-ai-plan"></div>
      </section>
      <section>
        <div class="results-head"><h3>Results</h3><span id="telegram-ai-count">—</span></div>
        <div id="telegram-ai-results"></div>
      </section>`;

    bindSettingsLinks(body);
    body.querySelectorAll('[data-ai-example]').forEach((button) => {
      button.addEventListener('click', () => {
        body.querySelector('#telegram-ai-goal').value = button.dataset.aiExample || '';
        body.querySelector('#telegram-ai-goal').focus();
      });
    });

    body.querySelector('#telegram-ai-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const goal = body.querySelector('#telegram-ai-goal').value.trim();
      const message = body.querySelector('#telegram-ai-message');
      const results = body.querySelector('#telegram-ai-results');
      const count = body.querySelector('#telegram-ai-count');
      const planWrap = body.querySelector('#telegram-ai-plan-wrap');
      const plan = body.querySelector('#telegram-ai-plan');
      const queryCount = body.querySelector('#telegram-ai-query-count');
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      message.className = 'research-status is-loading';
      message.textContent = 'AI is generating search phrases and checking Telegram…';
      results.innerHTML = '';
      plan.innerHTML = '';
      planWrap.hidden = true;
      count.textContent = '…';
      try {
        const payload = await aiSearchTelegram({
          goal,
          languages: searchLanguages(settings),
          periodHours: settings.periodHours,
          limit: 30,
          preview: false,
        });
        const languageText = (payload.languages || []).map((code) => languageMeta(code).short).join(', ');
        count.textContent = String(payload.count || 0);
        queryCount.textContent = String(payload.queries?.length || 0);
        message.className = 'research-status is-success';
        message.textContent = `AI generated ${payload.queries?.length || 0} searches${languageText ? ` · ${languageText}` : ''}.`;
        planWrap.hidden = false;
        plan.innerHTML = queryList(payload.queries);
        renderResults(results, payload);
      } catch (error) {
        count.textContent = '0';
        message.className = 'research-status is-error';
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  function renderTelegramSearch(mode = 'ai') {
    ensureResearchStyles();
    const app = document.querySelector('#app');
    if (!app) return;
    app.innerHTML = `
      <div class="research-v2">
        <div class="topbar">
          <button class="topbar__back" data-search-back>‹ Research</button>
          <span class="setup-badge">Read only</span>
        </div>
        <section class="setup-hero" style="padding-bottom:10px;">
          <span class="setup-hero__icon">⌕</span>
          <h1>Astel Research</h1>
          <p>Telegram Search</p>
        </section>
        <div class="research-tabs">
          <button type="button" class="research-tab ${mode === 'manual' ? 'is-active' : ''}" data-search-mode="manual">Manual Search</button>
          <button type="button" class="research-tab ${mode === 'ai' ? 'is-active' : ''}" data-search-mode="ai">✨ AI Search</button>
        </div>
        <div id="telegram-search-body"></div>
        ${bottomNav('search')}
      </div>`;

    app.querySelector('[data-search-back]').addEventListener('click', renderResearchHub);
    app.querySelectorAll('[data-search-mode]').forEach((button) => {
      button.addEventListener('click', () => renderTelegramSearch(button.dataset.searchMode));
    });
    bindBottomNav(app);
    if (mode === 'manual') renderManualMode(app);
    else renderAiMode(app);
  }

  function renderSearchSettings() {
    ensureResearchStyles();
    const app = document.querySelector('#app');
    if (!app) return;
    const settings = loadSettings();
    app.innerHTML = `
      <div class="research-v2">
        <div class="topbar">
          <button class="topbar__back" data-settings-back>‹ Search</button>
          <span class="setup-badge">Preferences</span>
        </div>
        <section class="setup-hero" style="padding-bottom:12px;">
          <span class="setup-hero__icon">⚙</span>
          <h1>Search Settings</h1>
          <p>Choose defaults once. Astel will reuse them for future searches.</p>
        </section>
        <section class="research-card">
          <h3 class="research-section-title">Default languages</h3>
          <p class="research-muted" style="margin-top:-4px;">These languages are always preferred. Smart selection can add another useful language when needed.</p>
          <div id="settings-language-list">
            ${LANGUAGES.map((item) => `
              <div class="settings-language">
                <div class="settings-language__label"><span>${item.flag}</span><span>${escapeHtml(item.label)} (${item.short})</span></div>
                <label class="research-switch"><input type="checkbox" value="${item.code}" data-setting-language ${settings.languages.includes(item.code) ? 'checked' : ''}><span></span></label>
              </div>`).join('')}
          </div>
        </section>
        <section class="research-card">
          <h3 class="research-section-title">Search behavior</h3>
          <div class="research-row">
            <div class="research-row__copy"><strong>✨ Smart language selection</strong><small>Keep your default languages and let AI add another useful language when the topic needs it.</small></div>
            <label class="research-switch"><input type="checkbox" id="setting-smart-languages" ${settings.smartLanguageSelection ? 'checked' : ''}><span></span></label>
          </div>
          <div class="research-row">
            <div class="research-row__copy" style="width:100%;"><strong>🗓 Default period</strong><small>Used by both Manual Search and AI Search.</small>
              <select id="setting-period" class="research-select" style="margin-top:9px;">
                <option value="24" ${settings.periodHours === 24 ? 'selected' : ''}>Last 24 hours</option>
                <option value="168" ${settings.periodHours === 168 ? 'selected' : ''}>Last 7 days</option>
                <option value="720" ${settings.periodHours === 720 ? 'selected' : ''}>Last 30 days</option>
              </select>
            </div>
          </div>
        </section>
        <section class="research-card">
          <button type="button" class="research-primary" data-save-search-settings style="margin-top:0;">Save Settings</button>
          <button type="button" class="research-link" data-reset-search-settings style="display:block;margin:15px auto 0;">Reset to default</button>
          <div id="settings-save-message" class="research-muted" style="text-align:center;margin-top:10px;"></div>
        </section>
        ${bottomNav('settings')}
      </div>`;

    app.querySelector('[data-settings-back]').addEventListener('click', () => renderTelegramSearch('ai'));
    bindBottomNav(app);

    app.querySelector('[data-save-search-settings]').addEventListener('click', () => {
      const selected = [...app.querySelectorAll('[data-setting-language]:checked')].map((node) => node.value);
      if (!selected.length) {
        app.querySelector('#settings-save-message').textContent = 'Choose at least one default language.';
        return;
      }
      const next = saveSettings({
        languages: selected,
        smartLanguageSelection: app.querySelector('#setting-smart-languages').checked,
        periodHours: Number(app.querySelector('#setting-period').value || 168),
      });
      app.querySelector('#settings-save-message').textContent = `Saved: ${languageSummary(next)} · ${periodLabel(next.periodHours)}.`;
      tg?.HapticFeedback?.notificationOccurred?.('success');
    });

    app.querySelector('[data-reset-search-settings]').addEventListener('click', () => {
      saveSettings(DEFAULT_SETTINGS);
      renderSearchSettings();
    });
  }

  function renderResearchHub() {
    ensureResearchStyles();
    const app = document.querySelector('#app');
    if (!app) return;
    app.innerHTML = `
      <div class="research-v2">
        <div class="topbar">
          <button class="topbar__back" data-home-search>‹ Home</button>
          <span class="setup-badge">Read only</span>
        </div>
        <section class="setup-hero">
          <span class="setup-hero__icon">⌕</span>
          <h1>Telegram Research</h1>
          <p>Search and manage Telegram sources through your connected Research account.</p>
        </section>
        <section class="quick-list">
          <button class="quick-action" data-open-telegram-search>
            <span><strong>Search Telegram</strong><span>Exact keywords or AI-generated search phrases</span></span>
            <span class="quick-action__arrow">›</span>
          </button>
          <button class="quick-action" data-open-sources-search>
            <span><strong>Sources</strong><span>Add or remove Telegram groups and channels</span></span>
            <span class="quick-action__arrow">›</span>
          </button>
          <button class="quick-action" data-open-search-settings>
            <span><strong>Search Settings</strong><span>Default languages and search period</span></span>
            <span class="quick-action__arrow">›</span>
          </button>
          <button class="quick-action" data-collector-search-soon>
            <span><strong>Group Collector</strong><span>Source discovery comes next</span></span>
            <span class="quick-action__arrow">›</span>
          </button>
          <button class="quick-action" data-open-account-search>
            <span><strong>Account</strong><span>Research account connection and authorization</span></span>
            <span class="quick-action__arrow">›</span>
          </button>
        </section>
        ${bottomNav('search')}
      </div>`;

    app.querySelector('[data-home-search]').addEventListener('click', () => window.render?.());
    app.querySelector('[data-open-telegram-search]').addEventListener('click', () => renderTelegramSearch('ai'));
    app.querySelector('[data-open-sources-search]').addEventListener('click', () => window.renderTelegramSources?.());
    app.querySelector('[data-open-search-settings]').addEventListener('click', renderSearchSettings);
    app.querySelector('[data-open-account-search]').addEventListener('click', () => window.renderTelegramSetup?.());
    app.querySelector('[data-collector-search-soon]').addEventListener('click', () => {
      window.showSheet?.('Group Collector', 'Next module: collect and classify Telegram groups, then add selected groups into Sources.');
    });
    bindBottomNav(app);
  }

  window.renderTelegramResearch = renderResearchHub;
  window.renderTelegramSearch = renderTelegramSearch;
  window.renderTelegramSearchSettings = renderSearchSettings;
})();
