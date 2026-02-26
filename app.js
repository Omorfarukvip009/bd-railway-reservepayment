// ============================
// CONFIG (EDIT THESE)
// ============================

// ✅ PUT YOUR bKASH NUMBER HERE:
const BKASH_NUMBER = "+8801XXXXXXXXX";

// Optional default reference (you can change)
const DEFAULT_REFERENCE = "RAIL-PAY";

// Countdown time in minutes
const COUNTDOWN_MINUTES = 15;

// ============================
// DOM
// ============================
const homeSection = document.getElementById("home");
const paySection = document.getElementById("payment");

const btnBkash = document.getElementById("btnBkash");
const backBtn = document.getElementById("backBtn");
const copyBtn = document.getElementById("copyBtn");
const submitBtn = document.getElementById("submitBtn");

const bkashNumberEl = document.getElementById("bkashNumber");
const timerValueEl = document.getElementById("timerValue");

const trxIdEl = document.getElementById("trxId");
const amountEl = document.getElementById("amount");
const custNameEl = document.getElementById("custName");

const amountTextEl = document.getElementById("amountText");
const refTextEl = document.getElementById("refText");
const statusEl = document.getElementById("status");

// ============================
// STATE
// ============================
let endAtMs = 0;
let timerInterval = null;

// ============================
// INIT
// ============================
bkashNumberEl.textContent = BKASH_NUMBER;
refTextEl.textContent = DEFAULT_REFERENCE;

btnBkash.addEventListener("click", () => {
  showPayment();
  startCountdown(COUNTDOWN_MINUTES);
});

backBtn.addEventListener("click", () => {
  stopCountdown();
  showHome();
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(BKASH_NUMBER);
    setStatus("Copied number!", "ok");
  } catch {
    // fallback
    fallbackCopy(BKASH_NUMBER);
    setStatus("Copied number!", "ok");
  }
});

amountEl.addEventListener("input", () => {
  const v = Number(amountEl.value || 0);
  amountTextEl.textContent = `৳ ${Number.isFinite(v) ? v : 0}`;
});

submitBtn.addEventListener("click", () => {
  if (isExpired()) {
    setStatus("Time expired. Please restart payment.", "err");
    return;
  }

  const trx = (trxIdEl.value || "").trim();
  const amt = Number(amountEl.value || 0);

  if (!trx || trx.length < 6) {
    setStatus("Please enter a valid Transaction ID.", "err");
    trxIdEl.focus();
    return;
  }

  if (!Number.isFinite(amt) || amt <= 0) {
    setStatus("Please enter a valid amount.", "err");
    amountEl.focus();
    return;
  }

  // ✅ For now: just show success message (no Telegram requested in your last message)
  // Later you can connect to backend to send it to Telegram.
  const name = (custNameEl.value || "").trim();
  const msg = name
    ? `Submitted! Name: ${name} | TrxID: ${trx} | Amount: ৳${amt}`
    : `Submitted! TrxID: ${trx} | Amount: ৳${amt}`;

  setStatus(msg, "ok");
});

// ============================
// UI HELPERS
// ============================
function showPayment() {
  homeSection.classList.add("hidden");
  paySection.classList.remove("hidden");
  setStatus("", "");
  // Reset fields
  trxIdEl.value = "";
  amountEl.value = "";
  custNameEl.value = "";
  amountTextEl.textContent = "৳ 0";
  submitBtn.disabled = false;
}

function showHome() {
  paySection.classList.add("hidden");
  homeSection.classList.remove("hidden");
  setStatus("", "");
}

function setStatus(text, type) {
  statusEl.textContent = text || "";
  statusEl.classList.remove("ok", "err");
  if (type === "ok") statusEl.classList.add("ok");
  if (type === "err") statusEl.classList.add("err");
}

// ============================
// COUNTDOWN
// ============================
function startCountdown(minutes) {
  stopCountdown();
  endAtMs = Date.now() + minutes * 60 * 1000;
  tick(); // immediate
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
    setStatus("Time expired. Click Back and start again.", "err");
    stopCountdown(); // stops interval and resets endAtMs; keeps disabled by set above
    submitBtn.disabled = true;
  }
}

// ============================
// COPY FALLBACK
// ============================
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
    }
