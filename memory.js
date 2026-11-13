// Naina webhook bot — per-fan memory (JSON files, one per fan).
// Same shape as fans/_template.json in the Muse bot brain:
// username, thread_fbid (here: IGSID), name, language, stage, warmth,
// subscriber, tier, birthday, pitched_at, pitch_declined, interests,
// notes, what_worked, last_message_at.
// Fans are keyed by their Instagram-scoped ID (IGSID) — the only stable
// id the webhook gives us. Username is filled in later when known.
const fs = require('fs');
const path = require('path');

function fansDir(dataDir) {
  return path.join(dataDir, 'fans');
}

function safeFileName(igsid) {
  return String(igsid).replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
}

function blankFan(igsid) {
  return {
    igsid: String(igsid),
    username: '',
    name: '',
    language: 'hinglish',
    stage: 0,
    warmth: 0,
    subscriber: false,
    tier: '',
    birthday: '',
    pitched_at: '',
    pitch_declined: false,
    interests: [],
    notes: '',
    what_worked: '',
    last_message_at: '',
    under18: false,
    flagged: false,
    streak_days: 0,
    last_active_date: '',
  };
}

function loadFan(dataDir, igsid) {
  const dir = fansDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, safeFileName(igsid));
  if (!fs.existsSync(file)) return blankFan(igsid);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...blankFan(igsid), ...parsed, igsid: String(igsid) };
  } catch {
    return blankFan(igsid);
  }
}

function saveFan(dataDir, fan) {
  const dir = fansDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, safeFileName(fan.igsid));
  fs.writeFileSync(file, JSON.stringify(fan, null, 2) + '\n', 'utf8');
}

function listFans(dataDir) {
  const dir = fansDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean);
}

// --- Idempotency: remember processed message ids so a Meta retry never
// triggers a double reply. Keeps the last ~500 mids in one small file.
function seenFile(dataDir) {
  return path.join(dataDir, 'seen_mids.json');
}

function loadSeen(dataDir) {
  try {
    const arr = JSON.parse(fs.readFileSync(seenFile(dataDir), 'utf8'));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markSeen(dataDir, mid) {
  const seen = loadSeen(dataDir);
  seen.add(mid);
  const arr = [...seen].slice(-500);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(seenFile(dataDir), JSON.stringify(arr), 'utf8');
}

function hasSeen(dataDir, mid) {
  return loadSeen(dataDir).has(mid);
}

// --- Warmth / stage rules (from SMART_RULES.md) ---
// stage: 0 (0-20 warmth) new, 1 (21-50) chatting, 2 (51-80) warm,
// 3 (81+) ready for ONE soft fan-club invite.
function stageForWarmth(warmth) {
  if (warmth >= 81) return 3;
  if (warmth >= 51) return 2;
  if (warmth >= 21) return 1;
  return 0;
}

function applyWarmth(fan, delta) {
  fan.warmth = Math.max(0, Math.min(100, (fan.warmth || 0) + delta));
  if (fan.subscriber) fan.warmth = 100;
  // Stage only ever moves forward automatically (never auto-demote a
  // subscriber or a fan who was already invited — pitch state is sacred).
  const next = stageForWarmth(fan.warmth);
  if (next > fan.stage && fan.stage < 3) fan.stage = next;
  if (fan.stage === 3 && fan.warmth < 81) fan.stage = 2; // cooled off
  return fan;
}

module.exports = { loadFan, saveFan, listFans, hasSeen, markSeen, applyWarmth, stageForWarmth, blankFan };
