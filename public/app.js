const tg = window.Telegram?.WebApp;

const icon = (name) => {
  const icons = {
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 4.5A3 3 0 0 0 4 6v1a3 3 0 0 0-1 5.24A3.5 3.5 0 0 0 6.5 18H8"/><path d="M14.5 4.5A3 3 0 0 1 20 6v1a3 3 0 0 1 1 5.24A3.5 3.5 0 0 1 17.5 18H16"/><path d="M9.5 4.5V20M14.5 4.5V20M8 9h1.5M14.5 9H16M8 15h1.5M14.5 15H16"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.38.34.72.6 1 .3.28.68.42 1.1.4H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
  };
  return icons[name] || icons.bolt;
};

const modules = [
  { id: 'skills', title: 'Skills', description: 'Manage skills and integrations', icon: 'bolt', bg: '#e3f4ff', fg: '#188ee8' },
  { id: 'leads', title: 'Leads', description: 'Find and manage opportunities', icon: 'users', bg: '#eee8ff', fg: '#694ce4' },
  { id: 'research', title: 'Research', description: 'Search, analyze and get insights', icon: 'search', bg: '#dcf7e9', fg: '#12a66c' },
  { id: 'think', title: 'Think', description: 'Reason, plan and solve complex tasks', icon: 'brain', bg: '#fff0df', fg: '#f28d24' },
  { id: 'status', title: 'Status', description: 'Track progress and activity', icon: 'chart', bg: '#eae8ff', fg: '#6553e6' },
  { id: 'settings', title: 'Settings', description: 'Connect Telegram Research and configure Astel', icon: 'gear', bg: '#e9eef5', fg: '#57708f' },
];

const quickActions = [
  { id: 'telegram-setup', title: 'Connect Telegram Research', subtitle: 'Authorize the read-only research account' },
  { id: 'find-lead', title: 'Find a lead', subtitle: 'Start a new lead search' },
  { id: 'research-now', title: 'Research something', subtitle: 'Open Telegram Research' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function moduleCard(item) {
  return `
    <button class="module-card" data-module="${item.id}" aria-label="Open ${item.title}">
      <span class="module-card__icon" style="--icon-bg:${item.bg};--icon-fg:${item.fg}">${icon(item.icon)}</span>
      <h2>${item.title}</h2>
      <p>${item.description}</p>
      <span class="module-card__chevron">›</span>
    </button>`;
}

function quickAction(item) {
  return `
    <button class="quick-action" data-action="${item.id}">
      <span><strong>${item.title}</strong><span>${item.subtitle}</span></span>
      <span class="quick-action__arrow">›</span>
    </button>`;
}

function render() {
  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="topbar">
      <button class="topbar__back" data-back hidden>‹ Back</button>
      <button class="topbar__more" aria-label="More options">•••</button>
    </div>

    <section class="hero">
      <div class="logo-orb" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none"><path d="M32 7c3.3 13.4 11.6 21.7 25 25-13.4 3.3-21.7 11.6-25 25-3.3-13.4-11.6-21.7-25-25C20.4 28.7 28.7 20.4 32 7Z" fill="currentColor"/></svg>
      </div>
      <h1>Astel Assistant</h1>
      <p class="hero__tagline">Plan. Search. Execute.</p>
      <div id="connection-pill" class="connection-pill">
        <span class="connection-pill__dot"></span>
        <span id="connection-label">Connecting to Astel…</span>
      </div>
    </section>

    <section class="module-grid" aria-label="Astel modules">
      ${modules.map(moduleCard).join('')}
    </section>

    <div class="section-head">
      <h3>Quick Actions</h3>
      <button data-see-all>See all ›</button>
    </div>
    <section class="quick-list">
      ${quickActions.map(quickAction).join('')}
    </section>

    <nav class="bottom-nav" aria-label="Primary navigation">
      <button class="nav-item is-active" data-nav="home"><b>⌂</b>Home</button>
      <button class="nav-item" data-nav="leads"><b>◎</b>Leads</button>
      <button class="nav-item" data-nav="skills"><b>⚡</b>Skills</button>
      <button class="nav-item" data-nav="settings"><b>⚙</b>Settings</button>
    </nav>
  `;

  bindEvents();
  refreshHealth();
}

function showSheet(title, text) {
  const existing = document.querySelector('.sheet-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="sheet__handle"></div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      <button class="sheet__close">Close</button>
    </section>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector('.sheet__close').addEventListener('click', close);
  tg?.HapticFeedback?.impactOccurred?.('light');
}

function setupHeaders() {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-telegram-init-data': tg?.initData || '',
  };
}

async function setupApi(path, { method = 'GET', body } = {}) {
  if (!tg?.initData) throw new Error('Open Astel from the Telegram bot to authorize this setup.');
  const response = await fetch(`/api/telegram-research/setup/${path}`, {
    method,
    headers: setupHeaders(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Setup failed (${response.status})`);
  return payload;
}

async function sourceApi(path = '', { method = 'GET', body } = {}) {
  if (!tg?.initData) throw new Error('Open Astel from the Telegram bot to manage sources.');
  const response = await fetch(`/api/telegram-research/sources${path}`, {
    method,
    headers: setupHeaders(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Source request failed (${response.status})`);
  return payload;
}

function setupMessage(text, type = '') {
  const node = document.querySelector('#setup-message');
  if (!node) return;
  node.className = `setup-message ${type}`.trim();
  node.textContent = text || '';
}

function setSetupBusy(busy) {
  document.querySelectorAll('.setup-card button, .setup-card input').forEach((node) => {
    node.disabled = Boolean(busy);
  });
}

function showSetupStep(step) {
  document.querySelectorAll('[data-setup-step]').forEach((node) => {
    node.hidden = node.dataset.setupStep !== step;
  });
}

async function refreshSetupStatus() {
  try {
    const status = await setupApi('status');
    if (status.ready) {
      const account = status.telegram?.account || {};
      showSetupStep('done');
      const label = document.querySelector('#setup-account');
      label.textContent = account.username ? `@${account.username}` : (account.firstName || 'Telegram account');
      setupMessage('Telegram Research is connected and ready.', 'is-success');
      return;
    }

    if (status.auth?.step === 'password') showSetupStep('password');
    else if (status.auth?.step === 'code') showSetupStep('code');
    else showSetupStep('phone');
  } catch (error) {
    showSetupStep('phone');
    setupMessage(error.message, 'is-error');
  }
}

function renderTelegramResearch() {
  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="topbar">
      <button class="topbar__back" data-home>‹ Home</button>
      <span class="setup-badge">Read only</span>
    </div>
    <section class="setup-hero">
      <span class="setup-hero__icon">${icon('search')}</span>
      <h1>Telegram Research</h1>
      <p>Manage where Astel reads Telegram data. Railway stays under the hood.</p>
    </section>
    <section class="quick-list">
      <button class="quick-action" data-open-sources>
        <span><strong>Sources</strong><span>Add or remove Telegram groups and channels</span></span>
        <span class="quick-action__arrow">›</span>
      </button>
      <button class="quick-action" data-open-telegram-account>
        <span><strong>Account</strong><span>Research account connection and authorization</span></span>
        <span class="quick-action__arrow">›</span>
      </button>
      <button class="quick-action" data-collector-soon>
        <span><strong>Group Collector</strong><span>Source discovery comes next</span></span>
        <span class="quick-action__arrow">›</span>
      </button>
    </section>`;

  document.querySelector('[data-home]').addEventListener('click', render);
  document.querySelector('[data-open-sources]').addEventListener('click', renderTelegramSources);
  document.querySelector('[data-open-telegram-account]').addEventListener('click', renderTelegramSetup);
  document.querySelector('[data-collector-soon]').addEventListener('click', () => showSheet('Group Collector', 'Next module: discover and classify Telegram groups, then add selected sources into Research.'));
}

function renderSourceRows(sources) {
  if (!sources.length) {
    return '<p class="setup-footnote">No sources yet. Add a public @username or t.me link below.</p>';
  }
  return sources.map((item) => `
    <div class="quick-action" style="cursor:default;align-items:center;">
      <span style="min-width:0;">
        <strong>${escapeHtml(item.title || item.source)}</strong>
        <span>${escapeHtml(item.source)} · ${escapeHtml(item.type || 'telegram')} · ${escapeHtml(item.status || 'connected')}</span>
      </span>
      <button type="button" class="setup-secondary" style="width:auto;margin:0;padding:8px 12px;" data-delete-source="${escapeHtml(item.source)}">Delete</button>
    </div>`).join('');
}

async function loadSources() {
  const list = document.querySelector('#source-list');
  if (!list) return;
  list.innerHTML = '<p class="setup-footnote">Loading sources…</p>';
  try {
    const payload = await sourceApi();
    list.innerHTML = renderSourceRows(payload.sources || []);
    document.querySelector('#source-count').textContent = String(payload.count || 0);
    list.querySelectorAll('[data-delete-source]').forEach((button) => {
      button.addEventListener('click', async () => {
        const source = button.dataset.deleteSource;
        button.disabled = true;
        try {
          await sourceApi(`/${encodeURIComponent(source.replace(/^@/, ''))}`, { method: 'DELETE' });
          setupMessage(`${source} removed.`, 'is-success');
          await loadSources();
        } catch (error) {
          setupMessage(error.message, 'is-error');
          button.disabled = false;
        }
      });
    });
  } catch (error) {
    list.innerHTML = '';
    setupMessage(error.message, 'is-error');
  }
}

function renderTelegramSources() {
  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="topbar">
      <button class="topbar__back" data-research>‹ Research</button>
      <span class="setup-badge"><span id="source-count">0</span> sources</span>
    </div>
    <section class="setup-hero">
      <span class="setup-hero__icon">${icon('search')}</span>
      <h1>Telegram Sources</h1>
      <p>Add a public group or channel. Astel checks that the connected Research account can access it before saving.</p>
    </section>
    <section class="setup-card">
      <div id="setup-message" class="setup-message"></div>
      <form id="source-form">
        <label for="source-input">Telegram group / channel</label>
        <input id="source-input" type="text" autocomplete="off" placeholder="https://t.me/groupname or @groupname" required>
        <small>Public usernames only in v1. Astel does not join groups or send messages.</small>
        <button type="submit" class="setup-primary">Add source</button>
      </form>
    </section>
    <section id="source-list" class="quick-list" style="margin-top:16px;"></section>
    <p class="setup-footnote">Sources are stored on the persistent Research Worker volume, not in Railway environment variables.</p>`;

  document.querySelector('[data-research]').addEventListener('click', renderTelegramResearch);
  document.querySelector('#source-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    setSetupBusy(true);
    setupMessage('Checking source access…');
    try {
      const source = document.querySelector('#source-input').value.trim();
      const result = await sourceApi('', { method: 'POST', body: { source } });
      document.querySelector('#source-input').value = '';
      setupMessage(result.created ? `${result.source.source} added.` : `${result.source.source} is already in Sources.`, 'is-success');
      await loadSources();
    } catch (error) {
      setupMessage(error.message, 'is-error');
    } finally {
      setSetupBusy(false);
    }
  });
  loadSources();
}

function renderTelegramSetup() {
  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="topbar">
      <button class="topbar__back" data-home>‹ Home</button>
      <span class="setup-badge">Owner only</span>
    </div>

    <section class="setup-hero">
      <span class="setup-hero__icon">${icon('search')}</span>
      <h1>Telegram Research</h1>
      <p>Authorize your extra Telegram account once. The worker stays read-only and saves the session privately on Railway.</p>
    </section>

    <section class="setup-card">
      <div id="setup-message" class="setup-message"></div>

      <form data-setup-step="phone" id="phone-form">
        <label for="setup-phone">Telegram phone</label>
        <input id="setup-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+1 222 333 4455" required>
        <small>Use the extra account for Research. International format with +country code.</small>
        <button type="submit" class="setup-primary">Send Telegram code</button>
      </form>

      <form data-setup-step="code" id="code-form" hidden>
        <label for="setup-code">Code from Telegram</label>
        <input id="setup-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="12345" required>
        <small>The code normally arrives inside Telegram, not by SMS.</small>
        <button type="submit" class="setup-primary">Confirm code</button>
        <button type="button" class="setup-secondary" data-reset-auth>Start over</button>
      </form>

      <form data-setup-step="password" id="password-form" hidden>
        <label for="setup-password">Telegram 2FA password</label>
        <input id="setup-password" type="password" autocomplete="current-password" placeholder="Your Telegram 2FA password" required>
        <small>This is sent only to the private worker for Telegram authorization and is not stored.</small>
        <button type="submit" class="setup-primary">Finish authorization</button>
        <button type="button" class="setup-secondary" data-reset-auth>Start over</button>
      </form>

      <div data-setup-step="done" hidden class="setup-done">
        <div class="setup-done__check">✓</div>
        <strong id="setup-account">Telegram account</strong>
        <span>Research worker connected</span>
        <button type="button" class="setup-primary" data-open-sources>Manage Sources</button>
        <button type="button" class="setup-secondary" data-home>Back to Astel</button>
      </div>
    </section>

    <p class="setup-footnote">No auto-DM, posting or outreach is enabled. This connection is for reading/searching the sources you explicitly add.</p>
  `;

  document.querySelectorAll('[data-home]').forEach((button) => button.addEventListener('click', render));
  document.querySelector('[data-open-sources]').addEventListener('click', renderTelegramSources);

  document.querySelector('#phone-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    setSetupBusy(true);
    setupMessage('Sending code…');
    try {
      const phone = document.querySelector('#setup-phone').value.trim().replace(/[\s()-]/g, '');
      const delivery = await setupApi('begin', { method: 'POST', body: { phone } });
      showSetupStep('code');
      setupMessage(delivery.viaApp ? 'Code sent inside Telegram on an already logged-in device.' : 'Code request accepted by Telegram. Check the delivery method available for this account.', 'is-success');
      document.querySelector('#setup-code').focus();
    } catch (error) {
      setupMessage(error.message, 'is-error');
    } finally {
      setSetupBusy(false);
    }
  });

  document.querySelector('#code-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    setSetupBusy(true);
    setupMessage('Checking code…');
    try {
      const code = document.querySelector('#setup-code').value.trim();
      const result = await setupApi('code', { method: 'POST', body: { code } });
      if (result.step === 'password') {
        showSetupStep('password');
        setupMessage('2FA is enabled. Enter the Telegram password.');
        document.querySelector('#setup-password').focus();
      } else {
        showSetupStep('done');
        document.querySelector('#setup-account').textContent = result.account?.username ? `@${result.account.username}` : (result.account?.firstName || 'Telegram account');
        setupMessage('Connected. Session saved privately.', 'is-success');
      }
    } catch (error) {
      setupMessage(error.message, 'is-error');
    } finally {
      setSetupBusy(false);
    }
  });

  document.querySelector('#password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    setSetupBusy(true);
    setupMessage('Finishing authorization…');
    try {
      const password = document.querySelector('#setup-password').value;
      const result = await setupApi('password', { method: 'POST', body: { password } });
      document.querySelector('#setup-password').value = '';
      showSetupStep('done');
      document.querySelector('#setup-account').textContent = result.account?.username ? `@${result.account.username}` : (result.account?.firstName || 'Telegram account');
      setupMessage('Connected. Session saved privately.', 'is-success');
    } catch (error) {
      document.querySelector('#setup-password').value = '';
      setupMessage(error.message, 'is-error');
    } finally {
      setSetupBusy(false);
    }
  });

  document.querySelectorAll('[data-reset-auth]').forEach((button) => {
    button.addEventListener('click', async () => {
      setSetupBusy(true);
      try {
        await setupApi('reset', { method: 'POST', body: {} });
        showSetupStep('phone');
        setupMessage('Authorization reset.');
      } catch (error) {
        setupMessage(error.message, 'is-error');
      } finally {
        setSetupBusy(false);
      }
    });
  });

  refreshSetupStatus();
}

function bindEvents() {
  document.querySelectorAll('[data-module]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = modules.find((module) => module.id === button.dataset.module);
      if (item.id === 'settings') return renderTelegramSetup();
      if (item.id === 'research') return renderTelegramResearch();
      showSheet(item.title, `${item.description}. This block is already modular — we can connect real functionality here without rebuilding the Home screen.`);
    });
  });

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = quickActions.find((action) => action.id === button.dataset.action);
      if (item.id === 'telegram-setup') return renderTelegramSetup();
      if (item.id === 'research-now') return renderTelegramResearch();
      showSheet(item.title, `${item.subtitle}. Action wiring comes in the next implementation step.`);
    });
  });

  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-nav]').forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');
      if (button.dataset.nav === 'settings') return renderTelegramSetup();
      if (button.dataset.nav !== 'home') {
        const item = modules.find((module) => module.id === button.dataset.nav);
        showSheet(item?.title || 'Astel', item?.description || 'This section is ready to be connected.');
      }
    });
  });

  document.querySelector('.topbar__more').addEventListener('click', () => {
    showSheet('Astel Assistant', 'Mini App shell v1. The dashboard is config-driven, so modules can be added, removed or reordered without redesigning the app.');
  });
}

async function refreshHealth() {
  const pill = document.querySelector('#connection-pill');
  const label = document.querySelector('#connection-label');

  try {
    const response = await fetch('/health', { headers: { accept: 'application/json' } });
    const health = await response.json();
    if (!response.ok || !health.ok) throw new Error('Astel Core is not healthy');

    pill.classList.add('is-online');
    label.textContent = `Astel online · ${health.aiModels?.chat || 'AI ready'}`;
  } catch (_error) {
    label.textContent = 'Astel connection unavailable';
  }
}

function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.('#f7f9ff');
  tg.setBackgroundColor?.('#f4f7ff');
}

initTelegram();
render();
