# Naina Webhook Bot — RESEARCH NOTES
Researched 13 Nov 2026. Everything below was checked against Meta's
developer docs (directly or via multiple independent guides that cite them)
and Google/Render docs. Where Meta's own pages could not be opened directly,
that is stated honestly.

## IMPORTANT — what could NOT be verified directly
- **developers.facebook.com returned HTTP 403 to our fetcher** on 13 Nov 2026
  (both the Instagram messaging-api page and the webhooks page). The facts
  below are therefore verified from **multiple independent secondary sources
  that all agree and cite Meta's docs** (see Sources), not from a direct read
  of Meta's pages. Before going Live, re-check the two Meta doc URLs in
  SETUP.md step 6 from a browser.
- **Username lookup for a sender IGSID** (`GET /{igsid}?fields=username`):
  UNVERIFIED. The code tries it best-effort and works fine without it.
- **Whether first DMs from non-followers (Requests folder) trigger the
  `messages` webhook**: UNVERIFIED. Test this in dev mode with a second
  account that does NOT follow Naina. If the webhook does not fire for
  Requests, those fans must first be accepted in the Instagram app — the bot
  cannot accept requests by API. (The Muse cron bot handled this by polling
  the Requests folder; the webhook bot cannot.)

## VERIFIED — Instagram API with Instagram Login (graph.instagram.com)
- Professional (Business/Creator) accounts only. Personal accounts have no
  API access. Naina (@its_naina_official1) is a Creator account — OK.
- No Facebook Page needed for this path (unlike the older Facebook Login path).
- Host: `https://graph.instagram.com` (Facebook Login path uses
  `graph.facebook.com` — this bot uses the Instagram Login path only).
- Permissions (scopes) needed: `instagram_business_basic` +
  `instagram_business_manage_messages`. (Facebook Login equivalents:
  `instagram_basic` + `instagram_manage_messages` + `pages_manage_metadata`.)
- **Instagram Messaging API is FREE.** Meta charges no per-message,
  per-conversation or per-API-call fee for Instagram messaging (unlike
  WhatsApp, which bills per message). Confirmed by multiple pricing guides
  checked against Meta docs, Sep–Nov 2026.

## VERIFIED — Webhooks
- Object type: `instagram`. Subscribe fields for DMs: `messages`
  (add `messaging_postbacks` for quick replies/ice-breakers, `comments`
  for comment events — this bot subscribes to `messages` only in v1).
- Per-account subscription (Instagram Login): after dashboard setup, call
  `POST https://graph.instagram.com/v26.0/me/subscribed_apps?subscribed_fields=comments,messages`
  once with that account's token. (Also configurable in App Dashboard →
  Webhooks product.)
- GET verification handshake: Meta sends `hub.mode=subscribe`,
  `hub.verify_token`, `hub.challenge`. Endpoint must check mode + token and
  answer HTTP 200 with the raw `hub.challenge` value as the body.
- Every POST delivery carries `X-Hub-Signature-256: sha256=<hex>` — an
  HMAC-SHA256 of the **raw request body bytes**, keyed with the **App
  Secret**. Compute over raw bytes (never re-serialized JSON) and compare
  with a timing-safe comparison. Reject mismatches with 401.
- Payload shape: `{object:"instagram", entry:[{messaging:[{sender:{id},
  recipient:{id}, timestamp, message:{mid, text, is_echo, attachments}}]}]}`.
  `sender.id` is the Instagram-scoped ID (IGSID) — use it as the reply
  recipient. `is_echo: true` = echo of our own send — ignore.
- Acknowledge with HTTP 200 within a few seconds; Meta retries failed
  deliveries for ~36h, then drops them. On a LONG-RUNNING server, reply
  200 first and do the LLM work async. **On Vercel serverless, do the
  OPPOSITE: process the reply synchronously and send 200 AFTER — the
  function freezes the moment the response is sent, so 200-first kills
  the reply (proven 13 Nov 2026: LLM aborted ~82ms in, fallback selected
  but never sent).**

## VERIFIED — Sending a message
- Endpoint: `POST https://graph.instagram.com/{version}/{ig-user-id}/messages`
  with `Authorization: Bearer <Instagram user access token>`.
- Body (text): `{"recipient":{"id":"<IGSID>"},"message":{"text":"..."},
  "messaging_type":"RESPONSE"}`. Text limit: 1000 characters.
- Private reply to a commenter: same endpoint, `recipient: {"comment_id":
  "..."}` instead of an IGSID (within 7 days of the comment, once per
  commenter). Not implemented in v1.
- Image: `message: {"attachment": {"type": "image", "payload": {"url":
  "<public https url>"}}}`.
- Success returns `{message_id: "mid...."}`.
- **24-hour window:** you may only reply within 24h of the user's last
  message. Outside it the send fails (error code 10, subcode 2534022:
  "message sent outside of allowed window"). The ONLY extension is the
  `HUMAN_AGENT` tag (7 days) — it is for **human agents only**, requires
  App Review, and the bot NEVER uses it. Consequence: proactive messages
  (good morning, birthday, win-back) are only sent if the fan wrote within
  the last 24h — the code enforces this.
- **Rate limits** (Instagram Login, per professional account):
  Send API 100 calls/second (text); private replies 750/hour. No daily DM
  cap published by Meta. This bot sends at most 1 reply per incoming
  message + rare proactive sends — far below the limits.
- **Reply-only by design:** the API cannot cold-DM anyone. Only people who
  messaged first (or commented) can be messaged.

## VERIFIED — App Review / Live mode / dev-mode limits
- In Development mode the app can only interact with users added as testers
  (max 25 test users). Real fans cannot be messaged until the app is Live.
- Going Live with `instagram_business_manage_messages` needs **Advanced
  Access**, granted only through **Meta App Review + Business Verification**.
  For messaging, Meta asks for a screen recording of the app sending a
  message and the inbox receiving it, plus the cURL request.
  (Sources: Meta App Review guides checked 9 Nov 2026.)
- Also enable in the Instagram app: Settings → Messages and story replies →
  Message controls → Connected tools → "Allow access to messages".
- Long-lived Instagram user tokens last **60 days** and must be refreshed
  before expiry (refresh endpoint exists; see SETUP.md troubleshooting).
- Graph API versions: v26.0 current (released 29 Jul 2026); v25.0 supported
  until Jul 2028. This bot defaults to v26.0, overridable via
  GRAPH_API_VERSION.

## VERIFIED — Gemini free tier (Nov 2026)
- Google AI Studio (aistudio.google.com) gives a free API key, no credit
  card. Free tier = free input/output tokens on eligible models, with
  rate limits shown live in AI Studio (Google no longer publishes fixed
  per-model numbers; reported values vary by project and date).
- **gemini-2.5-flash is DEPRECATED for new users** (announced Nov 2026):
  no longer selectable in AI Studio for new projects; shuts down
  1 Dec 2026 (requests auto-route to `gemini-3.5-flash-lite`). Same for
  `gemini-2.5-pro` → routes to `gemini-3.8-flash`. **New projects must use
  `gemini-3.5-flash-lite` or `gemini-3.8-flash`.** This bot defaults to
  `gemini-3.5-flash-lite`, fallback `gemini-3.8-flash`.
- Free-tier use: Google may use free-tier data to train models (privacy
  note — fan chats pass through Google's API).
- 429 handling: never hammer retries — Google may revoke a key after
  repeated 429s. This bot tries each model once, then falls back to a
  reply-bank line (no infinite retry).

## VERIFIED — Render free tier + keep-alive
- Free web service: 512 MB RAM, spins down after **15 minutes without
  inbound traffic**, cold start ~50-60s. 750 free instance-hours/month per
  workspace (one always-on service ≈ 744h/month — exactly one service).
- UptimeRobot free: 50 monitors, checks every 5 minutes, no card. A GET
  ping every 5 min keeps the service awake (this bot's `/health` endpoint).
- Honest caveat: Render's acceptable-use policy forbids "bypassing"
  restrictions; pingers are widely used and acknowledged by Render staff,
  but it is tolerance, not a guarantee. If the service sleeps, the first
  webhook after sleep is delayed ~60s (Meta retries) — the reply still
  arrives, just slower once. Alternative that never sleeps: Render's
  $7/month plan (not used here — the brief is $0).

## Sources (all checked 13 Nov 2026)
- Meta docs (cited, but 403 to our fetcher — re-check in a browser):
  developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
  developers.facebook.com/docs/instagram-platform/webhooks
  developers.facebook.com/docs/instagram-platform/overview
- https://flowgent.ai/blog/instagram-messaging-api
- https://socialift.uz/en/blog/instagram-messaging-api
- https://socialift.uz/en/docs/instagram-login-setup
- https://www.postmcpai.com/instagram-messaging-api
- https://www.infiq.in/glossary/instagram-messaging-api
- https://github.com/angellog/ai-instagram-agent/blob/HEAD/docs/RESEARCH.md
  (researched against official docs 2026-09-24)
- https://www.dmpop.com/meta-app-review-instagram (checked 9 Nov 2026)
- https://www.aifreeapi.com/en/posts/google-gemini-api-free-tier (11 Nov 2026)
- https://www.abhishekpatoliya.com/blog/gemini-api-free-tier-guide (Nov 2026)
- https://toolfreebie.com/free-bot-hosting-keepalive/ (Render + UptimeRobot)
- https://watchcron.com/guides/keep-alive-free-tier-hosting
