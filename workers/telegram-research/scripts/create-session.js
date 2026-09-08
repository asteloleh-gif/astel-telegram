const { createInterface } = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { TelegramClient } = require("teleproto");
const { StringSession } = require("teleproto/sessions");

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID || 0);
  const apiHash = String(process.env.TELEGRAM_API_HASH || "").trim();
  if (!apiId || !apiHash) {
    throw new Error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH before running npm run session");
  }

  const rl = createInterface({ input, output });
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.start({
      phoneNumber: async () => (await rl.question("Phone (+countrycode...): ")).trim(),
      phoneCode: async () => (await rl.question("Telegram code: ")).trim(),
      password: async () => (await rl.question("2FA password (if enabled): ")).trim(),
      onError: (error) => console.error("Telegram auth error:", error?.message || String(error)),
    });

    const me = await client.getMe();
    console.log(`Authorized as @${me?.username || "no_username"}`);
    console.log("\nTELEGRAM_SESSION (keep this secret; store it only in Railway Variables):\n");
    console.log(client.session.save());
  } finally {
    await client.disconnect().catch(() => null);
    rl.close();
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
