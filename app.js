// ===== Brain ⚡ Bolt — App.js v3.15.x (MATCH near-miss decoy schema – FULL FILE) =====
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const QUESTION_TIME_MS = 10000;
const QUESTION_TICK_MS = 100;

// 36 questions: 3 rounds of 12
const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = 3;

// Round modes (Round 2 = match)
const ROUND_MODES = ["quiz", "match", "quiz"];

// Match mode tuning
const MATCH_PAIRS = 6;   // how many pairs to solve
const MATCH_DECOYS = 6;  // near-miss decoys on right side (hard mode)

// ---------------- DOM helpers ----------------
const $ = (id) => document.getElementById(id);

const splashEl = $("splash");
const splashStatusEl = $("splashStatus");

const statusEl = $("status");
const scoreEl = $("score");
const qIndexEl = $("qIndex");
const questionEl = $("question");
const optionEls = [$("option1"), $("option2"), $("option3"), $("option4")];

const startBtn = $("startBtn");
const shuffleBtn = $("shuffleBtn");
const shareBtn = $("shareBtn");

const dotsEl = $("dots");
const timerBarFillEl = $("timerFill");

const quizPanelEl = $("quizPanel");
const matchPanelEl = $("matchPanel");
const matchLeftEl = $("matchLeft");
const matchRightEl = $("matchRight");
const matchHintEl = $("matchHint");

const countdownEl = $("countdown");
const countdownRingEl = $("countdownRing");
const countdownNumEl = $("countdownNum");

const soundBtn = $("soundBtn");

// ---------------- State ----------------
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

let roundIndex = 0;
let roundStartIndex = 0;
let roundQuestionIndex = 0;

let matchState = null;

// ---------------- Utilities ----------------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normStr(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function setText(el, txt) {
  if (el) el.textContent = txt;
}

function show(el) {
  if (el) el.style.display = "";
}

function hide(el) {
  if (el) el.style.display = "none";
}

function killStartSplash() {
  if (!splashEl) return;
  splashEl.classList.add("hide");
  setTimeout(() => (splashEl.style.display = "none"), 300);
}

// ---------------- Audio (resilient) ----------------
let tickAudio, goodAudio, badAudio;

function initAudio() {
  try {
    tickAudio = new Audio("tick.mp3");
    goodAudio = new Audio("good.mp3");
    badAudio = new Audio("bad.mp3");
  } catch {}
}

function play(a) {
  if (!soundOn || !a) return;
  try {
    a.currentTime = 0;
    a.play();
  } catch {}
}

// ---------------- CSV load ----------------
async function loadQuestions() {
  setText(splashStatusEl, "Loading today’s set…");

  // cache-buster
  const res = await fetch(CSV_URL + "&_ts=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("CSV fetch failed");

  const csvText = await res.text();

  let rows = [];
  if (window.Papa) {
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    rows = parsed.data || [];
  } else {
    throw new Error("PapaParse missing");
  }

  // IMPORTANT: keep CSV order (no shuffle)
  questions = rows
    .map((r) => ({
      ID: r.ID,
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
    }))
    .filter((q) => q.Question && q.Answer)
    .slice(0, TOTAL_QUESTIONS);

  if (questions.length < TOTAL_QUESTIONS) {
    throw new Error(`Only loaded ${questions.length}/${TOTAL_QUESTIONS}`);
  }
}

// ---------------- UI / Indicators ----------------
function updateHUD() {
  if (scoreEl) scoreEl.textContent = String(score);
  if (qIndexEl) qIndexEl.textContent = String(currentIndex + 1);
}

function resetDots() {
  if (!dotsEl) return;
  dotsEl.innerHTML = "";
  const total = TOTAL_QUESTIONS;
  for (let i = 0; i < total; i++) {
    const d = document.createElement("span");
    d.className = "dot";
    dotsEl.appendChild(d);
  }
}

function markDot(i, state) {
  if (!dotsEl) return;
  const d = dotsEl.children[i];
  if (!d) return;
  d.classList.remove("good", "bad");
  if (state === "good") d.classList.add("good");
  if (state === "bad") d.classList.add("bad");
}

function resetTimerUI() {
  if (!timerBarFillEl) return;
  timerBarFillEl.style.width = "100%";
}

function tickTimerUI() {
  if (!timerBarFillEl) return;
  const t = Date.now() - qStart;
  const p = Math.max(0, 1 - t / QUESTION_TIME_MS);
  timerBarFillEl.style.width = Math.round(p * 100) + "%";
}

function stopTimers() {
  if (qTimer) clearInterval(qTimer);
  qTimer = null;
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = null;
}

function startElapsed() {
  elapsed = 0;
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = setInterval(() => {
    elapsed += 1;
  }, 1000);
}

// ---------------- Game rules ----------------
function registerCorrect() {
  correctSinceLastWrong += 1;
  // redemption rule: after 3 correct since last wrong, reduce one wrong (if any)
  if (correctSinceLastWrong >= 3 && wrongTotal > 0) {
    wrongTotal -= 1;
    correctSinceLastWrong = 0;
  }
}

function registerWrong() {
  wrongTotal += 1;
  correctSinceLastWrong = 0;
}

// ---------------- Round logic ----------------
function roundSlice(rIdx) {
  const start = rIdx * ROUND_SIZE;
  return questions.slice(start, start + ROUND_SIZE);
}

function enterRound(rIdx) {
  roundIndex = rIdx;
  roundStartIndex = rIdx * ROUND_SIZE;
  roundQuestionIndex = 0;

  if (ROUND_MODES[rIdx] === "match") {
    show(matchPanelEl);
    hide(quizPanelEl);
    startMatchRound(); // Level 2
  } else {
    hide(matchPanelEl);
    show(quizPanelEl);
    showQuestion();
  }
}

// ---------------- Quiz mode ----------------
function showQuestion() {
  const q = questions[currentIndex];
  if (!q) return endGame();

  updateHUD();

  setText(questionEl, q.Question);

  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].map((x) =>
    String(x || "").trim()
  );

  optionEls.forEach((el, i) => {
    if (!el) return;
    el.disabled = false;
    el.classList.remove("good", "bad", "selected");
    el.textContent = opts[i] || "";
    el.onclick = () => chooseAnswer(opts[i], q.Answer);
  });

  startQuestionTimer();
}

function chooseAnswer(choice, answer) {
  stopQuestionTimer();
  const isGood = normStr(choice) === normStr(answer);

  // lock UI
  optionEls.forEach((el) => {
    if (!el) return;
    el.disabled = true;
  });

  if (isGood) {
    score += 1;
    registerCorrect();
    markDot(currentIndex, "good");
    play(goodAudio);
  } else {
    registerWrong();
    markDot(currentIndex, "bad");
    play(badAudio);
  }

  currentIndex += 1;

  // fail condition example (keep your existing logic; this is conservative)
  if (wrongTotal >= 3) return endGame("3 incorrect — game over!");

  // move rounds
  const nextRound = Math.floor(currentIndex / ROUND_SIZE);
  if (nextRound !== roundIndex && nextRound < TOTAL_ROUNDS) {
    return setTimeout(() => enterRound(nextRound), 350);
  }

  if (currentIndex >= TOTAL_QUESTIONS) return endGame("Daily set complete ✅");

  setTimeout(() => showQuestion(), 350);
}

function startQuestionTimer() {
  resetTimerUI();
  qStart = Date.now();
  qLastTickSec = 3;

  if (qTimer) clearInterval(qTimer);
  qTimer = setInterval(() => {
    tickTimerUI();

    const leftMs = QUESTION_TIME_MS - (Date.now() - qStart);
    const leftSec = Math.ceil(leftMs / 1000);

    // last 3 seconds tick
    if (leftSec <= 3 && leftSec > 0 && leftSec !== qLastTickSec) {
      qLastTickSec = leftSec;
      play(tickAudio);
    }

    if (leftMs <= 0) {
      clearInterval(qTimer);
      qTimer = null;

      // timeout counts as wrong
      registerWrong();
      markDot(currentIndex, "bad");
      currentIndex += 1;

      if (wrongTotal >= 3) return endGame("3 incorrect — game over!");

      const nextRound = Math.floor(currentIndex / ROUND_SIZE);
      if (nextRound !== roundIndex && nextRound < TOTAL_ROUNDS) {
        return enterRound(nextRound);
      }

      if (currentIndex >= TOTAL_QUESTIONS) return endGame("Daily set complete ✅");
      showQuestion();
    }
  }, QUESTION_TICK_MS);
}

function stopQuestionTimer() {
  if (qTimer) clearInterval(qTimer);
  qTimer = null;
}

// ---------------- Countdown ring ----------------
function showCountdown(cb) {
  if (!countdownEl) return cb && cb();
  show(countdownEl);

  let n = 3;
  setText(countdownNumEl, String(n));
  countdownRingEl && countdownRingEl.classList.remove("go");

  const step = () => {
    play(tickAudio);
    if (countdownRingEl) {
      countdownRingEl.classList.remove("pulse");
      // force reflow
      void countdownRingEl.offsetWidth;
      countdownRingEl.classList.add("pulse");
    }
    setText(countdownNumEl, String(n));
    n -= 1;
    if (n <= 0) {
      if (countdownRingEl) countdownRingEl.classList.add("go");
      setTimeout(() => {
        hide(countdownEl);
        cb && cb();
      }, 250);
      return;
    }
    setTimeout(step, 900);
  };

  step();
}

// ---------------- MATCH helpers ----------------
function shortenClue(s) {
  const t = String(s || "").trim();
  if (t.length <= 70) return t;
  return t.slice(0, 67) + "…";
}

function buildDecoyPoolFromRound(roundQs, correctAnswers) {
  const correctSet = new Set(correctAnswers.map((x) => normStr(x)));
  const pool = [];

  roundQs.forEach((q) => {
    ["OptionA", "OptionB", "OptionC", "OptionD", "Answer"].forEach((k) => {
      const v = String(q[k] || "").trim();
      if (!v) return;
      const nk = normStr(v);
      if (!nk) return;
      if (correctSet.has(nk)) return;
      pool.push(v);
    });
  });

  // de-dupe
  const out = [];
  const seen = new Set();
  for (const v of pool) {
    const k = normStr(v);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

// ---------------- MATCH: Near-miss decoy scoring ----------------
function bigramDice(a, b) {
  a = normStr(a);
  b = normStr(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (s) => {
    const out = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map();
  for (const bg of A) counts.set(bg, (counts.get(bg) || 0) + 1);
  let inter = 0;
  for (const bg of B) {
    const c = counts.get(bg) || 0;
    if (c > 0) {
      inter++;
      counts.set(bg, c - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

function pickNearMissDecoys(correctAnswers, decoyPool, countNeeded) {
  const answers = correctAnswers
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  const uniq = [];
  const seen = new Set();

  for (const d of decoyPool || []) {
    const t = String(d || "").trim();
    const k = normStr(t);
    if (!k || seen.has(k)) continue;
    if (answers.some((a) => normStr(a) === k)) continue; // exclude identical
    seen.add(k);
    uniq.push(t);
  }

  const scored = uniq.map((t) => {
    let best = 0;
    for (const a of answers) {
      const s = bigramDice(a, t);
      if (s > best) best = s;
    }
    return { t, score: best };
  });

  scored.sort((x, y) => y.score - x.score);

  // Prefer near-miss first; fill remainder if needed.
  const out = [];
  for (const x of scored) {
    if (x.score >= 0.28) {
      out.push(x.t);
      if (out.length >= countNeeded) return out;
    }
  }
  for (const x of scored) {
    if (out.includes(x.t)) continue;
    out.push(x.t);
    if (out.length >= countNeeded) break;
  }
  return out.slice(0, countNeeded);
}

function choosePairsForNearMiss(pool12, countNeeded) {
  const qs = pool12
    .map((q) => ({ q, ans: String(q.Answer || "").trim() }))
    .filter((x) => x.ans);

  if (qs.length <= countNeeded) return qs.map((x) => x.q).slice(0, countNeeded);

  // gather all texts in the round so we can score "confusability"
  const allTexts = [];
  pool12.forEach((q) => {
    ["Answer", "OptionA", "OptionB", "OptionC", "OptionD"].forEach((k) => {
      const v = String(q[k] || "").trim();
      if (v) allTexts.push(v);
    });
  });

  const scored = qs.map(({ q, ans }) => {
    let best = 0;
    for (const t of allTexts) {
      if (normStr(t) === normStr(ans)) continue;
      const s = bigramDice(ans, t);
      if (s > best) best = s;
    }
    return { q, score: best };
  });

  // highest confusability first
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, countNeeded).map((x) => x.q);
}

// ---------------- MATCH mode (Round 2) ----------------
function startMatchRound() {
  stopQuestionTimer();
  resetTimerUI();

  const pool12 = roundSlice(1); // Q13–Q24, in CSV order

  // Hard mode: pick the most confusable 6 pairs from this 12-question puzzle set
  const selected = choosePairsForNearMiss(pool12, MATCH_PAIRS);

  const pairs = selected.map((q, i) => {
    const correct = String(q.Answer || "").trim();
    return {
      pairId: "p" + i,
      leftText: shortenClue(q.Question),
      rightText: correct,
    };
  });

  const correctAnswers = pairs.map((p) => p.rightText);
  const decoyPool = buildDecoyPoolFromRound(pool12, correctAnswers);

  // Hard mode near-miss decoys: choose most similar decoys to the correct answers
  const decoys = pickNearMissDecoys(correctAnswers, decoyPool, MATCH_DECOYS);

  const leftTiles = shuffle(
    pairs.map((p) => ({
      side: "L",
      pairId: p.pairId,
      text: p.leftText,
      isDecoy: false,
    }))
  );

  const rightTiles = shuffle([
    ...pairs.map((p) => ({
      side: "R",
      pairId: p.pairId,
      text: p.rightText,
      isDecoy: false,
    })),
    ...decoys.map((d, i) => ({
      side: "R",
      pairId: "decoy_" + i,
      text: d,
      isDecoy: true,
    })),
  ]);

  matchState = {
    pairs,
    leftTiles,
    rightTiles,
    solved: new Set(),
    selectedLeftId: null,
    selectedRightId: null,
    locked: false,
  };

  renderMatchGrid();
  setMatchHint("Match the pairs. Beware: near-miss decoys included.");
  updateHUD();
}

function setMatchHint(s) {
  if (matchHintEl) matchHintEl.textContent = s || "";
}

function clearMatchGrid() {
  if (matchLeftEl) matchLeftEl.innerHTML = "";
  if (matchRightEl) matchRightEl.innerHTML = "";
}

function renderMatchGrid() {
  clearMatchGrid();

  if (!matchState) return;

  // Left column
  matchState.leftTiles.forEach((t) => {
    const b = document.createElement("button");
    b.className = "matchTile";
    b.textContent = t.text;
    b.dataset.side = "L";
    b.dataset.pairId = t.pairId;
    b.onclick = () => onMatchTap(b);
    matchLeftEl && matchLeftEl.appendChild(b);
  });

  // Right column (correct + decoys)
  matchState.rightTiles.forEach((t) => {
    const b = document.createElement("button");
    b.className = "matchTile";
    b.textContent = t.text;
    b.dataset.side = "R";
    b.dataset.pairId = t.pairId;
    b.dataset.decoy = t.isDecoy ? "1" : "0";
    b.onclick = () => onMatchTap(b);
    matchRightEl && matchRightEl.appendChild(b);
  });
}

function setTileSelected(btn, on) {
  if (!btn) return;
  btn.classList.toggle("selected", !!on);
}

function shakeEl(el) {
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

function glowLock(el) {
  if (!el) return;
  el.classList.remove("lockGlow");
  void el.offsetWidth;
  el.classList.add("lockGlow");
}

function onMatchTap(btn) {
  if (!matchState || matchState.locked) return;
  if (btn.disabled) return;

  const side = btn.dataset.side;
  const pairId = btn.dataset.pairId;

  // clear previous selection on that side
  if (side === "L") {
    matchState.selectedLeftId = pairId;
    // clear visual selection for left
    matchLeftEl &&
      [...matchLeftEl.querySelectorAll("button")].forEach((b) =>
        setTileSelected(b, b === btn)
      );
  } else {
    matchState.selectedRightId = pairId;
    matchRightEl &&
      [...matchRightEl.querySelectorAll("button")].forEach((b) =>
        setTileSelected(b, b === btn)
      );
  }

  if (!matchState.selectedLeftId || !matchState.selectedRightId) return;

  matchState.locked = true;

  const leftBtn = matchLeftEl
    ? [...matchLeftEl.querySelectorAll("button")].find(
        (b) => b.dataset.pairId === matchState.selectedLeftId
      )
    : null;

  const rightBtn = matchRightEl
    ? [...matchRightEl.querySelectorAll("button")].find(
        (b) => b.dataset.pairId === matchState.selectedRightId
      )
    : null;

  const correct = matchState.selectedLeftId === matchState.selectedRightId;

  if (correct) {
    // correct pair lock
    score += 1;
    registerCorrect();

    leftBtn && (leftBtn.disabled = true);
    rightBtn && (rightBtn.disabled = true);

    glowLock(leftBtn);
    glowLock(rightBtn);

    matchState.solved.add(matchState.selectedLeftId);

    // dots: mark the underlying position as good for this round's "slot"
    // (we mark within the 12-question block by solved size order)
    const dotIndex = roundStartIndex + Math.min(ROUND_SIZE - 1, matchState.solved.size - 1);
    markDot(dotIndex, "good");

    play(goodAudio);

    // reset selection
    matchState.selectedLeftId = null;
    matchState.selectedRightId = null;

    matchLeftEl &&
      [...matchLeftEl.querySelectorAll("button")].forEach((b) =>
        setTileSelected(b, false)
      );
    matchRightEl &&
      [...matchRightEl.querySelectorAll("button")].forEach((b) =>
        setTileSelected(b, false)
      );

    matchState.locked = false;
    updateHUD();

    // solved all pairs -> advance to next round
    if (matchState.solved.size >= MATCH_PAIRS) {
      // advance currentIndex to end of round 2 block (Q13–Q24)
      currentIndex = roundStartIndex + ROUND_SIZE;
      const nextRound = 2;
      return setTimeout(() => enterRound(nextRound), 450);
    }

    return;
  }

  // wrong (could be decoy or wrong correct)
  registerWrong();
  play(badAudio);

  // mark a dot as bad within this match round progression (best-effort)
  const badDotIndex = roundStartIndex + Math.min(ROUND_SIZE - 1, matchState.solved.size);
  markDot(badDotIndex, "bad");

  shakeEl(leftBtn);
  shakeEl(rightBtn);

  // clear selection after a beat
  setTimeout(() => {
    matchLeftEl &&
      [...matchLeftEl.querySelectorAll("button")].forEach((b) =>
        setTileSelected(b, false)
      );
    matchRightEl &&
      [...matchRightEl.querySelectorAll("button")].forEach((b) =>
        setTileSelected(b, false)
      );
    matchState.selectedLeftId = null;
    matchState.selectedRightId = null;
    matchState.locked = false;

    if (wrongTotal >= 3) return endGame("3 incorrect — game over!");
    updateHUD();
  }, 320);
}

// ---------------- End / Reset ----------------
function resetGame() {
  stopTimers();
  score = 0;
  wrongTotal = 0;
  correctSinceLastWrong = 0;

  currentIndex = 0;
  roundIndex = 0;
  roundStartIndex = 0;
  roundQuestionIndex = 0;

  matchState = null;

  resetDots();
  resetTimerUI();
  updateHUD();

  hide(matchPanelEl);
  show(quizPanelEl);
}

function endGame(msg) {
  stopTimers();
  stopQuestionTimer();
  setText(questionEl, msg || "Daily set complete ✅");
  optionEls.forEach((el) => {
    if (!el) return;
    el.disabled = true;
  });
}

// ---------------- Events ----------------
if (soundBtn) {
  soundBtn.onclick = () => {
    soundOn = !soundOn;
    soundBtn.classList.toggle("off", !soundOn);
  };
}

if (shuffleBtn) {
  shuffleBtn.onclick = () => {
    // Keep "layout" unchanged: only reshuffle options within current quiz question if in quiz mode
    if (ROUND_MODES[roundIndex] !== "quiz") return;
    const q = questions[currentIndex];
    if (!q) return;
    const opts = shuffle([q.OptionA, q.OptionB, q.OptionC, q.OptionD].map((x) => String(x || "").trim()));
    optionEls.forEach((el, i) => {
      if (!el) return;
      el.textContent = opts[i] || "";
      el.onclick = () => chooseAnswer(opts[i], q.Answer);
    });
  };
}

if (startBtn) {
  startBtn.onclick = () => {
    showCountdown(() => {
      enterRound(0);
      startElapsed();
    });
  };
}

// ---------------- Boot ----------------
(async function boot() {
  initAudio();
  try {
    await loadQuestions();
    resetGame();
    setTimeout(killStartSplash, 350);
  } catch (e) {
    console.error(e);
    setText(splashStatusEl, "Could not load today’s set.");
  }
})();
