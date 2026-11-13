// Naina webhook bot — server.
// Plain Node.js http, ZERO dependencies (nothing to npm-install, nothing
// to break on a free tier). Flow:
//   Meta webhook GET  /webhook  -> verification handshake (hub.challenge)
//   Meta webhook POST /webhook  -> X-Hub-Signature-256 check, then the
//                                 reply flow runs SYNCHRONOUSLY (LLM +
//                                 human-like pause + Graph send), and ONLY
//                                 then 200. On Vercel serverless the
//                                 function freezes the moment the response
//                                 is sent, so 200-first + async work
//                                 silently drops replies (13 Nov 2026:
//                                 LLM aborted ~82ms in, fallback selected
//                                 but never sent).
//   GET  /health -> "ok" (UptimeRobot keep-alive target)
//   GET  /       -> tiny status page
// Proactive subscriber care runs on an in-process timer (every 30 min) and
// ONLY messages fans who wrote within the last 24 hours (Meta's window rule).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadConfig } = require('./config');
const memory = require('./memory');
const { generateReply } = require('./brain');

const cfg = loadConfig();
const DATA_DIR = cfg.dataDir;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// ---------- Meta API helpers ----------

function graphUrl(pathname) {
  return `https://graph.instagram.com/${cfg.graphVersion}${pathname}`;
}

async function igGet(pathname) {
  const res = await fetch(graphUrl(pathname), {
    headers: { Authorization: `Bearer ${cfg.igAccessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GET ${pathname} -> ${res.status}`);
  return res.json();
}

async function sendText(recipientId, text) {
  const body = {
    recipient: { id: recipientId },
    message: { text: text.slice(0, 1000) }, // Instagram text limit: 1000 chars
    messaging_type: 'RESPONSE',
  };
  const res = await fetch(graphUrl(`/${cfg.igUserId}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.igAccessToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 24h window expired (code 10, subcode 2534022): fan went quiet, do NOT retry.
    if (data?.error?.error_subcode === 2534022 || data?.error?.code === 10) {
      log('[send] outside 24h window, skipping:', recipientId);
      return { ok: false, windowExpired: true };
    }
    log('[send] failed', res.status, JSON.stringify(data).slice(0, 300));
    return { ok: false };
  }
  return { ok: true, messageId: data.message_id };
}

async function sendImage(recipientId, imageUrl) {
  const body = {
    recipient: { id: recipientId },
    message: { attachment: { type: 'image', payload: { url: imageUrl } } },
    messaging_type: 'RESPONSE',
  };
  const res = await fetch(graphUrl(`/${cfg.igUserId}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.igAccessToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    log('[sendImage] failed', res.status);
    return { ok: false };
  }
  return { ok: true };
}

// Best-effort username lookup for a sender IGSID. Marked UNVERIFIED against
// Meta docs — if it fails we just keep chatting without a username.
async function lookupUsername(igsid) {
  try {
    const data = await igGet(`/${igsid}?fields=username`);
    return data && data.username ? data.username : '';
  } catch {
    return '';
  }
}

// ---------- Signature verification ----------

function validSignature(rawBody, header) {
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', cfg.appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------- Reply pipeline ----------

const REACTION_LINES = [
  'aww thank you! 🤍',
  'hehe, pasand aaya? 😊',
  '❤️ thank you!',
  'tum hamesha pehle dekhte ho, maine notice kiya ✨',
];

function randomDelay() {
  const min = cfg.replyDelayMinMs;
  const max = Math.max(min, cfg.replyDelayMaxMs);
  return min + Math.random() * (max - min);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function istNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: cfg.timezone }));
}

function hoursSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 3600000;
}

function pushHistory(fan, from, text) {
  fan.history = fan.history || [];
  fan.history.push({ from, text: String(text).slice(0, 500), at: new Date().toISOString() });
  fan.history = fan.history.slice(-10);
}

async function handleIncomingText(senderId, text, mid) {
  if (memory.hasSeen(DATA_DIR, mid)) return; // Meta retry — never double-reply
  memory.markSeen(DATA_DIR, mid);

  const fan = memory.loadFan(DATA_DIR, senderId);
  fan.last_message_at = new Date().toISOString();
  pushHistory(fan, 'fan', text);
  memory.saveFan(DATA_DIR, fan); // persist immediately — even if the send later fails
  // Username lookup is best-effort and must never slow the reply down.
  lookupUsername(senderId).then((name) => {
    if (name && !fan.username) { fan.username = name; memory.saveFan(DATA_DIR, fan); }
  }).catch(() => {});

  const result = await generateReply(cfg, fan, (fan.history || []).slice(0, -1), text);
  if (result.action === 'ignore') {
    log(`[skip] ${senderId}: ${result.reason}`);
    fan.flagged = true;
    fan.notes = (fan.notes ? fan.notes + ' | ' : '') + `ignored (${result.reason}) ${new Date().toISOString().slice(0, 10)}`;
    memory.saveFan(DATA_DIR, fan);
    return;
  }

  // Human-like pause: a real girl never answers in 0.3 seconds.
  await sleep(randomDelay());

  const sent = await sendText(senderId, result.reply);
  if (sent.ok) {
    pushHistory(fan, 'naina', result.reply);
    const p = result.parsed || {};
    if (p.name) fan.name = p.name;
    if (p.language) fan.language = p.language;
    if (p.birthday) fan.birthday = p.birthday;
    if (Array.isArray(p.interests) && p.interests.length) {
      fan.interests = [...new Set([...(fan.interests || []), ...p.interests])].slice(0, 10);
    }
    if (p.under18) fan.under18 = true;
    if (p.abuse || p.spam) fan.flagged = true;
    if (p.notes) fan.notes = (fan.notes ? fan.notes + ' | ' : '') + p.notes;
    if (p.what_worked) fan.what_worked = p.what_worked;
    if (p.pitch_now && !fan.pitched_at && !fan.pitch_declined) {
      fan.pitched_at = new Date().toISOString().slice(0, 10);
    }
    memory.applyWarmth(fan, typeof p.warmth_delta === 'number' ? p.warmth_delta : 10);
    // Streak: consecutive days of chatting.
    const today = new Date().toISOString().slice(0, 10);
    if (fan.last_active_date && fan.last_active_date !== today) {
      const gap = (new Date(today) - new Date(fan.last_active_date)) / 86400000;
      fan.streak_days = gap === 1 ? (fan.streak_days || 0) + 1 : 1;
    } else if (!fan.last_active_date) {
      fan.streak_days = 1;
    }
    fan.last_active_date = today;
    memory.saveFan(DATA_DIR, fan);
    log(`[reply] -> ${fan.username || senderId}: ${result.reply.slice(0, 80)}`);
  }
}

// Shares / stickers / story reactions carry no text — a short human reaction.
async function handleIncomingAttachment(senderId, mid) {
  if (memory.hasSeen(DATA_DIR, mid)) return;
  memory.markSeen(DATA_DIR, mid);
  const fan = memory.loadFan(DATA_DIR, senderId);
  fan.last_message_at = new Date().toISOString();
  await sleep(randomDelay());
  const line = REACTION_LINES[Math.floor(Math.random() * REACTION_LINES.length)];
  const sent = await sendText(senderId, line);
  if (sent.ok) {
    pushHistory(fan, 'fan', '[shared a post/story]');
    pushHistory(fan, 'naina', line);
    memory.applyWarmth(fan, 5);
    memory.saveFan(DATA_DIR, fan);
  }
}

async function handleMessagingEvent(event) {
  const senderId = event?.sender?.id;
  if (!senderId || senderId === cfg.igUserId) return; // own message / echo
  const msg = event.message;
  if (!msg || msg.is_echo) return; // echo of our own send
  const mid = msg.mid || `${senderId}-${event.timestamp}`;
  if (msg.text) {
    await handleIncomingText(senderId, msg.text, mid);
  } else if (msg.attachments || msg.sticker_id || msg.quick_reply || event.postback) {
    await handleIncomingAttachment(senderId, mid);
  }
  // delivery/read receipts (event.delivery / event.read) carry no message — ignore.
}

// ---------- Proactive subscriber care (timer, every 30 min) ----------
// Meta only allows proactive sends inside the 24h window, so we ONLY
// message fans who wrote within the last 24 hours. Birthday + win-back
// + weekly subscriber check-in. No guilt trips, ever.

function listPhotoUrls() {
  if (!cfg.publicBaseUrl) return [];
  const dir = path.join(__dirname, 'public', 'photos');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => `${cfg.publicBaseUrl.replace(/\/$/, '')}/photos/${encodeURIComponent(f)}`);
}

async function proactiveTick() {
  try {
    const now = istNow();
    const hour = now.getHours();
    const today = now.toISOString().slice(0, 10);
    const fans = memory.listFans(DATA_DIR);
    const photos = listPhotoUrls();
    for (const fan of fans) {
      if (!fan.subscriber && !fan.birthday) continue;
      if (hoursSince(fan.last_message_at) > 24) continue; // outside Meta window
      if (fan.flagged || fan.under18) continue;

      // Birthday today (subscriber or warm fan with birthday on file).
      if (fan.birthday && fan.birthday.slice(5) === today.slice(5) && hour >= 9 && hour < 11) {
        if (fan.last_birthday_wish === today) continue;
        const sent = await sendText(fan.igsid, `Happy Birthday! 🎂 tumhara din bahut khaas ho, cake kha lena meri taraf se bhi 🤍`);
        if (sent.ok) { fan.last_birthday_wish = today; memory.saveFan(DATA_DIR, fan); }
        continue;
      }
      if (!fan.subscriber) continue;

      // Good morning 9-10am, only if they chatted in the last 3 days.
      if (hour >= 9 && hour < 10 && hoursSince(fan.last_message_at) <= 72) {
        if (fan.last_good_morning === today) continue;
        const sent = await sendText(fan.igsid, 'good morning! ☀️ aaj ka din tumhara ho 🤍');
        if (sent.ok) { fan.last_good_morning = today; memory.saveFan(DATA_DIR, fan); }
        continue;
      }

      // Win-back: subscriber silent 7+ days (but still inside the 24h window
      // this can only happen if they wrote <24h ago after a gap — so check
      // last_active_date instead: if they returned after 7 days, welcome back).
      // Weekly exclusive photo: handled by the good-morning path above when a
      // photo is available — send at most one photo per week per subscriber.
      if (photos.length && hour >= 18 && hour < 20) {
        const lastPhoto = fan.last_photo_at ? new Date(fan.last_photo_at).getTime() : 0;
        if (Date.now() - lastPhoto > 7 * 86400000) {
          const url = photos[Math.floor(Math.random() * photos.length)];
          const sent = await sendImage(fan.igsid, url);
          if (sent.ok) {
            fan.last_photo_at = new Date().toISOString();
            memory.saveFan(DATA_DIR, fan);
            await sleep(1500);
            await sendText(fan.igsid, 'tumhare liye, pehle tum dekh lo ✨');
          }
        }
      }
    }
  } catch (e) {
    log('[proactive] error:', e.message);
  }
}

// ---------- HTTP server ----------

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // Keep-alive + health check (UptimeRobot target).
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/ping')) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Naina DM webhook bot</h1><p>Running. Webhook: POST /webhook</p>');
      return;
    }

    // Serve public photos (exclusive subscriber photos).
    if (req.method === 'GET' && url.pathname.startsWith('/photos/')) {
      const file = path.join(__dirname, 'public', decodeURIComponent(url.pathname));
      const base = path.join(__dirname, 'public');
      if (!file.startsWith(base) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(file).toLowerCase();
      const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': type });
      fs.createReadStream(file).pipe(res);
      return;
    }

    if (url.pathname === '/webhook') {
      // --- Verification handshake (GET) ---
      if (req.method === 'GET') {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');
        if (mode === 'subscribe' && token === cfg.verifyToken && challenge) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(challenge);
        } else {
          res.writeHead(403);
          res.end('verify token mismatch');
        }
        return;
      }

      // --- Event delivery (POST) ---
      if (req.method === 'POST') {
        const raw = await readRawBody(req);
        if (!validSignature(raw, req.headers['x-hub-signature-256'])) {
          log('[webhook] bad signature, rejected');
          res.writeHead(401);
          res.end('bad signature');
          return;
        }
        let body;
        try { body = JSON.parse(raw.toString('utf8')); } catch {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('EVENT_RECEIVED');
          return;
        }
        if (body.object === 'instagram') {
          // Process SYNCHRONOUSLY, then answer 200. Serverless freezes
          // the moment the response is sent, so nothing may run after
          // res.end() — the old 200-first pattern killed the reply here
          // (LLM aborted, fallback never sent). Total pre-200 work is
          // bounded (~18s worst case): short LLM timeouts + a modest
          // human pause on Vercel, so Meta's ~20s window is respected.
          // A Meta retry of the same mid is swallowed by the seen-mid
          // dedupe in handleIncomingText/handleIncomingAttachment.
          for (const entry of body.entry || []) {
            for (const event of entry.messaging || []) {
              await handleMessagingEvent(event).catch((e) => log('[event] error:', e.message));
            }
          }
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('EVENT_RECEIVED');
        return;
      }
    }

    res.writeHead(404);
    res.end('not found');
  } catch (e) {
    log('[server] error:', e.message);
    try { res.writeHead(500); res.end('error'); } catch { /* already sent */ }
  }
});

server.listen(cfg.port, () => {
  log(`Naina webhook bot listening on :${cfg.port}`);
  log(`Webhook URL path: /webhook  |  Health: /health`);
});

// Proactive care timer (only does anything when a fan is inside the 24h window).
setInterval(proactiveTick, 30 * 60 * 1000);
setTimeout(proactiveTick, 60 * 1000); // first check 1 min after boot
