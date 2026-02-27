const COUNTDOWN_MINUTES = 9;

const homeSection = document.getElementById("home");
const paySection = document.getElementById("payment");

const btnBkash = document.getElementById("btnBkash");
const backBtn = document.getElementById("backBtn");
const copyBtn = document.getElementById("copyBtn");
const submitBtn = document.getElementById("submitBtn");

const bkashNumberEl = document.getElementById("bkashNumber");
const amountTextEl = document.getElementById("amountText");
const timerValueEl = document.getElementById("timerValue");

const trxIdEl = document.getElementById("trxId");
const statusEl = document.getElementById("status");

let endAtMs = 0;
let timerInterval = null;

let cachedBkash = "";
let cachedAmount = 0;

// ==========================
// BKASH BUTTON CLICK
// ==========================
btnBkash.addEventListener("click", async () => {

  // 1. Show payment page first (always)
  showPayment();

  // 2. Start timer immediately
  startCountdown(COUNTDOWN_MINUTES);

  // 3. Load config from MongoDB (safe)
  await loadPublicConfig();

});

// ==========================
// BACK BUTTON
// ==========================
backBtn.addEventListener("click", () => {
  stopCountdown();
  showHome();
});

// ==========================
// COPY NUMBER
// ==========================
copyBtn.addEventListener("click", async () => {
  const number = (bkashNumberEl.textContent || "").trim();
  try {
    await navigator.clipboard.writeText(number);
    setStatus("Copied number!", "ok");
  } catch {
    fallbackCopy(number);
    setStatus("Copied number!", "ok");
  }
});

// ==========================
// SUBMIT TRX
// ==========================
submitBtn.addEventListener("click", async () => {
  if (isExpired()) {
    setStatus("Time expired. Please restart payment.", "err");
    return;
  }

  const trx = (trxIdEl.value || "").trim();
  if (!trx || trx.length < 6) {
    setStatus("Please enter valid Transaction ID.", "err");
    return;
  }

  submitBtn.disabled = true;
  setStatus("Submitting...", "");

  try {
    const resp = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trxId: trx })
    });

    const data = await resp.json();

    if (!resp.ok || !data.ok) {
      setStatus("Submit failed.", "err");
      submitBtn.disabled = false;
      return;
    }

    setStatus("Submitted successfully!", "ok");

  } catch {
    setStatus("Network error.", "err");
    submitBtn.disabled = false;
  }
});

// ==========================
// LOAD CONFIG FROM DB
// ==========================
async function loadPublicConfig() {
  try {
    const r = await fetch("/api/public-config", { cache: "no-store" });

    if (!r.ok) throw new Error("API failed");

    const data = await r.json();

    if (!data.ok) throw new Error("Config empty");

    cachedBkash = data.bkashNumber || "Not Set";
    cachedAmount = Number(data.payableAmount || 0);

    bkashNumberEl.textContent = cachedBkash;
    amountTextEl.textContent = `৳ ${cachedAmount}`;

  } catch {
    bkashNumberEl.textContent = "Not configured";
    amountTextEl.textContent = "৳ 0";
    setStatus("Payment config not loaded.", "err");
  }
}

// ==========================
// UI SWITCH
// ==========================
function showPayment() {
  homeSection.classList.add("hidden");
  paySection.classList.remove("hidden");
  setStatus("", "");
}

function showHome() {
  paySection.classList.add("hidden");
  homeSection.classList.remove("hidden");
  setStatus("", "");
}

// ==========================
// TIMER
// ==========================
function startCountdown(minutes) {
  stopCountdown();
  endAtMs = Date.now() + minutes * 60 * 1000;
  tick();
  timerInterval = setInterval(tick, 500);
}

function stopCountdown() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  endAtMs = 0;
  timerValueEl.textContent = `${String(COUNTDOWN_MINUTES).padStart(2, "0")}:00`;
  submitBtn.disabled = false;
}

function isExpired() {
  return endAtMs > 0 && Date.now() >= endAtMs;
}

function tick() {
  const remaining = Math.max(0, endAtMs - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;

  timerValueEl.textContent = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  if (remaining <= 0) {
    submitBtn.disabled = true;
    setStatus("Time expired.", "err");
    stopCountdown();
  }
}

// ==========================
// STATUS
// ==========================
function setStatus(text, type) {
  statusEl.textContent = text || "";
  statusEl.classList.remove("ok", "err");
  if (type === "ok") statusEl.classList.add("ok");
  if (type === "err") statusEl.classList.add("err");
}

// ==========================
// COPY FALLBACK
// ==========================
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
