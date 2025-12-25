// ===== Brain ⚡ Bolt — App.js v3.20.0 (Index.html ID-aligned + 36Q + Match Near-miss Decoys) =====

// Published sheet (LIVE tab)
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

// Quiz timing
const QUESTION_TIME_MS = 10000;
const QUESTION_TICK_MS = 100;

// Daily set structure
const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = 3;

// Round modes
const ROUND_MODES = ["quiz", "match", "quiz"];

// Match mode (Round 2)
const MATCH_PAIRS = 6;   // left clues
const MATCH_DECOYS = 6;  // near-miss decoys on right side (hard mode)

// Rules
const MAX_WRONG = 3;

// Redemption rule: earn back 1 mistake after N correct since last wrong
const REDEEM_AFTER = 5;

// ---------------- DOM ----------------
const $ = (id) => document.getElementById(id);

// Splash
const startSplash = $("startSplash");
const splashMsgEl = startSplash ? startSplash.querySelector(".splash-msg") : null;

// Top UI
const setLabel = $("setLabel");
const pillScore = $("pillScore");
const progressLabel = $("progressLabel");
const soundBtn = $("soundBtn");
const mmMenuBtn = $("mmMenuBtn");
const mmSideMenu = $("mmSideMenu");
const notifyItem = $("notifyItem");

// Main UI
const timerBar = $("timerBar");
const elapsedTimeEl = $("elapsedTime");
const countdownOverlay = $("countdownOverlay");
const countNum = $("countNum");

const questionBox = $("questionBox");
const choices = $("choices");
const streakBar = $("streakBar");

const gameOverBox = $("gameOverBox");
const gameOverText = $("gameOverText");
const successSplash = $("successSplash");

// Buttons
const startBtn = $("startBtn");
const shuffleBtn = $("shuffleBtn");
const shareBtn = $("shareBtn");
const playAgainBtn = $("playAgainBtn");

// Defensive: if the page is missing required elements, fail gracefully
function assertEl(el, name) {
  if (!el) throw new Error(`Missing element #${name} in index.html`);
}

// Ensure required elements exist (these are in your current index.html)
function assertRequired() {
  assertEl(questionBox, "questionBox");
  assertEl(choices, "choices");
  assertEl(startBtn, "startBtn");
  assertEl(timerBar, "timerBar");
  assertEl(countdownOverlay, "countdownOverlay");
  assertEl(countNum, "countNum");
  assertEl(streakBar, "streakBar");
  assertEl(progressLabel, "progressLabel");
  assertEl(setLabel, "setLabel");
  assertEl(pillScore, "pillScore");
}

// ---------------- Styles injected (no layout changes) ----------------
(function injectFXStyles() {
  const css = `
  .bb-hidden{display:none!important;}
  .bb-choice{user-select:none; -webkit-tap-highlight-color: transparent;}
  .bb-choice.selected{outline:2px solid rgba(255,255,255,.75); outline-offset:2px;}
  .bb-choice.correct{outline:2px solid rgba(0,255,170,.9); box-shadow:0 0 0 3px rgba(0,255,170,.15), 0 0 22px rgba(0,255,170,.35);}
  .bb-choice.wrong{outline:2px solid rgba(255,80,110,.95); box-shadow:0 0 0 3px rgba(255,80,110,.12), 0 0 22px rgba(255,80,110,.25);}
  .bb-shake{animation:bbShake .18s linear 0s 2;}
  @keyframes bbShake{0%{transform:translateX(0)}25%{transform:translateX(-3px)}50%{transform:translateX(3px)}75%{transform:translateX(-2px)}100%{transform:translateX(0)}}

  .bb-lockglow{animation:bbLockGlow .45s ease-out 0s 1;}
  @keyframes bbLockGlow{
    0%{box-shadow:0 0 0 0 rgba(0,255,170,.0), 0 0 0 rgba(0,255,170,.0);}
    30%{box-shadow:0 0 0 3px rgba(0,255,170,.18), 0 0 26px rgba(0,255,170,.45);}
    100%{box-shadow:0 0 0 0 rgba(0,255,170,.0), 0 0 0 rgba(0,255,170,.0);}
  }

  .bb-dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin:0 4px;
    background:rgba(255,255,255,.20); box-shadow:0 0 0 1px rgba(255,255,255,.10) inset;}
  .bb-dot.on{background:rgba(255,255,255,.35);}
  .bb-dot.good{background:rgba(0,255,170,.85); box-shadow:0 0 14px rgba(0,255,170,.35);}
  .bb-dot.bad{background:rgba(255,80,110,.9); box-shadow:0 0 14px rgba(255,80,110,.25);}

  .bb-timerfill{
    height:100%;
    width:0%;
    border-radius:999px;
    background:rgba(255,255,255,.85);
  }

  .bb-countdown-pop{animation:bbPop .26s ease-out 0s 1;}
  @keyframes bbPop{0%{transform:scale(.92); opacity:.8}100%{transform:scale(1); opacity:1}}
  `;
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
})();

// ---------------- State ----------------
let questions = [];            // 36 questions (in CSV order, unless shuffled)
let roundIndex = 0;            // 0..2
let roundQuestions = [];       // 12 for current round (slice of questions)
let qInRound = 0;              // 0..11 (quiz rounds)
let score = 0;

let wrongTotal = 0;
let correctSinceLastWrong = 0;

let playing = false;
let soundOn = true;

// elapsed timer
let elapsedSec = 0;
let elapsedInterval = null;

// per-question timer
let qTimer = null;
let qStart = 0;

// match mode state
let match = null;

// ---------------- Audio (never blocks app) ----------------
let tickAudio = null;
let goodAudio = null;
let badAudio = null;

function initAudio() {
  try { tickAudio = new Audio("/tick.mp3"); } catch {}
  try { goodAudio = new Audio("/good.mp3"); } catch {}
  try { badAudio = new Audio("/bad.mp3"); } catch {}
}

function playAudio(a) {
  if (!soundOn || !a) return;
  try {
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch {}
}

// ---------------- Helpers ----------------
function setText(el, t) { if (el) el.textContent = t; }

function ymdNowNZ() {
  try {
    // NZ format not required for logic; keep for display if needed later
    return new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return "";
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function safeHide(el) { if (el) el.style.display = "none"; }
function safeShow(el, display = "") { if (el) el.style.display = display; }

// ---------------- Splash ----------------
function updateSplash(msg) {
  if (splashMsgEl) splashMsgEl.textContent = msg;
}
function dismissSplash() {
  if (!startSplash) return;
  startSplash.classList.add("bb-hidden");
  startSplash.setAttribute("aria-hidden", "true");
}

// ---------------- Menu ----------------
function toggleMenu(open) {
  if (!mmSideMenu) return;
  const isOpen = mmSideMenu.getAttribute("aria-hidden") === "false";
  const next = typeof open === "boolean" ? open : !isOpen;
  mmSideMenu.setAttribute("aria-hidden", next ? "false" : "true");
  mmSideMenu.classList.toggle("open", next);
}

if (mmMenuBtn) {
  mmMenuBtn.addEventListener("click", () => toggleMenu());
}
document.addEventListener("click", (e) => {
  if (!mmSideMenu || !mmMenuBtn) return;
  const isOpen = mmSideMenu.getAttribute("aria-hidden") === "false";
  if (!isOpen) return;
  const t = e.target;
  if (mmSideMenu.contains(t) || mmMenuBtn.contains(t)) return;
  toggleMenu(false);
});

if (notifyItem) {
  notifyItem.addEventListener("click", () => {
    // Placeholder toggle - keep UI premium but avoid breaking
    const txt = notifyItem.textContent || "";
    const on = txt.includes("ON");
    notifyItem.textContent = on ? "🔔 Notifications: OFF" : "🔔 Notifications: ON";
  });
}

// ---------------- Timer UI ----------------
function resetTimerBar() {
  if (!timerBar) return;
  timerBar.innerHTML = "";
  const fill = document.createElement("div");
  fill.className = "bb-timerfill";
  timerBar.appendChild(fill);
}

function setTimerFill(pct) {
  if (!timerBar) return;
  const fill = timerBar.querySelector(".bb-timerfill");
  if (!fill) return;
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function stopQuestionTimer() {
  if (qTimer) clearInterval(qTimer);
  qTimer = null;
}

function startQuestionTimer(onTimeout) {
  stopQuestionTimer();
  qStart = Date.now();
  setTimerFill(0);

  qTimer = setInterval(() => {
    const elapsed = Date.now() - qStart;
    const pct = (elapsed / QUESTION_TIME_MS) * 100;
    setTimerFill(pct);

    if (elapsed >= QUESTION_TIME_MS) {
      stopQuestionTimer();
      onTimeout && onTimeout();
    }
  }, QUESTION_TICK_MS);
}

// elapsed time
function startElapsed() {
  stopElapsed();
  elapsedSec = 0;
  if (elapsedTimeEl) elapsedTimeEl.textContent = "0:00";
  elapsedInterval = setInterval(() => {
    elapsedSec++;
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    if (elapsedTimeEl) elapsedTimeEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
  }, 1000);
}
function stopElapsed() {
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = null;
}

// ---------------- Indicators (streak dots + redemption) ----------------
function renderDots(total, done, states /* optional array: 'good'|'bad'|'' */) {
  if (!streakBar) return;
  streakBar.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const d = document.createElement("span");
    d.className = "bb-dot";
    if (i < done) d.classList.add("on");
    if (states && states[i] === "good") d.classList.add("good");
    if (states && states[i] === "bad") d.classList.add("bad");
    streakBar.appendChild(d);
  }
}

function updateTopPills() {
  setText(pillScore, `Score ${score}`);

  const mode = ROUND_MODES[roundIndex] === "match" ? "MATCH ⚡" : "QUIZ ⚡";
  const qLabel =
    ROUND_MODES[roundIndex] === "match"
      ? `Pairs ${match ? match.solvedCount : 0}/${MATCH_PAIRS}`
      : `Q ${qInRound + (playing ? 1 : 0)}/${ROUND_SIZE}`;

  setText(setLabel, `Round ${roundIndex + 1}/${TOTAL_ROUNDS} • ${mode}`);
  setText(
    progressLabel,
    `${qLabel} • Wrong ${wrongTotal}/${MAX_WRONG}${correctSinceLastWrong ? ` • Streak ${correctSinceLastWrong}/${REDEEM_AFTER}` : ""}`
  );
}

function registerCorrect() {
  score++;
  correctSinceLastWrong++;
  // Redemption
  if (wrongTotal > 0 && correctSinceLastWrong >= REDEEM_AFTER) {
    wrongTotal = Math.max(0, wrongTotal - 1);
    correctSinceLastWrong = 0;
  }
  updateTopPills();
}

function registerWrong() {
  wrongTotal++;
  correctSinceLastWrong = 0;
  updateTopPills();
}

function isGameOver() {
  return wrongTotal >= MAX_WRONG;
}

// ---------------- CSV Load (cache-buster + tolerant parser) ----------------
function loadCSV() {
  return new Promise((resolve, reject) => {
    if (!window.Papa) return reject(new Error("PapaParse missing"));

    Papa.parse(CSV_URL + "&_ts=" + Date.now(), {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data || []),
      error: (err) => reject(err),
    });
  });
}

function normaliseRow(r) {
  // Support both header-case styles just in case
  const get = (k) => r[k] ?? r[String(k).toLowerCase()] ?? r[String(k).toUpperCase()] ?? "";
  return {
    id: String(get("ID") || "").trim(),
    date: String(get("Date") || "").trim(),
    question: String(get("Question") || "").trim(),
    optionA: String(get("OptionA") || "").trim(),
    optionB: String(get("OptionB") || "").trim(),
    optionC: String(get("OptionC") || "").trim(),
    optionD: String(get("OptionD") || "").trim(),
    answer: String(get("Answer") || "").trim(),
    category: String(get("Category") || "").trim(),
    difficulty: String(get("Difficulty") || "").trim(),
    explanation: String(get("Explanation") || "").trim(),
  };
}

function extractDailyQuestions(rows) {
  const qs = rows
    .map(normaliseRow)
    .filter((q) => q.question && q.answer)
    .slice(0, TOTAL_QUESTIONS);

  // IMPORTANT: preserve CSV order (do not shuffle here)
  return qs;
}

// ---------------- Countdown ----------------
function showCountdownOverlay(show) {
  if (!countdownOverlay) return;
  countdownOverlay.setAttribute("aria-hidden", show ? "false" : "true");
  countdownOverlay.style.display = show ? "flex" : "none";
}

async function runCountdown3() {
  showCountdownOverlay(true);

  for (let n = 3; n >= 1; n--) {
    if (countNum) {
      countNum.textContent = String(n);
      countNum.classList.remove("bb-countdown-pop");
      // force reflow
      void countNum.offsetWidth;
      countNum.classList.add("bb-countdown-pop");
    }
    playAudio(tickAudio);
    // wait ~1s
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 900));
  }

  showCountdownOverlay(false);
}

// ---------------- Quiz Round ----------------
let quizDotStates = new Array(ROUND_SIZE).fill("");

function renderQuizQuestion() {
  // guard
  if (!roundQuestions.length) return;

  // End round if finished
  if (qInRound >= ROUND_SIZE) {
    endRound();
    return;
  }

  const q = roundQuestions[qInRound];

  // Render question
  setText(questionBox, q.question);

  // Build choice buttons
  choices.innerHTML = "";
  choices.className = "choices";

  const opts = [
    { key: "A", text: q.optionA },
    { key: "B", text: q.optionB },
    { key: "C", text: q.optionC },
    { key: "D", text: q.optionD },
  ].filter((o) => o.text);

  // Keep a stable-but-not-obvious order: shuffle options per question
  const shuffled = shuffle(opts);

  shuffled.forEach((o) => {
    const b = document.createElement("button");
    b.className = "btn bb-choice";
    b.type = "button";
    b.textContent = o.text;
    b.addEventListener("click", () => handleQuizAnswer(b, o.text, q.answer));
    choices.appendChild(b);
  });

  // Dots
  renderDots(ROUND_SIZE, qInRound, quizDotStates);

  // Start timer
  startQuestionTimer(() => {
    // Timeout counts as wrong
    quizDotStates[qInRound] = "bad";
    registerWrong();
    flashWrongOnChoices();
    if (isGameOver()) return endGame("3 incorrect — game over!");
    qInRound++;
    setTimeout(renderQuizQuestion, 260);
  });

  updateTopPills();
}

function flashWrongOnChoices() {
  const buttons = Array.from(choices.querySelectorAll("button"));
  buttons.forEach((b) => b.classList.add("wrong"));
  playAudio(badAudio);
  setTimeout(() => buttons.forEach((b) => b.classList.remove("wrong")), 220);
}

function handleQuizAnswer(btn, chosenText, correctText) {
  stopQuestionTimer();

  const buttons = Array.from(choices.querySelectorAll("button"));
  buttons.forEach((b) => (b.disabled = true));

  const isCorrect = norm(chosenText) === norm(correctText);

  if (isCorrect) {
    btn.classList.add("correct");
    quizDotStates[qInRound] = "good";
    playAudio(goodAudio);
    registerCorrect();
  } else {
    btn.classList.add("wrong");
    quizDotStates[qInRound] = "bad";
    playAudio(badAudio);
    registerWrong();
    // also highlight the correct one
    const correctBtn = buttons.find((b) => norm(b.textContent) === norm(correctText));
    if (correctBtn) correctBtn.classList.add("correct");
  }

  renderDots(ROUND_SIZE, qInRound + 1, quizDotStates);

  if (isGameOver()) {
    return setTimeout(() => endGame("3 incorrect — game over!"), 450);
  }

  qInRound++;
  setTimeout(renderQuizQuestion, 520);
}

// ---------------- Match Round (Near-miss Decoys) ----------------
let matchDotStates = new Array(MATCH_PAIRS).fill("");

function buildDecoyPoolFromRound(pool, correctAnswersNormSet) {
  // Hard mode near-miss decoys:
  // - pull from other questions' wrong options (OptionA-D) excluding the correct tiles
  // - de-duplicate
  const out = [];

  pool.forEach((q) => {
    [q.optionA, q.optionB, q.optionC, q.optionD].forEach((v) => {
      const s = String(v || "").trim();
      if (!s) return;
      if (correctAnswersNormSet.has(norm(s))) return;
      out.push(s);
    });
  });

  // Also allow other correct answers (from round) as decoys (but not the chosen correct set)
  pool.forEach((q) => {
    const s = String(q.answer || "").trim();
    if (!s) return;
    if (correctAnswersNormSet.has(norm(s))) return;
    out.push(s);
  });

  return Array.from(new Set(out.map((x) => x.trim()))).filter(Boolean);
}

function startMatchRound() {
  stopQuestionTimer();
  setTimerFill(0);

  // Match uses full 12 question pool for that round
  const pool = roundQuestions.slice();

  // Choose 6 pairs
  const chosen = shuffle(pool).slice(0, MATCH_PAIRS);

  const pairs = chosen.map((q, idx) => ({
    id: `p${idx}`,
    left: makeLeftClue(q.question),
    right: String(q.answer || "").trim(),
  }));

  const correctSet = new Set(pairs.map((p) => norm(p.right)));

  const decoyPool = buildDecoyPoolFromRound(pool, correctSet);
  const decoys = shuffle(decoyPool).slice(0, MATCH_DECOYS);

  const leftTiles = shuffle(
    pairs.map((p) => ({
      side: "L",
      id: p.id,
      text: p.left,
    }))
  );

  const rightTiles = shuffle([
    ...pairs.map((p) => ({
      side: "R",
      id: p.id,
      text: p.right,
      decoy: false,
    })),
    ...decoys.map((d, i) => ({
      side: "R",
      id: `d${i}`,
      text: d,
      decoy: true,
    })),
  ]);

  match = {
    pairs,
    leftTiles,
    rightTiles,
    selectedL: null,
    selectedR: null,
    locked: false,
    solved: new Set(), // pair ids only
    solvedCount: 0,
  };

  matchDotStates = new Array(MATCH_PAIRS).fill("");

  setText(questionBox, "Match the pairs");
  choices.innerHTML = "";
  choices.className = "choices"; // keep existing layout class

  renderMatchGrid();
  renderDots(MATCH_PAIRS, 0, matchDotStates);

  updateTopPills();
}

function makeLeftClue(question) {
  // Make it less “obvious” without changing layout:
  // - trim
  // - remove trailing punctuation
  // - shorten long questions
  const q = String(question || "").trim().replace(/[?!.]+$/, "");
  if (q.length <= 44) return q;
  return q.slice(0, 44).trim() + "…";
}

function renderMatchGrid() {
  if (!match) return;

  choices.innerHTML = "";

  // Two-column feel using existing container; we simply render L then R (CSS already lays out)
  // If your CSS uses grid/flow, this stays compatible.
  const frag = document.createDocumentFragment();

  match.leftTiles.forEach((t) => {
    frag.appendChild(makeMatchBtn(t));
  });

  match.rightTiles.forEach((t) => {
    frag.appendChild(makeMatchBtn(t));
  });

  choices.appendChild(frag);
}

function makeMatchBtn(tile) {
  const b = document.createElement("button");
  b.className = "btn bb-choice";
  b.type = "button";
  b.textContent = tile.text;
  b.dataset.side = tile.side;
  b.dataset.id = tile.id;
  b.addEventListener("click", () => onMatchTap(b));
  return b;
}

function clearMatchSelections() {
  const buttons = Array.from(choices.querySelectorAll("button"));
  buttons.forEach((b) => b.classList.remove("selected"));
}

function setSelected(btn) {
  clearMatchSelections();

  if (match.selectedL) {
    const lb = choices.querySelector(`button[data-side="L"][data-id="${match.selectedL}"]`);
    if (lb) lb.classList.add("selected");
  }
  if (match.selectedR) {
    const rb = choices.querySelector(`button[data-side="R"][data-id="${match.selectedR}"]`);
    if (rb) rb.classList.add("selected");
  }

  if (btn) btn.classList.add("selected");
}

function onMatchTap(btn) {
  if (!match || match.locked) return;
  if (btn.disabled) return;

  const side = btn.dataset.side;
  const id = btn.dataset.id;

  if (side === "L") match.selectedL = id;
  if (side === "R") match.selectedR = id;

  setSelected(btn);

  if (!match.selectedL || !match.selectedR) return;

  match.locked = true;

  const leftBtn = choices.querySelector(`button[data-side="L"][data-id="${match.selectedL}"]`);
  const rightBtn = choices.querySelector(`button[data-side="R"][data-id="${match.selectedR}"]`);

  const correct = match.selectedL === match.selectedR;

  if (correct) {
    // lock both
    if (leftBtn) {
      leftBtn.classList.add("correct", "bb-lockglow");
      leftBtn.disabled = true;
    }
    if (rightBtn) {
      rightBtn.classList.add("correct", "bb-lockglow");
      rightBtn.disabled = true;
    }
    playAudio(goodAudio);

    if (!match.solved.has(match.selectedL)) {
      match.solved.add(match.selectedL);
      match.solvedCount = match.solved.size;
      matchDotStates[match.solvedCount - 1] = "good";
      renderDots(MATCH_PAIRS, match.solvedCount, matchDotStates);
    }

    registerCorrect();

    match.selectedL = null;
    match.selectedR = null;
    match.locked = false;

    updateTopPills();

    if (match.solved.size >= MATCH_PAIRS) {
      // Finished round
      setTimeout(endRound, 420);
    }
    return;
  }

  // Wrong match (near-miss decoy OR wrong pair)
  if (leftBtn) leftBtn.classList.add("wrong", "bb-shake");
  if (rightBtn) rightBtn.classList.add("wrong", "bb-shake");
  playAudio(badAudio);

  // Count as a wrong attempt
  registerWrong();
  matchDotStates[Math.min(match.solvedCount, MATCH_PAIRS - 1)] = "bad";
  renderDots(MATCH_PAIRS, match.solvedCount + 1, matchDotStates);

  if (isGameOver()) {
    return setTimeout(() => endGame("3 incorrect — game over!"), 450);
  }

  setTimeout(() => {
    if (leftBtn) leftBtn.classList.remove("wrong", "bb-shake");
    if (rightBtn) rightBtn.classList.remove("wrong", "bb-shake");
    match.selectedL = null;
    match.selectedR = null;
    match.locked = false;
    clearMatchSelections();
    updateTopPills();
  }, 320);
}

// ---------------- Round Flow ----------------
function sliceRoundQuestions() {
  const start = roundIndex * ROUND_SIZE;
  return questions.slice(start, start + ROUND_SIZE);
}

function beginRound() {
  safeHide(gameOverBox);
  safeHide(successSplash);
  safeShow(choices);
  resetTimerBar();

  roundQuestions = sliceRoundQuestions();
  if (roundQuestions.length < ROUND_SIZE) {
    endGame("Not enough questions loaded for today.");
    return;
  }

  if (ROUND_MODES[roundIndex] === "match") {
    // Level 2 match (Q13–Q24)
    qInRound = 0;
    startMatchRound();
  } else {
    // Quiz rounds
    qInRound = 0;
    quizDotStates = new Array(ROUND_SIZE).fill("");
    renderQuizQuestion();
  }

  updateTopPills();
}

function endRound() {
  stopQuestionTimer();

  roundIndex++;
  match = null;

  if (roundIndex >= TOTAL_ROUNDS) {
    // Done for the day
    safeShow(successSplash, "block");
    if (successSplash) successSplash.setAttribute("aria-hidden", "false");
    stopElapsed();

    setText(questionBox, "Daily set complete ✅");
    choices.innerHTML = "";
    renderDots(ROUND_SIZE, ROUND_SIZE, new Array(ROUND_SIZE).fill("good"));

    startBtn.style.display = "none";
    shuffleBtn.style.display = "";
    shareBtn.style.display = "";
    playAgainBtn.style.display = "";

    updateTopPills();
    return;
  }

  beginRound();
}

function endGame(msg) {
  stopQuestionTimer();
  stopElapsed();

  safeShow(gameOverBox, "block");
  setText(gameOverText, msg);
  choices.innerHTML = "";

  startBtn.style.display = "none";
  shuffleBtn.style.display = "";
  shareBtn.style.display = "";
  playAgainBtn.style.display = "";

  updateTopPills();
}

// ---------------- Controls ----------------
function resetGameState() {
  roundIndex = 0;
  qInRound = 0;
  score = 0;
  wrongTotal = 0;
  correctSinceLastWrong = 0;
  playing = false;
  match = null;

  updateTopPills();
  resetTimerBar();
  setTimerFill(0);

  setText(questionBox, "Press Start to Play");
  choices.innerHTML = "";
  renderDots(ROUND_SIZE, 0, new Array(ROUND_SIZE).fill(""));

  startBtn.style.display = "";
  playAgainBtn.style.display = "none";
  safeHide(gameOverBox);
  safeHide(successSplash);
}

async function startGame() {
  if (playing) return;
  playing = true;

  safeHide(gameOverBox);
  safeHide(successSplash);

  // Countdown
  await runCountdown3();

  // Start
  startElapsed();
  beginRound();
}

function shuffleSet() {
  // Shuffle the full 36-question set while preserving 12/12/12 grouping
  questions = shuffle(questions);
  resetGameState();
  updateTopPills();
  setText(questionBox, "Shuffled ✅ Press Start");
}

function shareScore() {
  const text = `Brain ⚡ Bolt — Score ${score} (Wrong ${wrongTotal}/${MAX_WRONG})`;
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).catch(() => {});
    alert("Copied to clipboard:\n" + text);
  }
}

// Sound toggle
function setSoundIcon() {
  if (!soundBtn) return;
  soundBtn.textContent = soundOn ? "🔊" : "🔇";
}
if (soundBtn) {
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    setSoundIcon();
    if (soundOn) playAudio(tickAudio);
  });
}
setSoundIcon();

// Buttons
if (startBtn) startBtn.addEventListener("click", () => startGame());
if (shuffleBtn) shuffleBtn.addEventListener("click", () => shuffleSet());
if (shareBtn) shareBtn.addEventListener("click", () => shareScore());
if (playAgainBtn) playAgainBtn.addEventListener("click", () => {
  resetGameState();
  startBtn.style.display = "";
});

// ---------------- Boot ----------------
async function boot() {
  assertRequired();
  initAudio();
  resetTimerBar();
  resetGameState();

  updateSplash("Loading today’s set…");

  try {
    const rows = await loadCSV();
    const daily = extractDailyQuestions(rows);

    if (daily.length < TOTAL_QUESTIONS) {
      updateSplash(`Only loaded ${daily.length}/${TOTAL_QUESTIONS}. Check LIVE sheet has 36 rows.`);
      // Still allow play if >= 12, but prefer a hard fail for consistency
      if (daily.length < 12) throw new Error("Not enough rows in LIVE sheet.");
    }

    questions = daily.slice(0, TOTAL_QUESTIONS);

    // Auto-dismiss splash (no tap)
    dismissSplash();

    // Ready state
    setText(setLabel, "Ready");
    setText(progressLabel, `Round 1/3 • Q 0/12`);
    setText(pillScore, "Score 0");
    setText(questionBox, "Press Start to Play");
    renderDots(ROUND_SIZE, 0, new Array(ROUND_SIZE).fill(""));

  } catch (e) {
    console.error(e);
    updateSplash("Could not load today’s set. Check LIVE publish + CSV URL.");
    // Keep splash visible so user sees the error
  }
}

document.addEventListener("DOMContentLoaded", boot);
