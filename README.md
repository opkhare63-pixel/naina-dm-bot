# Naina DM Webhook Bot

Naina's own Instagram DM bot — **free, unlimited, instant** (seconds, not
polling). Receives DMs via Meta webhook, replies with Naina's full brain
(persona, warmth stages, fan-club funnel, safety rules).

## Files
| File | Kya hai |
|---|---|
| `server.js` | Webhook server (zero dependencies): GET verify, POST events, signature check, send, proactive care timer |
| `brain.js` | System prompt (PERSONA + HUMAN_TEXTING + EMOJI_SYSTEM + funnel + safety) + Gemini / OpenAI calls + fallback lines |
| `memory.js` | Per-fan JSON memory (same shape as `../fans/_template.json`) + seen-message dedupe + warmth/stage rules |
| `config.js` | Env-var config (secrets kabhi code me nahi) |
| `.env.example` | Env vars ki list — copy to `.env` and fill |
| `render.yaml` | Render one-click deploy |
| `RESEARCH_NOTES.md` | Meta/Gemini/Render facts — kya verify hua, kya unverified hai |
| `SETUP.md` | **Poora Hinglish deploy guide** — Nittu ke liye step-by-step |
| `public/photos/` | Exclusive subscriber photos (khud daalo; khaali ho to text-only) |
| `data/` | Fan memory files (gitignore me hai, deploy par nahi jati) |

## Quick start (local test)
```bash
cp .env.example .env   # fill in real values
node server.js
# curl http://localhost:3000/health            -> ok
# curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=test123"
#   -> test123 (challenge echo)
npm test   # syntax check all files
```

## How it works
1. Fan DM bhejta hai → Meta webhook POST karta hai (`object: "instagram"`).
2. Server signature check karta hai (`X-Hub-Signature-256`, HMAC-SHA256),
   turant 200 bhejta hai, phir async kaam karta hai.
3. Fan memory load hoti hai (warmth/stage/language/history).
4. Gemini (free tier) Naina ki awaaz me 1-line reply banata hai.
5. 8-20 second human-like pause ke baad reply `POST /{ig-id}/messages` se jata hai.
6. Sexualized openers / spam / link-only messages ka **koi jawab nahi** — ignore + flag.
7. Proactive care (good morning / birthday / weekly photo) sirf tab jab fan
   ne pichle 24 ghante me message kiya ho (Meta ka 24h window rule).

## Cost
- Instagram Messaging API: **$0** (Meta DM ke paise nahi leta).
- Render free tier: **$0** (15-min idle spin-down; UptimeRobot free ping se awake).
- Gemini free tier: **$0** (rate limits apply — free tier, no card).
- Total: **$0/month**. Contacts unlimited.

## Important limits (honest)
- Sirf reply kar sakta hai — cold DM kisi ko nahi bhej sakta (Meta ka rule).
- 24h window: fan ke last message ke 24h ke andar hi reply (webhook instant
  hai, to practically hamesha andar hota hai).
- Live hone ke liye Meta App Review + Business Verification chahiye; dev mode
  me sirf testers (max 25) ko reply.
- Requests-folder DMs par webhook fire hoga ya nahi — unverified, test karna
  hai (RESEARCH_NOTES.md dekho).
- **Jab ye bot live ho, Muse wala `naina-dm-bot` cron BAND karo** — warna
  double reply hoga.
