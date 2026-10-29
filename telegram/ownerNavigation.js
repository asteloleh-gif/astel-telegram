function miniAppUrl(base, { distribution = false, video = false, planId, project = 'copilot' } = {}) {
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    url.pathname = '/'; url.search = ''; url.hash = '';
    if (distribution || video) url.searchParams.set('distribution', '1');
    if (project === 'subteam') url.searchParams.set('distributionProject', 'subteam');
    if (video && project === 'copilot') {
      url.searchParams.set('video', '1');
      if (/^[a-f0-9]{64}$/.test(planId || '')) url.searchParams.set('planId', planId);
    }
    return url.toString();
  } catch (_) { return ''; }
}

async function configureOwnerNavigation({ telegram, env }) {
  const owner = String(env.TELEGRAM_OWNER_ID || '');
  const url = miniAppUrl(env.PUBLIC_BASE_URL, { distribution: true });
  if (env.VIDEO_WORKSPACE_ENABLED !== 'true' || !/^[1-9]\d{0,15}$/.test(owner) || !Number.isSafeInteger(Number(owner)) || !url) return { enabled: false };
  // Scope both settings to the existing owner's private chat, never globally.
  const commands = [
    ['start', 'Открыть Astel'], ['video', 'Видеочерновики и правки'],
    ['canvas', 'Открыть Canvas'], ['distribution', 'Очередь и согласования'],
    ['status', 'Статус помощника'], ['help', 'Команды и помощь'],
    ['think', 'Усиленный AI'], ['research', 'Веб-исследование'],
    ['leads', 'Публичные B2B лиды'], ['crew', 'AI-команда'], ['reset', 'Очистить память'],
  ].map(([command, description]) => ({ command, description }));
  await telegram.setMyCommands({ commands, scope: { type: 'chat', chat_id: Number(owner) } });
  await telegram.setChatMenuButton({ chatId: owner, text: 'Canvas', url });
  return { enabled: true, ownerScoped: true, commandCount: commands.length };
}

module.exports = { miniAppUrl, configureOwnerNavigation };
