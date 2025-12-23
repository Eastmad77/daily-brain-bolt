// ===== Brain ⚡ Bolt — App.js v3.13.0 (36 questions: 3 rounds of 12) =====
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1v...1HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";
const QUESTION_TIME_MS = 10000, QUESTION_TICK_MS = 100;

// ✅ NEW: 36-per-day support
const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = Math.ceil(TOTAL_QUESTIONS / ROUND_SIZE);

let questions = [], currentIndex = 0, score = 0, wrongTotal = 0, correctSinceLastWrong = 0, elapsed = 0, elapsedInterval = null, qTimer = null, qStart = 0, qLastTickSec = 3, soundOn = true, successAutoNav = null;

/* Elements */
const startBtn = document.getElementById("startBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const shareBtn = document.getElementById("shareBtn");
const playAgainBtn = document.getElementById("playAgainBtn");
const qBox = document.getElementById("questionBox");
const choicesDiv = document.getElementById("choices");
const pillScore = document.getElementById("pillScore");
const progressLabel = document.getElementById("progressLabel");
const elapsedTimeEl = document.getElementById("elapsedTime");
const timerBar = document.getElementById("timerBar");
const gameOverBox = document.getElementById("gameOverBox");
const gameOverText = document.getElementById("gameOverText");
const setLabel = document.getElementById("setLabel");
const streakBar = document.getElementById("streakBar");
const soundBtn = document.getElementById("soundBtn");
const successSplash = document.getElementById("successSplash");
const countdownOverlay = document.getElementById("countdownOverlay");
const countNum = document.getElementById("countNum");

/* Helpers */
const $ = s => document.querySelector(s);
const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
const setText = (el, txt) => { if (el) el.textContent = txt; };
const setStyle = (el, k, v) => { if (el) el.style[k] = v; };
const addCls = (el, c) => el?.classList?.add?.(c);
const remCls = (el, c) => el?.classList?.remove?.(c);

/* Countdown overlay */
function showCountdown(on) {
  if (!countdownOverlay) return;
  if (on) addCls(countdownOverlay, "show"); else remCls(countdownOverlay, "show");
}

/* Splash */
function killStartSplash() {
  const s = document.getElementById("startSplash");
  if (!s || s.dataset.dismissed === "1") return;
  s.dataset.dismissed = "1";
  addCls(s, "hiding"); setTimeout(() => s.remove(), 420);
}
document.addEventListener("click", killStartSplash, { once: true });

/* Sound + haptics */
function beep(freq = 880, dur = 60) {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.type = "sine";
    g.gain.value = 0.06;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, dur);
  } catch (_) { }
}
function vibrate(ms = 60) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) { } }

/* CSV */
function fetchCSV() {
  return new Promise((resolve, reject) => {
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: r => resolve(r.data || []),
      error: e => reject(e)
    });
  });
}

/* Utils */
function formatTime(s) { const m = Math.floor(s / 60), x = s % 60; return `${m}:${x < 10 ? "0" : ""}${x}`; }
function shuffleArray(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function norm(x) { return String(x ?? "").trim().toLowerCase(); }

/* Correct text resolve */
function resolveCorrectText(q) {
  if (!q) return "";
  const Q = k => q[k] ?? q[k?.toLowerCase?.()] ?? q[k?.toUpperCase?.()];
  // Prefer Answer column; fallback to AnswerX or Correct etc.
  return Q("Answer") ?? Q("Correct") ?? "";
}

/* Row validity */
function isValidRow(row) {
  if (!row) return false;
  const get = k => row[k] ?? row[k?.toLowerCase?.()] ?? row[k?.toUpperCase?.()];
  const hasQ = !!String(get("Question") || "").trim();
  const opts = ["OptionA", "OptionB", "OptionC", "OptionD"].map(get).filter(Boolean);
  return hasQ && opts.length >= 2;
}

/* Streak */
function buildStreakBar() {
  if (!streakBar) return;
  streakBar.innerHTML = "";
  for (let i = 0; i < 12; i++) {
    const d = document.createElement("div");
    d.className = "dot";
    streakBar.appendChild(d);
  }
}
function markStreak() {
  if (!streakBar) return;
  const dots = [...streakBar.querySelectorAll(".dot")];
  dots.forEach((d, i) => {
    if (i < correctSinceLastWrong) d.classList.add("on"); else d.classList.remove("on");
  });
}
function redeemOneWrongDot() {
  if (wrongTotal <= 0) return false;
  wrongTotal = Math.max(0, wrongTotal - 1);
  return true;
}

/* Timer */
function startQuestionTimer(onTimeout) {
  stopQuestionTimer();
  qStart = Date.now();
  qLastTickSec = 3;
  setStyle(timerBar, "width", "0%");
  qTimer = setInterval(() => {
    const now = Date.now();
    const t = Math.max(0, QUESTION_TIME_MS - (now - qStart));
    const p = 100 * (1 - t / QUESTION_TIME_MS);
    setStyle(timerBar, "width", `${p}%`);

    const sec = Math.ceil(t / 1000);
    if (sec > 0 && sec <= 3 && sec !== qLastTickSec) {
      qLastTickSec = sec;
      beep(700, 35);
    }
    if (t <= 0) {
      stopQuestionTimer();
      onTimeout?.();
    }
  }, QUESTION_TICK_MS);
}
function stopQuestionTimer() {
  if (qTimer) { clearInterval(qTimer); qTimer = null; }
}

/* Start game */
async function startGame() {
  clearTimeout(successAutoNav);
  try {
    successSplash?.classList.remove("show");
    setText(setLabel, "Loading…");
    const data = await fetchCSV();
    const safe = data.filter(isValidRow);
    if (!safe.length) throw new Error("No valid questions");

    // ✅ Build 3 rounds of 12 (Easy → Medium → Hard bucket) when available.
    const diffOf = r => norm(r.Difficulty ?? r.difficulty ?? r["Difficulty"] ?? r["difficulty"]);
    const easy = safe.filter(r => diffOf(r) === "easy");
    const med = safe.filter(r => diffOf(r) === "medium");
    const hard = safe.filter(r => ["hard", "medium-hard", "difficult"].includes(diffOf(r)));

    const pickN = (arr, n) => shuffleArray(arr.slice()).slice(0, n);

    if (easy.length >= ROUND_SIZE && med.length >= ROUND_SIZE && hard.length >= ROUND_SIZE) {
      questions = [...pickN(easy, ROUND_SIZE), ...pickN(med, ROUND_SIZE), ...pickN(hard, ROUND_SIZE)];
    } else {
      // Fallback: just take the first 36 after shuffle.
      questions = shuffleArray(safe).slice(0, TOTAL_QUESTIONS);
    }

    currentIndex = 0; score = 0; wrongTotal = 0; correctSinceLastWrong = 0; elapsed = 0;
    setText(pillScore, "Score 0");
    setText(progressLabel, `Round 1/${TOTAL_ROUNDS} • Q 0/${ROUND_SIZE}`);
    show(gameOverBox, false); show(playAgainBtn, false);
    remCls(playAgainBtn, "pulse");
    setText(setLabel, "Ready");
    buildStreakBar(); markStreak();

    // Countdown
    let n = 3;
    setText(countNum, n);
    showCountdown(true);
    countNum.style.animation = "none"; void countNum.offsetWidth; countNum.style.animation = "popIn .4s ease";
    beep(600, 45);

    const int = setInterval(() => {
      n--;
      if (n > 0) {
        setText(countNum, n);
        countNum.style.animation = "none"; void countNum.offsetWidth; countNum.style.animation = "popIn .4s ease";
        beep(600, 45);
      } else {
        clearInterval(int);
        setText(countNum, "GO");
        countNum.style.animation = "none"; void countNum.offsetWidth; countNum.style.animation = "popIn .4s ease";
        beep(900, 70);
        setTimeout(() => { showCountdown(false); beginQuiz(); }, 200);
      }
    }, 700);

  } catch (e) {
    setText(qBox, "Could not load today’s quiz. Please try again later.");
    setText(setLabel, "Load failed");
    console.error(e);
  }
}

function beginQuiz() {
  show(gameOverBox, false); show(playAgainBtn, false);
  // elapsed timer
  clearInterval(elapsedInterval);
  elapsed = 0;
  elapsedInterval = setInterval(() => {
    elapsed++;
    setText(elapsedTimeEl, formatTime(elapsed));
  }, 1000);

  showQuestion();
}

function showQuestion() {
  if (!Array.isArray(questions) || currentIndex >= questions.length) return endGame();
  const q = questions[currentIndex];
  if (!q) { currentIndex++; return showQuestion(); }

  const Q = k => q[k] ?? q[k?.toLowerCase?.()] ?? q[k?.toUpperCase?.()];
  const correctText = resolveCorrectText(q);

  setText(qBox, Q("Question") || "—");
  choicesDiv.innerHTML = "";

  let opts = [];
  ["OptionA", "OptionB", "OptionC", "OptionD"].forEach((k) => {
    const v = Q(k);
    if (!v) return;
    const ok = norm(v) === norm(correctText);
    opts.push({ text: String(v), isCorrect: ok });
  });

  if (!opts.some(o => o.isCorrect) && opts.length > 0) opts[0].isCorrect = true;
  if (opts.length < 2) { currentIndex++; return showQuestion(); }

  opts = shuffleArray(opts);
  opts.forEach(o => {
    const b = document.createElement("button");
    b.className = "choiceBtn";
    b.textContent = o.text;
    b.onclick = () => handleAnswer(b, o.isCorrect);
    choicesDiv.appendChild(b);
  });

  const round = Math.min(TOTAL_ROUNDS, Math.floor(currentIndex / ROUND_SIZE) + 1);
  const inRound = ((currentIndex) % ROUND_SIZE) + 1;
  setText(progressLabel, `Round ${round}/${TOTAL_ROUNDS} • Q ${inRound}/${ROUND_SIZE}`);

  startQuestionTimer(() => handleTimeout());
}

/* Answers */
function handleTimeout() { beep(240, 90); vibrate(160); registerWrong(); advanceOrEnd(); }

function handleAnswer(btn, isCorrect) {
  stopQuestionTimer();
  [...choicesDiv.querySelectorAll("button")].forEach(b => b.disabled = true);

  if (isCorrect) {
    beep(980, 80);
    registerCorrect();
  } else {
    beep(240, 90);
    vibrate(160);
    btn.classList.add("wrong");
    registerWrong();
  }
  setTimeout(() => advanceOrEnd(), 520);
}

function registerCorrect() {
  score++;
  correctSinceLastWrong++;
  setText(pillScore, `Score ${score}`);
  markStreak();
}

function registerWrong() {
  wrongTotal++;
  correctSinceLastWrong = 0;
  markStreak();
}

function advanceOrEnd() {
  if (wrongTotal >= 3) return endGame("3 incorrect — try again!");
  currentIndex++;
  if (currentIndex >= questions.length) endGame();
  else showQuestion();
}

/* End */
function endGame(msg = "") {
  clearInterval(elapsedInterval);
  stopQuestionTimer();
  showCountdown(false);

  if (msg) {
    setText(gameOverText, msg);
    show(gameOverBox, true);
    show(playAgainBtn, true);
    addCls(playAgainBtn, "pulse");
  } else {
    // Success splash (auto-returns to start)
    successSplash?.removeAttribute("aria-hidden");
    successSplash?.classList.remove("show");
    void successSplash?.offsetWidth;
    successSplash?.classList.add("show");

    clearTimeout(successAutoNav);
    successAutoNav = setTimeout(() => {
      successSplash?.classList.remove("show");
      setText(qBox, "Tap Start for today’s set");
      choicesDiv.innerHTML = "";
      setText(pillScore, "Score 0");
      setText(progressLabel, `Round 1/${TOTAL_ROUNDS} • Q 0/${ROUND_SIZE}`);
      setStyle(timerBar, "width", "0%");
      buildStreakBar();
      markStreak();
    }, 3000);
  }
}

/* Wire UI */
startBtn?.addEventListener("click", startGame);

shuffleBtn?.addEventListener("click", () => {
  shuffleArray(questions);
  currentIndex = 0;
  score = 0;
  wrongTotal = 0;
  correctSinceLastWrong = 0;
  setText(pillScore, "Score 0");
  setText(progressLabel, `Round 1/${TOTAL_ROUNDS} • Q 0/${ROUND_SIZE}`);
  buildStreakBar(); markStreak();
  showQuestion();
});

shareBtn?.addEventListener("click", () => {
  const text = `I'm playing Brain ⚡ Bolt! Current score: ${score}/${TOTAL_QUESTIONS}`;
  if (navigator.share) {
    navigator.share({ title: "Brain ⚡ Bolt", text, url: location.href }).catch(() => { });
  } else {
    navigator.clipboard?.writeText(`${text} - ${location.href}`);
  }
});

playAgainBtn?.addEventListener("click", startGame);

soundBtn?.addEventListener("click", () => {
  soundOn = !soundOn;
  if (soundBtn) soundBtn.textContent = soundOn ? "🔊" : "🔇";
});
