const path = require("path");
const express = require("express");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ================= MongoDB FAST CONNECT =================
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "railway";
const COLLECTION = "settings";

let mongoClient = null;
let mongoDb = null;

function initMongo() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });

    mongoClient.connect()
      .then(client => {
        mongoDb = client.db(DB_NAME);
        console.log("MongoDB connected");
      })
      .catch(() => {
        console.log("MongoDB connecting in background...");
      });
  }
}

async function getCollection() {
  if (!mongoDb) throw new Error("Mongo not ready");
  return mongoDb.collection(COLLECTION);
}

async function getConfig() {
  try {
    const col = await getCollection();
    const doc = await col.findOne({ key: "payment_config" });
    if (doc) return doc;
  } catch {}

  return {
    bkashNumber: "",
    payableAmount: 0
  };
}

async function setConfig(bkashNumber, payableAmount) {
  const col = await getCollection();
  await col.updateOne(
    { key: "payment_config" },
    { $set: { key:"payment_config", bkashNumber, payableAmount } },
    { upsert: true }
  );
}

// ================= JWT =================
function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signToken(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

  const sig = crypto.createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${data}.${sig}`;
}

function verifyToken(token, secret) {
  try {
    const [h,p,s] = token.split(".");
    const data = `${h}.${p}`;

    const expected = crypto.createHmac("sha256", secret)
      .update(data)
      .digest("base64")
      .replace(/\+/g,"-")
      .replace(/\//g,"_")
      .replace(/=+$/g,"");

    if(expected !== s) return false;
    return true;
  } catch {
    return false;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  raw.split(";").forEach(p=>{
    const [k,v]=p.trim().split("=");
    out[k]=v;
  });
  return out;
}

// ================= ADMIN LOGIN =================
app.post("/api/admin/login", (req,res)=>{
  if(
    req.body.email !== process.env.ADMIN_EMAIL ||
    req.body.password !== process.env.ADMIN_PASSWORD
  ){
    return res.status(401).json({ok:false});
  }

  const token = signToken({admin:true}, process.env.JWT_SECRET);

  res.setHeader("Set-Cookie",
    `admin_token=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax; Secure`
  );

  res.json({ok:true});
});

function requireAdmin(req,res,next){
  const token = parseCookies(req).admin_token;
  if(!verifyToken(token, process.env.JWT_SECRET))
    return res.status(401).json({ok:false});
  next();
}

// ================= ADMIN CONFIG =================
app.get("/api/admin/config", requireAdmin, async (req,res)=>{
  try{
    const cfg = await getConfig();
    res.json({ok:true, config:cfg});
  }catch{
    res.json({ok:false});
  }
});

app.put("/api/admin/config", requireAdmin, async (req,res)=>{
  try{
    await setConfig(req.body.bkashNumber, req.body.payableAmount);
    res.json({ok:true});
  }catch{
    res.json({ok:false});
  }
});

// ================= PUBLIC CONFIG =================
app.get("/api/public-config", async (req,res)=>{
  try{
    const cfg = await getConfig();
    res.json({ok:true, ...cfg});
  }catch{
    res.json({ok:true, bkashNumber:"", payableAmount:0});
  }
});

// ================= TELEGRAM =================
app.post("/api/submit", async (req,res)=>{
  const trx = req.body.trxId;

  const cfg = await getConfig();

  const msg =
    `New Payment\nTrxID: ${trx}\nNumber: ${cfg.bkashNumber}\nAmount: ৳${cfg.payableAmount}`;

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: msg
    })
  });

  res.json({ok:true});
});

// ================= ADMIN PAGE =================
app.get("/admin", (req,res)=>{
  res.sendFile(path.join(__dirname,"public/admin.html"));
});

// ================= START =================
app.listen(PORT, ()=>{
  console.log("Server running fast on", PORT);
  initMongo(); // background connect
});
