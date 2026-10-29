(() => {
  const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const pending = new Map();
  const states = { DRAFT: 'Черновик', NEEDS_APPROVAL: 'Ожидает согласования', APPROVED: 'План согласован', FAILED: 'Ошибка', PUBLISHED: 'Опубликован', CANCELLED: 'Отменён' };
  const button = (label, action) => { const node = el('button', label); node.type = 'button'; node.className = 'sheet__close'; node.onclick = action; return node; };
  const feedbackKey = item => `astel:video-feedback:${item.planId}:${item.card.digest}`;
  function savedRequest(key) {
    if (pending.has(key)) return pending.get(key);
    try { const value = JSON.parse(sessionStorage.getItem(key)); if (value && typeof value.requestId === 'string') { pending.set(key, value); return value; } } catch (_) {}
    return null;
  }
  function saveRequest(key, value) {
    if (value) pending.set(key, value); else pending.delete(key);
    try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); } catch (_) {}
  }
  function reserveFeedback(item, decision, note) {
    const key = feedbackKey(item), previous = savedRequest(key);
    if (previous && (previous.decision !== decision || previous.note !== note || previous.digest !== item.card.digest)) throw Error('Сначала проверь или повтори прежнее неподтверждённое решение.');
    const value = previous || { planId: item.planId, digest: item.card.digest, requestId: crypto.randomUUID(), decision, note };
    saveRequest(key, value); return value;
  }
  async function request(path, body) {
    const init = window.Telegram?.WebApp?.initData;
    if (!init) throw Error('Открой Canvas кнопкой в Telegram: /video или меню Canvas.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/distribution/' + path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-telegram-init-data': init }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages = { 401: 'Сессия Telegram истекла. Закрой Canvas и открой его снова из бота.', 403: 'Эта очередь доступна только владельцу.',
          404: 'Видеосвязка пока не подключена или карточка недоступна.', 409: 'Версия или статус изменились. Обнови карточку перед решением.',
          429: 'Слишком много проверок. Подожди минуту и обнови карточку.' };
        const error = Error(messages[response.status] || 'Связь с Hub недоступна. Обнови статус перед повтором.'); error.status = response.status; throw error;
      }
      return value;
    } finally { clearTimeout(timer); }
  }
  function sourceUrl(raw, driveOnly = false) {
    try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password && (!driveOnly || ['drive.google.com', 'drive.usercontent.google.com'].includes(url.hostname)) ? url.href : ''; } catch (_) { return ''; }
  }
  window.renderVideoWorkspace = async ({ planId } = {}) => {
    const root = document.querySelector('#app'), view = el('section'); view.className = 'video-workspace'; root.replaceChildren(view);
    const current = () => root.contains(view);
    const status = el('p'); status.setAttribute('role', 'status');
    view.append(button('‹ Очередь Canvas', () => window.renderDistribution()), el('h1', 'Видеочерновики Astel'),
      el('p', 'Посмотри точную версию и оставь правку. Принятие черновика не разрешает публикацию.'), status);
    const refresh = button('Обновить видеочерновики', () => window.renderVideoWorkspace({ planId })); view.append(refresh);
    const list = el('section'), detail = el('article'); list.setAttribute('aria-label', 'Список видеочерновиков'); detail.className = 'setup-hero video-workspace__detail'; view.append(list, detail);
    let selected = 0;
    async function showItem(item, features) {
      const selection = ++selected; detail.replaceChildren(el('p', 'Загрузка точной версии…'));
      try {
        const [record, plan] = await Promise.all([request('video-workspace/status', { planId: item.planId }), request('plans/' + item.planId)]);
        if (!current() || selection !== selected) return;
        item = { ...item, ...record }; const card = item.card, key = feedbackKey(item);
        const stored = savedRequest(key);
        if (stored && item.reviews?.some(review => review.id === stored.requestId)) {
          saveRequest(key, null); status.textContent = 'Решение найдено в Hub. Повторная отправка не нужна.';
        }
        const outstanding = savedRequest(key), latestReview = item.reviews?.at(-1);
        const safeArtifact = card?.artifact && typeof card.artifact.sha256 === 'string' && Number.isFinite(card.artifact.duration);
        if (!safeArtifact || plan.id !== item.planId || plan.digest !== item.inputDigest) throw Error('Не удалось подтвердить привязку точной версии. Обнови карточку.');
        detail.replaceChildren(el('h2', card.title), el('p', `Версия ${card.revision} · ${card.artifact.duration.toFixed(1)} с · ${states[plan.state] || plan.state}`),
          el('p', plan.input?.mode === 'simulation' ? 'Тестовый план (simulation)' : 'План публикации'),
          el('p', item.proof?.state === 'verified' ? 'Сервер проверил весь MP4; SHA-256 совпадает.' : 'Нужна серверная проверка MP4 с Mac.'));
        const media = sourceUrl(plan.input?.assets?.[0]?.url, true);
        if (media) {
          const video = el('video'); video.controls = true; video.preload = 'metadata'; video.playsInline = true; video.src = media;
          video.setAttribute('aria-label', 'Видео точной версии');
          const fallback = el('p', 'Предпросмотр не загрузился. Открой MP4 по ссылке ниже; версия и правки сохраняются.'); fallback.hidden = true;
          video.addEventListener('error', () => { fallback.hidden = false; });
          const link = el('a', 'Открыть MP4 отдельно'); link.href = media; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer';
          detail.append(video, fallback, link);
        } else detail.append(el('p', 'У этой версии нет доступной ссылки на MP4. Проверь передачу файла с Mac.'));
        detail.append(el('h3', 'Сценарий'), el('p', card.script));
        for (const source of card.sources || []) {
          const line = el('p', `${source.author || 'Автор не указан'} · ${source.license || 'Лицензия не указана'}`), url = sourceUrl(source.url);
          if (url) { const link = el('a', ' Исходник'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; line.append(link); } detail.append(line);
        }
        const identity = el('details'), summary = el('summary', 'Проверяемая версия'); identity.append(summary, el('p', `SHA-256 MP4: ${card.artifact.sha256}`), el('p', `План: ${item.planId}`)); detail.append(identity);
        if (latestReview) detail.append(el('p', (latestReview.decision === 'changes_requested' ? 'Запрошена правка: ' : 'Черновик принят: ') + (latestReview.note || 'без замечаний')));
        const note = el('textarea'); note.maxLength = 2000; note.rows = 4; note.placeholder = 'Что изменить в этой версии'; note.setAttribute('aria-label', 'Правка видеочерновика'); note.value = outstanding?.note || ''; detail.append(note);
        const actions = el('div'); actions.className = 'video-workspace__actions'; detail.append(actions);
        const feedbackButtons = []; let busy = false;
        for (const [decision, label] of [['changes_requested', 'Вернуть на правку'], ['draft_accepted', 'Принять видеочерновик']]) {
          const action = button(label, async () => {
            if (busy || !current()) return;
            const text = note.value.trim(); if (decision === 'changes_requested' && !text) { status.textContent = 'Напиши, что исправить в этой версии.'; note.focus(); return; }
            let body; try { body = reserveFeedback(item, decision, text); } catch (error) { status.textContent = error.message; return; }
            busy = true; feedbackButtons.forEach(node => { node.disabled = true; }); note.disabled = true;
            try { await request('video-workspace/feedback', body); saveRequest(key, null); status.textContent = 'Решение сохранено. Публикация не запускалась.'; }
            catch (error) {
              if ([400, 403, 404, 409].includes(error.status)) saveRequest(key, null);
              status.textContent = error.status ? error.message : 'Ответ не подтверждён. Обнови карточку или повтори то же решение — новый запрос не создаётся.';
            } finally { if (current() && selection === selected) await showItem(item, features); }
          });
          action.disabled = !item.latest || Boolean(outstanding && outstanding.decision !== decision); actions.append(action); feedbackButtons.push(action);
        }
        note.disabled = !item.latest || Boolean(outstanding);
        if (outstanding) detail.append(el('p', 'Предыдущее решение не подтверждено. Можно повторить только его же с прежним номером запроса.'));
        const proofFresh = item.proof?.state === 'verified' && Date.now() - Date.parse(item.proof.at) <= 86400000 && item.proof.sha256 === card.artifact.sha256;
        const future = plan.input?.destinations?.length && plan.input.destinations.every(target => Date.parse(target.scheduledAt) > Date.now());
        if (features.videoApprovals && item.latest && proofFresh && future && plan.state === 'NEEDS_APPROVAL' && latestReview?.decision !== 'changes_requested' && !outstanding) {
          const approve = button('Согласовать точную версию плана', async () => {
            if (busy || !current()) return; busy = true; approve.disabled = true; feedbackButtons.forEach(node => { node.disabled = true; });
            try { await request('approve', { planId: plan.id, digest: plan.digest }); status.textContent = 'План согласован. Отправка в Buffer не запускалась.'; }
            catch (error) { status.textContent = error.status ? error.message : 'Ответ о согласовании не подтверждён. Проверяем сохранённый статус.'; }
            finally { if (current() && selection === selected) await showItem(item, features); }
          }); detail.append(approve);
        }
        if (!item.latest) detail.append(el('p', 'Есть новая версия. Решения по этой карточке отключены.'));
        if (plan.state === 'NEEDS_APPROVAL' && !future) detail.append(el('p', 'Тестовый слот истёк. Подготовь новую передачу с Mac перед согласованием.'));
      } catch (error) {
        if (!current() || selection !== selected) return;
        detail.replaceChildren(el('p', error.message || 'Не удалось открыть эту карточку.'), button('Повторить загрузку карточки', () => showItem(item, features)));
      }
    }
    status.textContent = 'Загрузка…';
    try {
      const features = await request('features');
      if (!features.videoWorkspace) throw Error('Видеосвязка пока не подключена. Обычная очередь Canvas доступна по кнопке выше.');
      const data = await request('video-workspace/inbox', {});
      if (!current()) return;
      if (!Array.isArray(data.items)) throw Error('Получен неполный ответ очереди. Повтори проверку.');
      const items = data.items.filter(item => /^[a-f0-9]{64}$/.test(item.planId || '') && item.card?.artifact);
      status.textContent = items.length ? `Карточек: ${items.length}` : 'Новых черновиков пока нет. Собери ролик в OpenReel и передай его на согласование.';
      for (const item of items) {
        const entry = button(`${item.card.title} · версия ${item.card.revision}${item.latest ? '' : ' (архив)'}`, () => showItem(item, features)); entry.className = 'quick-action'; list.append(entry);
      }
      const focused = planId && items.find(item => item.planId === planId);
      if (planId && !focused) detail.append(el('p', 'Карточка из уведомления не найдена. Выбери актуальную версию в списке.'));
      else if (items.length) await showItem(focused || items.find(item => item.latest) || items[0], features);
    } catch (error) { if (current()) status.textContent = error.message || 'Очередь недоступна.'; }
  };
})();
