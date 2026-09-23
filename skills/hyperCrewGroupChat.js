function isHyperCrewGroupChat(event, { chatId } = {}) {
  const configured = String(chatId || "").trim();
  if (!configured || !event?.conversationId) return false;
  if (String(event.conversationId) !== configured) return false;
  if (!event.isOwner) return false;
  if (/^\/(?:crew|team)(?:@\w+)?(?:\s|$)/i.test(String(event.text || "").trim())) return false;
  return Boolean(String(event.text || "").trim());
}

function agentEmoji(agentId) {
  return ({
    orchestrator: "👔",
    researcher: "🕵️",
    strategist: "🧠",
    copywriter: "✍️",
    reviewer: "👷",
    "distribution-manager": "🌍",
    visual: "🎨",
    analytics: "📊",
    "router-parser": "🧩",
  })[agentId] || "🤖";
}

function formatCrewReply(result) {
  const target = result?.target || {};
  const header = `${agentEmoji(target.id)} ${target.name || "Hyper Crew"} · ${target.title || target.id || "Agent"}`;
  const reply = String(result?.reply || "").trim();
  return reply ? `${header}\n\n${reply}` : header;
}

async function handleHyperCrewGroupChat({
  event,
  client,
  conversationStore,
  telegramAdapter,
  projectId = "astel-business",
  logger,
} = {}) {
  if (!event) throw new Error("Hyper Crew group chat requires event");
  if (!client?.chat) throw new Error("Hyper Crew group chat requires client");
  if (!conversationStore) throw new Error("Hyper Crew group chat requires conversation store");
  if (!telegramAdapter) throw new Error("Hyper Crew group chat requires telegram adapter");

  const history = await conversationStore.read(event);
  const result = await client.chat({
    text: event.text,
    projectId,
    history: history.slice(-12).map(item => ({ role: item.role, text: item.text })),
  });

  await conversationStore.append(event, {
    role: "user",
    text: event.text,
    messageId: event.messageId,
  });

  const message = formatCrewReply(result);
  const image = (Array.isArray(result?.artifacts) ? result.artifacts : [])
    .find(item => item?.type === "image" && /^data:image\/(png|jpeg|webp);base64,/.test(String(item.dataUrl || "")));

  if (image) {
    await telegramAdapter.sendPhoto({
      chatId: event.conversationId,
      dataUrl: image.dataUrl,
      caption: message.slice(0, 1024),
      replyToMessageId: event.messageId,
      threadId: event.threadId,
    });
  } else {
    await telegramAdapter.sendMessage({
      chatId: event.conversationId,
      text: message.slice(0, 4096),
      replyToMessageId: event.messageId,
      threadId: event.threadId,
    });
  }

  await conversationStore.append(event, {
    role: "assistant",
    text: result?.reply || "",
  });

  logger?.info?.({
    traceId: event.traceId,
    reasonCode: "HYPER_CREW_GROUP_REPLY",
    conversationId: event.conversationId,
    messageId: event.messageId,
    userId: event.userId,
    extra: {
      agentId: result?.target?.id || null,
      agentName: result?.target?.name || null,
      artifactCount: Array.isArray(result?.artifacts) ? result.artifacts.length : 0,
    },
  });

  return result;
}

module.exports = {
  isHyperCrewGroupChat,
  handleHyperCrewGroupChat,
  formatCrewReply,
  agentEmoji,
};
