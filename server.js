const path = require("path");
const express = require("express");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ===== MongoDB =====
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "railway";
const COLLECTION = process.env.MONGODB_COLLECTION || "settings";

let mongoClient;
async function getCollection() {
  if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
  }
  return mongoClient.db(DB_NAME).collection(COLLECTION);
}

async function getConfig() {
  const col = await getCollection();
  const doc = await col.findOne({ key: "payment_config" });
  if (doc) return doc;

  const defaultDoc = {
    key: "payment_config",
    bkashNumber: "",
    payableAmount: 0,
    updatedAt: new Date().toISOString(),
  };
  await col.insertOne(defaultDoc);
  return defaultDoc;
}

async function setConfig({ bkashNumber, payableAmount }) {
  const col = await getCollection();
  await col.updateOne(
    { key: "payment_config" },
    {
      $set: {
        bkashNumber,
        payableAmount,
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
}

// ===== Simple JWT (HMAC) =====
// (No external libs; works on Render Node)
function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function signToken(payload, secret, ttlSeconds = 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + ttlSeconds };

  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(full));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${data}.${sig}`;
}
function verifyToken(token, secret) {
  try {
    const [h, p, sig] = token.split(".");
    if (!h || !p || !sig) return null;
    const data = `${h}.${p}`;
    const expected = crypto.createHmac("sha256", secret).update(data).digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// Cookie helper
function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  raw.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}

// ===== Admin HTML (served at /admin) =====
const ADMIN_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Admin Panel</title>
<style>
  body{font-family:system-ui,Segoe UI,Arial;margin:0;background:#fbf6ea;}
  .wrap{max-width:900px;margin:0 auto;padding:18px;}
  .card{background:#fff;border-radius:16px;padding:16px;box-shadow:0 14px 40px rgba(0,0,0,.12);border:1px solid rgba(0,0,0,.08)}
  h1{margin:0 0 10px 0}
  label{display:block;margin:10px 0 6px 0;font-weight:800}
  input{width:100%;padding:12px;border-radius:12px;border:1px solid rgba(0,0,0,.18);font-size:14px}
  button{padding:12px 14px;border-radius:12px;border:0;background:#c57a2a;color:#fff;font-weight:900;cursor:pointer}
  button:disabled{opacity:.6;cursor:not-allowed}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .muted{color:#666;font-size:13px}
  .status{margin-top:10px;font-weight:900}
  .ok{color:#15803d}
  .err{color:#b91c1c}
  @media(max-width:800px){.row{grid-template-columns:1fr}}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card" id="loginCard">
      <h1>Admin Login</h1>
      <p class="muted">Login to update bKash number and amount.</p>
      <label>Email</label>
      <input id="email" type="email" placeholder="admin email" />
      <label>Password</label>
      <input id="password" type="password" placeholder="admin password" />
      <div style="margin-top:12px">
        <button id="loginBtn">Login</button>
      </div>
      <div id="loginStatus" class="status"></div>
    </div>

    <div class="card" id="panelCard" style="display:none;margin-top:14px">
      <h1>Payment Config</h1>
      <p class="muted">This updates what users see on the payment page.</p>

      <div class="row">
        <div>
          <label>bKash Number</label>
          <input id="bkashNumber" type="text" placeholder="+8801..." />
        </div>
        <div>
          <label>Payable Amount (BDT)</label>
          <input id="payableAmount" type="number" min="0" step="1" placeholder="e.g. 500" />
        </div>
      </div>

      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
        <button id="loadBtn">Load</button>
        <button id="saveBtn">Save</button>
        <button id="logoutBtn" style="background:#7a4a2b">Logout</button>
      </div>

      <div id="panelStatus" class="status"></div>
    </div>
  </div>

<script>
  const loginCard = document.getElementById("loginCard");
  const panelCard = document.getElementById("panelCard");
  const loginStatus = document.getElementById("loginStatus");
  const panelStatus = document.getElementById("panelStatus");

  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");

  const bkashEl = document.getElementById("bkashNumber");
  const amountEl = document.getElementById("payableAmount");

  function setStatus(el, msg, type){
    el.textContent = msg || "";
    el.className = "status " + (type || "");
  }

  async function api(path, method, body){
    const res = await fetch(path, {
      method,
      headers: { "Content-Type":"application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(()=>({}));
    return { ok: res.ok, data };
  }

  document.getElementById("loginBtn").onclick = async () => {
    setStatus(loginStatus, "Logging in...", "");
    const email = (emailEl.value||"").trim();
    const password = (passEl.value||"").trim();
    const r = await api("/api/admin/login", "POST", { email, password });
    if(!r.ok || !r.data.ok){
      setStatus(loginStatus, "Invalid login.", "err");
      return;
    }
    setStatus(loginStatus, "Login success.", "ok");
    loginCard.style.display = "none";
    panelCard.style.display = "block";
  };

  document.getElementById("loadBtn").onclick = async () => {
    setStatus(panelStatus, "Loading...", "");
    const r = await api("/api/admin/config", "GET");
    if(!r.ok || !r.data.ok){
      setStatus(panelStatus, "Load failed.", "err");
      return;
    }
    bkashEl.value = r.data.config.bkashNumber || "";
    amountEl.value = (r.data.config.payableAmount ?? "");
    setStatus(panelStatus, "Loaded.", "ok");
  };

  document.getElementById("saveBtn").onclick = async () => {
    setStatus(panelStatus, "Saving...", "");
    const bkashNumber = (bkashEl.value||"").trim();
    const payableAmount = Number(amountEl.value||0);

    if(!bkashNumber || bkashNumber.length < 8){
      setStatus(panelStatus, "Enter valid bKash number.", "err");
      return;
    }
    if(!Number.isFinite(payableAmount) || payableAmount <= 0){
      setStatus(panelStatus, "Enter valid amount.", "err");
      return;
    }

    const r = await api("/api/admin/config", "PUT", { bkashNumber, payableAmount });
    if(!r.ok || !r.data.ok){
      setStatus(panelStatus, "Save failed.", "err");
      return;
    }
    setStatus(panelStatus, "Saved successfully!", "ok");
  };

  document.getElementById("logoutBtn").onclick = async () => {
    await api("/api/admin/logout", "POST");
    panelCard.style.display = "none";
    loginCard.style.display = "block";
    setStatus(panelStatus, "", "");
    setStatus(loginStatus, "", "");
  };
</script>
</body>
</html>`;

// ===== Routes =====
app.get("/health", (req, res) => res.json({ ok: true }));

// Admin page
app.get("/admin", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(ADMIN_HTML);
});

// Public config for user page
app.get("/api/public-config", async (req, res) => {
  try {
    const cfg = await getConfig();
    res.json({ ok: true, bkashNumber: cfg.bkashNumber, payableAmount: cfg.payableAmount });
  } catch {
    res.status(500).json({ ok: false, error: "Config load failed" });
  }
});

// Admin auth middleware
function requireAdmin(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ ok: false, error: "Missing JWT_SECRET" });

  const cookies = parseCookies(req);
  const token = cookies.admin_token;
  if (!token) return res.status(401).json({ ok: false, error: "Not logged in" });

  const payload = verifyToken(token, secret);
  if (!payload) return res.status(401).json({ ok: false, error: "Invalid session" });

  next();
}

// Admin login
app.post("/api/admin/login", (req, res) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASSWORD;
  const secret = process.env.JWT_SECRET;

  if (!adminEmail || !adminPass || !secret) {
    return res.status(500).json({ ok: false, error: "Missing admin env vars" });
  }

  const email = (req.body?.email || "").toString().trim();
  const password = (req.body?.password || "").toString().trim();

  if (email !== adminEmail || password !== adminPass) {
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
  }

  const token = signToken({ sub: "admin", email }, secret, 60 * 60); // 1 hour
  // HttpOnly cookie
  res.setHeader(
    "Set-Cookie",
    `admin_token=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax; Secure`
  );
  return res.json({ ok: true });
});

// Admin logout
app.post("/api/admin/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    `admin_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`
  );
  res.json({ ok: true });
});

// Admin get config
app.get("/api/admin/config", requireAdmin, async (req, res) => {
  try {
    const cfg = await getConfig();
    res.json({ ok: true, config: { bkashNumber: cfg.bkashNumber, payableAmount: cfg.payableAmount } });
  } catch {
    res.status(500).json({ ok: false, error: "Load failed" });
  }
});

// Admin update config
app.put("/api/admin/config", requireAdmin, async (req, res) => {
  try {
    const bkashNumber = (req.body?.bkashNumber || "").toString().trim();
    const payableAmount = Number(req.body?.payableAmount);

    if (!bkashNumber || bkashNumber.length < 8) {
      return res.status(400).json({ ok: false, error: "Invalid bKash number" });
    }
    if (!Number.isFinite(payableAmount) || payableAmount <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid amount" });
    }

    await setConfig({ bkashNumber, payableAmount });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Save failed" });
  }
});

// User submits trx id -> send Telegram
app.post("/api/submit", async (req, res) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return res.status(500).json({ ok: false, error: "Missing Telegram env vars" });
    }

    const trxId = (req.body?.trxId || "").toString().trim();
    if (trxId.length < 6 || trxId.length > 64) {
      return res.status(400).json({ ok: false, error: "Invalid Transaction ID" });
    }

    const cfg = await getConfig();
    const now = new Date().toISOString();

    const text =
      `✅ New bKash Transaction Submitted\n` +
      `• TrxID: ${trxId}\n` +
      `• Receiver: ${cfg.bkashNumber || "(not set)"}\n` +
      `• Amount: ৳${cfg.payableAmount || 0}\n` +
      `• Time: ${now}`;

    const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const tgRes = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
    });

    const data = await tgRes.json();
    if (!data.ok) return res.status(502).json({ ok: false, error: "Telegram API error" });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log("Server running on", PORT));
