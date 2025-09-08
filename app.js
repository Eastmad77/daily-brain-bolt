/* =========================================================
   The Daily BrainBolt — app.js (Firebase + Quiz + FCM)
   ========================================================= */

// small helpers
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const fmtDateKey = (d = new Date()) =>
  [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

function whenPapa(cb) {
  if (window.Papa) return cb();
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js";
  s.onload = cb;
  document.head.appendChild(s);
}

/* 1) Firebase early init */
(function initFirebaseEarly() {
  try {
    if (!window.FB_CONFIG) {
      console.warn("[Firebase] FB_CONFIG missing. Is /firebase-config.js included before /app.js?");
      return;
    }
    if (!window.firebase || !firebase.initializeApp) {
      console.warn("[Firebase] SDK not loaded yet. Will retry on DOMContentLoaded.");
      document.addEventListener("DOMContentLoaded", attemptInitOnce, { once: true });
      return;
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(window.FB_CONFIG);
      console.log("[Firebase] Initialized [DEFAULT]");
    }
    window._db = firebase.firestore();
    window._auth = firebase.auth ? firebase.auth() : null;
  } catch (e) {
    console.error("[Firebase] Init error:", e);
  }

  function attemptInitOnce() {
    try {
      if (!window.FB_CONFIG || !window.firebase || !firebase.initializeApp) return;
      if (!firebase.apps.length) {
        firebase.initializeApp(window.FB_CONFIG);
        console.log("[Firebase] Initialized on DOMContentLoaded");
      }
      window._db = firebase.firestore();
      window._auth = firebase.auth ? firebase.auth() : null;
    } catch (e) {
      console.error("[Firebase] Delayed init error:", e);
    }
  }
})();

/* 2) Push Notifications (FCM) */
const vapidKey = 'BMt3tNZvjrKVPgzHd2k_Belbqd2idB7O-5j5-u6lIcl7-mptPSeROci4SRxOqnyhWM1Ii4BZgT-TA5k8HVPoClY';

async function enableNotifications() {
  try {
    if (!("Notification" in window)) {
      alert("Notifications are not supported in this browser.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      alert("Notifications blocked. You can enable them in your browser settings.");
      return;
    }

    // register the messaging SW at the ROOT path
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      vapidKey,
      serviceWorkerRegistration: swReg,
    });

    console.log("[FCM] token:", token);
    if (!token) {
      alert("Could not get a notification token. Check Console for details.");
      return;
    }

    // optionally save token under /users/{uid}
    const uid = firebase.auth()?.currentUser?.uid || null;
    if (uid) {
      await firebase.firestore().collection("users").doc(uid).set(
        {
          fcmToken: token,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.log("[FCM] token saved for user", uid);
    }

    alert("Notifications enabled ✅");
  } catch (e) {
    console.error("[FCM] error:", e);
    alert("Notifications error — see Console.");
  }
}

/* 3) Auth (optional) */
async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().signInWithPopup(provider);
  } catch (e) {
    console.error("[Auth] sign-in error:", e);
    alert("Sign-in failed. See Console.");
  }
}
async function signOut() {
  try {
    await firebase.auth().signOut();
  } catch (e) {
    console.error("[Auth] sign-out error:", e);
  }
}
firebase.auth?.().onAuthStateChanged?.((user) => {
  const badge = $("#userBadge");
  if (!badge) return;
  if (user) {
    badge.textContent = user.displayName || "Signed in";
    badge.classList.add("signed-in");
  } else {
    badge.textContent = "Guest";
    badge.classList.remove("signed-in");
  }
});

/* 4) Quiz from Google Sheets */
const SHEET_PUB_BASE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv";
const LIVE_GID = "1410250735";
const BANK_GID = "2009978011";
const CSV_LIVE = `${SHEET_PUB_BASE}&gid=${LIVE_GID}`;
const CSV_BANK = `${SHEET_PUB_BASE}&gid=${BANK_GID}`;

const state = {
  todayKey: fmtDateKey(),
  allRows: [],
  todays: [],
  idx: 0,
  score: 0,
  selected: null,
  ticking: false,
  timerReq: 0,
  timerStart: 0,
  timerDurMs: 10000, // 10s
};

const els = {
  today: $("#today"),
  metaText: $("#metaText"),
  question: $("#question"),
  options: $("#options"),
  feedback: $("#feedback"),
  score: $("#score"),
  progressText: $("#progressText"),
  progressFill: $("#progressFill"),
  timerFill: $("#timerFill"),
  status: $("#statusline"),
  btnStart: $("#btnStart") || $("#startQuiz") || $("#start"),
  btnShuffle: $("#btnShuffle"),
  btnShare: $("#btnShare"),
  btnNotify: $("#btnNotify"),
  btnShowAnswer: $("#showAnswerBtn"),
  btnPlayAgain: $("#playAgain"),
};

function logStatus(msg) { if (els.status) els.status.textContent = msg; console.log("[Quiz]", msg); }
function norm(s) { return String(s || "").trim(); }

function loadCSV(url, ok, err) {
  Papa.parse(url + "&cb=" + Date.now(), {
    download: true, header: true, skipEmptyLines: true,
    complete: ({ data }) => ok(data || []),
    error: (e) => err(e),
  });
}
function pickTodays(rows) {
  const good = rows.filter(r => r && r.Date && r.Question);
  const todays = good.filter(r => norm(r.Date) === state.todayKey);
  return todays.length ? todays : good.slice(0, 12);
}

function updateBars() {
  if (els.progressText) els.progressText.textContent = `${state.idx}/${state.todays.length || 0}`;
  if (els.progressFill) {
    const pct = state.todays.length ? (state.idx / state.todays.length) * 100 : 0;
    els.progressFill.style.width = `${pct}%`;
  }
  if (els.score) els.score.textContent = String(state.score);
}

function buildChoice(text) {
  const btn = document.createElement("button");
  btn.className = "choice";
  btn.textContent = text;
  btn.onclick = () => onSelect(btn, text);
  return btn;
}

function showQuestion() {
  const q = state.todays[state.idx];
  if (!q) {
    if (els.feedback) els.feedback.innerHTML = `<div class="correct banner">Nice! Done for today.</div>`;
    if (els.btnPlayAgain) {
      els.btnPlayAgain.style.display = "inline-flex";
      els.btnPlayAgain.onclick = startQuiz;
    }
    stopTimer();
    return;
  }
  state.selected = null;
  if (els.feedback) els.feedback.innerHTML = "";
  if (els.btnShowAnswer) els.btnShowAnswer.style.display = "none";
  if (els.btnPlayAgain) els.btnPlayAgain.style.display = "none";

  if (els.metaText) els.metaText.textContent = `${q.Difficulty || "—"} • ${q.Category || "Quiz"}`;
  if (els.question) els.question.textContent = q.Question || "—";

  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  if (els.options) {
    els.options.innerHTML = "";
    opts.forEach((t) => els.options.appendChild(buildChoice(t)));
  }

  startTimer(() => { if (!state.selected) reveal(q, false, true); });
}

function onSelect(btn, val) {
  $$(".choice").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  state.selected = val;
  setTimeout(() => {
    const q = state.todays[state.idx];
    if (!q) return;
    reveal(q, norm(val).toLowerCase() === norm(q.Answer).toLowerCase(), false);
  }, 500);
}

function reveal(q, isCorrect, isTimeout) {
  stopTimer();
  $$(".choice").forEach((b) => { b.classList.add("disabled"); b.disabled = true; });
  const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : "";
  if (els.feedback) {
    els.feedback.innerHTML = isCorrect
      ? `<div class="banner ok">Correct!${expl}</div>`
      : `<div class="banner bad">${isTimeout ? "Time’s up!" : "Not quite."} <span class="answer">Correct: <strong>${q.Answer}</strong></span>${expl}</div>`;
  }
  if (isCorrect) { state.score++; state.idx++; updateBars(); setTimeout(showQuestion, 900); }
  else { updateBars(); }
}

/* Smooth 10s timer bar */
function startTimer(onTimeout) {
  stopTimer();
  state.ticking = true;
  state.timerStart = performance.now();
  const dur = state.timerDurMs;

  const tick = (ts) => {
    if (!state.ticking) return;
    const t = Math.min(1, (ts - state.timerStart) / dur);
    if (els.timerFill) els.timerFill.style.width = `${(1 - t) * 100}%`;
    if (t >= 1) { state.ticking = false; onTimeout?.(); return; }
    state.timerReq = requestAnimationFrame(tick);
  };
  state.timerReq = requestAnimationFrame(tick);
}
function stopTimer() {
  state.ticking = false;
  if (state.timerReq) cancelAnimationFrame(state.timerReq);
  state.timerReq = 0;
}

/* Start / Shuffle / Share */
function startQuiz() { state.idx = 0; state.score = 0; updateBars(); showQuestion(); }
function shuffleSet() {
  if (state.allRows?.length) {
    const rand = [...state.allRows].sort(() => Math.random() - 0.5).slice(0, 12);
    state.todays = rand; startQuiz();
  }
}
async function shareLink() {
  const data = { title: "The Daily BrainBolt", text: "Try today’s Daily BrainBolt quiz!", url: location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(data.url); alert("Link copied!"); }
  } catch (e) { console.warn("Share canceled/failed:", e); }
}

/* Load data (live first, fallback bank) */
function bootQuiz() {
  whenPapa(() => {
    if ($("#today")) $("#today").textContent = state.todayKey;
    logStatus("Loading live…");
    loadCSV(CSV_LIVE, (live) => {
      logStatus(`Live loaded: ${live.length} rows`);
      state.allRows = live;
      state.todays = pickTodays(live);
      if (!state.todays.length) {
        logStatus("No live rows for today. Loading bank…");
        loadCSV(CSV_BANK, (bank) => {
          state.allRows = bank;
          state.todays = pickTodays(bank);
          if ($("#metaText")) $("#metaText").textContent = state.todays.length ? "Ready. Click Start." : "No quiz rows found.";
          updateBars();
        }, (e) => { console.error("Bank CSV error", e); logStatus("Error loading bank CSV."); });
        return;
      }
      if ($("#metaText")) $("#metaText").textContent = "Ready. Click Start.";
      updateBars();
    }, (e) => {
      console.error("Live CSV error", e);
      logStatus("Couldn’t load CSV. Ensure the sheet is Published and gid is correct.");
      loadCSV(CSV_BANK, (bank) => {
        state.allRows = bank;
        state.todays = pickTodays(bank);
        if ($("#metaText")) $("#metaText").textContent = state.todays.length ? "Ready. Click Start." : "No quiz rows found.";
        updateBars();
      }, (e2) => { console.error("Bank CSV error", e2); logStatus("Error loading CSV. Check publish settings and access."); });
    });
  });
}

/* Save session (optional) */
async function saveSession(score, elapsedSec) {
  try {
    const uid = firebase.auth()?.currentUser?.uid || null;
    await firebase.firestore().collection("sessions").add({
      date: state.todayKey, score, elapsedSec, uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.warn("[Session] save failed:", e); }
}

/* Wire + boot */
function wireUI() {
  on($("#btnStart") || $("#startQuiz") || $("#start"), "click", startQuiz);
  on($("#btnShuffle"), "click", shuffleSet);
  on($("#btnShare"), "click", shareLink);
  on($("#btnNotify"), "click", enableNotifications);
  on($("#showAnswerBtn"), "click", () => {
    const q = state.todays[state.idx];
    if (!q || !state.selected) return;
    const ok = norm(state.selected).toLowerCase() === norm(q.Answer).toLowerCase();
    reveal(q, ok, false);
  });
}
document.addEventListener("DOMContentLoaded", () => { wireUI(); bootQuiz(); });
