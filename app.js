/* ===== Brain ⚡ Bolt — App.js v3.16.0 (Rounds + Match Near-Miss Decoys + Splash Fix) =====
   - Works with current index.html IDs:
     startSplash, splashMsg, startBtn, shuffleBtn, soundBtn,
     questionBox, choices, timerBar, qTimerBar, dots, pillScore, setLabel, qIndex,
     countdownOverlay, countNum, countRing
   - 36 questions: 3 rounds of 12
     Round 1: QUIZ (Q1–Q12)
     Round 2: MATCH (Q13–Q24) with HARD “near-miss” decoys
     Round 3: QUIZ (Q25–Q36)
*/

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const QUESTION_TIME_MS = 10000; // 10s per quiz question
const QUESTION_TICK_MS = 100;   // timer bar tick

const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = 3;

// Round modes: 1 quiz, 2 match, 3 quiz
const ROUND_MODES = ["quiz", "match", "quiz"];

// Match mode (Round 2) — HARD: near-miss decoys
const MATCH_PAIRS = 6;   // 6 left clues
const MATCH_DECOYS = 6;  // + 6 decoy answers on right
const MATCH_TOTAL_TIME_MS = 45000; // total time for match round

// Redemption rule
// - You can make up to 3 wrong total (game over on 3).
// - After a wrong, 3 consecutive correct answers “redeem” one wrong.
const MAX_WRONG = 3;
const REDEEM_STREAK = 3;

/* ---------------- DOM ---------------- */
const $ = (id) => document.getElementById(id);

const startSplash = $("startSplash");
const splashMsg = $("splashMsg");

const startBtn = $("startBtn");
const shuffleBtn = $("shuffleBtn");
const soundBtn = $("soundBtn");

const questionBox = $("questionBox");
const choices = $("choices");

const timerBar = $("timerBar");     // overall progress bar (we use as progress)
const qTimerBar = $("qTimerBar");   // per-question timer bar

const dots = $("dots");
const pillScore = $("pillScore");
const setLabel = $("setLabel");
const qIndex = $("qIndex");

const countdownOverlay = $("countdownOverlay");
const countNum = $("countNum");
const countRing = $("countRing");

/* ---------------- State ---------------- */
let questions = [];          // all 36 rows
let playing = false;

let soundOn = true;

// game progress
let score = 0;
let wrongTotal = 0;
let correctSinceLastWrong = 0;

// indices
let globalIndex = 0;         // 0..35 (across rounds)
let roundIndex = 0;          // 0..2
let roundStart = 0;          // roundIndex * 12
let roundEnd = 12;           // exclusive
let roundQ = [];             // slice of 12 for current round

// quiz timers
let qTimer = null;
let qStart = 0;

// match timers/state
let matchTimer = null;
let matchStart = 0;
let matchState = null;

/* ---------------- Audio (no mp3 dependency) ---------------- */
// tiny WebAudio beeps so missing mp3 files can’t break anything
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
}
function beep(freq = 740, durMs = 70, vol = 0.045) {
  if (!soundOn) return;
  ensureAudio();
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    setTimeout(() => { try { o.stop(); } catch {} }, durMs);
  } catch {}
}
function sTick() { beep(740, 55, 0.04); }
function sGood() { beep(880, 90, 0.05); setTimeout(()=>beep(1040, 70, 0.04), 90); }
function sBad()  { beep(220, 110, 0.05); }

/* ---------------- Helpers ---------------- */
function setText(el, t) { if (el) el.textContent = t; }

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

function tokenSet(s) {
  return new Set(norm(s).split(" ").filter(Boolean));
}

function jaccard(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function safeHideSplash() {
  if (!startSplash) return;
  startSplash.classList.add("hide");
  setTimeout(() => { startSplash.style.display = "none"; }, 260);
}

function showSplashError(msg) {
  if (!startSplash) return;
  setText(splashMsg, msg);
  // leave splash visible so user sees the error
}

function setOverallProgress() {
  // overall bar shows how far through the 36 we are (not time)
  const p = (globalIndex / TOTAL_QUESTIONS);
  if (timerBar) timerBar.style.width = `${clamp(p * 100, 0, 100)}%`;
}

function resetQTimerUI() {
  if (qTimerBar) qTimerBar.style.width = "100%";
}

function startQuizTimer(onTimeout) {
  stopQuizTimer();
  qStart = Date.now();
  resetQTimerUI();

  qTimer = setInterval(() => {
    const t = Date.now() - qStart;
    const left = clamp(1 - (t / QUESTION_TIME_MS), 0, 1);
    if (qTimerBar) qTimerBar.style.width = `${left * 100}%`;

    // last 3 seconds tick
    const secLeft = Math.ceil((QUESTION_TIME_MS - t) / 1000);
    if (secLeft <= 3 && secLeft >= 1) {
      // only tick once per second
      const boundary = QUESTION_TIME_MS - (secLeft * 1000);
      if (t >= boundary && t < boundary + QUESTION_TICK_MS + 20) sTick();
    }

    if (t >= QUESTION_TIME_MS) {
      stopQuizTimer();
      onTimeout?.();
    }
  }, QUESTION_TICK_MS);
}

function stopQuizTimer() {
  if (qTimer) clearInterval(qTimer);
  qTimer = null;
}

function startMatchTimer(totalMs, onTimeout) {
  stopMatchTimer();
  matchStart = Date.now();
  // reuse qTimerBar as “round timer” bar in match mode
  if (qTimerBar) qTimerBar.style.width = "100%";

  matchTimer = setInterval(() => {
    const t = Date.now() - matchStart;
    const left = clamp(1 - (t / totalMs), 0, 1);
    if (qTimerBar) qTimerBar.style.width = `${left * 100}%`;
    if (t >= totalMs) {
      stopMatchTimer();
      onTimeout?.();
    }
  }, 100);
}

function stopMatchTimer() {
  if (matchTimer) clearInterval(matchTimer);
  matchTimer = null;
}

/* --------- Dots / lives + redemption --------- */
function renderDots() {
  if (!dots) return;
  // 3 “lives” style dots (filled = remaining)
  const remaining = MAX_WRONG - wrongTotal;
  dots.innerHTML = "";
  for (let i = 0; i < MAX_WRONG; i++) {
    const d = document.createElement("span");
    d.className = "dot";
    if (i < remaining) d.classList.add("dot-on");
    dots.appendChild(d);
  }
}

function registerCorrect() {
  score++;
  correctSinceLastWrong++;

  // redemption
  if (wrongTotal > 0 && correctSinceLastWrong >= REDEEM_STREAK) {
    wrongTotal = Math.max(0, wrongTotal - 1);
    correctSinceLastWrong = 0;
  }

  setText(pillScore, `Score ${score}`);
  renderDots();
}

function registerWrong() {
  wrongTotal++;
  correctSinceLastWrong = 0;
  renderDots();
}

function isGameOver() {
  return wrongTotal >= MAX_WRONG;
}

/* ---------------- CSV load ---------------- */
function fetchCSVRows() {
  return new Promise((resolve, reject) => {
    if (!window.Papa) return reject(new Error("PapaParse not found"));

    // ✅ cache-buster
    const url = CSV_URL + "&_ts=" + Date.now();

    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data || []),
      error: (err) => reject(err),
    });
  });
}

function normaliseRow(r) {
  // Expect headers: Date, Question, OptionA, OptionB, Answer, OptionC, OptionD, Explanation, Category, Difficulty, ID, LastUsed, DayNumber
  return {
    Date: String(r.Date || "").trim(),
    Question: String(r.Question || "").trim(),
    OptionA: String(r.OptionA || "").trim(),
    OptionB: String(r.OptionB || "").trim(),
    OptionC: String(r.OptionC || "").trim(),
    OptionD: String(r.OptionD || "").trim(),
    Answer: String(r.Answer || "").trim(),
    Explanation: String(r.Explanation || "").trim(),
    Category: String(r.Category || "").trim(),
    Difficulty: String(r.Difficulty || "").trim(),
    ID: String(r.ID || "").trim(),
  };
}

/* ---------------- Countdown (3 seconds) ---------------- */
function showCountdown(seconds = 3) {
  return new Promise((resolve) => {
    if (!countdownOverlay || !countNum || !countRing) return resolve();

    countdownOverlay.style.display = "flex";
    countdownOverlay.classList.remove("hide");

    let s = seconds;

    const tick = () => {
      setText(countNum, String(s));
      // ring progress: 0..1
      const p = (seconds - s) / seconds;
      countRing.style.setProperty("--p", String(p));
      sTick();
      if (s <= 0) {
        countdownOverlay.classList.add("hide");
        setTimeout(() => {
          countdownOverlay.style.display = "none";
          resolve();
        }, 180);
        return;
      }
      s--;
      setTimeout(tick, 1000);
    };

    // start at 3
    tick();
  });
}

/* ---------------- Round selection ---------------- */
function computeRoundIndex(idx) {
  return Math.floor(idx / ROUND_SIZE); // 0,1,2
}

function enterRound(ri) {
  roundIndex = ri;
  roundStart = ri * ROUND_SIZE;
  roundEnd = roundStart + ROUND_SIZE;
  roundQ = questions.slice(roundStart, roundEnd);

  const mode = ROUND_MODES[roundIndex];
  setText(setLabel, `Level ${roundIndex + 1} / ${TOTAL_ROUNDS} • ${mode === "match" ? "MATCH" : "QUIZ"} ⚡`);
}

/* ---------------- QUIZ mode ---------------- */
function renderQuizQuestion() {
  // ensure we’re in a quiz round
  const row = questions[globalIndex];
  if (!row) return endSession();

  const localNumber = (globalIndex - roundStart) + 1;
  setText(qIndex, `${localNumber} / ${ROUND_SIZE}`);
  setText(questionBox, row.Question || "—");

  // answers (always 4 buttons in index)
  const opts = [row.OptionA, row.OptionB, row.OptionC, row.OptionD].map(x => String(x || "").trim());
  // If any missing, still render safely
  const btns = [
    $("optA"), $("optB"), $("optC"), $("optD")
  ].filter(Boolean);

  btns.forEach((b, i) => {
    b.disabled = false;
    b.className = "choice-btn";
    b.textContent = opts[i] || "—";
    b.onclick = () => handleQuizAnswer(opts[i], row.Answer, b);
  });

  // start timer
  startQuizTimer(() => {
    // timeout counts as wrong
    sBad();
    pulseWrong(btns);
    registerWrong();
    if (isGameOver()) return endGame("3 incorrect — game over!");
    nextStep();
  });
}

function handleQuizAnswer(chosen, correct, btnEl) {
  stopQuizTimer();

  const ok = norm(chosen) === norm(correct);
  if (ok) {
    sGood();
    flashCorrect(btnEl);
    registerCorrect();
  } else {
    sBad();
    flashWrong(btnEl);
    registerWrong();
    if (isGameOver()) return endGame("3 incorrect — game over!");
  }

  setTimeout(() => nextStep(), 520);
}

/* ---------------- MATCH mode (Round 2) ---------------- */
function shortenClue(q) {
  const s = String(q || "").trim();
  if (!s) return "—";
  const noQ = s.replace(/\?+$/g, "");
  // shorten without changing layout: keep it snappy
  if (noQ.length <= 64) return noQ;
  return noQ.slice(0, 62) + "…";
}

function buildNearMissDecoys(pairs, poolRows, decoyCount) {
  // Build a decoy candidate pool from options of the 12 rows, excluding correct answers.
  const correctSet = new Set(pairs.map(p => norm(p.right)));

  const candidates = [];
  for (const r of poolRows) {
    const opts = [r.OptionA, r.OptionB, r.OptionC, r.OptionD].map(x => String(x || "").trim()).filter(Boolean);
    for (const o of opts) {
      const n = norm(o);
      if (!n) continue;
      if (correctSet.has(n)) continue;
      candidates.push(o);
    }
  }

  // unique
  const uniq = [...new Map(candidates.map(v => [norm(v), v])).values()];

  // Score each candidate as “near miss” by max similarity to any correct answer
  const scored = uniq.map(v => {
    let best = 0;
    for (const p of pairs) best = Math.max(best, jaccard(v, p.right));
    return { v, best };
  });

  // Sort: highest similarity first (near miss)
  scored.sort((a, b) => b.best - a.best);

  // take top N, but if too few, pad with random uniques
  const picked = [];
  for (const s of scored) {
    if (picked.length >= decoyCount) break;
    picked.push(s.v);
  }

  if (picked.length < decoyCount) {
    const remain = uniq.filter(v => !picked.some(p => norm(p) === norm(v)));
    const extra = shuffleArray(remain).slice(0, decoyCount - picked.length);
    picked.push(...extra);
  }

  return picked.slice(0, decoyCount);
}

function startMatchRound() {
  stopQuizTimer();
  stopMatchTimer();
  resetQTimerUI();

  // Round 2 uses Q13–Q24 (12 rows) exactly in CSV order
  const pool = roundQ.slice();

  // pick 6 pairs from pool (stable but not “obvious”)
  // We’ll sample across the 12: take every other item then slice to 6
  const spaced = pool.filter((_, i) => i % 2 === 0);
  const basePairs = (spaced.length >= MATCH_PAIRS ? spaced : pool).slice(0, MATCH_PAIRS);

  const pairs = basePairs.map((q, i) => ({
    pairId: `p${i}`,
    left: shortenClue(q.Question),
    right: String(q.Answer || "").trim(),
  }));

  // HARD near-miss decoys
  const decoys = buildNearMissDecoys(pairs, pool, MATCH_DECOYS);

  const leftTiles = shuffleArray(pairs.map(p => ({
    side: "L",
    pairId: p.pairId,
    text: p.left,
  })));

  const rightTiles = shuffleArray([
    ...pairs.map(p => ({
      side: "R",
      pairId: p.pairId,
      text: p.right,
      isDecoy: false,
    })),
    ...decoys.map((d, i) => ({
      side: "R",
      pairId: `decoy_${i}`,
      text: d,
      isDecoy: true,
    })),
  ]);

  matchState = {
    pairs,
    leftTiles,
    rightTiles,
    solved: new Set(),
    selL: null,
    selR: null,
    locked: false,
  };

  // UI labels
  setText(qIndex, `— / ${ROUND_SIZE}`);
  setText(questionBox, "Match the pairs");
  // Use choices grid for match
  renderMatchGrid();

  // Match timer
  startMatchTimer(MATCH_TOTAL_TIME_MS, () => {
    // Timeout ends round (counts as wrong)
    sBad();
    registerWrong();
    if (isGameOver()) return endGame("3 incorrect — game over!");
    // move to next round
    globalIndex = roundEnd; // jump to next round start
    nextStep(true);
  });
}

function renderMatchGrid() {
  if (!choices || !matchState) return;

  // Clear and switch to match grid styling (CSS already supports "match-grid" in your build)
  choices.innerHTML = "";
  choices.classList.add("match-grid");

  const makeBtn = (tile) => {
    const b = document.createElement("button");
    b.className = "choice-btn match-btn";
    b.textContent = tile.text;
    b.dataset.side = tile.side;
    b.dataset.pairId = tile.pairId;
    b.onclick = () => onMatchTap(b);
    return b;
  };

  // Left column first
  matchState.leftTiles.forEach(t => choices.appendChild(makeBtn(t)));

  // Right tiles (correct + decoys)
  matchState.rightTiles.forEach(t => choices.appendChild(makeBtn(t)));
}

function clearMatchSelections() {
  if (!choices) return;
  const btns = [...choices.querySelectorAll("button")];
  btns.forEach(b => b.classList.remove("selected"));
}

function syncMatchSelectionStyles() {
  if (!choices || !matchState) return;
  const btns = [...choices.querySelectorAll("button")];
  btns.forEach(b => {
    const pid = b.dataset.pairId;
    const side = b.dataset.side;
    const selected = (side === "L" && matchState.selL === pid) || (side === "R" && matchState.selR === pid);
    b.classList.toggle("selected", !!selected);
  });
}

function onMatchTap(btn) {
  if (!matchState || matchState.locked || btn.disabled) return;

  const side = btn.dataset.side;
  const pairId = btn.dataset.pairId;

  if (side === "L") matchState.selL = pairId;
  else matchState.selR = pairId;

  syncMatchSelectionStyles();

  if (!matchState.selL || !matchState.selR) return;

  matchState.locked = true;

  const correct = matchState.selL === matchState.selR;
  const btns = [...choices.querySelectorAll("button")];

  const leftBtn = btns.find(b => b.dataset.side === "L" && b.dataset.pairId === matchState.selL);
  const rightBtn = btns.find(b => b.dataset.side === "R" && b.dataset.pairId === matchState.selR);

  if (!leftBtn || !rightBtn) {
    matchState.selL = null; matchState.selR = null; matchState.locked = false;
    clearMatchSelections();
    return;
  }

  if (correct) {
    sGood();
    // premium connection glow (CSS class hooks)
    leftBtn.classList.add("correct", "lock");
    rightBtn.classList.add("correct", "lock");

    // lock them
    leftBtn.disabled = true;
    rightBtn.disabled = true;

    matchState.solved.add(matchState.selL);

    // count as “correct”
    registerCorrect();

    matchState.selL = null;
    matchState.selR = null;
    matchState.locked = false;
    clearMatchSelections();

    // finish match round once all solved
    if (matchState.solved.size >= MATCH_PAIRS) {
      stopMatchTimer();
      // jump to next round start
      globalIndex = roundEnd;
      return nextStep(true);
    }

    return;
  }

  // wrong (near-miss decoy OR wrong pair)
  sBad();
  registerWrong();

  // micro shake
  leftBtn.classList.add("shake");
  rightBtn.classList.add("shake");
  setTimeout(() => {
    leftBtn.classList.remove("shake");
    rightBtn.classList.remove("shake");
  }, 260);

  // clear selection
  matchState.selL = null;
  matchState.selR = null;
  matchState.locked = false;

  setTimeout(() => {
    clearMatchSelections();
    syncMatchSelectionStyles();
  }, 140);

  if (isGameOver()) return endGame("3 incorrect — game over!");
}

/* ---------------- Visual feedback helpers ---------------- */
function flashCorrect(btn) {
  if (!btn) return;
  btn.classList.add("correct");
  setTimeout(() => btn.classList.remove("correct"), 260);
}
function flashWrong(btn) {
  if (!btn) return;
  btn.classList.add("wrong", "shake");
  setTimeout(() => btn.classList.remove("wrong", "shake"), 340);
}
function pulseWrong(btns) {
  (btns || []).forEach(b => b && b.classList.add("wrong"));
  setTimeout(() => (btns || []).forEach(b => b && b.classList.remove("wrong")), 240);
}

/* ---------------- Flow control ---------------- */
function resetGame() {
  playing = false;
  score = 0;
  wrongTotal = 0;
  correctSinceLastWrong = 0;

  globalIndex = 0;
  enterRound(0);

  setText(pillScore, `Score ${score}`);
  renderDots();
  setOverallProgress();
  resetQTimerUI();

  // Ensure choices is quiz-mode default (index has 4 option buttons, but we render via those buttons)
  if (choices) choices.classList.remove("match-grid");

  // Render first question text
  setText(setLabel, `Level 1 / ${TOTAL_ROUNDS} • QUIZ ⚡`);
  setText(qIndex, `1 / ${ROUND_SIZE}`);

  // Buttons for quiz are in DOM already; showQuestion will wire them.
  // Don’t start timer until user presses Start.
}

function wireQuizButtonsIfNeeded() {
  // Ensure the option buttons exist
  const ids = ["optA", "optB", "optC", "optD"];
  const missing = ids.some(id => !$(id));
  if (missing) {
    // fallback: if index uses different structure, fail loudly on splash msg
    throw new Error("Missing option buttons (optA/optB/optC/optD) in index.html");
  }
}

function stepIntoCurrentMode() {
  // Determine round based on globalIndex
  const ri = computeRoundIndex(globalIndex);

  // If we just entered a new round, update slices/labels
  if (ri !== roundIndex) enterRound(ri);

  const mode = ROUND_MODES[roundIndex];

  // update labels
  setText(setLabel, `Level ${roundIndex + 1} / ${TOTAL_ROUNDS} • ${mode === "match" ? "MATCH" : "QUIZ"} ⚡`);

  // Overall progress
  setOverallProgress();

  if (mode === "match") {
    // start match only once at round start
    if (globalIndex !== roundStart) {
      // if something bumped us mid-round, normalise to round start
      globalIndex = roundStart;
    }
    return startMatchRound();
  }

  // QUIZ
  if (choices) choices.classList.remove("match-grid");
  return renderQuizQuestion();
}

function nextStep(fromRoundJump = false) {
  // In quiz mode, advance by 1 question; in match mode we jump by setting globalIndex = roundEnd.
  if (!fromRoundJump) globalIndex++;

  if (globalIndex >= TOTAL_QUESTIONS) return endSession();

  // If we crossed into next round, enter it
  const ri = computeRoundIndex(globalIndex);
  if (ri !== roundIndex) enterRound(ri);

  // If we’re in quiz mode, local counter changes
  const localNumber = (globalIndex - roundStart) + 1;
  if (ROUND_MODES[roundIndex] === "quiz") setText(qIndex, `${localNumber} / ${ROUND_SIZE}`);

  stepIntoCurrentMode();
}

function endSession() {
  stopQuizTimer();
  stopMatchTimer();
  setOverallProgress();
  if (qTimerBar) qTimerBar.style.width = "0%";
  setText(questionBox, "Daily set complete ✅");
  setText(setLabel, `Done • Score ${score}`);
  setText(qIndex, `— / ${ROUND_SIZE}`);
  if (choices) choices.classList.remove("match-grid");

  // disable buttons
  ["optA","optB","optC","optD"].forEach(id => {
    const b = $(id);
    if (b) { b.disabled = true; b.onclick = null; }
  });

  playing = false;
}

function endGame(msg) {
  stopQuizTimer();
  stopMatchTimer();
  setText(questionBox, msg || "Game over");
  setText(setLabel, `Final • Score ${score}`);
  if (qTimerBar) qTimerBar.style.width = "0%";
  playing = false;

  // disable buttons
  ["optA","optB","optC","optD"].forEach(id => {
    const b = $(id);
    if (b) { b.disabled = true; b.onclick = null; }
  });
}

/* ---------------- Shuffle (optional) ----------------
   IMPORTANT: You suspected row order might be changing.
   This build keeps CSV order by default.
   Shuffle button will shuffle WITHIN EACH ROUND only.
*/
function shuffleWithinRounds() {
  if (!questions.length) return;
  const r1 = questions.slice(0, 12);
  const r2 = questions.slice(12, 24);
  const r3 = questions.slice(24, 36);
  questions = [...shuffleArray(r1), ...shuffleArray(r2), ...shuffleArray(r3)];
}

/* ---------------- Boot ---------------- */
async function boot() {
  try {
    // validate DOM early (prevents silent splash hang)
    if (!startSplash) throw new Error("Missing startSplash in index.html");
    if (!questionBox || !choices) throw new Error("Missing questionBox/choices in index.html");
    if (!startBtn) throw new Error("Missing startBtn in index.html");

    wireQuizButtonsIfNeeded();

    setText(splashMsg, "Loading today’s set…");

    const rows = await fetchCSVRows();
    const cleaned = rows.map(normaliseRow).filter(r => r.Question && r.Answer);

    if (cleaned.length < TOTAL_QUESTIONS) {
      throw new Error(`Only found ${cleaned.length} questions. Need at least ${TOTAL_QUESTIONS}.`);
    }

    // Keep CSV order exactly
    questions = cleaned.slice(0, TOTAL_QUESTIONS);

    resetGame();

    // auto dismiss splash (no tap)
    setTimeout(() => safeHideSplash(), 380);

  } catch (e) {
    console.error(e);
    showSplashError("Could not load today’s set. Check the published CSV URL + network.");
  }
}

/* ---------------- Events ---------------- */
if (soundBtn) {
  soundBtn.addEventListener("click", async () => {
    soundOn = !soundOn;
    soundBtn.classList.toggle("is-off", !soundOn);
    // resume audio context if user interacts
    try { ensureAudio(); if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume(); } catch {}
  });
}

if (shuffleBtn) {
  shuffleBtn.addEventListener("click", () => {
    // shuffle within rounds only, then restart session state but keep score reset
    shuffleWithinRounds();
    resetGame();
  });
}

if (startBtn) {
  startBtn.addEventListener("click", async () => {
    if (playing) return;

    playing = true;

    // unlock audio on user gesture
    try { ensureAudio(); if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume(); } catch {}

    await showCountdown(3);

    // enter the correct mode at question 1
    enterRound(0);
    stepIntoCurrentMode();
  });
}

// Kick off
document.addEventListener("DOMContentLoaded", boot);
