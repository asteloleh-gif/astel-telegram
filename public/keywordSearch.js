(() => {
  const tg = window.Telegram?.WebApp;
  const SETTINGS_KEY = 'astel.telegramResearch.keywordSearchSettings.v2';

  const esc = (v) => String(v ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function headers() {
    return { accept: 'application/json', 'content-type': 'application/json', 'x-telegram-init-data': tg?.initData || '' };
  }

  async function apiGet(path) {
    if (!tg?.initData) throw new Error('Open Astel from the Telegram bot to use Telegram Research.');
    const response = await fetch(path, { method: 'GET', headers: headers() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
    return payload;
  }

  async function apiPost(path, body) {
    if (!tg?.initData) throw new Error('Open Astel from the Telegram bot to use Telegram Research.');
    const response = await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body || {}) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
    return payload;
  }

  function searchTelegram(query, periodHours) {
    return apiPost('/api/telegram-research/search', { query, periodHours, limit: 20 });
  }

  function deepSearchTelegram(query, periodHours, threshold = 0.42) {
    return apiPost('/api/telegram-research/deep-search', { query, periodHours, threshold, limit: 50 });
  }

  async function smartMatchKeywords(keywords) {
    let seeds = keywords.slice(0, 8);
    while (seeds.length > 1 && JSON.stringify(seeds).length > 450) seeds = seeds.slice(0, -1);
    if (!seeds.length || JSON.stringify(seeds).length > 450) return { searchKeywords: keywords, items: [] };
    const payload = await apiPost('/api/telegram-research/ai-search', {
      goal: JSON.stringify(seeds),
      languages: ['smart-match'],
      preview: true,
    });
    const generated = Array.isArray(payload.searchKeywords)
      ? payload.searchKeywords
      : (payload.queries || []).map((item) => item.query).filter(Boolean);
    const combined = [];
    for (const value of [...keywords, ...generated]) {
      const query = String(value || '').trim();
      if (!query || combined.some((item) => item.toLocaleLowerCase() === query.toLocaleLowerCase())) continue;
      combined.push(query);
      if (combined.length >= 40) break;
    }
    return { ...payload, searchKeywords: combined };
  }

  function settings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        periodHours: [24, 168, 720].includes(Number(raw.periodHours)) ? Number(raw.periodHours) : 168,
        smartMatching: raw.smartMatching !== false,
      };
    } catch (_error) { return { periodHours: 168, smartMatching: true }; }
  }

  function saveSettings(periodHours, smartMatching = true) {
    const value = {
      periodHours: [24, 168, 720].includes(Number(periodHours)) ? Number(periodHours) : 168,
      smartMatching: smartMatching !== false,
    };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch (_error) {}
    try { tg?.CloudStorage?.setItem?.(SETTINGS_KEY, JSON.stringify(value), () => {}); } catch (_error) {}
    return value;
  }

  function periodLabel(hours) {
    if (Number(hours) === 24) return 'Last 24 hours';
    if (Number(hours) === 720) return 'Last 30 days';
    return 'Last 7 days';
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return value || 'Unknown date';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function parseKeywords(value) {
    const seen = new Set();
    const out = [];
    for (const item of String(value || '').split(/[\n,;]+/)) {
      const keyword = item.trim().replace(/\s+/g, ' ');
      const key = keyword.toLocaleLowerCase();
      if (!keyword || keyword.length > 160 || seen.has(key)) continue;
      seen.add(key); out.push(keyword);
      if (out.length >= 20) break;
    }
    return out;
  }

  function resultKey(item) {
    if (item?.url) return `url:${item.url}`;
    const source = item?.chatUsername || item?.chatTitle || item?.chatId || 'telegram';
    return item?.messageId ? `${source}:${item.messageId}` : `${source}:${item?.date || ''}:${String(item?.text || '').slice(0, 160)}`;
  }

  async function searchSet(keywords, periodHours, progress) {
    const merged = new Map();
    const sources = new Set();
    const errors = [];
    for (let i = 0; i < keywords.length; i += 1) {
      const keyword = keywords[i];
      progress?.(i + 1, keywords.length, keyword);
      try {
        const payload = await searchTelegram(keyword, periodHours);
        (payload.sources || []).forEach((source) => sources.add(source));
        for (const item of payload.results || []) {
          const key = resultKey(item);
          const existing = merged.get(key);
          if (!existing) merged.set(key, { ...item, matchedQueries: [keyword] });
          else if (!existing.matchedQueries.includes(keyword)) existing.matchedQueries.push(keyword);
        }
        for (const error of payload.errors || []) errors.push({ query: keyword, ...error });
      } catch (error) {
        errors.push({ query: keyword, error: error?.message || 'SEARCH_FAILED' });
      }
    }
    const results = [...merged.values()]
      .sort((a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime())
      .slice(0, 100);
    return { count: results.length, results, sources: [...sources], errors };
  }

  function styles() {
    if (document.querySelector('#astel-keyword-set-styles')) return;
    const style = document.createElement('style');
    style.id = 'astel-keyword-set-styles';
    style.textContent = `
      .ks-wrap{padding-bottom:150px}.ks-card{background:rgba(255,255,255,.94);border:1px solid rgba(24,34,62,.08);border-radius:24px;padding:20px;margin-bottom:16px;box-shadow:0 14px 35px rgba(70,92,140,.08)}
      .ks-info{background:#f3f7ff;border-radius:20px;padding:15px 16px;margin-bottom:16px;color:#687690;line-height:1.45}.ks-info strong{display:block;color:#17213c;margin-bottom:4px}
      .ks-textarea{width:100%;min-height:118px;box-sizing:border-box;border:1px solid rgba(21,31,57,.14);border-radius:18px;padding:15px 16px;font:inherit;line-height:1.4;background:#fff;color:#11182e;outline:none}
      .ks-textarea:focus,.ks-select:focus,.collector-search:focus,.deep-input:focus{border-color:rgba(41,124,255,.55);box-shadow:0 0 0 3px rgba(41,124,255,.09)}
      .ks-preview,.ks-examples,.ks-tags,.ks-actions{display:flex;flex-wrap:wrap;gap:7px}.ks-preview{margin-top:11px}.ks-examples{margin-top:12px}
      .ks-chip,.ks-example,.ks-tag{border:0;border-radius:999px;padding:7px 10px;font:inherit;font-size:12px}.ks-chip{background:#eaf2ff;color:#315a92}.ks-example,.ks-tag{background:#f0f3f8;color:#66738b}.ks-chip b{margin-left:6px;opacity:.65}
      .ks-primary{width:100%;border:0;border-radius:18px;padding:15px 16px;background:#11162e;color:#fff;font:inherit;font-weight:800;margin-top:14px}.ks-primary:disabled{opacity:.5}
      .ks-status{border-radius:16px;padding:12px 14px;margin-bottom:12px;font-weight:650}.ks-loading{background:#eef3fb;color:#53627e}.ks-ok{background:#e9f8f0;color:#148154}.ks-error{background:#fff0f1;color:#ad3340}
      .ks-head{display:flex;justify-content:space-between;align-items:center;margin:20px 4px 9px}.ks-head h3{margin:0}.ks-result{background:rgba(255,255,255,.95);border:1px solid rgba(24,34,62,.08);border-radius:22px;padding:16px;margin:10px 0}.ks-result small{color:#7a879f}.ks-text{white-space:pre-wrap;line-height:1.45;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}.ks-tags{margin-top:9px}.ks-actions{margin-top:10px}
      .ks-secondary{border:0;border-radius:14px;padding:10px 13px;background:#edf2fb;color:#42516c;font:inherit;font-weight:700}.ks-link{border:0;background:transparent;color:#1675ff;font:inherit;font-weight:750}
      .ks-smart-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:13px 0 2px;border-top:1px solid rgba(24,34,62,.08)}.ks-smart-row small{display:block;color:#7a879f;margin-top:3px}.ks-switch{position:relative;width:48px;height:29px;flex:0 0 auto}.ks-switch input{opacity:0;width:0;height:0}.ks-switch span{position:absolute;inset:0;background:#dfe5ef;border-radius:999px}.ks-switch span:after{content:'';position:absolute;width:23px;height:23px;top:3px;left:3px;background:#fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.14);transition:.18s}.ks-switch input:checked+span{background:#1684ff}.ks-switch input:checked+span:after{transform:translateX(19px)}
      .ks-smart-plan{margin-top:12px;padding:12px 13px;border-radius:16px;background:#f8f9fc;color:#66738b;font-size:13px;line-height:1.45}.ks-smart-plan strong{color:#2d3953}
      .collector-toolbar{display:grid;grid-template-columns:1fr auto;gap:9px;margin-bottom:12px}.collector-search,.deep-input{width:100%;box-sizing:border-box;border:1px solid rgba(21,31,57,.14);border-radius:16px;padding:13px 14px;background:#fff;font:inherit;color:#11182e;outline:none}.collector-filters{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}.collector-filter{border:0;border-radius:999px;padding:8px 11px;background:#edf2fb;color:#5d6b83;font:inherit;font-size:12px;font-weight:700}.collector-filter.on{background:#11162e;color:white}.collector-item{background:rgba(255,255,255,.95);border:1px solid rgba(24,34,62,.08);border-radius:20px;padding:15px;margin:9px 0}.collector-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.collector-title{min-width:0}.collector-title strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.collector-title small{display:block;color:#7a879f;margin-top:4px}.collector-badge{flex:0 0 auto;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:800;background:#eef3fb;color:#66738b}.collector-badge.added{background:#e9f8f0;color:#148154}.collector-action{width:100%;margin-top:11px;border:0;border-radius:14px;padding:11px 13px;font:inherit;font-weight:800;background:#edf3ff;color:#2269c8}.collector-action:disabled{background:#f1f3f6;color:#929bad}.collector-summary{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 15px}.collector-stat{padding:8px 11px;border-radius:999px;background:#f0f3f8;color:#66738b;font-size:12px;font-weight:700}
      .deep-grid{display:grid;grid-template-columns:1fr auto;gap:9px}.deep-store{display:flex;align-items:center;justify-content:space-between;gap:12px}.deep-store small{display:block;color:#7a879f;margin-top:4px}.deep-score{display:inline-block;border-radius:999px;padding:5px 8px;margin-top:8px;background:#e9f8f0;color:#148154;font-size:11px;font-weight:800}
      .ks-nav{position:sticky;bottom:0;display:grid;grid-template-columns:repeat(4,1fr);margin:26px -4px -4px;padding:10px 8px calc(10px + env(safe-area-inset-bottom));background:rgba(248,250,255,.97);backdrop-filter:blur(18px);border-top:1px solid rgba(24,34,62,.08);z-index:10}.ks-nav button{border:0;background:transparent;color:#7b88a0;padding:6px 2px;font:inherit;font-size:11px;font-weight:700}.ks-nav button span{display:block;font-size:19px;margin-bottom:3px}.ks-nav .on{color:#157cff}.ks-select{width:100%;border:1px solid rgba(21,31,57,.14);border-radius:16px;padding:13px 14px;background:#fff;font:inherit;color:#11182e}
    `;
    document.head.appendChild(style);
  }

  function nav(active = 'search') {
    return `<nav class="ks-nav">
      <button class="${active === 'search' ? 'on' : ''}" data-ks-nav="search"><span>⌕</span>Search</button>
      <button class="${active === 'sources' ? 'on' : ''}" data-ks-nav="sources"><span>▦</span>Sources</button>
      <button class="${active === 'collector' ? 'on' : ''}" data-ks-nav="collector"><span>♧</span>Collector</button>
      <button class="${active === 'settings' ? 'on' : ''}" data-ks-nav="settings"><span>⚙</span>Settings</button>
    </nav>`;
  }

  function bindNav(root) {
    root.querySelectorAll('[data-ks-nav]').forEach((button) => button.addEventListener('click', () => {
      const target = button.dataset.ksNav;
      if (target === 'search') return renderSearch();
      if (target === 'sources') return window.renderTelegramSources?.();
      if (target === 'settings') return renderSettings();
      if (target === 'collector') return renderCollector();
    }));
  }

  function resultCard(item, index) {
    const title = item.chatTitle || (item.chatUsername ? `@${item.chatUsername}` : 'Telegram');
    const meta = `${formatDate(item.date)}${item.chatUsername ? ` · @${item.chatUsername}` : ''}`;
    return `<article class="ks-result"><strong>${esc(title)}</strong><br><small>${esc(meta)}</small>
      <p id="ks-r-${index}" class="ks-text" data-collapsed="1">${esc(item.text || '')}</p>
      ${(item.matchedQueries || []).length ? `<div class="ks-tags">${item.matchedQueries.slice(0, 4).map((q) => `<span class="ks-tag">${esc(q)}</span>`).join('')}</div>` : ''}
      ${Number.isFinite(Number(item.score)) ? `<span class="deep-score">Match ${Math.round(Number(item.score) * 100)}%</span>` : ''}
      <div class="ks-actions">${item.url ? `<button class="ks-secondary" data-open="${esc(item.url)}">Open message</button>` : ''}<button class="ks-secondary" data-more="ks-r-${index}">Show more</button></div></article>`;
  }

  function renderResults(root, payload) {
    root.innerHTML = payload.results?.length ? payload.results.map(resultCard).join('') : '<p style="color:#7a879f">No matching messages in this period.</p>';
    root.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => tg?.openLink ? tg.openLink(button.dataset.open) : window.open(button.dataset.open, '_blank')));
    root.querySelectorAll('[data-more]').forEach((button) => button.addEventListener('click', () => {
      const node = document.querySelector(`#${button.dataset.more}`); if (!node) return;
      const collapsed = node.dataset.collapsed === '1'; node.dataset.collapsed = collapsed ? '0' : '1';
      node.style.display = collapsed ? 'block' : '-webkit-box'; node.style.webkitLineClamp = collapsed ? 'unset' : '4';
      button.textContent = collapsed ? 'Show less' : 'Show more';
    }));
  }

  function syncPreview(root) {
    const input = root.querySelector('#ks-keywords');
    const keywords = parseKeywords(input.value);
    root.querySelector('#ks-count').textContent = `${keywords.length}/20`;
    const preview = root.querySelector('#ks-preview');
    preview.innerHTML = keywords.map((q) => `<button class="ks-chip" data-remove="${esc(q)}">${esc(q)}<b>×</b></button>`).join('');
    preview.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      const remove = button.dataset.remove.toLocaleLowerCase();
      input.value = parseKeywords(input.value).filter((q) => q.toLocaleLowerCase() !== remove).join('\n'); syncPreview(root);
    }));
    return keywords;
  }

  function renderSearch() {
    styles();
    const app = document.querySelector('#app'); if (!app) return;
    const pref = settings();
    app.innerHTML = `<div class="ks-wrap">
      <div class="topbar"><button class="topbar__back" data-back>‹ Research</button><span class="setup-badge">Read only</span></div>
      <section class="setup-hero" style="padding-bottom:10px"><span class="setup-hero__icon">⌕</span><h1>Telegram Search</h1><p>Search multiple keywords in one run.</p></section>
      <div class="ks-info"><strong>Live Telegram search</strong>Separate words or phrases with commas or new lines. Smart Match keeps every original keyword and may add close typo/grammar variants.</div>
      <section class="ks-card"><div id="ks-status"></div><label for="ks-keywords" style="font-weight:800">Keywords <span id="ks-count" style="float:right;color:#7a879f;font-weight:600">0/20</span></label>
        <textarea id="ks-keywords" class="ks-textarea" placeholder="тканина\nкуплю тканину\nпродам тканину"></textarea><div id="ks-preview" class="ks-preview"></div>
        <div class="ks-examples"><button class="ks-example" data-add="тканина">+ тканина</button><button class="ks-example" data-add="куплю">+ куплю</button><button class="ks-example" data-add="продам">+ продам</button></div>
        <div class="ks-smart-row"><div><strong>Smart matching</strong><small>Typos, keyboard/translit mistakes and close word forms. No topic expansion.</small></div><label class="ks-switch"><input type="checkbox" id="ks-smart" ${pref.smartMatching ? 'checked' : ''}><span></span></label></div>
        <div id="ks-smart-plan"></div>
        <button class="ks-primary" data-run>Search all keywords</button></section>
      <section class="ks-card"><div class="deep-store"><div><strong>🧠 Deep Search</strong><small>Search our stored Telegram index with fuzzy typo tolerance.</small></div><button class="ks-link" data-deep>Open ›</button></div></section>
      <section class="ks-card" style="display:flex;justify-content:space-between;align-items:center"><div><strong>🗓 Period</strong><div style="color:#7a879f;margin-top:3px">${periodLabel(pref.periodHours)}</div></div><button class="ks-link" data-settings>Change</button></section>
      <section><div class="ks-head"><h3>Results</h3><span id="ks-results-count">—</span></div><div id="ks-results"></div></section>${nav('search')}</div>`;

    app.querySelector('[data-back]').addEventListener('click', renderHub); app.querySelector('[data-settings]').addEventListener('click', renderSettings); app.querySelector('[data-deep]').addEventListener('click', renderDeepSearch); bindNav(app);
    const input = app.querySelector('#ks-keywords'); input.addEventListener('input', () => syncPreview(app)); syncPreview(app);
    app.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => { input.value = parseKeywords(`${input.value}\n${button.dataset.add}`).join('\n'); syncPreview(app); input.focus(); }));
    app.querySelector('[data-run]').addEventListener('click', async (event) => {
      const keywords = syncPreview(app), status = app.querySelector('#ks-status'), results = app.querySelector('#ks-results'), count = app.querySelector('#ks-results-count'), button = event.currentTarget, smartPlan = app.querySelector('#ks-smart-plan');
      if (!keywords.length) { status.className = 'ks-status ks-error'; status.textContent = 'Add at least one keyword.'; return; }
      const smartEnabled = app.querySelector('#ks-smart').checked;
      button.disabled = true; status.className = 'ks-status ks-loading'; results.innerHTML = ''; smartPlan.innerHTML = ''; count.textContent = '…';
      try {
        let searchKeywords = [...keywords];
        let smartFallback = false;
        if (smartEnabled) {
          status.textContent = 'Smart Match is checking spelling and close word forms…';
          try {
            const match = await smartMatchKeywords(keywords);
            searchKeywords = match.searchKeywords?.length ? match.searchKeywords : keywords;
            const originalKeys = new Set(keywords.map((q) => q.toLocaleLowerCase()));
            const extras = searchKeywords.filter((q) => !originalKeys.has(q.toLocaleLowerCase()));
            smartPlan.innerHTML = extras.length
              ? `<div class="ks-smart-plan"><strong>Also searching:</strong> ${extras.slice(0, 16).map(esc).join(' · ')}</div>`
              : '<div class="ks-smart-plan"><strong>Smart Match:</strong> no extra variants needed.</div>';
          } catch (_error) {
            smartFallback = true;
            smartPlan.innerHTML = '<div class="ks-smart-plan"><strong>Smart Match unavailable.</strong> Exact keywords are still being searched.</div>';
          }
        }
        const payload = await searchSet(searchKeywords, pref.periodHours, (i, total, keyword) => { status.textContent = `Searching ${i}/${total}: ${keyword}`; });
        count.textContent = String(payload.count || 0); status.className = 'ks-status ks-ok';
        status.textContent = `${smartFallback ? 'Exact fallback · ' : ''}Searched ${keywords.length} keyword(s)${searchKeywords.length !== keywords.length ? ` as ${searchKeywords.length} lexical queries` : ''} across ${payload.sources.length} source(s).`;
        renderResults(results, payload); tg?.HapticFeedback?.notificationOccurred?.('success');
      } catch (error) { count.textContent = '0'; status.className = 'ks-status ks-error'; status.textContent = error.message; }
      finally { button.disabled = false; }
    });
  }

  function renderSettings() {
    styles(); const app = document.querySelector('#app'); if (!app) return; const pref = settings();
    app.innerHTML = `<div class="ks-wrap"><div class="topbar"><button class="topbar__back" data-back>‹ Search</button><span class="setup-badge">Preferences</span></div>
      <section class="setup-hero"><span class="setup-hero__icon">⚙</span><h1>Search Settings</h1><p>Defaults for keyword search.</p></section>
      <section class="ks-card"><label style="font-weight:800">Default period</label><select id="ks-period" class="ks-select"><option value="24" ${pref.periodHours === 24 ? 'selected' : ''}>Last 24 hours</option><option value="168" ${pref.periodHours === 168 ? 'selected' : ''}>Last 7 days</option><option value="720" ${pref.periodHours === 720 ? 'selected' : ''}>Last 30 days</option></select>
      <div class="ks-smart-row"><div><strong>Smart matching by default</strong><small>Keep original keywords and add only close spelling/word-form variants.</small></div><label class="ks-switch"><input type="checkbox" id="ks-setting-smart" ${pref.smartMatching ? 'checked' : ''}><span></span></label></div>
      <button class="ks-primary" data-save>Save Settings</button><div id="ks-save" style="text-align:center;color:#7a879f;margin-top:10px"></div></section>${nav('settings')}</div>`;
    app.querySelector('[data-back]').addEventListener('click', renderSearch); bindNav(app); app.querySelector('[data-save]').addEventListener('click', () => { const saved = saveSettings(app.querySelector('#ks-period').value, app.querySelector('#ks-setting-smart').checked); app.querySelector('#ks-save').textContent = `Saved: ${periodLabel(saved.periodHours)} · Smart Match ${saved.smartMatching ? 'ON' : 'OFF'}.`; });
  }

  function collectorCard(item, index) {
    const handle = item.username ? `@${item.username}` : 'Private / no public username';
    const badge = item.added ? '<span class="collector-badge added">Added</span>' : `<span class="collector-badge">${esc(item.type || 'chat')}</span>`;
    let action;
    if (item.added) action = '<button class="collector-action" disabled>✓ Already in Sources</button>';
    else if (item.public && item.source) action = `<button class="collector-action" data-collector-add="${esc(item.source)}" data-collector-index="${index}">+ Add to Sources</button>`;
    else action = '<button class="collector-action" disabled>Private source · not supported yet</button>';
    return `<article class="collector-item" data-collector-card data-title="${esc(String(item.title || '').toLocaleLowerCase())}" data-user="${esc(String(item.username || '').toLocaleLowerCase())}" data-added="${item.added ? '1' : '0'}" data-public="${item.public ? '1' : '0'}">
      <div class="collector-top"><div class="collector-title"><strong>${esc(item.title || item.source || 'Telegram')}</strong><small>${esc(handle)}</small></div>${badge}</div>${action}</article>`;
  }

  async function renderCollector() {
    styles(); const app = document.querySelector('#app'); if (!app) return;
    app.innerHTML = `<div class="ks-wrap"><div class="topbar"><button class="topbar__back" data-back>‹ Research</button><span class="setup-badge">Read only</span></div>
      <section class="setup-hero" style="padding-bottom:10px"><span class="setup-hero__icon">♧</span><h1>Group Collector</h1><p>Groups and channels already visible to your Research account.</p></section>
      <div class="ks-info"><strong>My Groups</strong>Astel does not join anything automatically. Public groups can be added to Sources with one tap. Private groups are shown for visibility only.</div>
      <section class="ks-card"><div id="collector-status" class="ks-status ks-loading">Loading Telegram dialogs…</div>
        <div class="collector-toolbar"><input id="collector-search" class="collector-search" placeholder="Search groups…" autocomplete="off"><button class="ks-secondary" data-refresh>Refresh</button></div>
        <div class="collector-filters"><button class="collector-filter on" data-filter="all">All</button><button class="collector-filter" data-filter="public">Public</button><button class="collector-filter" data-filter="added">Added</button></div>
        <div id="collector-summary" class="collector-summary"></div><div id="collector-list"></div></section>${nav('collector')}</div>`;
    app.querySelector('[data-back]').addEventListener('click', renderHub); bindNav(app);

    let dialogs = [];
    let activeFilter = 'all';
    const status = app.querySelector('#collector-status');
    const list = app.querySelector('#collector-list');
    const summary = app.querySelector('#collector-summary');
    const search = app.querySelector('#collector-search');

    function draw() {
      const term = search.value.trim().toLocaleLowerCase();
      const filtered = dialogs.filter((item) => {
        if (activeFilter === 'public' && !item.public) return false;
        if (activeFilter === 'added' && !item.added) return false;
        if (!term) return true;
        return String(item.title || '').toLocaleLowerCase().includes(term) || String(item.username || '').toLocaleLowerCase().includes(term);
      });
      const publicCount = dialogs.filter((item) => item.public).length;
      const addedCount = dialogs.filter((item) => item.added).length;
      summary.innerHTML = `<span class="collector-stat">${dialogs.length} chats</span><span class="collector-stat">${publicCount} public</span><span class="collector-stat">${addedCount} in Sources</span>`;
      list.innerHTML = filtered.length ? filtered.map(collectorCard).join('') : '<p style="color:#7a879f">No groups match this filter.</p>';
      list.querySelectorAll('[data-collector-add]').forEach((button) => button.addEventListener('click', async () => {
        const index = Number(button.dataset.collectorIndex);
        const source = button.dataset.collectorAdd;
        button.disabled = true; button.textContent = 'Adding…';
        try {
          await apiPost('/api/telegram-research/sources', { source });
          if (dialogs[index]) dialogs[index].added = true;
          tg?.HapticFeedback?.notificationOccurred?.('success');
          draw();
        } catch (error) {
          button.disabled = false; button.textContent = `Retry · ${error.message}`;
        }
      }));
    }

    async function load() {
      status.className = 'ks-status ks-loading'; status.textContent = 'Reading groups visible to @astel_us…';
      try {
        const payload = await apiGet('/api/telegram-research/dialogs?limit=200');
        dialogs = Array.isArray(payload.dialogs) ? payload.dialogs : [];
        status.className = 'ks-status ks-ok'; status.textContent = `Loaded ${dialogs.length} group/channel dialog(s).`;
        draw();
      } catch (error) {
        status.className = 'ks-status ks-error'; status.textContent = error.message; dialogs = []; draw();
      }
    }

    search.addEventListener('input', draw);
    app.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
      activeFilter = button.dataset.filter; app.querySelectorAll('[data-filter]').forEach((node) => node.classList.toggle('on', node === button)); draw();
    }));
    app.querySelector('[data-refresh]').addEventListener('click', load);
    await load();
  }

  async function renderDeepSearch() {
    styles(); const app = document.querySelector('#app'); if (!app) return;
    app.innerHTML = `<div class="ks-wrap"><div class="topbar"><button class="topbar__back" data-back>‹ Search</button><span class="setup-badge">Stored index</span></div>
      <section class="setup-hero" style="padding-bottom:10px"><span class="setup-hero__icon">🧠</span><h1>Deep Search</h1><p>Fuzzy search across messages saved in Astel.</p></section>
      <div class="ks-info"><strong>Own Telegram index</strong>This search does not depend on Telegram matching the exact word. It combines exact text, full-text and fuzzy trigram matching, so small typos can still hit.</div>
      <section class="ks-card"><div id="deep-store-status" class="ks-status ks-loading">Checking Message Store…</div><div class="deep-store"><div><strong id="deep-store-count">— stored messages</strong><small id="deep-store-last">Waiting for status…</small></div><button class="ks-secondary" data-sync>Sync now</button></div></section>
      <section class="ks-card"><div id="deep-search-status"></div><label for="deep-query" style="font-weight:800">Search stored messages</label><div class="deep-grid" style="margin-top:9px"><input id="deep-query" class="deep-input" placeholder="тканиа" autocomplete="off"><button class="ks-secondary" data-run-deep>Search</button></div><label style="display:block;font-weight:800;margin:14px 0 8px">Period</label><select id="deep-period" class="ks-select"><option value="168">Last 7 days</option><option value="720">Last 30 days</option><option value="2160" selected>Last 90 days</option><option value="8760">Last year</option></select></section>
      <section><div class="ks-head"><h3>Results</h3><span id="deep-count">—</span></div><div id="deep-results"></div></section>${nav('search')}</div>`;
    app.querySelector('[data-back]').addEventListener('click', renderSearch); bindNav(app);
    const storeStatus = app.querySelector('#deep-store-status');
    const storeCount = app.querySelector('#deep-store-count');
    const storeLast = app.querySelector('#deep-store-last');

    async function loadStoreStatus() {
      try {
        const payload = await apiGet('/api/telegram-research/message-store/status');
        if (!payload.configured) {
          storeStatus.className = 'ks-status ks-error'; storeStatus.textContent = 'Message Store is not configured yet.'; return;
        }
        storeStatus.className = payload.ready ? 'ks-status ks-ok' : 'ks-status ks-error';
        storeStatus.textContent = payload.ready ? 'Message Store ready.' : (payload.error || 'Message Store unavailable.');
        storeCount.textContent = `${Number(payload.count || 0)} stored messages`;
        storeLast.textContent = payload.lastCollectedAt ? `Last stored: ${formatDate(payload.lastCollectedAt)}` : 'No messages stored yet.';
      } catch (error) {
        storeStatus.className = 'ks-status ks-error'; storeStatus.textContent = error.message;
      }
    }

    app.querySelector('[data-sync]').addEventListener('click', async (event) => {
      const button = event.currentTarget; button.disabled = true; button.textContent = 'Syncing…';
      try {
        const payload = await apiPost('/api/telegram-research/message-store/sync', { periodHours: 720, limitPerSource: 150 });
        storeStatus.className = 'ks-status ks-ok'; storeStatus.textContent = `Sync complete: ${payload.stored || 0} message(s) processed.`;
        await loadStoreStatus(); tg?.HapticFeedback?.notificationOccurred?.('success');
      } catch (error) {
        storeStatus.className = 'ks-status ks-error'; storeStatus.textContent = error.message;
      } finally { button.disabled = false; button.textContent = 'Sync now'; }
    });

    async function runDeep() {
      const query = app.querySelector('#deep-query').value.trim();
      const status = app.querySelector('#deep-search-status');
      const results = app.querySelector('#deep-results');
      const count = app.querySelector('#deep-count');
      const button = app.querySelector('[data-run-deep]');
      if (!query) { status.className = 'ks-status ks-error'; status.textContent = 'Type a word or phrase.'; return; }
      button.disabled = true; status.className = 'ks-status ks-loading'; status.textContent = 'Searching Astel index…'; results.innerHTML = ''; count.textContent = '…';
      try {
        const payload = await deepSearchTelegram(query, Number(app.querySelector('#deep-period').value || 2160));
        count.textContent = String(payload.count || 0); status.className = 'ks-status ks-ok'; status.textContent = `Deep Search found ${payload.count || 0} message(s).`; renderResults(results, payload);
      } catch (error) {
        count.textContent = '0'; status.className = 'ks-status ks-error'; status.textContent = error.message;
      } finally { button.disabled = false; }
    }
    app.querySelector('[data-run-deep]').addEventListener('click', runDeep);
    app.querySelector('#deep-query').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); runDeep(); } });
    await loadStoreStatus();
  }

  function renderHub() {
    styles(); const app = document.querySelector('#app'); if (!app) return;
    app.innerHTML = `<div class="ks-wrap"><div class="topbar"><button class="topbar__back" data-home>‹ Home</button><span class="setup-badge">Read only</span></div>
      <section class="setup-hero"><span class="setup-hero__icon">⌕</span><h1>Telegram Research</h1><p>Search and manage Telegram sources through your connected Research account.</p></section>
      <section class="quick-list"><button class="quick-action" data-search><span><strong>Search Telegram</strong><span>Live keyword sets with optional Smart Match</span></span><span class="quick-action__arrow">›</span></button><button class="quick-action" data-deep><span><strong>Deep Search</strong><span>Fuzzy search over the Astel Message Store</span></span><span class="quick-action__arrow">›</span></button><button class="quick-action" data-sources><span><strong>Sources</strong><span>Add or remove Telegram groups and channels</span></span><span class="quick-action__arrow">›</span></button><button class="quick-action" data-collector><span><strong>Group Collector</strong><span>Browse groups visible to @astel_us and add public ones</span></span><span class="quick-action__arrow">›</span></button><button class="quick-action" data-settings><span><strong>Search Settings</strong><span>Period and Smart Match default</span></span><span class="quick-action__arrow">›</span></button><button class="quick-action" data-account><span><strong>Account</strong><span>Research account connection and authorization</span></span><span class="quick-action__arrow">›</span></button></section>${nav('search')}</div>`;
    app.querySelector('[data-home]').addEventListener('click', () => window.render?.()); app.querySelector('[data-search]').addEventListener('click', renderSearch); app.querySelector('[data-deep]').addEventListener('click', renderDeepSearch); app.querySelector('[data-sources]').addEventListener('click', () => window.renderTelegramSources?.()); app.querySelector('[data-settings]').addEventListener('click', renderSettings); app.querySelector('[data-account]').addEventListener('click', () => window.renderTelegramSetup?.()); app.querySelector('[data-collector]').addEventListener('click', renderCollector); bindNav(app);
  }

  window.renderTelegramResearch = renderHub;
  window.renderTelegramSearch = renderSearch;
  window.renderTelegramSearchSettings = renderSettings;
  window.renderTelegramCollector = renderCollector;
  window.renderTelegramDeepSearch = renderDeepSearch;
})();
