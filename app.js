// ===== Brain ⚡ Bolt — App.js v3.16.0 (stability + Level 2 decoys) =====
// Keeps existing layout/DOM. Fixes splash stuck, restores countdown + timer bar + streak/redemption,
// and ensures Level 2 match mode is interactive with "near-miss" decoy answers.

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const TZ = "Pacific/Auckland";
const QUESTION_TIME_MS = 10000;
const QUESTION_TICK_MS = 100;

// 36-per-day support
const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = 3;

// Round modes (Level 2 is match)
const ROUND_MODES = ["quiz", "match", "quiz"];

// Match mode (Level 2)
const MATCH_PAIRS = 6;          // number of correct pairs
const MATCH_DECOYS = 6;         // extra answer tiles (near-miss decoys)
const MATCH_TIME_MS = 45000;    // match round timer
const MATCH_TICK_MS = 100;

// Redemption rule
// - Up to 3 mistakes total ends the run
// - After a wrong answer, get 3 correct in a row to "redeem" one mistake (and show a redeem dot)
const MAX_WRONG = 3;
const REDEEM_STREAK = 3;

// ---------------- DOM ----------------
const $ = (id) => document.getElementById(id);

const splashEl = $("splash");
const splashStatusEl = $("splashStatus");

const gameWrap = $("gameWrap");
const questionBox = $("questionBox");
const questionEl = $("question");
const choicesDiv = $("choices");

const timerBar = $("timerBar");
const qTimerBar = $("qTimerBar");

const progressLabel = $("progressLabel");
const elapsedTimeEl = $("elapsedTime");

const setLabel = $("setLabel");
const pillScore = $("pillScore");

const streakVis = $("streakVis");
const countdownOverlay = $("countdownOverlay");
const countNum = $("countNum");

const startBtn = $("startBtn");
const shuffleBtn = $("shuffleBtn");
const soundBtn = $("soundBtn");

// Guard against missing critical nodes (don't hard-crash; show splash error instead)
function requireEl(el, name) {
  if (!el) throw new Error(`Missing element #${name} in index.html`);
  return el;
}

// ---------------- State ----------------
let allRows = [];
let questions = [];

let roundIndex = 0;            // 0..2
let roundQuestions = [];       // current 12
let roundQuestionIndex = 0;    // 0..11 within round

let score = 0;
let wrongTotal = 0;
let correctSinceLastWrong = 0;

let elapsed = 0;
let elapsedInterval = null;

let qTimer = null;
let qStart = 0;

let soundOn = true;

// Match state
let matchState = null;

// ---------------- Helpers ----------------
function setText(el, t) { if (el) el.textContent = t; }
function show(el) { if (el) el.style.display = ""; }
function hide(el) { if (el) el.style.display = "none"; }

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function safeNowYmd() {
  // Used only for UI labels; sheet build handles the true date.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------- Sound (no mp3 dependency) ----------------
// We use tiny WebAudio beeps so missing /tick.mp3 etc never blocks the app.
let audioCtx = null;

function ensureAudioCtx() {
  if (!soundOn) return null;
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  } catch {
    return null;
  }
}

function beep({ freq = 880, ms = 70, type = "sine", gain = 0.06 } = {}) {
  if (!soundOn) return;
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      o.disconnect();
      g.disconnect();
    }, ms);
  } catch {}
}

function tickSound() { beep({ freq: 880, ms: 55, type: "square", gain: 0.05 }); }
function goodSound() { beep({ freq: 1046, ms: 90, type: "sine", gain: 0.06 }); }
function badSound()  { beep({ freq: 220, ms: 110, type: "sawtooth", gain: 0.04 }); }

// ---------------- UI primitives ----------------
function killSplash() {
  if (!splashEl) return;
  splashEl.classList.add("hide");
  setTimeout(() => { splashEl.style.display = "none"; }, 280);
}

function showSplashError(msg) {
  if (splashStatusEl) setText(splashStatusEl, msg);
  console.error(msg);
}

function resetTimerBar() {
  if (qTimerBar) qTimerBar.style.width = "100%";
}

function setTimerBarPct(pct) {
  if (!qTimerBar) return;
  const clamped = Math.max(0, Math.min(100, pct));
  qTimerBar.style.width = `${clamped}%`;
}

function startElapsedClock() {
  stopElapsedClock();
  elapsed = 0;
  if (elapsedTimeEl) setText(elapsedTimeEl, "0:00");
  elapsedInterval = setInterval(() => {
    elapsed += 1;
    if (!elapsedTimeEl) return;
    const mm = Math.floor(elapsed / 60);
    const ss = String(elapsed % 60).padStart(2, "0");
    setText(elapsedTimeEl, `${mm}:${ss}`);
  }, 1000);
}

function stopElapsedClock() {
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = null;
}

function updateHeaderUI() {
  if (setLabel) {
    const mode = ROUND_MODES[roundIndex] === "match" ? "MATCH" : "QUIZ";
    setText(setLabel, `Round ${roundIndex + 1}/${TOTAL_ROUNDS} • ${mode}`);
  }
  if (pillScore) setText(pillScore, `Score ${score}`);
  if (progressLabel) {
    if (ROUND_MODES[roundIndex] === "match") {
      const solved = matchState ? matchState.solved.size : 0;
      setText(progressLabel, `Pairs ${solved}/${MATCH_PAIRS} • Errors ${wrongTotal}/${MAX_WRONG}`);
    } else {
      setText(progressLabel, `Q ${roundQuestionIndex + 1}/${ROUND_SIZE} • Errors ${wrongTotal}/${MAX_WRONG}`);
    }
  }
}

function renderStreakDots() {
  // 36 dots (12 per round): show correct/wrong and redemption marks.
  if (!streakVis) return;

  const html = [];
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    html.push(`<span class="streak-dot" data-dot="${i}"></span>`);
  }
  streakVis.innerHTML = html.join("");

  [...streakVis.querySelectorAll(".streak-dot")].forEach((d) => {
    d.classList.remove("correct", "wrong", "redeem");
  });
}

function markDot(globalIndex, kind) {
  if (!streakVis) return;
  const el = streakVis.querySelector(`[data-dot="${globalIndex}"]`);
  if (!el) return;
  if (kind === "correct") el.classList.add("correct");
  if (kind === "wrong") el.classList.add("wrong");
  if (kind === "redeem") el.classList.add("redeem");
}

function globalQuestionIndex() {
  return (roundIndex * ROUND_SIZE) + roundQuestionIndex;
}

// ---------------- Countdown (3..2..1) ----------------
function runStartCountdown() {
  return new Promise((resolve) => {
    if (!countdownOverlay || !countNum) return resolve();

    let n = 3;
    show(countdownOverlay);

    const step = () => {
      setText(countNum, String(n));
      countNum.classList.remove("pulse");
      void countNum.offsetWidth; // restart anim
      countNum.classList.add("pulse");
      tickSound();

      n -= 1;
      if (n === 0) {
        setTimeout(() => {
          hide(countdownOverlay);
          resolve();
        }, 420);
        return;
      }
      setTimeout(step, 850);
    };

    step();
  });
}

// ---------------- CSV load ----------------
async function loadQuestionsFromSheets() {
  setText(splashStatusEl, "Loading today’s set…");

  const url = CSV_URL + "&_ts=" + Date.now(); // cache-buster
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV fetch failed (${res.status})`);

  const csvText = await res.text();

  if (!window.Papa) throw new Error("PapaParse missing");
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = (parsed && parsed.data) ? parsed.data : [];

  // Keep sheet order; do NOT shuffle here.
  const cleaned = rows
    .map((r) => ({
      Date: r.Date,
      Question: r.Question,
      OptionA: r.OptionA,
      OptionB: r.OptionB,
      OptionC: r.OptionC,
      OptionD: r.OptionD,
      Answer: r.Answer,
      Explanation: r.Explanation,
      Category: r.Category,
      Difficulty: r.Difficulty,
      ID: r.ID,
      LastUsed: r.LastUsed,
      DayNumber: r.DayNumber
    }))
    .filter((r) => r && String(r.Question || "").trim() && String(r.Answer || "").trim());

  if (cleaned.length < TOTAL_QUESTIONS) {
    throw new Error(`Not enough rows in LIVE sheet. Need ${TOTAL_QUESTIONS}, got ${cleaned.length}.`);
  }

  return cleaned.slice(0, TOTAL_QUESTIONS);
}

// ---------------- Quiz mode ----------------
function renderQuizQuestion() {
  requireEl(questionEl, "question");
  requireEl(choicesDiv, "choices");

  const q = roundQuestions[roundQuestionIndex];
  setText(questionEl, q.Question || "");

  // Build options (preserve sheet option order; fallback to Answer if missing)
  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  while (opts.length < 4) opts.push(String(q.Answer || "").trim());

  // restore quiz layout
  choicesDiv.style.display = "";
  choicesDiv.style.gridTemplateColumns = "";
  choicesDiv.style.gap = "";
  choicesDiv.innerHTML = "";

  opts.forEach((txt) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.type = "button";
    b.textContent = txt;
    b.onclick = () => onQuizPick(b, txt);
    choicesDiv.appendChild(b);
  });

  resetTimerBar();
  startQuestionTimer();
  updateHeaderUI();
}

function startQuestionTimer() {
  stopQuestionTimer();
  qStart = Date.now();
  setTimerBarPct(100);

  qTimer = setInterval(() => {
    const elapsedMs = Date.now() - qStart;
    const pct = 100 - (elapsedMs / QUESTION_TIME_MS) * 100;
    setTimerBarPct(pct);

    if (elapsedMs >= QUESTION_TIME_MS) {
      stopQuestionTimer();
      onQuizTimeout();
    }
  }, QUESTION_TICK_MS);
}

function stopQuestionTimer() {
  if (qTimer) clearInterval(qTimer);
  qTimer = null;
}

function lockChoices() {
  [...choicesDiv.querySelectorAll("button")].forEach((b) => (b.disabled = true));
}

function onQuizTimeout() {
  badSound();
  registerWrong();
  revealQuizAnswer(null);
  setTimeout(nextStepAfterAnswer, 650);
}

function onQuizPick(btn, pickedText) {
  stopQuestionTimer();
  lockChoices();

  const q = roundQuestions[roundQuestionIndex];
  const isCorrect = norm(pickedText) === norm(q.Answer);

  if (isCorrect) {
    goodSound();
    registerCorrect();
  } else {
    badSound();
    registerWrong();
  }

  revealQuizAnswer(btn);
  setTimeout(nextStepAfterAnswer, 650);
}

function revealQuizAnswer(clickedBtn) {
  const q = roundQuestions[roundQuestionIndex];
  const answerNorm = norm(q.Answer);

  [...choicesDiv.querySelectorAll("button")].forEach((b) => {
    const t = norm(b.textContent);
    if (t === answerNorm) b.classList.add("correct");
    else if (clickedBtn && b === clickedBtn) b.classList.add("wrong");
  });
}

// ---------------- Redemption + dots ----------------
function registerCorrect() {
  score += 1;
  correctSinceLastWrong += 1;

  markDot(globalQuestionIndex(), "correct");

  if (wrongTotal > 0 && correctSinceLastWrong >= REDEEM_STREAK) {
    wrongTotal -= 1;
    correctSinceLastWrong = 0;
    markDot(globalQuestionIndex(), "redeem");
    beep({ freq: 1320, ms: 110, type: "triangle", gain: 0.05 });
  }

  updateHeaderUI();
}

function registerWrong() {
  wrongTotal += 1;
  correctSinceLastWrong = 0;

  markDot(globalQuestionIndex(), "wrong");
  updateHeaderUI();

  if (wrongTotal >= MAX_WRONG) {
    endRun("3 mistakes — run ended.");
  }
}

function nextStepAfterAnswer() {
  if (wrongTotal >= MAX_WRONG) return;

  roundQuestionIndex += 1;
  if (roundQuestionIndex >= ROUND_SIZE) {
    endRound();
    return;
  }
  renderQuizQuestion();
}

// ---------------- Match mode (Level 2) ----------------
function buildNearMissDecoys(pool, answerNormSet, countNeeded) {
  // Pull from other questions' options (A/B/C/D), excluding correct answers,
  // then rank by similarity to any correct answer (near-miss feeling).
  const allCandidates = [];
  const correctAnswers = new Set([...answerNormSet]);

  for (const q of pool) {
    const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD]
      .map((v) => String(v || "").trim())
      .filter(Boolean);

    for (const v of opts) {
      const n = norm(v);
      if (!n) continue;
      if (correctAnswers.has(n)) continue;
      allCandidates.push(v);
    }
  }

  // unique
  const uniq = [];
  const seen = new Set();
  for (const v of allCandidates) {
    const n = norm(v);
    if (seen.has(n)) continue;
    seen.add(n);
    uniq.push(v);
  }

  const correctArr = [...answerNormSet].map((s) => String(s));
  const scored = uniq.map((txt) => {
    const tNorm = norm(txt);
    const tWords = new Set(tNorm.split(" ").filter(Boolean));
    const tLen = tNorm.length;

    let best = 0;
    for (const a of correctArr) {
      const aWords = a.split(" ").filter(Boolean);
      const aSet = new Set(aWords);
      let inter = 0;
      for (const w of tWords) if (aSet.has(w)) inter += 1;

      const lenSim =
        1 - Math.min(1, Math.abs(tLen - a.length) / Math.max(1, Math.max(tLen, a.length)));
      const wordSim = aWords.length ? (inter / aWords.length) : 0;
      const score = (wordSim * 0.75) + (lenSim * 0.25);
      if (score > best) best = score;
    }

    return { txt, score: best };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, countNeeded).map((x) => x.txt);
}

function startMatchRound() {
  stopQuestionTimer();
  resetTimerBar();

  if (questionEl) setText(questionEl, "Match the pairs");
  updateHeaderUI();

  const pool = roundQuestions.slice();
  const picked = shuffleArray(pool).slice(0, MATCH_PAIRS);

  const pairs = picked.map((q, i) => ({
    pairId: `p${i}`,
    left: String(q.Question || "").trim(),
    right: String(q.Answer || "").trim(),
  }));

  const answerNormSet = new Set(pairs.map((p) => norm(p.right)));
  const decoys = buildNearMissDecoys(pool, answerNormSet, MATCH_DECOYS);

  const leftTiles = shuffleArray(pairs.map((p) => ({ text: p.left, pairId: p.pairId, side: "L" })));
  const rightTiles = shuffleArray([
    ...pairs.map((p) => ({ text: p.right, pairId: p.pairId, side: "R", isDecoy: false })),
    ...decoys.map((d, i) => ({ text: d, pairId: `d${i}`, side: "R", isDecoy: true })),
  ]);

  matchState = {
    pairs,
    leftTiles,
    rightTiles,
    solved: new Set(),
    selectedLeft: null,
    selectedRight: null,
    locked: false,
    matchTimer: null,
    matchStart: 0,
  };

  // Render 2-column grid (only in match mode)
  choicesDiv.innerHTML = "";
  choicesDiv.style.display = "grid";
  choicesDiv.style.gridTemplateColumns = "1fr 1fr";
  choicesDiv.style.gap = "0.5rem";

  leftTiles.forEach((t) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.type = "button";
    b.textContent = t.text;
    b.dataset.side = "L";
    b.dataset.pairId = t.pairId;
    b.onclick = () => onMatchTap(b);
    choicesDiv.appendChild(b);
  });

  rightTiles.forEach((t) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.type = "button";
    b.textContent = t.text;
    b.dataset.side = "R";
    b.dataset.pairId = t.pairId;
    b.dataset.decoy = t.isDecoy ? "1" : "0";
    b.onclick = () => onMatchTap(b);
    choicesDiv.appendChild(b);
  });

  startMatchTimer();
  updateHeaderUI();
}

function clearMatchSelections() {
  matchState.selectedLeft = null;
  matchState.selectedRight = null;
  [...choicesDiv.querySelectorAll("button.choice")].forEach((b) => b.classList.remove("selected"));
}

function onMatchTap(btn) {
  if (!matchState || matchState.locked) return;
  if (btn.disabled) return;

  const side = btn.dataset.side;
  const pairId = btn.dataset.pairId;

  if (matchState.solved.has(pairId)) return;

  if (side === "L") {
    [...choicesDiv.querySelectorAll('button.choice[data-side="L"]')].forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    matchState.selectedLeft = pairId;
  } else {
    [...choicesDiv.querySelectorAll('button.choice[data-side="R"]')].forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    matchState.selectedRight = pairId;
  }

  if (!matchState.selectedLeft || !matchState.selectedRight) return;

  matchState.locked = true;

  const leftId = matchState.selectedLeft;
  const rightId = matchState.selectedRight;

  const allBtns = [...choicesDiv.querySelectorAll("button.choice")];
  const leftBtn = allBtns.find((b) => b.dataset.side === "L" && b.dataset.pairId === leftId);
  const rightBtn = allBtns.find((b) => b.dataset.side === "R" && b.dataset.pairId === rightId);

  const isCorrect = leftId === rightId;

  if (isCorrect) {
    goodSound();

    leftBtn.classList.add("correct", "glow");
    rightBtn.classList.add("correct", "glow");

    leftBtn.disabled = true;
    rightBtn.disabled = true;

    matchState.solved.add(leftId);
    score += 1;

    // mark progress dot in this round (pairs solved)
    markDot((roundIndex * ROUND_SIZE) + (matchState.solved.size - 1), "correct");

    matchState.selectedLeft = null;
    matchState.selectedRight = null;
    matchState.locked = false;

    setTimeout(() => {
      leftBtn.classList.remove("glow", "selected");
      rightBtn.classList.remove("glow", "selected");
    }, 350);

    updateHeaderUI();

    if (matchState.solved.size >= MATCH_PAIRS) {
      stopMatchTimer();
      setTimeout(endRound, 450);
    }
    return;
  }

  badSound();
  wrongTotal += 1;
  correctSinceLastWrong = 0;

  leftBtn.classList.add("wrong", "shake");
  rightBtn.classList.add("wrong", "shake");

  const wrongDotIndex = (roundIndex * ROUND_SIZE) + Math.min(ROUND_SIZE - 1, matchState.solved.size);
  markDot(wrongDotIndex, "wrong");

  updateHeaderUI();

  setTimeout(() => {
    leftBtn.classList.remove("wrong", "shake", "selected");
    rightBtn.classList.remove("wrong", "shake", "selected");
    clearMatchSelections();
    matchState.locked = false;

    if (wrongTotal >= MAX_WRONG) {
      stopMatchTimer();
      endRun("3 mistakes — run ended.");
    }
  }, 320);
}

function startMatchTimer() {
  stopMatchTimer();
  matchState.matchStart = Date.now();
  setTimerBarPct(100);

  matchState.matchTimer = setInterval(() => {
    const elapsedMs = Date.now() - matchState.matchStart;
    const pct = 100 - (elapsedMs / MATCH_TIME_MS) * 100;
    setTimerBarPct(pct);

    if (elapsedMs >= MATCH_TIME_MS) {
      stopMatchTimer();

      wrongTotal += 1;
      correctSinceLastWrong = 0;
      badSound();
      updateHeaderUI();

      if (wrongTotal >= MAX_WRONG) endRun("3 mistakes — run ended.");
      else endRound();
    }
  }, MATCH_TICK_MS);
}

function stopMatchTimer() {
  if (matchState && matchState.matchTimer) clearInterval(matchState.matchTimer);
  if (matchState) matchState.matchTimer = null;
}

// ---------------- Round flow ----------------
function setRoundQuestions() {
  const start = roundIndex * ROUND_SIZE;
  roundQuestions = questions.slice(start, start + ROUND_SIZE);
  roundQuestionIndex = 0;
  matchState = null;
}

function beginRound() {
  setRoundQuestions();
  updateHeaderUI();

  if (ROUND_MODES[roundIndex] === "match") {
    startMatchRound();
  } else {
    renderQuizQuestion();
  }
}

function endRound() {
  stopQuestionTimer();
  if (matchState) stopMatchTimer();

  roundIndex += 1;

  if (roundIndex >= TOTAL_ROUNDS) {
    endRun("Daily set complete ✅");
    return;
  }

  beginRound();
}

function endRun(message) {
  stopQuestionTimer();
  if (matchState) stopMatchTimer();
  stopElapsedClock();

  if (questionEl) setText(questionEl, message);

  if (choicesDiv) {
    choicesDiv.style.display = "";
    choicesDiv.style.gridTemplateColumns = "";
    choicesDiv.style.gap = "";
    choicesDiv.innerHTML = "";
  }

  resetTimerBar();
  updateHeaderUI();
}

// ---------------- Controls ----------------
async function startGame() {
  try { if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume(); } catch {}

  await runStartCountdown();

  score = 0;
  wrongTotal = 0;
  correctSinceLastWrong = 0;

  roundIndex = 0;
  roundQuestionIndex = 0;

  renderStreakDots();
  startElapsedClock();

  beginRound();
}

function shuffleSet() {
  // Shuffle within rounds but preserve 12/12/12 grouping
  const r1 = shuffleArray(questions.slice(0, 12));
  const r2 = shuffleArray(questions.slice(12, 24));
  const r3 = shuffleArray(questions.slice(24, 36));
  questions = [...r1, ...r2, ...r3];

  beep({ freq: 740, ms: 70, type: "triangle", gain: 0.04 });

  // If already started, re-render current round safely
  beginRound();
}

function toggleSound() {
  soundOn = !soundOn;
  if (soundBtn) soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
  if (soundBtn) soundBtn.textContent = soundOn ? "🔊" : "🔇";
  if (soundOn) tickSound();
}

// ---------------- Boot ----------------
async function boot() {
  try {
    requireEl(questionEl, "question");
    requireEl(choicesDiv, "choices");
    requireEl(startBtn, "startBtn");

    allRows = await loadQuestionsFromSheets();
    questions = allRows.slice(0, TOTAL_QUESTIONS);

    startBtn.addEventListener("click", () => startGame());
    if (shuffleBtn) shuffleBtn.addEventListener("click", () => shuffleSet());
    if (soundBtn) soundBtn.addEventListener("click", () => toggleSound());

    setText(splashStatusEl, `Ready • ${safeNowYmd()}`);
    setTimeout(killSplash, 350);

    renderStreakDots();
    updateHeaderUI();
    resetTimerBar();

  } catch (e) {
    showSplashError(String(e && e.message ? e.message : e));
  }
}

document.addEventListener("DOMContentLoaded", boot);
