// ===== Brain ⚡ Bolt — App.js (Stable rebuild: 36Q / 3 rounds + splash + countdown + dots + timer + match decoys) =====

// ✅ Published sheet CSV (Live tab) — this is the correct "Publish to web → CSV" URL
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const QUESTION_TIME_MS = 10000;
const QUESTION_TICK_MS = 100;

// 36-per-day support
const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = Math.ceil(TOTAL_QUESTIONS / ROUND_SIZE);

// Round modes (you can change later)
const ROUND_MODES = ["quiz", "match", "quiz"];

// Match mode settings
const MATCH_PAIRS_PER_ROUND = 6; // how many question-answer pairs shown
const MATCH_DECOYS_MAX = 6;      // extra decoy answers appended to right column

// Redemption rule: after a wrong, earn redemption by getting N correct in a row
const REDEEM_AFTER_CORRECT_STREAK = 3;

// ---------------- DOM ----------------
const $ = (id) => document.getElementById(id);

const splashEl = $("splash");
const splashStatusEl = $("splashStatus");

const statusEl = $("statusText");
const scoreEl = $("scoreText");
const qProgressEl = $("qProgress");
const elapsedEl = $("elapsedText");

const questionEl = $("questionText");
const optionsWrap = $("options");
const optionBtns = [$("option1"), $("option2"), $("option3"), $("option4")];

const timerFill = $("timerFill");
const dotsEl = $("dots");

const startBtn = $("startBtn");
const shuffleBtn = $("shuffleBtn");
const shareBtn = $("shareBtn");

const soundBtn = $("soundBtn");
const menuBtn = $("menuBtn");

const countdownOverlay = $("countdownOverlay");
const countNum = $("countNum");

// ---------------- State ----------------
let questions = [];

let score = 0;
let wrongTotal = 0;

// for redemption behaviour
let inRedemption = false;
let correctSinceLastWrong = 0;

// timing
let elapsed = 0;
let elapsedInterval = null;

let qTimer = null;
let qStart = 0;

// navigation
let roundIndex = 0;           // 0..2
let roundStartIndex = 0;      // global index start of round
let roundQuestionIndex = 0;   // 0..11 within current round
let currentGlobalIndex = 0;   // global question index (roundStartIndex + roundQuestionIndex)

// mode
let mode = "quiz";            // "quiz" | "match"
let playing = false;

// quiz question being displayed
let currentQ = null;
let currentOptions = [];

// match state
let matchState = null; // { pairs, leftItems, rightItems, leftSelectedId, rightSelectedId, matchedCount, map }

// sound
let soundOn = true;

// audio (no mp3 files; uses WebAudio beeps to avoid 404s)
let audioCtx = null;

// ---------------- Inject premium micro-CSS (no layout changes) ----------------
(function injectMicroCss() {
  const css = `
  /* Countdown: circular pulse background */
  #countdownOverlay { pointer-events: none; }
  #countNum {
    display:inline-flex;
    align-items:center;
    justify-content:center;
    width:72px;height:72px;
    border-radius:999px;
    background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.20), rgba(255,255,255,.06));
    box-shadow: 0 0 0 2px rgba(255,255,255,.08), 0 18px 50px rgba(0,0,0,.35);
    transform: scale(1);
    opacity: 0;
  }
  .bb-count-in { animation: bbCountIn .18s ease-out forwards; }
  .bb-count-pop { animation: bbCountPop .42s cubic-bezier(.2,.9,.2,1); }
  @keyframes bbCountIn { to { opacity: 1; } }
  @keyframes bbCountPop {
    0% { transform: scale(.86); filter: saturate(1); }
    55% { transform: scale(1.08); filter: saturate(1.2); }
    100% { transform: scale(1); filter: saturate(1); }
  }

  /* Dots: correct/wrong/redeemed */
  #dots .dot { background: rgba(255,255,255,.08); }
  #dots .dot.correct { background: rgba(64, 255, 170, .90); box-shadow: 0 0 0 2px rgba(64,255,170,.20), 0 10px 24px rgba(64,255,170,.18); }
  #dots .dot.wrong { background: rgba(255, 94, 94, .90); box-shadow: 0 0 0 2px rgba(255,94,94,.18), 0 10px 24px rgba(255,94,94,.14); }
  #dots .dot.redeemed { background: rgba(255, 205, 84, .92); box-shadow: 0 0 0 2px rgba(255,205,84,.18), 0 10px 24px rgba(255,205,84,.14); }

  /* Match micro effects */
  .bb-shake { animation: bbShake .28s ease-in-out; }
  @keyframes bbShake {
    0%,100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    50% { transform: translateX(6px); }
    75% { transform: translateX(-4px); }
  }
  .bb-lock-glow { animation: bbGlow .55s ease-out; }
  @keyframes bbGlow {
    0% { box-shadow: 0 0 0 rgba(64,255,170,0); }
    35% { box-shadow: 0 0 0 3px rgba(64,255,170,.18), 0 0 30px rgba(64,255,170,.22); }
    100% { box-shadow: 0 0 0 rgba(64,255,170,0); }
  }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

// ---------------- Helpers ----------------
function setText(el, txt) {
  if (el) el.textContent = txt;
}

function show(el) {
  if (el) el.style.display = "";
}
function hide(el) {
  if (el) el.style.display = "none";
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

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

function killSplashSoon() {
  if (!splashEl) return;
  splashEl.classList.add("hide");
  setTimeout(() => {
    splashEl.style.display = "none";
  }, 250);
}

// WebAudio beep (prevents mp3 404s)
function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      audioCtx = null;
    }
  }
}
function beep(freq = 880, ms = 70, vol = 0.04) {
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
    setTimeout(() => {
      o.stop();
      o.disconnect();
      g.disconnect();
    }, ms);
  } catch { }
}
function tickBeep() { beep(980, 55, 0.035); }
function goodBeep() { beep(660, 90, 0.05); setTimeout(() => beep(880, 80, 0.045), 90); }
function badBeep() { beep(220, 120, 0.05); }

// ---------------- CSV Load (cache-buster) ----------------
function fetchCSV() {
  return new Promise((resolve, reject) => {
    if (!window.Papa) {
      reject(new Error("PapaParse not loaded"));
      return;
    }

    // ✅ cache-buster to avoid stale CSV + SW/CDN caching
    const url = CSV_URL + "&_ts=" + Date.now();

    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data || []),
      error: (err) => reject(err),
    });
  });
}

function mapRowsToQuestions(rows) {
  return rows
    .map((r) => ({
      id: r.ID || r.Id || r.id || "",
      question: r.Question || r.question || "",
      optionA: r.OptionA || r.optionA || "",
      optionB: r.OptionB || r.optionB || "",
      optionC: r.OptionC || r.optionC || "",
      optionD: r.OptionD || r.optionD || "",
      answer: r.Answer || r.answer || "",
      explanation: r.Explanation || r.explanation || "",
      category: r.Category || r.category || "",
      difficulty: r.Difficulty || r.difficulty || "",
    }))
    .filter((q) => q.question && q.answer)
    .slice(0, TOTAL_QUESTIONS);
}

// ---------------- UI: header/status ----------------
function updateHeader() {
  setText(statusEl, playing ? "Playing" : "Ready");
  setText(scoreEl, String(score));

  const roundHuman = `${roundIndex + 1}/${TOTAL_ROUNDS}`;
  if (mode === "match") {
    // show match progress like "Round 2/3 • Match 0/6"
    const matched = matchState ? matchState.matchedCount : 0;
    setText(qProgressEl, `Round ${roundHuman} • Match ${matched}/${MATCH_PAIRS_PER_ROUND}`);
  } else {
    // quiz progress like "Round 1/3 • Q 0/12"
    setText(qProgressEl, `Round ${roundHuman} • Q ${roundQuestionIndex}/${ROUND_SIZE}`);
  }
}

function startElapsed() {
  stopElapsed();
  elapsed = 0;
  setText(elapsedEl, "Time: 0:00");
  elapsedInterval = setInterval(() => {
    elapsed++;
    const mm = Math.floor(elapsed / 60);
    const ss = elapsed % 60;
    setText(elapsedEl, `Time: ${mm}:${String(ss).padStart(2, "0")}`);
  }, 1000);
}

function stopElapsed() {
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = null;
}

// ---------------- Dots (streak indicators) ----------------
function initDots() {
  if (!dotsEl) return;
  dotsEl.innerHTML = "";
  for (let i = 0; i < ROUND_SIZE; i++) {
    const d = document.createElement("div");
    d.className = "dot";
    dotsEl.appendChild(d);
  }
}

function setDot(idx, state) {
  if (!dotsEl) return;
  const dot = dotsEl.children[idx];
  if (!dot) return;
  dot.classList.remove("correct", "wrong", "redeemed");
  if (state) dot.classList.add(state);
}

// ---------------- Timer bar ----------------
function stopQuestionTimer() {
  if (qTimer) clearInterval(qTimer);
  qTimer = null;
  if (timerFill) timerFill.style.width = "0%";
}

function startQuestionTimer(onTimeout) {
  stopQuestionTimer();
  qStart = Date.now();

  // Ensure bar is visible immediately
  if (timerFill) timerFill.style.width = "100%";

  qTimer = setInterval(() => {
    const elapsedMs = Date.now() - qStart;
    const left = clamp(1 - elapsedMs / QUESTION_TIME_MS, 0, 1);
    if (timerFill) timerFill.style.width = `${Math.round(left * 100)}%`;

    if (elapsedMs >= QUESTION_TIME_MS) {
      stopQuestionTimer();
      onTimeout && onTimeout();
    }
  }, QUESTION_TICK_MS);
}

// ---------------- Countdown overlay (3..2..1) ----------------
function showCountdown3(cb) {
  if (!countdownOverlay || !countNum) {
    cb && cb();
    return;
  }

  show(countdownOverlay);

  // make sure audio is unlocked (first user gesture)
  ensureAudio();

  let n = 3;
  countNum.classList.add("bb-count-in");

  const step = () => {
    setText(countNum, String(n));
    // pop animation
    countNum.classList.remove("bb-count-pop");
    // force reflow
    void countNum.offsetWidth;
    countNum.classList.add("bb-count-pop");
    tickBeep();

    n--;
    if (n === 0) {
      setTimeout(() => {
        hide(countdownOverlay);
        cb && cb();
      }, 220);
    } else {
      setTimeout(step, 500);
    }
  };

  step();
}

// ---------------- Game flow ----------------
function resetGame() {
  score = 0;
  wrongTotal = 0;
  inRedemption = false;
  correctSinceLastWrong = 0;

  roundIndex = 0;
  roundStartIndex = 0;
  roundQuestionIndex = 0;
  currentGlobalIndex = 0;

  playing = false;

  initDots();
  stopQuestionTimer();
  stopElapsed();

  // default UI
  setText(questionEl, "Press Start to Play");
  optionBtns.forEach((b) => {
    if (!b) return;
    b.disabled = true;
    b.classList.remove("correct", "wrong", "selected");
    b.textContent = "";
  });

  // ensure options wrapper is in quiz state
  renderQuizShell();

  mode = ROUND_MODES[0] || "quiz";
  updateHeader();
}

function beginRound() {
  mode = ROUND_MODES[roundIndex] || "quiz";
  roundStartIndex = roundIndex * ROUND_SIZE;
  roundQuestionIndex = 0;
  currentGlobalIndex = roundStartIndex;

  initDots();
  updateHeader();

  if (mode === "match") {
    buildMatchRound();
  } else {
    showQuizQuestion();
  }
}

function nextRoundOrEnd() {
  roundIndex++;

  if (roundIndex >= TOTAL_ROUNDS) {
    // End game
    playing = false;
    stopQuestionTimer();
    updateHeader();

    setText(questionEl, "Daily set complete ✅");
    optionBtns.forEach((b) => (b.disabled = true));
    return;
  }

  beginRound();
}

function nextQuestion() {
  roundQuestionIndex++;
  currentGlobalIndex = roundStartIndex + roundQuestionIndex;

  if (roundQuestionIndex >= ROUND_SIZE) {
    nextRoundOrEnd();
    return;
  }

  showQuizQuestion();
}

// ---------------- Quiz rendering ----------------
function renderQuizShell() {
  // restore the 4 option buttons (match mode dynamically replaces optionsWrap content)
  if (!optionsWrap) return;

  // If the buttons exist, ensure wrapper contains them in order.
  // (Your HTML already has these; this is just a safety reset after match mode.)
  if (optionsWrap.querySelector("#option1")) return;

  optionsWrap.innerHTML = "";
  optionBtns.forEach((b) => b && optionsWrap.appendChild(b));
}

function setOptionBtnState(reset = true) {
  optionBtns.forEach((b) => {
    if (!b) return;
    b.disabled = !playing || mode !== "quiz";
    if (reset) b.classList.remove("correct", "wrong", "selected");
  });
}

function showQuizQuestion() {
  renderQuizShell();

  currentQ = questions[currentGlobalIndex];
  if (!currentQ) {
    nextRoundOrEnd();
    return;
  }

  setText(questionEl, currentQ.question);

  // build randomized options
  const opts = [
    { key: "A", text: currentQ.optionA },
    { key: "B", text: currentQ.optionB },
    { key: "C", text: currentQ.optionC },
    { key: "D", text: currentQ.optionD },
  ].filter((o) => String(o.text || "").trim().length);

  currentOptions = shuffle(opts);

  // assign to buttons
  for (let i = 0; i < 4; i++) {
    const b = optionBtns[i];
    if (!b) continue;

    const o = currentOptions[i];
    if (!o) {
      b.textContent = "";
      b.disabled = true;
      continue;
    }
    b.textContent = o.text;
    b.disabled = false;
    b.onclick = () => handleQuizAnswer(o.text, b);
  }

  // update header Q count: show "Q 0/12" as you answer
  updateHeader();

  // start timer for this question
  startQuestionTimer(() => {
    // timeout counts as wrong
    handleQuizAnswer(null, null, true);
  });
}

function handleQuizAnswer(selectedText, btnEl, isTimeout = false) {
  if (!playing || mode !== "quiz") return;

  stopQuestionTimer();
  setOptionBtnState(false);

  const correct = normStr(selectedText) === normStr(currentQ.answer);
  const dotIdx = roundQuestionIndex;

  if (btnEl) btnEl.classList.add("selected");

  // mark correct option visually
  const correctBtn = optionBtns.find((b) => normStr(b.textContent) === normStr(currentQ.answer));
  if (correctBtn) correctBtn.classList.add("correct");

  if (correct && !isTimeout) {
    score++;
    goodBeep();
    setDot(dotIdx, "correct");

    if (inRedemption) {
      correctSinceLastWrong++;
      if (correctSinceLastWrong >= REDEEM_AFTER_CORRECT_STREAK) {
        // redeem one wrong (if any)
        if (wrongTotal > 0) wrongTotal--;
        // mark last wrong as redeemed if possible (best-effort: scan backwards for wrong dot)
        for (let i = dotIdx - 1; i >= 0; i--) {
          const d = dotsEl?.children?.[i];
          if (d && d.classList.contains("wrong")) {
            d.classList.remove("wrong");
            d.classList.add("redeemed");
            break;
          }
        }
        inRedemption = false;
        correctSinceLastWrong = 0;
      }
    }
  } else {
    // wrong / timeout
    if (btnEl) btnEl.classList.add("wrong");
    badBeep();

    wrongTotal++;
    inRedemption = true;
    correctSinceLastWrong = 0;

    setDot(dotIdx, "wrong");
  }

  updateHeader();

  // lock buttons briefly then advance
  optionBtns.forEach((b) => (b.disabled = true));

  setTimeout(() => {
    // update header before next question
    updateHeader();
    nextQuestion();
  }, 520);
}

// ---------------- Match mode ----------------
function buildMatchRound() {
  // Replace optionsWrap with two columns list (no HTML layout change; just JS content inside the same container)
  if (!optionsWrap) return;

  stopQuestionTimer(); // no per-question timer in match (you can add later)
  renderMatchUI();

  // Select pool from this round
  const pool = questions.slice(roundStartIndex, roundStartIndex + ROUND_SIZE);

  // pick pairs
  const pairs = shuffle(pool)
    .slice(0, MATCH_PAIRS_PER_ROUND)
    .map((q, i) => ({
      id: `p${i}_${q.id || i}`,
      left: q.question,
      right: q.answer,
    }));

  // decoys: pull other answers not in correct set
  const correctAnswers = new Set(pairs.map((p) => normStr(p.right)));
  const otherAnswers = shuffle(
    pool
      .map((q) => q.answer)
      .filter((a) => a && !correctAnswers.has(normStr(a)))
  );

  const decoys = otherAnswers.slice(0, MATCH_DECOYS_MAX);

  // right items = correct answers + decoys shuffled
  const rightItems = shuffle([...pairs.map((p) => p.right), ...decoys]).map((t, idx) => ({
    id: `r${idx}_${normStr(t).slice(0, 16)}`,
    text: t,
    isDecoy: !correctAnswers.has(normStr(t)),
    locked: false,
  }));

  // left items shuffled
  const leftItems = shuffle(pairs).map((p) => ({
    id: p.id,
    text: p.left,
    locked: false,
  }));

  // mapping from leftId to correct right normalized value
  const map = {};
  pairs.forEach((p) => (map[p.id] = normStr(p.right)));

  matchState = {
    pairs,
    leftItems,
    rightItems,
    map,
    leftSelectedId: null,
    rightSelectedId: null,
    matchedCount: 0,
  };

  updateHeader();
  renderMatchLists();
}

function renderMatchUI() {
  // Build a two-column grid inside #options
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "1fr 1fr";
  wrap.style.gap = "10px";
  wrap.style.width = "100%";

  const leftCol = document.createElement("div");
  const rightCol = document.createElement("div");
  leftCol.id = "bbMatchLeft";
  rightCol.id = "bbMatchRight";

  // small hint (keeps layout unchanged, just text within container)
  setText(questionEl, "Match the pairs");

  wrap.appendChild(leftCol);
  wrap.appendChild(rightCol);

  optionsWrap.innerHTML = "";
  optionsWrap.appendChild(wrap);
}

function renderMatchLists() {
  const leftCol = document.getElementById("bbMatchLeft");
  const rightCol = document.getElementById("bbMatchRight");
  if (!leftCol || !rightCol || !matchState) return;

  leftCol.innerHTML = "";
  rightCol.innerHTML = "";

  // Helper to create item buttons styled like your existing option buttons (reuse class)
  const makeItem = (text) => {
    const btn = document.createElement("button");
    btn.className = "option"; // your CSS already styles .option buttons
    btn.type = "button";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.textContent = text;
    return btn;
  };

  matchState.leftItems.forEach((it) => {
    const b = makeItem(it.text);
    b.dataset.id = it.id;
    b.disabled = it.locked;

    if (matchState.leftSelectedId === it.id) b.classList.add("selected");
    if (it.locked) b.classList.add("correct");

    b.onclick = () => {
      if (!playing || mode !== "match" || it.locked) return;
      matchState.leftSelectedId = it.id;
      // clear any shake remnants
      b.classList.remove("bb-shake");
      renderMatchLists();
      tryResolveMatch();
    };

    leftCol.appendChild(b);
  });

  matchState.rightItems.forEach((it) => {
    const b = makeItem(it.text);
    b.dataset.id = it.id;
    b.disabled = it.locked;

    if (matchState.rightSelectedId === it.id) b.classList.add("selected");
    if (it.locked) b.classList.add("correct");

    // subtle “decoy” is not visually marked (keep it fair/premium)
    b.onclick = () => {
      if (!playing || mode !== "match" || it.locked) return;
      matchState.rightSelectedId = it.id;
      b.classList.remove("bb-shake");
      renderMatchLists();
      tryResolveMatch();
    };

    rightCol.appendChild(b);
  });
}

function tryResolveMatch() {
  if (!matchState) return;
  if (!matchState.leftSelectedId || !matchState.rightSelectedId) return;

  const leftId = matchState.leftSelectedId;
  const rightId = matchState.rightSelectedId;

  const rightItem = matchState.rightItems.find((r) => r.id === rightId);
  const leftCorrectNorm = matchState.map[leftId];
  const chosenNorm = normStr(rightItem?.text);

  const leftBtn = document.querySelector(`#bbMatchLeft button[data-id="${leftId}"]`);
  const rightBtn = document.querySelector(`#bbMatchRight button[data-id="${rightId}"]`);

  if (chosenNorm && leftCorrectNorm && chosenNorm === leftCorrectNorm) {
    // correct
    goodBeep();

    // lock left + right
    matchState.leftItems = matchState.leftItems.map((l) =>
      l.id === leftId ? { ...l, locked: true } : l
    );
    matchState.rightItems = matchState.rightItems.map((r) =>
      r.id === rightId ? { ...r, locked: true } : r
    );

    matchState.matchedCount++;

    // premium lock glow
    if (leftBtn) leftBtn.classList.add("bb-lock-glow");
    if (rightBtn) rightBtn.classList.add("bb-lock-glow");

    // reset selection
    matchState.leftSelectedId = null;
    matchState.rightSelectedId = null;

    updateHeader();
    renderMatchLists();

    if (matchState.matchedCount >= MATCH_PAIRS_PER_ROUND) {
      // match round done -> next round
      setTimeout(() => {
        nextRoundOrEnd();
      }, 520);
    }
  } else {
    // wrong
    badBeep();
    if (leftBtn) leftBtn.classList.add("bb-shake");
    if (rightBtn) rightBtn.classList.add("bb-shake");

    // small penalty (optional): keep score unchanged; could track wrongTotal if you want
    matchState.leftSelectedId = null;
    matchState.rightSelectedId = null;

    setTimeout(() => {
      renderMatchLists();
    }, 260);
  }
}

// ---------------- Controls ----------------
function onStart() {
  if (!questions.length) return;

  // unlock audio on first gesture
  ensureAudio();
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => { });
  }

  if (!playing) {
    playing = true;
    startElapsed();
    updateHeader();

    showCountdown3(() => {
      beginRound();
    });
  }
}

function onShuffle() {
  if (!questions.length) return;

  // reshuffle within today’s set (keeps same 36 but changes order)
  questions = shuffle(questions);

  resetGame();
  updateHeader();
}

function onShare() {
  try {
    const text = `Brain ⚡ Bolt — I scored ${score} today.`;
    if (navigator.share) {
      navigator.share({ title: "Brain Bolt", text, url: location.href }).catch(() => { });
    } else {
      navigator.clipboard?.writeText(`${text} ${location.href}`).catch(() => { });
      alert("Share link copied.");
    }
  } catch { }
}

function onToggleSound() {
  soundOn = !soundOn;
  // reflect state lightly without layout changes
  if (soundBtn) soundBtn.style.opacity = soundOn ? "1" : "0.45";
  if (soundOn) tickBeep();
}

// ---------------- Boot ----------------
(async function boot() {
  try {
    setText(splashStatusEl, "Loading today’s set…");

    const rows = await fetchCSV();
    questions = mapRowsToQuestions(rows);

    if (!questions.length) throw new Error("No questions loaded");

    // Initialise UI
    resetGame();

    // Auto-dismiss splash (no tap)
    setTimeout(killSplashSoon, 300);
  } catch (e) {
    console.error(e);
    setText(splashStatusEl, "Could not load today’s set.");
    // still allow dismiss after a moment so you're not trapped
    setTimeout(killSplashSoon, 900);
  }

  // wire controls
  if (startBtn) startBtn.onclick = onStart;
  if (shuffleBtn) shuffleBtn.onclick = onShuffle;
  if (shareBtn) shareBtn.onclick = onShare;

  if (soundBtn) soundBtn.onclick = onToggleSound;
  if (menuBtn) menuBtn.onclick = () => (window.location.href = "menu.html");

  // initial sound state
  if (soundBtn) soundBtn.style.opacity = soundOn ? "1" : "0.45";
})();
