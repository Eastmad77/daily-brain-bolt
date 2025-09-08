/* =========================================================
   The Daily BrainBolt — app.js (Firebase + Quiz + FCM)
   ========================================================= */

/* -----------------------------
   0) SMALL UTILITIES
------------------------------ */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const fmtDateKey = (d = new Date()) =>
  [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

// simple loader for Papa if needed (most builds already include Papa from CDN in index.html)
function whenPapa(cb) {
  if (window.Papa) return cb();
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js";
  s.onload = cb;
  document.head.appendChild(s);
}

/* -----------------------------------------
   1) FIREBASE: EARLY INIT (compat SDKs)
------------------------------------------ */
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

/* -----------------------------------------
   2) FCM (Web Push): VAPID + enable button
------------------------------------------ */
const vapidKey = 'BMt3tNZvjrKVPgzHd2k_Belbqd2idB7O-5j5-u6lIcl7-mptPSeROci4SRxOqnyhWM1Ii4BZgT-TA5k8HVPoClY'; // ✅ your key

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

    // ensure SW at the ROOT: /firebase-messaging-sw.js
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

    // Save token under /users/{uid} if signed in
    try {
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
    } catch (e) {
      console.warn("[FCM] token save skipped/failed:", e);
    }

    alert("Notifications enabled ✅");
  } catch (e) {
    console.error("[FCM] error:", e);
    alert("Notifications error — see Console.");
  }
}

/* -----------------------------------------
   3) AUTH (optional: Google sign in/out)
------------------------------------------ */
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

/* -----------------------------------------
   4) QUIZ: Google Sheets CSV -> questions
------------------------------------------ */
// Update with your sheet + gids
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
  timerFill: $("#timerFill"), // width-based smooth bar
  status: $("#statusline"),

  btnStart: $("#btnStart") || $("#startQuiz") || $("#start"), // tolerate naming variants
  btnShuffle: $("#btnShuffle"),
  btnShare: $("#btnShare"),
  btnNotify: $("#btnNotify"),

  btnShowAnswer: $("#showAnswerBtn"), // may exist in some templates
  btnPlayAgain: $("#playAgain"),
};

function logStatus(msg) {
  if (els.status) els.status.textContent = msg;
  console.log("[Quiz]", msg);
}
function norm(s) {
  return String(s || "").trim();
}

function loadCSV(url, cbOk, cbErr) {
  Papa.parse(url + "&cb=" + Date.now(), {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: ({ data }) => cbOk(data || []),
    error: (err) => cbErr(err),
  });
}

function pickTodays(rows) {
  const good = rows.filter((r) => r && r.Date && r.Question);
  const todays = good.filter((r) => norm(r.Date) === state.todayKey);
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

  // (Re)start smooth timer
  startTimer(() => {
    // time’s up → reveal wrong (if no selection)
    if (!state.selected) reveal(q, false, true);
  });
}

function onSelect(btn, val) {
  $$(".choice").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  state.selected = val;
  // auto-reveal after a short delay
  setTimeout(() => {
    const q = state.todays[state.idx];
    if (!q) return;
    reveal(q, norm(val).toLowerCase() === norm(q.Answer).toLowerCase(), false);
  }, 500);
}

function reveal(q, isCorrect, isTimeout) {
  stopTimer();

  // disable buttons to prevent more clicks in this round
  $$(".choice").forEach((b) => {
    b.classList.add("disabled");
    b.disabled = true;
  });

  const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : "";
  if (els.feedback) {
    els.feedback.innerHTML = isCorrect
      ? `<div class="banner ok">Correct!${expl}</div>`
      : `<div class="banner bad">${isTimeout ? "Time’s up!" : "Not quite."} <span class="answer">Correct: <strong>${q.Answer}</strong></span>${expl}</div>`;
  }

  // scoring + move next (or stop on wrong – earlier behavior was to stop and require Start/Shuffle)
  if (isCorrect) {
    state.score++;
    state.idx++;
  } else {
    // stop here; let user click Start or Shuffle to continue, per your preference
  }
  updateBars();
  // Only advance automatically if correct:
  if (isCorrect) setTimeout(showQuestion, 900);
}

/* -----------------------------
   Smooth 10s timer bar
------------------------------ */
function startTimer(onTimeout) {
  stopTimer();
  state.ticking = true;
  state.timerStart = performance.now();
  const dur = state.timerDurMs;

  const tick = (ts) => {
    if (!state.ticking) return;
    const elapsed = ts - state.timerStart;
    const t = Math.min(1, elapsed / dur);
    if (els.timerFill) els.timerFill.style.width = `${(1 - t) * 100}%`; // count-down left→right
    if (t >= 1) {
      state.ticking = false;
      onTimeout?.();
      return;
    }
    state.timerReq = requestAnimationFrame(tick);
  };
  state.timerReq = requestAnimationFrame(tick);
}

function stopTimer() {
  state.ticking = false;
  if (state.timerReq) cancelAnimationFrame(state.timerReq);
  state.timerReq = 0;
}

/* -----------------------------
   Flow: Start / Shuffle / Share
------------------------------ */
function startQuiz() {
  state.idx = 0;
  state.score = 0;
  updateBars();
  showQuestion();
}

function shuffleSet() {
  // reshuffle today's set (or take a random 12 from bank)
  if (state.allRows?.length) {
    // take 12 random from bank:
    const rand = [...state.allRows].sort(() => Math.random() - 0.5).slice(0, 12);
    state.todays = rand;
    startQuiz();
  }
}

async function shareLink() {
  const shareData = {
    title: "The Daily BrainBolt",
    text: "Try today’s Daily BrainBolt quiz!",
    url: location.href,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareData.url);
      alert("Link copied!");
    }
  } catch (e) {
    console.warn("Share canceled/failed:", e);
  }
}

/* -----------------------------
   Load data (live first, fallback bank)
------------------------------ */
function bootQuiz() {
  whenPapa(() => {
    const today = fmtDateKey();
    if (els.today) els.today.textContent = today;

    logStatus("Loading live…");
    loadCSV(
      CSV_LIVE,
      (liveRows) => {
        logStatus(`Live loaded: ${liveRows.length} rows`);
        state.allRows = liveRows;
        state.todays = pickTodays(liveRows);
        if (!state.todays.length) {
          // fallback to bank
          logStatus("No live rows for today. Loading bank…");
          loadCSV(
            CSV_BANK,
            (bankRows) => {
              state.allRows = bankRows;
              state.todays = pickTodays(bankRows);
              if (!state.todays.length) {
                logStatus("No quiz rows found in live or bank.");
                if (els.metaText) els.metaText.textContent = "No quiz rows found.";
                return;
              }
              if (els.metaText) els.metaText.textContent = "Ready. Click Start.";
              updateBars();
            },
            (err) => {
              console.error("Bank CSV error", err);
              logStatus("Error loading bank CSV.");
            }
          );
          return;
        }
        if (els.metaText) els.metaText.textContent = "Ready. Click Start.";
        updateBars();
      },
      (err) => {
        console.error("Live CSV error", err);
        logStatus("Couldn’t load CSV. Ensure the sheet is Published to the web and gid is correct.");
        // try bank anyway
        loadCSV(
          CSV_BANK,
          (bankRows) => {
            state.allRows = bankRows;
            state.todays = pickTodays(bankRows);
            if (els.metaText) els.metaText.textContent = state.todays.length ? "Ready. Click Start." : "No quiz rows found.";
            updateBars();
          },
          (err2) => {
            console.error("Bank CSV error", err2);
            logStatus("Error loading CSV. Check publish settings and access.");
          }
        );
      }
    );
  });
}

/* -----------------------------
   Save session to Firestore
------------------------------ */
async function saveSession(score, elapsedSec) {
  try {
    const uid = firebase.auth()?.currentUser?.uid || null;
    await firebase.firestore().collection("sessions").add({
      date: state.todayKey,
      score,
      elapsedSec,
      uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn("[Session] save failed:", e);
  }
}

/* -----------------------------
   Wire buttons + boot
------------------------------ */
function wireUI() {
  on(els.btnStart, "click", startQuiz);
  on(els.btnShuffle, "click", shuffleSet);
  on(els.btnShare, "click", shareLink);
  on(els.btnNotify, "click", enableNotifications);

  // Legacy “Show Answer” button (kept for older templates)
  on(els.btnShowAnswer, "click", () => {
    const q = state.todays[state.idx];
    if (!q || !state.selected) return;
    const isCorrect = norm(state.selected).toLowerCase() === norm(q.Answer).toLowerCase();
    reveal(q, isCorrect, false);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireUI();
  bootQuiz();
});
