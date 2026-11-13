// Naina webhook bot — config. Secrets ONLY from environment variables.
// Never hardcode tokens or keys in this repo.
const REQUIRED = ['VERIFY_TOKEN', 'META_APP_SECRET', 'IG_ACCESS_TOKEN', 'IG_USER_ID', 'GEMINI_API_KEY'];

function loadConfig() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}. See .env.example`);
  }
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    verifyToken: process.env.VERIFY_TOKEN,
    appSecret: process.env.META_APP_SECRET,
    igAccessToken: process.env.IG_ACCESS_TOKEN,
    igUserId: process.env.IG_USER_ID,
    geminiApiKey: process.env.GEMINI_API_KEY,
    // Current free-tier flash models for NEW projects (Nov 2026):
    // gemini-2.5-flash is deprecated for new users and shuts down 1 Dec 2026.
    // Primary: gemini-3.5-flash-lite (free tier), fallback: gemini-3.8-flash.
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    graphVersion: process.env.GRAPH_API_VERSION || 'v26.0',
    // Human-like pause before sending a reply (webhook is instant, a real
    // girl never replies in 0.3 seconds). Random between min and max.
    replyDelayMinMs: parseInt(process.env.REPLY_DELAY_MIN_MS || '8000', 10),
    replyDelayMaxMs: parseInt(process.env.REPLY_DELAY_MAX_MS || '20000', 10),
    dataDir: process.env.DATA_DIR || './data',
    // Public base URL of this server (needed to send photos as attachments).
    // Example: https://naina-dm-bot.onrender.com
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
    // Quiet hours (IST): never START a new conversation 00:00–09:00.
    // Replies to an already-active chat are still sent (fan is waiting).
    quietStartHour: 0,
    quietEndHour: 9,
    timezone: 'Asia/Kolkata',
  };
}

module.exports = { loadConfig };
