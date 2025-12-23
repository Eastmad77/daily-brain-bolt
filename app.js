// ===== Brain ⚡ Bolt — App.js v3.13.1 (36 questions: 3 rounds of 12 + restored premium UX) =====

/**
 * ✅ Uses the PUBLISHED CSV link (works for anonymous/incognito access)
 * Make sure this exact URL loads a CSV in a normal browser tab.
 */
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

// Timing
const QUESTION_TIME_MS = 10000;
const QUESTION_TICK_MS = 100;

// ✅ 36-per-day support
const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = Math.ceil(TOTAL_QUESTIONS / ROUND_SIZE);

// State
let questions = [];
let currentIndex = 0;
let score = 0;

let wrongTotal = 0;
let correctSinceLastWrong = 0;

let elapsed = 0;
let elapsedInterval = null;

let qTimer = null;
let qStart = 0;
let qLastTickSec = 3;

let soundOn = true;
let successAutoNav = null;

// ---------------- Elements ----------------
const startBtn = document.getElementById("startBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const shareBtn = document.getElementById("shareBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

const qBox = document.getElementById("questionBox");
const choicesDiv = document.getElementById("choices");

const pillScore = document.getElementById("pillScore");
const progressLabel = document.getElementById("progressLabel");
const elapsedTimeEl = document.getElementById("elapsedTime");

const timerBar = document.getElementById("timerBar"); // overall
const qTimerBar = document.getElementById("qTimerBar"); // per-question

const startSplash = document.getElementById("startSplash");
const successSplash = document.getElementById("successSplash");

const countdownOverlay = document.getElementById("countdownOverlay");
const countNum = document.getElementById("countNum");

const setLabel = document.getElementById("setLabel");
const soundBtn = document.getElementById("soundBtn");

const streakVis = document.getElementById("streakVis");

// ---------------- Helpers ----------------
const setText = (el, txt) => {
  if (el) el.textContent = txt;
};
const addCls = (el, c) => el && el.classList.add(c);
const remCls = (el, c) => el && el.classList.remove(c);

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function showCountdown(on) {
  if (!countdownOverlay) return;
  if (on) {
    countdownOverlay.hidden = false;
    addCls(countdownOverlay, "show");
  } else {
    remCls(countdownOverlay, "show");
    // let CSS fade complete
    setTimeout(() => {
      if (!countdownOverlay.classList.contains("show")) countdownOverlay.hidden = true;
    }, 250);
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------- Audio (tick + GO) ----------------
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function beep(freq = 880, dur = 0.08, gain = 0.04, type = "sine") {
  if (!soundOn) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch (_) { }
}

function beepTick() {
  beep(880, 0.07, 0.04, "sine");
}
function beepGo() {
  if (!soundOn) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    g.gain.value = 0.05;
    o.frequency.setValueAtTime(660, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.16);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
  } catch (_) { }
}

// ---------------- Splash (auto-dismiss, no tap required) ----------------
function killStartSplash() {
  if (!startSplash) return;
  addCls(startSplash, "hide");
  setTimeout(() => {
    startSplash.style.display = "none";
  }, 280);
}

function setupSplashAutodismiss() {
  if (!startSplash) return;

  // Allow tap as a backup (doesn't change layout)
  startSplash.addEventListener("click", killStartSplash, { once: true });

  // Auto-dismiss shortly after load (no tap required)
  // If you want longer, change 900 -> e.g. 1600
  setTimeout(killStartSplash, 900);
}

// ---------------- CSV load ----------------
function fetchCSV() {
  return new Promise((resolve, reject) => {
    if (!window.Papa) return reject(new Error("PapaParse not loaded"));
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data || []),
      error: (err) => reject(err),
    });
  });
}

function normaliseRow(r) {
  const question = (r.Question || "").trim();
  const optionA = (r.OptionA || "").trim();
  const optionB = (r.OptionB || "").trim();
  const optionC = (r.OptionC || "").trim();
  const optionD = (r.OptionD || "").trim();
  const answer = (r.Answer || "").trim();

  if (!question || !optionA || !optionB || !answer) return null;

  const options = [optionA, optionB, optionC, optionD].filter(Boolean);
  if (options.length < 2) return null;

  return {
    question,
    options,
    answer,
    category: (r.Category || "").trim(),
    difficulty: (r.Difficulty || "").trim(),
    explanation: (r.Explanation || "").trim(),
    id: (r.ID || "").trim(),
    date: (r.Date || "").trim(),
  };
}

// ---------------- Streak dots + Redemption ----------------
function buildStreakBar() {
  if (!streakVis) return;
  streakVis.innerHTML = "";
  // Ensure it has the right CSS class (layout unchanged)
  addCls(streakVis, "streak-vis");

  for (let i = 0; i < ROUND_SIZE; i++) {
    const d = document.createElement("div");
    d.className = "streak-dot"; // ✅ matches style.css
    d.dataset.idx = String(i);
    streakVis.appendChild(d);
  }
}

function markStreakDot(isCorrect) {
  if (!streakVis) return;

  const withinRound = currentIndex % ROUND_SIZE;
  const dots = [...streakVis.querySelectorAll(".streak-dot")];
  const dot = dots[withinRound];
  if (!dot) return;

  remCls(dot, "is-correct");
  remCls(dot, "is-wrong");

  addCls(dot, isCorrect ? "is-correct" : "is-wrong");
}

function redeemOneWrongDot() {
  // Redemption rule: after 3 correct since last wrong -> redeem ONE previous wrong dot
  if (!streakVis) return;

  const dots = [...streakVis.querySelectorAll(".streak-dot")];
  const wrongDot = dots.find((d) => d.classList.contains("is-wrong"));
  if (!wrongDot) return;

  remCls(wrongDot, "is-wrong");
  addCls(wrongDot, "is-correct");
  addCls(wrongDot, "redeem");
  setTimeout(() => remCls(wrongDot, "redeem"), 1000);
}

// ---------------- UI labels ----------------
function updateHeaderLabels() {
  const round = Math.floor(currentIndex / ROUND_SIZE) + 1;
  const inRound = (currentIndex % ROUND_SIZE);
  const qNum = clamp(inRound, 0, ROUND_SIZE);

  setText(pillScore, `Score ${score}`);
  setText(progressLabel, `Round ${round}/${TOTAL_ROUNDS} • Q ${qNum}/${ROUND_SIZE}`);
}

function setReadyUI() {
  setText(setLabel, "Ready");
  setText(pillScore, "Score 0");
  setText(progressLabel, `Round 1/${TOTAL_ROUNDS} • Q 0/${ROUND_SIZE}`);
  setText(elapsedTimeEl, "Time: 0:00");
  if (timerBar) timerBar.style.width = "0%";
  if (qTimerBar) qTimerBar.style.width = "0%";
}

// ---------------- Game flow ----------------
function stopAllTimers() {
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = null;

  if (qTimer) clearInterval(qTimer);
  qTimer = null;

  if (successAutoNav) clearTimeout(successAutoNav);
  successAutoNav = null;
}

function beginElapsedTimer() {
  const t0 = Date.now();
  elapsedInterval = setInterval(() => {
    const ms = Date.now() - t0;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    setText(elapsedTimeEl, `Time: ${m}:${String(r).padStart(2, "0")}`);

    // overall bar cycles across full run (optional)
    const pct = clamp((currentIndex / TOTAL_QUESTIONS) * 100, 0, 100);
    if (timerBar) timerBar.style.width = `${pct}%`;
  }, 200);
}

function startQuestionTimer() {
  qStart = Date.now();
  qLastTickSec = 3;

  if (qTimer) clearInterval(qTimer);

  qTimer = setInterval(() => {
    const elapsedMs = Date.now() - qStart;
    const remaining = Math.max(0, QUESTION_TIME_MS - elapsedMs);
    const pct = clamp((remaining / QUESTION_TIME_MS) * 100, 0, 100);

    if (qTimerBar) qTimerBar.style.width = `${pct}%`;

    // tick at 3..2..1
    const sec = Math.ceil(remaining / 1000);
    if (sec <= 3 && sec > 0 && sec !== qLastTickSec) {
      qLastTickSec = sec;
      beepTick();
    }

    if (remaining <= 0) {
      clearInterval(qTimer);
      qTimer = null;
      // auto-mark wrong and advance
      onAnswer(null, true);
    }
  }, QUESTION_TICK_MS);
}

function showQuestion() {
  const q = questions[currentIndex];
  if (!q) return;

  // Enable buttons
  if (choicesDiv) choicesDiv.innerHTML = "";

  setText(qBox, q.question);

  // Build answers
  const opts = shuffleArray([...q.options]);
  opts.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.type = "button";
    btn.textContent = opt;
    btn.addEventListener("click", () => onAnswer(opt, false));
    choicesDiv.appendChild(btn);
  });

  updateHeaderLabels();
  startQuestionTimer();
}

function disableChoices() {
  if (!choicesDiv) return;
  [...choicesDiv.querySelectorAll("button")].forEach((b) => (b.disabled = true));
}

function onAnswer(selected, isTimeout) {
  const q = questions[currentIndex];
  if (!q) return;

  disableChoices();

  const correct = !isTimeout && selected && selected === q.answer;

  if (correct) {
    score++;
    correctSinceLastWrong++;

    markStreakDot(true);

    // Redemption: every 3 correct since last wrong redeems one previous wrong (per round)
    if (correctSinceLastWrong >= 3 && wrongTotal > 0) {
      redeemOneWrongDot();
      wrongTotal--;
      correctSinceLastWrong = 0;
    }
  } else {
    wrongTotal++;
    correctSinceLastWrong = 0;
    markStreakDot(false);
  }

  setText(pillScore, `Score ${score}`);

  // brief delay then next
  setTimeout(() => {
    nextStep();
  }, 360);
}

function nextStep() {
  currentIndex++;

  // Round boundary handling
  const justFinishedRound = currentIndex % ROUND_SIZE === 0;
  const finishedAll = currentIndex >= TOTAL_QUESTIONS;

  if (finishedAll) {
    endGame();
    return;
  }

  if (justFinishedRound) {
    // Reset streak visuals for next round (layout unchanged)
    buildStreakBar();
  }

  showQuestion();
}

function endGame() {
  stopAllTimers();

  // Small “success” splash if exists
  if (successSplash) {
    successSplash.style.display = "";
    addCls(successSplash, "show");
    // auto-hide after a moment
    successAutoNav = setTimeout(() => {
      remCls(successSplash, "show");
      successSplash.style.display = "none";
    }, 1500);
  }

  // Show play again button pulse (if CSS supports)
  addCls(playAgainBtn, "pulse");
  setText(setLabel, "Done");
  setText(progressLabel, `Round ${TOTAL_ROUNDS}/${TOTAL_ROUNDS} • Q ${ROUND_SIZE}/${ROUND_SIZE}`);
}

async function startGame() {
  stopAllTimers();

  try {
    remCls(successSplash, "show");
    setText(setLabel, "Loading…");

    const data = await fetchCSV();
    const mapped = data.map(normaliseRow).filter(Boolean);

    if (!mapped.length) throw new Error("No valid questions in CSV");

    // ✅ Keep exactly 36 (3 rounds of 12). If fewer, use what we have safely.
    questions = shuffleArray(mapped).slice(0, TOTAL_QUESTIONS);

    currentIndex = 0;
    score = 0;
    wrongTotal = 0;
    correctSinceLastWrong = 0;

    setReadyUI();
    buildStreakBar();

    // Countdown: 3..2..1..GO with circular animation + tick sounds
    let n = 3;
    setText(countNum, n);
    showCountdown(true);
    countNum.style.animation = "none";
    void countNum.offsetWidth;
    countNum.style.animation = "popIn .4s ease";
    beepTick();

    const int = setInterval(() => {
      n--;
      if (n > 0) {
        setText(countNum, n);
        countNum.style.animation = "none";
        void countNum.offsetWidth;
        countNum.style.animation = "popIn .4s ease";
        beepTick();
      } else {
        clearInterval(int);
        setText(countNum, "GO");
        countNum.style.animation = "none";
        void countNum.offsetWidth;
        countNum.style.animation = "popIn .4s ease";
        beepGo();

        setTimeout(() => {
          showCountdown(false);
          setText(setLabel, "Playing");
          remCls(playAgainBtn, "pulse");
          beginElapsedTimer();
          showQuestion();
        }, 220);
      }
    }, 700);
  } catch (e) {
    console.error(e);
    setText(qBox, "Could not load today’s quiz. Please try again later.");
    setText(setLabel, "Error");
  }
}

// ---------------- Shuffle set ----------------
function shuffleSet() {
  if (!questions || !questions.length) return;
  shuffleArray(questions);
  currentIndex = 0;
  score = 0;
  wrongTotal = 0;
  correctSinceLastWrong = 0;

  setReadyUI();
  buildStreakBar();
  showQuestion();
}

// ---------------- Share ----------------
function shareScore() {
  const round = Math.floor(currentIndex / ROUND_SIZE) + 1;
  const inRound = currentIndex % ROUND_SIZE;
  const text = `I'm playing Brain ⚡ Bolt! Score: ${score} • Round ${round}/${TOTAL_ROUNDS} • Q ${inRound}/${ROUND_SIZE}`;
  const url = location.href;

  // Try native share
  if (navigator.share) {
    navigator
      .share({ title: "Brain Bolt", text, url })
      .catch(() => { });
    return;
  }
  // Clipboard fallback
  navigator.clipboard?.writeText(`${text} - ${url}`).catch(() => { });
}

// ---------------- Init ----------------
function init() {
  setupSplashAutodismiss();

  // Sound toggle
  soundBtn?.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
    // attempt to unlock audio on first interaction
    if (soundOn) {
      try {
        const ctx = getAudioCtx();
        if (ctx.state === "suspended") ctx.resume();
      } catch (_) { }
    }
  });

  startBtn?.addEventListener("click", startGame);
  shuffleBtn?.addEventListener("click", shuffleSet);
  shareBtn?.addEventListener("click", shareScore);
  playAgainBtn?.addEventListener("click", startGame);

  // initial UI
  setReadyUI();
  buildStreakBar();
}

init();
