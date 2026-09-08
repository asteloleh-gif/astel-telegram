const RESEARCH_INSTRUCTIONS = `You are the research skill inside Astel Assistant.
Use web search for current, verifiable information. Prefer primary sources and recent sources.
Never invent facts, companies, people, contacts, prices, or URLs. If evidence is weak, say so.
Answer in the same language as the user's request. Keep the answer concise enough for one Telegram message.`;

const LEAD_INSTRUCTIONS = `You are the Lead Hunter skill inside Astel Assistant.
Use web search to find publicly available B2B leads that match the owner's request.
Only use lawful public information. Do not seek private data, credentials, gated data, or hidden personal information.
Do not invent contacts. Prefer actual buyer intent, RFQs, procurement notices, company requests, public discussions, or other strong demand signals.
For each lead give: name/company, what they appear to need, why it matches, confidence (high/medium/low), and a public source.
Return at most 8 strong leads; quality beats quantity. Answer in the same language as the user's request and keep it concise enough for one Telegram message.`;

function createResearchSkill({ provider, conversationStore, logger, policy } = {}) {
  if (!provider?.generate) throw new Error("researchSkill requires provider.generate");

  function parse(event) {
    const text = String(event?.text || "").trim();
    const [commandRaw, ...rest] = text.split(/\s+/);
    const command = (commandRaw || "").toLowerCase();
    if (!["/research", "/leads", "/lead"].includes(command)) return null;
    return { command, query: rest.join(" ").trim() };
  }

  function canHandle(event) {
    return Boolean(parse(event));
  }

  async function handle(event) {
    const parsed = parse(event);
    if (!parsed?.query) {
      return {
        text: [
          "Примеры:",
          "/research последние изменения пошлин США на автозапчасти",
          "/leads покупатели carbon fiber auto parts в США",
        ].join("\n"),
        rememberAssistant: false,
      };
    }

    await conversationStore.append(event, {
      role: "user",
      text: event.text,
      messageId: event.messageId,
    });

    const isLead = parsed.command === "/leads" || parsed.command === "/lead";
    const generated = await provider.generate({
      instructions: isLead ? LEAD_INSTRUCTIONS : RESEARCH_INSTRUCTIONS,
      input: parsed.query,
      model: policy?.openaiPowerModel || "gpt-5.6-terra",
      reasoningEffort: policy?.openaiPowerReasoningEffort || "medium",
      maxOutputTokens: policy?.aiPowerMaxOutputTokens || 1600,
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      include: ["web_search_call.action.sources"],
      maxToolCalls: 3,
    });

    const sourceLines = (generated.sources || []).slice(0, 5).map(url => `- ${url}`);
    let text = generated.text;
    if (sourceLines.length) text += `\n\nSources:\n${sourceLines.join("\n")}`;
    if (text.length > 3900) text = `${text.slice(0, 3860)}\n…`;

    logger.info({
      traceId: event.traceId,
      reasonCode: isLead ? "LEAD_RESEARCH_GENERATED" : "WEB_RESEARCH_GENERATED",
      conversationId: event.conversationId,
      messageId: event.messageId,
      userId: event.userId,
      extra: {
        model: generated.model,
        mode: "power",
        responseId: generated.responseId,
        sourceCount: generated.sources?.length || 0,
        usage: generated.usage,
      },
    });

    return {
      text,
      rememberAssistant: true,
      ai: generated,
    };
  }

  return { id: "research", canHandle, handle };
}

module.exports = { createResearchSkill, RESEARCH_INSTRUCTIONS, LEAD_INSTRUCTIONS };
