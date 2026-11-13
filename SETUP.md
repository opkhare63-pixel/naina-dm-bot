# Naina DM Webhook Bot — SETUP (poora guide, Hinglish)
Ye bot Naina ke Instagram DMs ka jawab **seconds me** deta hai — Meta ka
webhook use karta hai, isliye koi 5-minute wait nahi. **Kharcha lagbhag ₹0:**
Instagram API free hai, server Render free tier par, AI Gemini free tier par.
Unlimited contacts — ManyChat jaisi koi limit nahi.

**Time lagega:** pehli baar setup me 1-2 ghante + Meta App Review me kuch din.
**Nittu ko khud karna hai:** steps 1, 2, 5, 6 (uske logins hain). Baaki code
pehle se bana hua hai.

---

## Step 0 — Kya kya chahiye (pehle se taiyaar rakho)
- Naina ka Instagram account **Creator/Business** ho (hai — @its_naina_official1).
- Ek Google account (Gemini API key ke liye).
- Ek GitHub account (code Render par daalne ke liye) — free.
- Ek Render account (render.com) — free, card nahi chahiye.
- Ek UptimeRobot account (uptimerobot.com) — free, card nahi chahiye.

## Step 1 — Gemini API key (free, 5 minute)
1. aistudio.google.com kholo, Google account se login karo.
2. **Get API key** → **Create API key** → ek naya project banao.
3. Key copy karke safe jagah likh lo — ye `GEMINI_API_KEY` banegi.
4. Note: free tier par Google tumhare data ko training ke liye use kar sakta
   hai. Fan chats Google ke through jayenge — ye normal hai, ManyChat bhi
   aise hi karta hai.

## Step 2 — Meta developer app banao (30 minute)
1. developers.facebook.com kholo → **My Apps** → **Create App**.
2. App type: **Business** (ya jo option aaye, "Manage messaging & content
   on Instagram" wala use case chuno).
3. App banne ke baad left menu me **Instagram → API setup with Instagram
   login** kholo. (Agar ye option naye app me na dikhe to Meta ka dashboard
   badal gaya hai — "API setup with Facebook login" wala rasta use karo aur
   Naina ke account se linked Facebook Page se connect karo.)
4. **Instagram app ID aur Instagram app secret** copy karo — ye Meta App ID
   se ALAG hote hain. App secret `META_APP_SECRET` banega.
5. Permissions maango: `instagram_business_basic` aur
   `instagram_business_manage_messages`.
6. **Generate Token** dabao → Naina ka account chuno → token copy karo.
   Ye `IG_ACCESS_TOKEN` hai. Token ke paas jo numeric ID dikhe, wo
   `IG_USER_ID` hai. (Long-lived token 60 din chalta hai — Step 7 me refresh
   dekh lo.)
7. Instagram app me jaao: **Settings → Messages and story replies →
   Message controls → Connected tools → "Allow access to messages" ON karo.**
   Ye bhool gaye to webhook aayega hi nahi.

## Step 3 — Code Render par daalo (15 minute)
1. Is folder (`webhook-bot/`) ko GitHub par ek naya repo bana kar push karo.
   (`.env` kabhi push mat karo — `.gitignore` me hai, phir bhi check kar lo.)
2. render.com → **New +** → **Web Service** → GitHub repo chuno.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
   - **Health Check Path:** `/health`
4. **Environment variables** me ye sab daalo (values Step 1-2 se):
   - `VERIFY_TOKEN` — khud ek lamba random password banao (20+ characters),
     yehi token Meta ke webhook settings me bhi dalna hai.
   - `META_APP_SECRET` — Step 2 step 4 se.
   - `IG_ACCESS_TOKEN` — Step 2 step 6 se.
   - `IG_USER_ID` — Step 2 step 6 se.
   - `GEMINI_API_KEY` — Step 1 se.
   - `GEMINI_MODEL` — `gemini-3.5-flash-lite`
   - `GEMINI_FALLBACK_MODEL` — `gemini-3.8-flash`
   - `GRAPH_API_VERSION` — `v26.0`
   - `PUBLIC_BASE_URL` — Render deploy hone ke baad jo URL mile
     (jaise `https://naina-dm-bot.onrender.com`) — pehle deploy karo, phir
     ye daal kar **redeploy** karo (photos bhejne ke liye chahiye).
5. Deploy karo. URL khulega: `https://<tumhara-naam>.onrender.com`.
   `/health` kholo — **"ok"** dikhna chahiye.

## Step 4 — Webhook Meta me lagao (10 minute)
1. Meta App Dashboard → **Webhooks** (ya Instagram → Webhooks) →
   **Add Callback URL**.
2. **Callback URL:** `https://<tumhara-app>.onrender.com/webhook`
3. **Verify Token:** wahi jo Step 3 me `VERIFY_TOKEN` me dala tha.
4. **Verify and Save** dabao — Meta tumhare server ko GET bhejega, server
   challenge wapas karega. Green tick aana chahiye.
5. Subscribe karo: **`messages`** field (aur `messaging_postbacks` bhi).
6. Phir ek baar ye call karo (account ko subscribe karne ke liye) — terminal
   ya Postman se, `<TOKEN>` ki jagah IG token:
   ```
   curl -X POST "https://graph.instagram.com/v26.0/me/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=<TOKEN>"
   ```
   Jawab me `{"success":true}` aana chahiye.

## Step 5 — UptimeRobot (server ko jagaye rakhne ke liye, 5 minute)
Render free server 15 minute khaali rehne par so jata hai. Isliye:
1. uptimerobot.com → free account → **Add New Monitor**.
2. **Monitor Type:** HTTP(s), **URL:** `https://<tumhara-app>.onrender.com/health`,
   **Monitoring Interval:** 5 minutes.
3. Save. Ab har 5 minute ek ping aayega aur server jaga rahega.
4. Note: ek mahine me 750 free hours milte hain — ek service hamesha-ON
   rakhne par lagbhag 744 ghante use hote hain. Is workspace me doosri free
   service mat chalao, warna hours khatam ho jayenge.

## Step 6 — Test karo (pehle dev mode me)
1. Meta app **Development mode** me hai to sirf **testers** ko reply ja sakta
   hai. App Dashboard → **Roles** → apni doosri ID (jaise @unstoppablenitin)
   ko **Tester** banao aur us ID se invite accept karo.
2. Doosri ID se Naina ko DM bhejo ("hello"). **Seconds me jawab aana
   chahiye** — pehle "heyy! 🤍 kaise ho?" jaisa chhota reply.
3. Render ke **Logs** me dekho: `[reply] -> <id>: ...` dikhna chahiye.
4. Agar jawab na aaye to neeche Troubleshooting dekho.
5. Test pass ho to **App Review** ke liye apply karo (neeche dekho).

## Step 7 — Live karo (App Review + Business Verification)
Real fans ko jawab tabhi milega jab app **Live** ho:
1. Meta App Dashboard → **App Review** → `instagram_business_manage_messages`
   ke liye request karo.
2. Meta maangega: ek **screen recording** — tumhara app message bhej raha
   hai aur Instagram inbox me woh message aa raha hai — plus woh cURL
   request. Dev-mode test (Step 6) ki recording kaam aayegi.
3. **Business Verification** bhi karni padegi (business document — GST /
   company / individual verification, Meta batayega kya chahiye).
4. Review me kuch din lag sakte hain; koi fixed time Meta nahi batata.
   Approve hote hi app **Live** karo — uske baad saare fans ko jawab
   milega, unlimited.
5. **Tab tak Muse wala bot (5-minute cron) chaloo rakho** — wohi backup hai.
   Live hote hi Jinni ko bolo "webhook bot live hai, Muse bot band karo" —
   warna dono ek hi DM ka jawab denge.

## Step 8 — Token refresh (har 60 din, 2 minute)
IG token 60 din me expire hota hai. Expire se pehle refresh karo:
```
curl -X GET "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<OLD_TOKEN>"
```
Naya token milega — use Render ke Environment Variables me badal kar
redeploy karo. (Calendar me reminder laga lo — 55 din par.)

## Exclusive photos (subscribers ke liye)
- `webhook-bot/public/photos/` folder me 2-3 **exclusive** photos daalo
  (jo feed par nahi aayi hon). Bot hafte me ek baar subscribers ko ek photo
  bhejega (sirf tab jab fan ne pichle 24 ghante me message kiya ho — Meta ka
  rule hai). Folder khaali ho to bot sirf text bhejega, kuch tootta nahi.

---

## Troubleshooting

**Webhook "Verify and Save" fail ho raha hai**
- Callback URL me `https://` hona chahiye, `/webhook` end me.
- Verify token Render ke env var se EXACT match hona chahiye (space mat chhodo).
- Render Logs dekho — server chal raha hai? `/health` kholo, "ok" aana chahiye.
- Pehli baar Render free server ko jaagne me ~1 minute lagta hai — verify
  dobara dabao.

**Message aaya, reply nahi gaya**
- Render Logs me `[send] failed` dekho. 401 = token galat/expire — token
  dobara generate karo. 403 = permission nahi — App Review / tester check karo.
- `[send] outside 24h window` = fan ne 24 ghante se pehle message kiya tha
  aur bot tab down tha — ab us thread par API se reply nahi ho sakta, sirf
  app se haath se jawab do.
- `[brain] LLM failed` = Gemini key galat ya 429 (rate limit). Key check
  karo; 429 aaye to thoda ruk jao — baar-baar retry se Google key revoke kar
  sakta hai. Bot tab bhi ek chhota fallback reply bhejta hai, khaali nahi chhodta.

**Reply aa raha hai lekin galat / filmy / lamba**
- `brain.js` ka system prompt dekho — reply 1 line, max 2 chhoti lines ka
  rule hai. Agar LLM phir bhi lamba likhe to temperature kam karo ya
  `maxOutputTokens` 200 se 120 karo.

**Naye fan (jo follow nahi karta) ka message nahi aata**
- Pehli baar DM **Requests folder** me ja sakta hai — webhook us par fire
  hoga ya nahi, ye test karna baaki hai (RESEARCH_NOTES.md dekho). Agar na
  aaye to Naina ko app se request accept karni hogi; uske baad ki baat bot
  sambhal lega.

**Server baar-baar sota hai / pehla reply late aata hai**
- UptimeRobot monitor ON hai? Interval 5 minute hona chahiye.
- Render free hours khatam to nahi hue? Dashboard me check karo (750/month).
- Neend se jaagne par pehla webhook ~60 second late ho sakta hai — Meta
  retry karta hai, reply phir bhi pahunchta hai.

**"App Review" reject ho gaya**
- Meta ka feedback padho — aam taur par screen recording saaf nahi hoti.
  Dobara recording banao: pehle app se message bhejo, phir Instagram app me
  wohi message dikhao, ek hi video me. Phir se submit karo.

**Muse bot aur webhook bot dono reply kar rahe hain**
- Turant ek ko band karo. Webhook live hai to Muse cron `naina-dm-bot`
  disable karo (Jinni se bolo). Webhook band hai to Render service ko
  **Suspend** karo.
