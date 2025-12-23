// ===== Brain ⚡ Bolt — App.js v3.13.2 (OLD features + 36 questions: 3 rounds of 12) =====
// Uses the published "Live" CSV feed:
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const QUESTION_TIME_MS = 10000;
const QUESTION_TICK_MS = 100;

// 36-per-day support
const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = Math.ceil(TOTAL_QUESTIONS / ROUND_SIZE);

// ---------------- State ----------------
let questions = [];           // full 36 loaded
let roundQuestions = [];      // current 12
let currentIndex = 0;         // index within current round
let roundIndex = 0;           // 0..2
let score = 0;                // total correct across all rounds
let wrongTotal = 0;           // wrongs in current round (game over at 3)
let correctSinceLastWrong = 0;

let elapsed = 0;
let elapsedInterval = null;

let qTimer = null;
let qRemaining = QUESTION_TIME_MS;
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
const timerBar = document.getElementById("timerBar");

const countdownOverlay = document.getElementById("countdownOverlay");
const countNum = document.getElementById("countNum");

const successSplash = document.getElementById("successSplash");
const gameOverBox = document.getElementById("gameOverBox");
const gameOverText = document.getElementById("gameOverText");

const soundBtn = document.getElementById("soundBtn");
const setLabel = document.getElementById("setLabel");

// IMPORTANT: in your current HTML the streak container is id="streakBar"
const streakBar = document.getElementById("streakBar");

// Guard: if we're on a non-quiz page, just wire sound toggle safely.
if (!qBox || !choicesDiv) {
  soundBtn?.addEventListener("click", () => {
    soundOn = !soundOn;
    if (soundBtn) soundBtn.textContent = soundOn ? "🔊" : "🔇";
  });
} else {
  // ---------------- Helpers ----------------
  const setText = (el, txt) => {
    if (el) el.textContent = txt;
  };
  const setStyle = (el, p, v) => {
    if (el && el.style) el.style[p] = v;
  };
  const show = (el, on = true) => {
    if (el) el.style.display = on ? "" : "none";
  };
  const addCls = (el, c) => {
    if (el) el.classList.add(c);
  };
  const remCls = (el, c) => {
    if (el) el.classList.remove(c);
  };

  function showCountdown(on) {
    if (!countdownOverlay) return;
    countdownOverlay.hidden = !on;
    if (on) addCls(countdownOverlay, "show");
    else remCls(countdownOverlay, "show");
  }

  function ensureCountdownCircle() {
    // Your CSS has `.countdown-dot`, but HTML only has `#countNum`.
    // We create the circular wrapper at runtime (no layout file changes).
    if (!countdownOverlay || !countNum) return;
    const existingDot = countdownOverlay.querySelector(".countdown-dot");
    if (existingDot) return;

    const dot = document.createElement("div");
    dot.className = "countdown-dot";

    // move countNum inside dot
    const parent = countNum.parentElement;
    dot.appendChild(countNum);
    if (parent) parent.appendChild(dot);
    else countdownOverlay.appendChild(dot);
  }

  function asText(v) {
    return String(v ?? "").trim();
  }
  function norm(v) {
    return asText(v).toLowerCase();
  }
  function formatTime(s) {
    const m = Math.floor(s / 60);
    const x = s % 60;
    return `${m}:${x < 10 ? "0" : ""}${x}`;
  }
  function shuffleArray(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------------- Splash (auto-dismiss, no tap) ----------------
  function killStartSplash() {
    const s = document.getElementById("startSplash");
    if (!s || s.dataset.dismissed === "1") return;
    s.dataset.dismissed = "1";
    addCls(s, "hiding");
    setTimeout(() => s.remove(), 520);
  }
  document.addEventListener("DOMContentLoaded", () => {
    ensureCountdownCircle();
    showCountdown(false);
    setTimeout(killStartSplash, 900);
  });
  window.addEventListener("load", () => setTimeout(killStartSplash, 900));
  setTimeout(killStartSplash, 4000);

  // ---------------- Audio (tick sounds + correct/incorrect) ----------------
  function beep(f = 600, d = 0.25) {
    if (!soundOn) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.value = 0.25;
      const t = ctx.currentTime;
      o.start(t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.stop(t + d + 0.02);
    } catch {}
  }
  const beepTick = () => beep(620, 0.22);
  const beepGo = () => beep(950, 0.28);
  const sfxCorrect = () => beep(1020, 0.18);
  const sfxIncorrect = () => beep(220, 0.2);
  const tickSoft = () => beep(740, 0.08);

  function vibrate(ms = 100) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // ---------------- CSV fetch ----------------
  function fetchCSV() {
    return new Promise((resolve, reject) => {
      Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (r) => resolve(r.data || []),
        error: (e) => reject(e),
      });
    });
  }

  // ---------------- Row parsing / correctness ----------------
  function resolveCorrectText(q) {
    if (!q) return "";
    const Q = (k) => q[k] ?? q[k?.toLowerCase?.()] ?? q[k?.toUpperCase?.()];
    const ans = norm(Q("Answer"));

    const M = { a: "OptionA", b: "OptionB", c: "OptionC", d: "OptionD" };
    if (["a", "b", "c", "d"].includes(ans)) return Q(M[ans]) ?? "";

    if (["optiona", "optionb", "optionc", "optiond"].includes(ans)) {
      const k = "Option" + ans.slice(-1).toUpperCase();
      return Q(k) ?? "";
    }
    return Q("Answer") ?? "";
  }

  function isValidRow(row) {
    if (!row) return false;
    const get = (k) => row[k] ?? row[k?.toLowerCase?.()] ?? row[k?.toUpperCase?.()];
    const hasQ = !!norm(get("Question"));
    const opts = ["OptionA", "OptionB", "OptionC", "OptionD"]
      .map(get)
      .filter(Boolean);
    return hasQ && opts.length >= 2;
  }

  // ---------------- Streak bar (12 dots) ----------------
  function buildStreakBar() {
    if (!streakBar) return;
    // match your CSS: `.streak-vis` + `.streak-dot`
    streakBar.classList.add("streak-vis");
    streakBar.innerHTML = "";
    for (let i = 0; i < ROUND_SIZE; i++) {
      const d = document.createElement("div");
      d.className = "streak-dot";
      d.dataset.index = String(i);
      streakBar.appendChild(d);
    }
  }

  function markStreak(i, ok) {
    if (!streakBar) return;
    const d = streakBar.querySelector(`.streak-dot[data-index="${i}"]`);
    if (!d) return;
    d.classList.remove("is-correct", "is-wrong");
    d.classList.add(ok ? "is-correct" : "is-wrong");
  }

  // Redemption rule: after 3 correct since last wrong, remove 1 previous wrong dot.
  function redeemOneWrongDot() {
    if (!streakBar) return;
    const wrongs = [...streakBar.querySelectorAll(".streak-dot.is-wrong")];
    if (!wrongs.length) return;

    // Prefer the most recent wrong before currentIndex
    const target =
      wrongs
        .slice()
        .reverse()
        .find((d) => Number(d.dataset.index) < currentIndex) || wrongs[0];

    target.classList.add("redeem");
    setTimeout(() => {
      target.classList.remove("is-wrong", "redeem");
    }, 900);
  }

  // ---------------- Timers ----------------
  function startQuestionTimer(onTimeout) {
    stopQuestionTimer();
    qRemaining = QUESTION_TIME_MS;
    qLastTickSec = 3;

    qTimer = setInterval(() => {
      qRemaining -= QUESTION_TICK_MS;

      const secsLeft = Math.ceil(qRemaining / 1000);
      if (qRemaining <= 3000) {
        if (secsLeft > 0 && secsLeft < qLastTickSec + 1) {
          tickSoft();
          qLastTickSec = secsLeft;
        }
      }

      if (qRemaining <= 0) {
        stopQuestionTimer();
        onTimeout?.();
      }
    }, QUESTION_TICK_MS);
  }

  function stopQuestionTimer() {
    if (qTimer) {
      clearInterval(qTimer);
      qTimer = null;
    }
  }

  // ---------------- UI labels ----------------
  function setProgressLabel() {
    const r = Math.min(roundIndex + 1, TOTAL_ROUNDS);
    const q = Math.min(currentIndex + 1, ROUND_SIZE);
    setText(progressLabel, `Round ${r}/${TOTAL_ROUNDS} • Q ${q}/${ROUND_SIZE}`);
  }

  function resetTopBar() {
    setText(pillScore, `Score ${score}`);
    setText(setLabel, "Ready");
    setText(progressLabel, `Round 1/${TOTAL_ROUNDS} • Q 0/${ROUND_SIZE}`);
  }

  // ---------------- Game flow ----------------
  async function startGame() {
    clearTimeout(successAutoNav);

    try {
      successSplash?.classList.remove("show");
      show(gameOverBox, false);
      show(playAgainBtn, false);
      playAgainBtn?.classList.remove("pulse");

      setText(setLabel, "Loading…");
      setText(qBox, "Loading today’s set…");
      if (choicesDiv) choicesDiv.innerHTML = "";

      const data = await fetchCSV();
      const safe = data.filter(isValidRow);

      if (!safe.length) throw new Error("No valid questions in LIVE feed.");

      // If sheet has more than 36, we take first 36 after shuffle.
      // If it has exactly 36 (your daily build), perfect.
      questions = shuffleArray(safe.slice()).slice(0, TOTAL_QUESTIONS);

      // Reset whole run
      score = 0;
      elapsed = 0;
      roundIndex = 0;

      beginRound(0, { doCountdown: true });
    } catch (e) {
      console.error(e);
      setText(setLabel, "Error");
      setText(qBox, "Could not load today’s quiz. Please try again later.");
    }
  }

  function beginRound(rIndex, { doCountdown } = { doCountdown: false }) {
    roundIndex = rIndex;

    // slice current 12
    const start = roundIndex * ROUND_SIZE;
    const end = start + ROUND_SIZE;
    roundQuestions = questions.slice(start, end);

    // per-round state
    currentIndex = 0;
    wrongTotal = 0;
    correctSinceLastWrong = 0;

    buildStreakBar();
    setText(pillScore, `Score ${score}`);
    setText(setLabel, "Ready");
    setText(qBox, "Press Start to Play");
    if (choicesDiv) choicesDiv.innerHTML = "";

    setProgressLabel();

    // Start overall timer once (only at first round)
    if (roundIndex === 0) {
      elapsed = 0;
      setText(elapsedTimeEl, "0:00");
      setStyle(timerBar, "width", "0%");
      clearInterval(elapsedInterval);
      elapsedInterval = setInterval(() => {
        elapsed++;
        setText(elapsedTimeEl, formatTime(elapsed));
        // Same visual behaviour as before: fill over 5 minutes.
        setStyle(timerBar, "width", Math.min(100, (elapsed / 300) * 100) + "%");
      }, 1000);
    }

    if (doCountdown) {
      runCountdown(() => {
        setText(setLabel, `Round ${roundIndex + 1} start`);
        showQuestion();
      });
    } else {
      showQuestion();
    }
  }

  function runCountdown(onDone) {
    ensureCountdownCircle();
    showCountdown(true);

    let n = 3;
    setText(countNum, n);

    // kick animation + sound
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
          onDone?.();
        }, 200);
      }
    }, 700);
  }

  function showQuestion() {
    if (!Array.isArray(roundQuestions) || currentIndex >= roundQuestions.length) {
      return endRound();
    }

    const q = roundQuestions[currentIndex];
    if (!q) {
      currentIndex++;
      return showQuestion();
    }

    const Q = (k) => q[k] ?? q[k?.toLowerCase?.()] ?? q[k?.toUpperCase?.()];
    const correctText = resolveCorrectText(q);

    setText(qBox, Q("Question") || "—");
    if (choicesDiv) choicesDiv.innerHTML = "";

    let opts = [];
    ["OptionA", "OptionB", "OptionC", "OptionD"].forEach((k) => {
      const v = Q(k);
      if (!v) return;
      const ok = norm(v) === norm(correctText);
      opts.push({ text: String(v), isCorrect: ok });
    });

    // ensure one correct
    if (!opts.some((o) => o.isCorrect) && opts.length > 0) opts[0].isCorrect = true;
    if (opts.length < 2) {
      currentIndex++;
      return showQuestion();
    }

    opts = shuffleArray(opts);

    opts.forEach((o) => {
      const b = document.createElement("button");
      b.textContent = o.text;
      b.onclick = () => handleAnswer(b, o.isCorrect);
      choicesDiv.appendChild(b);
    });

    setProgressLabel();
    setText(setLabel, `Round ${roundIndex + 1}/${TOTAL_ROUNDS}`);
    startQuestionTimer(() => handleTimeout());
  }

  function handleTimeout() {
    sfxIncorrect();
    vibrate(160);
    registerWrong();
    advanceOrEnd();
  }

  function handleAnswer(btn, isCorrect) {
    stopQuestionTimer();
    [...choicesDiv.querySelectorAll("button")].forEach((b) => (b.disabled = true));

    if (isCorrect) {
      btn.classList.add("correct");
      sfxCorrect();
      vibrate(60);
      score++;
      setText(pillScore, `Score ${score}`);
      registerCorrect();
    } else {
      btn.classList.add("incorrect");
      sfxIncorrect();
      vibrate(160);
      registerWrong();
    }

    setTimeout(() => advanceOrEnd(), 800);
  }

  function registerCorrect() {
    markStreak(currentIndex, true);
    correctSinceLastWrong++;

    if (correctSinceLastWrong >= 3 && wrongTotal > 0) {
      redeemOneWrongDot();
      wrongTotal--;
      correctSinceLastWrong = 0;
    }
  }

  function registerWrong() {
    markStreak(currentIndex, false);
    wrongTotal++;
    correctSinceLastWrong = 0;
  }

  function advanceOrEnd() {
    // game over rule stays the same (3 wrong in a round)
    if (wrongTotal >= 3) return endGame("3 incorrect — game over!");

    currentIndex++;
    if (currentIndex >= ROUND_SIZE) endRound();
    else showQuestion();
  }

  function endRound() {
    stopQuestionTimer();

    // Completed this round successfully
    const isLastRound = roundIndex >= TOTAL_ROUNDS - 1;

    if (!isLastRound) {
      // brief "Nice work" splash, then next round countdown
      successSplash?.classList.remove("show");
      void successSplash?.offsetWidth;
      successSplash?.classList.add("show");

      clearTimeout(successAutoNav);
      successAutoNav = setTimeout(() => {
        successSplash?.classList.remove("show");
        beginRound(roundIndex + 1, { doCountdown: true });
      }, 1200);
      return;
    }

    // Completed all rounds
    endGame("");
  }

  function endGame(msg = "") {
    clearInterval(elapsedInterval);
    stopQuestionTimer();
    showCountdown(false);

    if (msg) {
      setText(gameOverText, msg);
      show(gameOverBox, true);
      show(playAgainBtn, true);
      playAgainBtn?.classList.add("pulse");
      setText(setLabel, "Game Over");
      return;
    }

    // Success end-state (keep your existing success splash behaviour)
    successSplash?.removeAttribute("aria-hidden");
    successSplash?.classList.remove("show");
    void successSplash?.offsetWidth;
    successSplash?.classList.add("show");

    clearTimeout(successAutoNav);
    successAutoNav = setTimeout(() => {
      successSplash?.classList.remove("show");
      setText(qBox, "Press Start to Play");
      setText(setLabel, "Ready");
      setText(pillScore, "Score 0");
      setText(progressLabel, `Round 1/${TOTAL_ROUNDS} • Q 0/${ROUND_SIZE}`);
      setStyle(timerBar, "width", "0%");
      buildStreakBar();
    }, 3000);
  }

  // ---------------- Wire UI ----------------
  startBtn?.addEventListener("click", () => {
    // If we already loaded a session, start from current round with countdown,
    // otherwise load fresh.
    if (questions?.length >= TOTAL_QUESTIONS) {
      beginRound(roundIndex, { doCountdown: true });
    } else {
      startGame();
    }
  });

  shuffleBtn?.addEventListener("click", () => {
    // Shuffle only within the current round (keeps 3-round structure)
    roundQuestions = shuffleArray(roundQuestions.slice());
    currentIndex = 0;
    wrongTotal = 0;
    correctSinceLastWrong = 0;
    buildStreakBar();
    showQuestion();
  });

  shareBtn?.addEventListener("click", () => {
    const totalAnswered = roundIndex * ROUND_SIZE + currentIndex;
    const text = `I'm playing Brain ⚡ Bolt! Score: ${score}/${TOTAL_QUESTIONS} (Answered ${totalAnswered}/${TOTAL_QUESTIONS})`;
    if (navigator.share) {
      navigator.share({ title: "Brain ⚡ Bolt", text, url: location.href }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(`${text} - ${location.href}`);
    }
  });

  playAgainBtn?.addEventListener("click", () => {
    // Fresh reload from sheet
    startGame();
  });

  soundBtn?.addEventListener("click", () => {
    soundOn = !soundOn;
    if (soundBtn) soundBtn.textContent = soundOn ? "🔊" : "🔇";
  });

  // Boot UI state
  resetTopBar();
  buildStreakBar();
}
