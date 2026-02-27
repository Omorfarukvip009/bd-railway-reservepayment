const path = require("path");
const express = require("express");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ================== MongoDB ==================
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "railway";
const COLLECTION = process.env.MONGODB_COLLECTION || "settings";

let mongoClient = null;

async function getCollection() {
  if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");

  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    try {
      await mongoClient.connect();
      console.log("MongoDB connected");
    } catch (e) {
      console.log("MongoDB connection delayed...");
    }
  }

  return mongoClient.db(DB_NAME).collection(COLLECTION);
}

async function getConfig() {
  try {
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
  } catch {
    return {
      bkashNumber: "",
      payableAmount: 0,
    };
  }
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

// ================== JWT ==================
function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signToken(payload, secret, ttl = 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + ttl };

  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(full));
  const data = `${h}.${p}`;

  const sig = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${data}.${sig}`;
}

function verifyToken(token, secret) {
  try {
    const [h, p, sig] = token.split(".");
    const data = `${h}.${p}`;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(data)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    if (expected !== sig) return null;

    const payload = JSON.parse(
      Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    );

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

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

// ================== ADMIN LOGIN ==================
app.post("/api/admin/login", (req, res) => {
  const email = req.body.email;
  const pass = req.body.password;

  if (
    email !== process.env.ADMIN_EMAIL ||
    pass !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({ ok: false });
  }

  const token = signToken({ sub: "admin" }, process.env.JWT_SECRET, 3600);

  res.setHeader(
    "Set-Cookie",
    `admin_token=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax; Secure`
  );

  res.json({ ok: true });
});

function requireAdmin(req, res, next) {
  const token = parseCookies(req).admin_token;
  const payload = verifyToken(token, process.env.JWT_SECRET);
  if (!payload) return res.status(401).json({ ok: false });
  next();
}

// ================== ADMIN CONFIG ==================
app.get("/api/admin/config", requireAdmin, async (req, res) => {
  const cfg = await getConfig();
  res.json({ ok: true, config: cfg });
});

app.put("/api/admin/config", requireAdmin, async (req, res) => {
  await setConfig(req.body);
  res.json({ ok: true });
});

// ================== PUBLIC CONFIG ==================
app.get("/api/public-config", async (req, res) => {
  const cfg = await getConfig();
  res.json({ ok: true, ...cfg });
});

// ================== TELEGRAM ==================
app.post("/api/submit", async (req, res) => {
  const trx = req.body.trxId;

  if (!trx || trx.length < 6) {
    return res.status(400).json({ ok: false });
  }

  const cfg = await getConfig();

  const msg =
    `New Payment\n` +
    `TrxID: ${trx}\n` +
    `bKash: ${cfg.bkashNumber}\n` +
    `Amount: ৳${cfg.payableAmount}`;

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: msg
    })
  });

  res.json({ ok: true });
});

// ================== ADMIN PAGE ==================
app.get("/admin", (req,res)=>{
  res.sendFile(path.join(__dirname,"public/admin.html"));
});

// ================== START ==================
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
