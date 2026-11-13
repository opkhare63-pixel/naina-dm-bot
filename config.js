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
    // On Vercel the reply flow runs BEFORE the 200 (serverless freezes
    // after the response), so the pause is kept modest there: LLM + pause
    // + send must stay inside ~18s (Meta's ~20s window, 60s Hobby cap).
    // Standalone/Render keeps the slower 8-20s pause (200 was fast there,
    // but the sync flow is now the same everywhere, so the pause still
    // counts toward Meta's window — env can raise it if ever needed).
    replyDelayMinMs: parseInt(process.env.REPLY_DELAY_MIN_MS || (process.env.VERCEL === '1' ? '2000' : '8000'), 10),
    replyDelayMaxMs: parseInt(process.env.REPLY_DELAY_MAX_MS || (process.env.VERCEL === '1' ? '5000' : '20000'), 10),
    // Per-attempt LLM timeout. Vercel default 10s (two attempts max, so
    // worst case LLM is ~20s; standalone keeps the old 20s). Overridable
    // with LLM_TIMEOUT_MS.
    llmTimeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || (process.env.VERCEL === '1' ? '10000' : '20000'), 10),
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
