(() => {
  const tg = window.Telegram?.WebApp;
  const SETTINGS_KEY = 'astel.telegramResearch.keywordSearchSettings.v1';

  const esc = (v) => String(v ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function headers() {
    return { accept: 'application/json', 'content-type': 'application/json', 'x-telegram-init-data': tg?.initData || '' };
  }

  async function searchTelegram(query, periodHours) {
    if (!tg?.initData) throw new Error('Open Astel from the Telegram bot to use Telegram Research.');
    const response = await fetch('/api/telegram-research/search', {
      method: 'POST', headers: headers(), body: JSON.stringify({ query, periodHours, limit: 20 }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
    return payload;
  }

  function settings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { periodHours: [24, 168, 720].includes(Number(raw.periodHours)) ? Number(raw.periodHours) : 168 };
    } catch (_error) { return { periodHours: 168 }; }
  }

  function saveSettings(periodHours) {
    const value = { periodHours: [24, 168, 720].includes(Number(periodHours)) ? Number(periodHours) : 168 };
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
      .ks-wrap{padding-bottom:120px}.ks-card{background:rgba(255,255,255,.94);border:1px solid rgba(24,34,62,.08);border-radius:24px;padding:20px;margin-bottom:16px;box-shadow:0 14px 35px rgba(70,92,140,.08)}
      .ks-info{background:#f3f7ff;border-radius:20px;padding:15px 16px;margin-bottom:16px;color:#687690;line-height:1.45}.ks-info strong{display:block;color:#17213c;margin-bottom:4px}
      .ks-textarea{width:100%;min-height:118px;box-sizing:border-box;border:1px solid rgba(21,31,57,.14);border-radius:18px;padding:15px 16px;font:inherit;line-height:1.4;background:#fff;color:#11182e;outline:none}
      .ks-textarea:focus,.ks-select:focus{border-color:rgba(41,124,255,.55);box-shadow:0 0 0 3px rgba(41,124,255,.09)}
      .ks-preview,.ks-examples,.ks-tags,.ks-actions{display:flex;flex-wrap:wrap;gap:7px}.ks-preview{margin-top:11px}.ks-examples{margin-top:12px}
      .ks-chip,.ks-example,.ks-tag{border:0;border-radius:999px;padding:7px 10px;font:inherit;font-size:12px}.ks-chip{background:#eaf2ff;color:#315a92}.ks-example,.ks-tag{background:#f0f3f8;color:#66738b}.ks-chip b{margin-left:6px;opacity:.65}
      .ks-primary{width:100%;border:0;border-radius:18px;padding:15px 16px;background:#11162e;color:#fff;font:inherit;font-weight:800;margin-top:14px}.ks-primary:disabled{opacity:.5}
      .ks-status{border-radius:16px;padding:12px 14px;margin-bottom:12px;font-weight:650}.ks-loading{background:#eef3fb;color:#53627e}.ks-ok{background:#e9f8f0;color:#148154}.ks-error{background:#fff0f1;color:#ad3340}
      .ks-head{display:flex;justify-content:space-between;align-items:center;margin:20px 4px 9px}.ks-head h3{margin:0}.ks-result{background:rgba(255,255,255,.95);border:1px solid rgba(24,34,62,.08);border-radius:22px;padding:16px;margin:10px 0}.ks-result small{color:#7a879f}.ks-text{white-space:pre-wrap;line-height:1.45;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}.ks-tags{margin-top:9px}.ks-actions{margin-top:10px}
      .ks-secondary{border:0;border-radius:14px;padding:10px 13px;background:#edf2fb;color:#42516c;font:inherit;font-weight:700}.ks-link{border:0;background:transparent;color:#1675ff;font:inherit;font-weight:750}
      .ks-nav{position:sticky;bottom:0;display:grid;grid-template-columns:repeat(4,1fr);margin:26px -4px -4px;padding:10px 8px calc(10px + env(safe-area-inset-bottom));background:rgba(248,250,255,.97);backdrop-filter:blur(18px);border-top:1px solid rgba(24,34,62,.08);z-index:10}.ks-nav button{border:0;background:transparent;color:#7b88a0;padding:6px 2px;font:inherit;font-size:11px;font-weight:700}.ks-nav button span{display:block;font-size:19px;margin-bottom:3px}.ks-nav .on{color:#157cff}.ks-select{width:100%;border:1px solid rgba(21,31,57,.14);border-radius:16px;padding:13px 14px;background:#fff;font:inherit;color:#11182e}
    `;
    document.head.appendChild(style);
  }

  function nav(active = 'search') {
    return `<nav class="ks-nav">
      <button class="${active === 'search' ? 'on' : ''}" data-ks-nav="search"><span>⌕</span>Search</button>
      <button class="${active === 'sources' ? 'on' : ''}" data-ks-nav="sources"><span>▦</span>Sources</button>
      <button data-ks-nav="collector"><span>♧</span>Collector</button>
      <button class="${active === 'settings' ? 'on' : ''}" data-ks-nav="settings"><span>⚙</span>Settings</button>
    </nav>`;
  }

  function bindNav(root) {
    root.querySelectorAll('[data-ks-nav]').forEach((button) => button.addEventListener('click', () => {
      const target = button.dataset.ksNav;
      if (target === 'search') return renderSearch();
      if (target === 'sources') return window.renderTelegramSources?.();
      if (target === 'settings') return renderSettings();
      window.showSheet?.('Group Collector', 'Next module: collect and classify Telegram groups, then add selected groups into Sources.');
    }));
  }

  function resultCard(item, index) {
    const title = item.chatTitle || (item.chatUsername ? `@${item.chatUsername}` : 'Telegram');
    const meta = `${formatDate(item.date)}${item.chatUsername ? ` · @${item.chatUsername}` : ''}`;
    return `<article class="ks-result"><strong>${esc(title)}</strong><br><small>${esc(meta)}</small>
      <p id="ks-r-${index}" class="ks-text" data-collapsed="1">${esc(item.text || '')}</p>
      ${(item.matchedQueries || []).length ? `<div class="ks-tags">${item.matchedQueries.slice(0, 4).map((q) => `<span class="ks-tag">${esc(q)}</span>`).join('')}</div>` : ''}
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
      <section class="setup-hero" style="padding-bottom:10px"><span class="setup-hero__icon">⌕</span><h1>Telegram Search</h1><p>Multiple exact keywords in one run.</p></section>
      <div class="ks-info"><strong>Keyword set</strong>Separate words or phrases with commas or new lines. Astel searches each one, merges results and removes duplicates.</div>
      <section class="ks-card"><div id="ks-status"></div><label for="ks-keywords" style="font-weight:800">Keywords <span id="ks-count" style="float:right;color:#7a879f;font-weight:600">0/20</span></label>
        <textarea id="ks-keywords" class="ks-textarea" placeholder="тканина\nкуплю тканину\nпродам тканину"></textarea><div id="ks-preview" class="ks-preview"></div>
        <div class="ks-examples"><button class="ks-example" data-add="тканина">+ тканина</button><button class="ks-example" data-add="куплю">+ куплю</button><button class="ks-example" data-add="продам">+ продам</button></div>
        <button class="ks-primary" data-run>Search all keywords</button></section>
      <section class="ks-card" style="display:flex;justify-content:space-between;align-items:center"><div><strong>🗓 Period</strong><div style="color:#7a879f;margin-top:3px">${periodLabel(pref.periodHours)}</div></div><button class="ks-link" data-settings>Change</button></section>
      <section><div class="ks-head"><h3>Results</h3><span id="ks-results-count">—</span></div><div id="ks-results"></div></section>${nav('search')}</div>`;

    app.querySelector('[data-back]').addEventListener('click', renderHub); app.querySelector('[data-settings]').addEventListener('click', renderSettings); bindNav(app);
    const input = app.querySelector('#ks-keywords'); input.addEventListener('input', () => syncPreview(app)); syncPreview(app);
    app.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => { input.value = parseKeywords(`${input.value}\n${button.dataset.add}`).join('\n'); syncPreview(app); input.focus(); }));
    app.querySelector('[data-run]').addEventListener('click', async (event) => {
      const keywords = syncPreview(app), status = app.querySelector('#ks-status'), results = app.querySelector('#ks-results'), count = app.querySelector('#ks-results-count'), button = event.currentTarget;
      if (!keywords.length) { status.className = 'ks-status ks-error'; status.textContent = 'Add at least one keyword.'; return; }
      button.disabled = true; status.className = 'ks-status ks-loading'; results.innerHTML = ''; count.textContent = '…';
      try {
        const payload = await searchSet(keywords, pref.periodHours, (i, total, keyword) => { status.textContent = `Searching ${i}/${total}: ${keyword}`; });
        count.textContent = String(payload.count || 0); status.className = 'ks-status ks-ok'; status.textContent = `Searched ${keywords.length} keyword(s) across ${payload.sources.length} source(s).`; renderResults(results, payload); tg?.HapticFeedback?.notificationOccurred?.('success');
      } catch (error) { count.textContent = '0'; status.className = 'ks-status ks-error'; status.textContent = error.message; }
      finally { button.disabled = false; }
    });
  }

  function renderSettings() {
    styles(); const app = document.querySelector('#app'); if (!app) return; const pref = settings();
    app.innerHTML = `<div class="ks-wrap"><div class="topbar"><button class="topbar__back" data-back>‹ Search</button><span class="setup-badge">Preferences</span></div>
      <section class="setup-hero"><span class="setup-hero__icon">⚙</span><h1>Search Settings</h1><p>Default period for keyword search.</p></section>
      <section class="ks-card"><label style="font-weight:800">Default period</label><select id="ks-period" class="ks-select"><option value="24" ${pref.periodHours === 24 ? 'selected' : ''}>Last 24 hours</option><option value="168" ${pref.periodHours === 168 ? 'selected' : ''}>Last 7 days</option><option value="720" ${pref.periodHours === 720 ? 'selected' : ''}>Last 30 days</option></select><button class="ks-primary" data-save>Save Settings</button><div id="ks-save" style="text-align:center;color:#7a879f;margin-top:10px"></div></section>${nav('settings')}</div>`;
    app.querySelector('[data-back]').addEventListener('click', renderSearch); bindNav(app); app.querySelector('[data-save]').addEventListener('click', () => { const saved = saveSettings(app.querySelector('#ks-period').value); app.querySelector('#ks-save').textContent = `Saved: ${periodLabel(saved.periodHours)}.`; });
  }

  function renderHub() {
    styles(); const app = document.querySelector('#app'); if (!app) return;
    app.innerHTML = `<div class="ks-wrap"><div class="topbar"><button class="topbar__back" data-home>‹ Home</button><span class="setup-badge">Read only</span></div>
      <section class="setup-hero"><span class="setup-hero__icon">⌕</span><h1>Telegram Research</h1><p>Search and manage Telegram sources through your connected Research account.</p></section>
      <section class="quick-list"><button class="quick-action" data-search><span><strong>Search Telegram</strong><span>Search a set of exact keywords in one run</span></span><span class="quick-action__arrow">›</span></button><button class="quick-action" data-sources><span><strong>Sources</strong><span>Add or remove Telegram groups and channels</span></span><span class="quick-action__arrow">›</span></button><button class="quick-action" data-settings><span><strong>Search Settings</strong><span>Default search period</span></span><span class="quick-action__arrow">›</span></button><button class="quick-action" data-collector><span><strong>Group Collector</strong><span>Source discovery comes next</span></span><span class="quick-action__arrow">›</span></button><button class="quick-action" data-account><span><strong>Account</strong><span>Research account connection and authorization</span></span><span class="quick-action__arrow">›</span></button></section>${nav('search')}</div>`;
    app.querySelector('[data-home]').addEventListener('click', () => window.render?.()); app.querySelector('[data-search]').addEventListener('click', renderSearch); app.querySelector('[data-sources]').addEventListener('click', () => window.renderTelegramSources?.()); app.querySelector('[data-settings]').addEventListener('click', renderSettings); app.querySelector('[data-account]').addEventListener('click', () => window.renderTelegramSetup?.()); app.querySelector('[data-collector]').addEventListener('click', () => window.showSheet?.('Group Collector', 'Next module: collect and classify Telegram groups, then add selected groups into Sources.')); bindNav(app);
  }

  window.renderTelegramResearch = renderHub;
  window.renderTelegramSearch = renderSearch;
  window.renderTelegramSearchSettings = renderSettings;
})();
