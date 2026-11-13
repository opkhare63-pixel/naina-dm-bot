// Naina webhook bot — VERCEL serverless version.
// Same brain (brain.js), same memory shape (memory.js), same config
// (config.js) as the Render version (server.js), adapted for Vercel
// Serverless Functions (Hobby plan, free, NO card required).
//
// Differences from server.js — READ before changing anything:
//   1. NO long-running process: there is no proactive-care timer here
//      (good morning / birthday / weekly exclusive photo). On serverless
//      that timer CANNOT run — proactive care is NOT included in this
//      Vercel version and will need a separate cron/ping later.
//   2. The reply is processed SYNCHRONOUSLY inside the handler, then we
//      return 200. No fire-and-forget: a serverless function freezes the
//      moment the response is sent, so async work after res.send() may
//      never finish.
//   3. The human-like pause before replying (8-20s, from env) is kept,
//      but the Hobby plan caps one function invocation at 60 seconds, so
//      worst case is ~20s pause + 20s LLM timeout + 15s send timeout.
//   4. Fan memory lives in /tmp (see memory.js) — best-effort, resets on
//      cold start. The Muse 5-minute bot keeps the durable fan files.
//   5. No /photos serving here — Vercel serves public/ as static assets
//      and the weekly-photo feature needs the (missing) timer anyway.
// Zero dependencies: Node built-ins + global fetch only.

const crypto = require('crypto');
const { loadConfig } = require('../config');
const memory = require('../memory');
const { generateReply } = require('../brain');

// Vercel: disable the default JSON body parser — we need the RAW body
// to verify Meta's X-Hub-Signature-256 HMAC.
module.exports.config = { api: { bodyParser: false } };

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// ---------- Meta API helpers ----------

function graphUrl(cfg, pathname) {
  return `https://graph.instagram.com/${cfg.graphVersion}${pathname}`;
}

async function igGet(cfg, pathname) {
  const res = await fetch(graphUrl(cfg, pathname), {
    headers: { Authorization: `Bearer ${cfg.igAccessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GET ${pathname} -> ${res.status}`);
  return res.json();
}

async function sendText(cfg, recipientId, text) {
  const body = {
    recipient: { id: recipientId },
    message: { text: text.slice(0, 1000) }, // Instagram text limit: 1000 chars
    messaging_type: 'RESPONSE',
  };
  const res = await fetch(graphUrl(cfg, `/${cfg.igUserId}/messages`), {
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

// Best-effort username lookup for a sender IGSID. Marked UNVERIFIED against
// Meta docs — if it fails we just keep chatting without a username.
// NOTE (Vercel): this runs fire-and-forget, so on a cold function it may
// not finish before the response is sent. The fan file is already saved
// before this call, so nothing important is lost.
async function lookupUsername(cfg, igsid) {
  try {
    const data = await igGet(cfg, `/${igsid}?fields=username`);
    return data && data.username ? data.username : '';
  } catch {
    return '';
  }
}

// ---------- Signature verification ----------

function validSignature(cfg, rawBody, header) {
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', cfg.appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------- Reply pipeline (same logic as server.js) ----------

const REACTION_LINES = [
  'aww thank you! 🤍',
  'hehe, pasand aaya? 😊',
  '❤️ thank you!',
  'tum hamesha pehle dekhte ho, maine notice kiya ✨',
];

function randomDelay(cfg) {
  const min = cfg.replyDelayMinMs;
  const max = Math.max(min, cfg.replyDelayMaxMs);
  return min + Math.random() * (max - min);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pushHistory(fan, from, text) {
  fan.history = fan.history || [];
  fan.history.push({ from, text: String(text).slice(0, 500), at: new Date().toISOString() });
  fan.history = fan.history.slice(-10);
}

async function handleIncomingText(cfg, senderId, text, mid) {
  const DATA_DIR = cfg.dataDir;
  if (memory.hasSeen(DATA_DIR, mid)) return; // Meta retry — never double-reply
  memory.markSeen(DATA_DIR, mid);

  const fan = memory.loadFan(DATA_DIR, senderId);
  fan.last_message_at = new Date().toISOString();
  pushHistory(fan, 'fan', text);
  memory.saveFan(DATA_DIR, fan); // persist immediately — even if the send later fails
  // Username lookup is best-effort and must never slow the reply down.
  lookupUsername(cfg, senderId).then((name) => {
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
  await sleep(randomDelay(cfg));

  const sent = await sendText(cfg, senderId, result.reply);
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
async function handleIncomingAttachment(cfg, senderId, mid) {
  const DATA_DIR = cfg.dataDir;
  if (memory.hasSeen(DATA_DIR, mid)) return;
  memory.markSeen(DATA_DIR, mid);
  const fan = memory.loadFan(DATA_DIR, senderId);
  fan.last_message_at = new Date().toISOString();
  await sleep(randomDelay(cfg));
  const line = REACTION_LINES[Math.floor(Math.random() * REACTION_LINES.length)];
  const sent = await sendText(cfg, senderId, line);
  if (sent.ok) {
    pushHistory(fan, 'fan', '[shared a post/story]');
    pushHistory(fan, 'naina', line);
    memory.applyWarmth(fan, 5);
    memory.saveFan(DATA_DIR, fan);
  }
}

async function handleMessagingEvent(cfg, event) {
  const senderId = event?.sender?.id;
  if (!senderId || senderId === cfg.igUserId) return; // own message / echo
  const msg = event.message;
  if (!msg || msg.is_echo) return; // echo of our own send
  const mid = msg.mid || `${senderId}-${event.timestamp}`;
  if (msg.text) {
    await handleIncomingText(cfg, senderId, msg.text, mid);
  } else if (msg.attachments || msg.sticker_id || msg.quick_reply || event.postback) {
    await handleIncomingAttachment(cfg, senderId, mid);
  }
  // delivery/read receipts (event.delivery / event.read) carry no message — ignore.
}

// ---------- Handler ----------

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    log('[webhook] config error:', e.message);
    res.status(500).send('server not configured');
    return;
  }

  try {
    // --- Verification handshake (GET) ---
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === cfg.verifyToken && challenge) {
        res.status(200).send(challenge);
      } else {
        res.status(403).send('verify token mismatch');
      }
      return;
    }

    // --- Event delivery (POST) ---
    if (req.method === 'POST') {
      const raw = await readRawBody(req);
      if (!validSignature(cfg, raw, req.headers['x-hub-signature-256'])) {
        log('[webhook] bad signature, rejected');
        res.status(401).send('bad signature');
        return;
      }
      let body;
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        res.status(200).send('EVENT_RECEIVED');
        return;
      }
      if (body.object === 'instagram') {
        // Process SYNCHRONOUSLY, then answer 200. Serverless freezes
        // after the response, so nothing may run after res.send().
        for (const entry of body.entry || []) {
          for (const event of entry.messaging || []) {
            await handleMessagingEvent(cfg, event).catch((e) => log('[event] error:', e.message));
          }
        }
      }
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    res.status(404).send('not found');
  } catch (e) {
    log('[webhook] error:', e.message);
    try { res.status(500).send('error'); } catch { /* already sent */ }
  }
};
