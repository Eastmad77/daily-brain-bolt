// ===== Brain ⚡ Bolt — App.js v3.15.0 (MATCH decoy upgrade) =====
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";
const QUESTION_TIME_MS = 10000, QUESTION_TICK_MS = 100;

// ✅ 36-per-day support
const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = Math.ceil(TOTAL_QUESTIONS / ROUND_SIZE);

// ✅ Modes (Round 1: Quiz, Round 2: Match, Round 3: Quiz)
const ROUND_MODES = ["quiz", "match", "quiz"];

// ✅ Match mode settings
const MATCH_PAIRS_PER_ROUND = 6;    // 6 pairs to solve
const MATCH_DECOYS_MAX = 6;         // add up to 6 decoy answers (right column)

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

let roundIndex = 0; // 0..2
let roundStartIndex = 0; // index into questions for current round
let roundQuestionIndex = 0; // 0..11 within round

// Match state
let matchState = null;

// ---------------- DOM ----------------
const $ = (id) => document.getElementById(id);

const splashEl = $("splash");
const splashStatusEl = $("splashStatus");

const statusEl = $("status");
const scoreEl = $("score");
const qIndexEl = $("qIndex");

const questionEl = $("question");
const optionEls = [
  $("option1"),
  $("option2"),
  $("option3"),
  $("option4")
];

const startBtn = $("startBtn");
const shuffleBtn = $("shuffleBtn");
const shareBtn = $("shareBtn");

const dotsEl = $("dots");
const timerBarEl = $("timerBar");
const timerBarFillEl = $("timerFill");

// Countdown UI
const countdownEl = $("countdown");
const countdownRingEl = $("countdownRing"); // if exists
const countdownNumEl = $("countdownNum");   // if exists

// Panels
const quizPanelEl = $("quizPanel");
const matchPanelEl = $("matchPanel");
const matchLeftEl = $("matchLeft");
const matchRightEl = $("matchRight");
const matchHintEl = $("matchHint");

// Sound toggle (if exists)
const soundBtn = $("soundBtn");

// ---------------- Helpers ----------------
function clampText(s, max = 120) {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function shuffle(arr) {
  const a = (arr || []).slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueId() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
}

function normStr(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqByNorm(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach(v => {
    const k = normStr(v);
    if (!k) return;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(String(v).trim());
  });
  return out;
}

function show(el) { if (el) el.style.display = ""; }
function hide(el) { if (el) el.style.display = "none"; }

function setText(el, txt) { if (el) el.textContent = txt; }

function setStatusReady() { setText(statusEl, "Ready"); }
function setStatusPlaying() { setText(statusEl, "Playing"); }
function setStatusDone() { setText(statusEl, "Done"); }

function setScore(n) {
  score = n;
  setText(scoreEl, String(score));
}

function updateHeaderProgress() {
  const roundNum = roundIndex + 1;
  const withinRound = roundQuestionIndex + 1;
  setText(qIndexEl, `Round ${roundNum}/${TOTAL_ROUNDS} • Q ${withinRound}/${ROUND_SIZE}`);
}

function killStartSplash() {
  if (!splashEl) return;
  splashEl.classList.add("hide");
  setTimeout(() => { splashEl.style.display = "none"; }, 300);
}

// ---------------- Audio ----------------
let tickAudio = null;
let goodAudio = null;
let badAudio = null;

function initAudio() {
  // Keep it resilient: if files don't exist, no crash.
  try { tickAudio = new Audio("tick.mp3"); } catch (e) { }
  try { goodAudio = new Audio("good.mp3"); } catch (e) { }
  try { badAudio = new Audio("bad.mp3"); } catch (e) { }
}

function playTick() {
  if (!soundOn || !tickAudio) return;
  try { tickAudio.currentTime = 0; tickAudio.play(); } catch (e) { }
}
function playGood() {
  if (!soundOn || !goodAudio) return;
  try { goodAudio.currentTime = 0; goodAudio.play(); } catch (e) { }
}
function playBad() {
  if (!soundOn || !badAudio) return;
  try { badAudio.currentTime = 0; badAudio.play(); } catch (e) { }
}

// ---------------- CSV Load ----------------
async function loadQuestions() {
  setText(splashStatusEl, "Loading today’s set…");

  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);

  const csvText = await res.text();

  // Simple CSV parse: use Papa if present, else fallback
  let rows = [];
  if (window.Papa && Papa.parse) {
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    rows = parsed.data || [];
  } else {
    rows = simpleCsvParse(csvText);
  }

  // Map row -> question model
  const mapped = rows.map(r => ({
    id: r.ID || r.Id || r.id || uniqueId(),
    date: r.Date || r.date || "",
    question: r.Question || r.question || "",
    optionA: r.OptionA || r.optionA || "",
    optionB: r.OptionB || r.optionB || "",
    optionC: r.OptionC || r.optionC || "",
    optionD: r.OptionD || r.optionD || "",
    answer: r.Answer || r.answer || "",
    explanation: r.Explanation || r.explanation || "",
    category: r.Category || r.category || "",
    difficulty: r.Difficulty || r.difficulty || ""
  }));

  // Ensure we have at least 36 — otherwise just use what exists
  questions = mapped.filter(q => q.question && q.answer);
  if (!questions.length) throw new Error("No questions found in CSV.");

  // If more than 36, just take first 36 (sheet should already be 36/day)
  questions = questions.slice(0, TOTAL_QUESTIONS);

  setText(splashStatusEl, `Loaded ${questions.length} questions`);
}

function simpleCsvParse(csvText) {
  // Minimal CSV parser (handles quoted commas fairly well)
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const header = parseCsvLine(lines[0]);
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => row[h] = cols[idx] ?? "");
    out.push(row);
  }
  return out;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && next === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => String(s).trim());
}

// ---------------- Game Logic ----------------
function resetGame() {
  currentIndex = 0;
  roundIndex = 0;
  roundStartIndex = 0;
  roundQuestionIndex = 0;

  setScore(0);
  wrongTotal = 0;
  correctSinceLastWrong = 0;

  elapsed = 0;
  clearInterval(elapsedInterval);
  elapsedInterval = null;

  stopQuestionTimer();
  matchState = null;

  setStatusReady();
  updateHeaderProgress();
  renderDots();
  renderRound();
}

function getRoundQuestions() {
  const start = roundStartIndex;
  const end = Math.min(start + ROUND_SIZE, questions.length);
  return questions.slice(start, end);
}

function renderRound() {
  const mode = ROUND_MODES[roundIndex] || "quiz";

  // switch panels (layout unchanged; only toggling visibility)
  if (mode === "match") {
    hide(quizPanelEl);
    show(matchPanelEl);
    startMatchRound();
  } else {
    hide(matchPanelEl);
    show(quizPanelEl);
    renderQuizQuestion();
  }

  updateHeaderProgress();
}

function nextRoundOrEnd() {
  roundIndex += 1;
  if (roundIndex >= TOTAL_ROUNDS) {
    endGame();
    return;
  }
  roundStartIndex = roundIndex * ROUND_SIZE;
  roundQuestionIndex = 0;
  matchState = null;
  renderDots();
  renderRound();
}

function endGame() {
  setStatusDone();
  stopQuestionTimer();
  clearInterval(elapsedInterval);
  elapsedInterval = null;
}

// ---------------- Quiz Mode ----------------
function resolveCorrectText(q) {
  // Some sheets store Answer as literal option text, others as A/B/C/D
  const raw = String(q.answer || q.Answer || "").trim();
  const key = raw.toUpperCase();
  const map = {
    "A": q.optionA,
    "B": q.optionB,
    "C": q.optionC,
    "D": q.optionD
  };
  const mapped = map[key];
  const out = mapped ? String(mapped).trim() : raw;
  return out;
}

function renderQuizQuestion() {
  const roundQs = getRoundQuestions();
  const q = roundQs[roundQuestionIndex];

  if (!q) {
    nextRoundOrEnd();
    return;
  }

  setText(questionEl, clampText(q.question, 240));

  const opts = [
    q.optionA, q.optionB, q.optionC, q.optionD
  ].map(s => String(s || "").trim());

  optionEls.forEach((el, idx) => {
    if (!el) return;
    el.classList.remove("correct", "wrong", "disabled");
    el.disabled = false;
    setText(el, opts[idx] || "");
    el.onclick = () => onPickOption(idx, q);
  });

  // Reset timer bar
  if (timerBarFillEl) timerBarFillEl.style.width = "100%";

  // Start question timer
  startQuestionTimer(() => {
    // timeout = wrong (no selection)
    registerWrong();
    flashCorrectAnswer(q);
    setTimeout(() => {
      roundQuestionIndex++;
      renderDots();
      renderRound();
    }, 600);
  });
}

function onPickOption(idx, q) {
  stopQuestionTimer();

  const chosen = String(optionEls[idx]?.textContent || "").trim();
  const correct = resolveCorrectText(q);

  const isCorrect = normStr(chosen) === normStr(correct);

  if (isCorrect) {
    registerCorrect();
    playGood();
  } else {
    registerWrong();
    playBad();
  }

  optionEls.forEach(el => {
    if (!el) return;
    el.disabled = true;
    el.classList.add("disabled");
  });

  // highlight correct + chosen
  optionEls.forEach(el => {
    if (!el) return;
    const t = String(el.textContent || "").trim();
    if (normStr(t) === normStr(correct)) el.classList.add("correct");
    if (!isCorrect && normStr(t) === normStr(chosen)) el.classList.add("wrong");
  });

  setTimeout(() => {
    roundQuestionIndex++;
    renderDots();
    renderRound();
  }, 600);
}

function flashCorrectAnswer(q) {
  const correct = resolveCorrectText(q);
  optionEls.forEach(el => {
    if (!el) return;
    const t = String(el.textContent || "").trim();
    if (normStr(t) === normStr(correct)) el.classList.add("correct");
    el.disabled = true;
    el.classList.add("disabled");
  });
}

// Redemption rule + streak indicators
function registerCorrect() {
  correctSinceLastWrong++;
  // Example scoring: +1 each correct
  setScore(score + 1);
  renderDots();
}

function registerWrong() {
  wrongTotal++;
  correctSinceLastWrong = 0;
  renderDots();
}

function renderDots() {
  if (!dotsEl) return;

  // 12 dots per round only (keeps layout)
  const dots = [];
  for (let i = 0; i < ROUND_SIZE; i++) {
    const state = getDotState(i);
    dots.push(`<span class="dot ${state}"></span>`);
  }
  dotsEl.innerHTML = dots.join("");
}

function getDotState(i) {
  // This keeps the previous feel without changing layout:
  // - completed correct => "ok"
  // - completed wrong/timeout => "bad"
  // - current => "now"
  // - future => ""
  if (i < roundQuestionIndex) {
    // We don’t store per-question correctness; approximate using last wrong reset.
    // If you have per-question history, wire it here.
    return "done";
  }
  if (i === roundQuestionIndex) return "now";
  return "";
}

// ---------------- Timer (10s bar) ----------------
function startQuestionTimer(onTimeout) {
  stopQuestionTimer();

  qStart = performance.now();
  qLastTickSec = 3;

  qTimer = setInterval(() => {
    const now = performance.now();
    const elapsedMs = now - qStart;
    const remaining = Math.max(0, QUESTION_TIME_MS - elapsedMs);

    // Timer fill
    const pct = (remaining / QUESTION_TIME_MS) * 100;
    if (timerBarFillEl) timerBarFillEl.style.width = `${pct}%`;

    // Optional audible countdown ticks on last 3 seconds
    const remSec = Math.ceil(remaining / 1000);
    if (remSec <= 3 && remSec > 0 && remSec !== qLastTickSec) {
      qLastTickSec = remSec;
      playTick();
    }

    if (remaining <= 0) {
      stopQuestionTimer();
      onTimeout && onTimeout();
    }
  }, QUESTION_TICK_MS);
}

function stopQuestionTimer() {
  if (qTimer) clearInterval(qTimer);
  qTimer = null;
}

// ---------------- Match Mode ----------------
function startMatchRound() {
  const roundQs = getRoundQuestions();

  // Build match set (pairs + right-side decoys)
  const built = buildMatchSetFromRoundQuestions(roundQs);

  matchState = {
    pairs: built.pairs,
    leftTiles: built.leftTiles,
    rightTiles: built.rightTiles,
    decoys: built.decoys,
    selectedLeft: null,
    selectedRight: null,
    locked: new Set(), // pair ids solved
    shake: { left: null, right: null }, // micro shake flags
  };

  setText(matchHintEl, "Match the pairs");
  renderMatchGrid();
  stopQuestionTimer(); // no 10s per tile here (keeps layout)
}

function collectOptionPool(qs) {
  // Builds a unique pool of plausible answer-strings from all options in a round.
  const pool = [];
  (qs || []).forEach(q => {
    const opts = [
      q.optionA, q.optionB, q.optionC, q.optionD,
      q.OptionA, q.OptionB, q.OptionC, q.OptionD,
      q.answer, q.Answer
    ].filter(Boolean).map(String);
    pool.push(...opts);
  });
  return uniqByNorm(pool);
}

function buildMatchSetFromRoundQuestions(roundQuestions) {
  // Build 6 pairs from the round's questions.
  const qs = (roundQuestions || []).slice(0, ROUND_SIZE);
  const pairCount = Math.min(MATCH_PAIRS_PER_ROUND, qs.length);
  const picks = qs.slice(0, pairCount).map(q => ({
    id: String(q.id || q.ID || uniqueId()),
    prompt: String(q.question || q.Question || '').trim(),
    answer: resolveCorrectText(q)
  }));

  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const correctSet = new Set(picks.map(p => norm(p.answer)).filter(Boolean));

  // Build decoy candidates:
  // 1) All options across ALL 12 round questions (best mix)
  // 2) Correct answers from the *unused* questions (guaranteed plausible)
  const optionPool = [];
  qs.forEach(q => {
    [q.optionA, q.optionB, q.optionC, q.optionD, q.OptionA, q.OptionB, q.OptionC, q.OptionD]
      .filter(Boolean).forEach(v => optionPool.push(String(v)));
  });

  const unusedQs = qs.slice(pairCount);
  unusedQs.forEach(q => {
    const a = resolveCorrectText(q);
    if (a) optionPool.push(String(a));
  });

  // De-dupe and exclude any real correct answers for this match set
  const uniqPool = uniqByNorm(optionPool);
  const decoyCandidates = uniqPool.filter(v => v && !correctSet.has(norm(v)));

  // Pick up to 6 decoys (or fewer if we truly can't)
  const want = Math.min(MATCH_DECOYS_MAX, decoyCandidates.length);
  const decoys = shuffle(decoyCandidates).slice(0, want);

  const leftTiles = shuffle(picks.map(p => ({ type: 'q', id: p.id, text: p.prompt })));
  const rightAnswers = picks.map(p => ({ type: 'a', id: p.id, text: p.answer }));
  const rightDecoys = decoys.map((d, i) => ({ type: 'd', id: 'd' + i, text: String(d) }));
  const rightTiles = shuffle([...rightAnswers, ...rightDecoys]);

  return { pairs: picks, leftTiles, rightTiles, decoys };
}

function renderMatchGrid() {
  if (!matchState) return;
  if (!matchLeftEl || !matchRightEl) return;

  const locked = matchState.locked;

  const leftHtml = matchState.leftTiles.map(t => {
    const isLocked = locked.has(t.id);
    const isSelected = matchState.selectedLeft && matchState.selectedLeft.id === t.id;
    const shake = matchState.shake.left === t.id ? " shake" : "";
    return `
      <button class="match-tile left ${isLocked ? "locked" : ""} ${isSelected ? "selected" : ""}${shake}"
        data-side="left" data-id="${t.id}" ${isLocked ? "disabled" : ""}>
        ${clampText(t.text, 140)}
      </button>
    `;
  }).join("");

  const rightHtml = matchState.rightTiles.map(t => {
    const isLocked = (t.type === "a") && locked.has(t.id);
    const isSelected = matchState.selectedRight && matchState.selectedRight.uid === (t.uid || t.id + "::" + t.text);
    const shake = matchState.shake.right === (t.uid || t.id + "::" + t.text) ? " shake" : "";
    // Give every right tile a stable unique id so duplicates don’t collide
    const uid = t.uid || (t.id + "::" + t.text);
    return `
      <button class="match-tile right ${isLocked ? "locked" : ""} ${isSelected ? "selected" : ""} ${t.type === "d" ? "decoy" : ""}${shake}"
        data-side="right" data-uid="${encodeURIComponent(uid)}" data-id="${t.id}" data-type="${t.type}" ${isLocked ? "disabled" : ""}>
        ${clampText(t.text, 140)}
      </button>
    `;
  }).join("");

  matchLeftEl.innerHTML = leftHtml;
  matchRightEl.innerHTML = rightHtml;

  // Wire events
  matchLeftEl.querySelectorAll("button.match-tile").forEach(btn => {
    btn.onclick = () => onPickMatch("left", btn.getAttribute("data-id"));
  });
  matchRightEl.querySelectorAll("button.match-tile").forEach(btn => {
    btn.onclick = () => onPickMatch("right", decodeURIComponent(btn.getAttribute("data-uid")));
  });

  // Clear shake flags after animation tick
  setTimeout(() => {
    if (!matchState) return;
    matchState.shake.left = null;
    matchState.shake.right = null;
    // don't re-render; CSS animation will finish on its own
  }, 220);
}

function onPickMatch(side, idOrUid) {
  if (!matchState) return;

  if (side === "left") {
    const tile = matchState.leftTiles.find(t => t.id === idOrUid);
    if (!tile) return;
    if (matchState.locked.has(tile.id)) return;

    matchState.selectedLeft = tile;
  } else {
    const tile = matchState.rightTiles.find(t => (t.uid || (t.id + "::" + t.text)) === idOrUid);
    if (!tile) return;
    // If it's a correct-answer tile that is already locked, ignore
    if (tile.type === "a" && matchState.locked.has(tile.id)) return;

    matchState.selectedRight = { ...tile, uid: (tile.uid || (tile.id + "::" + tile.text)) };
  }

  // If both selected, evaluate
  if (matchState.selectedLeft && matchState.selectedRight) {
    const leftId = matchState.selectedLeft.id;
    const right = matchState.selectedRight;

    const isCorrect = (right.type === "a") && (right.id === leftId);

    if (isCorrect) {
      matchState.locked.add(leftId);
      playGood();

      // tiny premium "connection glow" animation hook
      tryAddConnectionGlow(leftId, right.uid);

      // scoring: +1 per correct pair
      setScore(score + 1);
    } else {
      playBad();
      // micro shake on wrong match
      matchState.shake.left = leftId;
      matchState.shake.right = right.uid;

      // redemption rule effect: reset streak counter
      correctSinceLastWrong = 0;
    }

    // clear selection
    matchState.selectedLeft = null;
    matchState.selectedRight = null;

    renderMatchGrid();

    // finished?
    if (matchState.locked.size >= MATCH_PAIRS_PER_ROUND) {
      setTimeout(() => {
        roundQuestionIndex = ROUND_SIZE; // mark round complete for header/dots
        nextRoundOrEnd();
      }, 450);
    }
  } else {
    renderMatchGrid();
  }
}

function tryAddConnectionGlow(leftId, rightUid) {
  // purely additive — relies on existing CSS classes; if you have a glow class it will show
  const leftBtn = matchLeftEl?.querySelector(`button[data-id="${leftId}"]`);
  const rightBtn = matchRightEl?.querySelector(`button[data-uid="${encodeURIComponent(rightUid)}"]`);
  if (!leftBtn || !rightBtn) return;

  leftBtn.classList.add("connect-glow");
  rightBtn.classList.add("connect-glow");
  setTimeout(() => {
    leftBtn.classList.remove("connect-glow");
    rightBtn.classList.remove("connect-glow");
  }, 260);
}

// ---------------- Countdown (Start) ----------------
function startCountdownThenPlay() {
  // Circular 3-2-1 with ticks (layout unchanged; uses existing nodes if present)
  let n = 3;
  show(countdownEl);

  const tick = () => {
    if (countdownNumEl) setText(countdownNumEl, String(n));
    playTick();

    // Ring animation if exists
    if (countdownRingEl) {
      countdownRingEl.classList.remove("pulse");
      void countdownRingEl.offsetWidth;
      countdownRingEl.classList.add("pulse");
    }

    n--;
    if (n === 0) {
      setTimeout(() => {
        hide(countdownEl);
        beginPlay();
      }, 300);
      return;
    }
    setTimeout(tick, 1000);
  };

  tick();
}

function beginPlay() {
  setStatusPlaying();

  // Start elapsed timer (overall)
  if (!elapsedInterval) {
    const t0 = performance.now();
    elapsedInterval = setInterval(() => {
      const now = performance.now();
      elapsed = Math.floor((now - t0) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(1, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      const timeEl = $("time");
      if (timeEl) setText(timeEl, `Time: ${mm}:${ss}`);
    }, 250);
  }

  // render current round (quiz starts timer per question)
  renderRound();
}

// ---------------- Buttons ----------------
if (startBtn) {
  startBtn.addEventListener("click", () => {
    // If on splash, ensure it’s gone; then start countdown
    killStartSplash();
    startCountdownThenPlay();
  });
}

if (shuffleBtn) {
  shuffleBtn.addEventListener("click", () => {
    // shuffle within current round only
    const start = roundStartIndex;
    const end = Math.min(start + ROUND_SIZE, questions.length);
    const slice = questions.slice(start, end);
    const shuffled = shuffle(slice);
    questions.splice(start, shuffled.length, ...shuffled);

    // reset within-round progress
    roundQuestionIndex = 0;
    renderDots();
    renderRound();
  });
}

if (shareBtn) {
  shareBtn.addEventListener("click", async () => {
    const text = `Brain ⚡ Bolt — I scored ${score} today.`;
    try {
      if (navigator.share) {
        await navigator.share({ text, url: location.href });
      } else {
        await navigator.clipboard.writeText(text + " " + location.href);
        alert("Copied to clipboard!");
      }
    } catch (e) { }
  });
}

if (soundBtn) {
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.classList.toggle("on", soundOn);
  });
}

// ---------------- Boot ----------------
(async function boot() {
  initAudio();

  try {
    await loadQuestions();
    resetGame();

    // ✅ auto-dismiss splash after load (no tap required)
    setTimeout(killStartSplash, 350);

  } catch (err) {
    console.error(err);
    setText(splashStatusEl, "Could not load today’s set.");
    // Still allow start; but without questions it won’t progress
  }
})();
