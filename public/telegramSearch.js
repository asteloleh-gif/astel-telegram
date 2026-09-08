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

  async function searchTelegram({ query, periodHours, limit = 20 }) {
    if (!tg?.initData) throw new Error('Open Astel from the Telegram bot to use Telegram Research.');
    const response = await fetch('/api/telegram-research/search', {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify({ query, periodHours, limit }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Search failed (${response.status})`);
    return payload;
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

  function resultCard(item) {
    const title = item.chatTitle || (item.chatUsername ? `@${item.chatUsername}` : 'Telegram');
    const meta = `${formatDate(item.date)}${item.chatUsername ? ` · @${item.chatUsername}` : ''}`;
    const link = item.url
      ? `<button type="button" class="setup-secondary" style="width:auto;margin:10px 0 0;padding:8px 12px;" data-result-link="${escapeHtml(item.url)}">Open message</button>`
      : '';

    return `
      <article class="setup-card" style="margin-top:12px;">
        <strong style="display:block;margin-bottom:4px;">${escapeHtml(title)}</strong>
        <small style="display:block;margin-bottom:10px;">${escapeHtml(meta)}</small>
        <p style="white-space:pre-wrap;margin:0;">${escapeHtml(item.text || '')}</p>
        ${link}
      </article>`;
  }

  function bindResultLinks(root) {
    root.querySelectorAll('[data-result-link]').forEach((button) => {
      button.addEventListener('click', () => {
        const url = button.dataset.resultLink;
        if (!url) return;
        if (tg?.openLink) tg.openLink(url);
        else window.open(url, '_blank', 'noopener,noreferrer');
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
          <span><strong>Search Telegram</strong><span>Search messages across all saved Sources</span></span>
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
        <p>Search messages in every connected Telegram Source. No sending, joining or outreach.</p>
      </section>
      <section class="setup-card">
        <div id="telegram-search-message" class="setup-message"></div>
        <form id="telegram-search-form">
          <label for="telegram-search-query">What are you looking for?</label>
          <input id="telegram-search-query" type="text" autocomplete="off" placeholder="пошив, виробництво, шукаю..." required>
          <label for="telegram-search-period" style="margin-top:12px;">Period</label>
          <select id="telegram-search-period" class="setup-input" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:transparent;">
            <option value="24">Last 24 hours</option>
            <option value="168" selected>Last 7 days</option>
            <option value="720">Last 30 days</option>
          </select>
          <button type="submit" class="setup-primary" style="margin-top:14px;">Search Telegram</button>
        </form>
      </section>
      <section style="margin-top:16px;">
        <div class="section-head" style="margin-bottom:8px;">
          <h3>Results</h3>
          <span id="telegram-search-count">—</span>
        </div>
        <div id="telegram-search-results"></div>
      </section>`;

    app.querySelector('[data-search-back]').addEventListener('click', renderResearchHub);
    app.querySelector('#telegram-search-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const message = app.querySelector('#telegram-search-message');
      const results = app.querySelector('#telegram-search-results');
      const count = app.querySelector('#telegram-search-count');
      const query = app.querySelector('#telegram-search-query').value.trim();
      const periodHours = Number(app.querySelector('#telegram-search-period').value || 168);

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

        if (!items.length) {
          results.innerHTML = '<p class="setup-footnote">No matching messages in this period.</p>';
        } else {
          results.innerHTML = items.map(resultCard).join('');
          bindResultLinks(results);
        }

        if (Array.isArray(payload.errors) && payload.errors.length) {
          const errorText = payload.errors.map((item) => `${item.source}: ${item.error}`).join(' · ');
          results.insertAdjacentHTML('beforeend', `<p class="setup-footnote">Source errors: ${escapeHtml(errorText)}</p>`);
        }
      } catch (error) {
        count.textContent = '0';
        message.className = 'setup-message is-error';
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  window.renderTelegramResearch = renderResearchHub;
  window.renderTelegramSearch = renderTelegramSearch;
})();
