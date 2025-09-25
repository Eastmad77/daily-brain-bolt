// ===== Brain ⚡ Bolt — App.js v3.10.4 =====
// Changes vs v3.10.1:
// - Success splash has no buttons (handled in index.html); auto-returns Home after 5s
// - Proper "consecutive correct" streak; resets to 0 on any wrong/timeout
// - Everything else left as-is from your stable version

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const QUESTION_TIME_MS = 10000;   // 10 seconds
const QUESTION_TICK_MS = 100;     // smooth bar update (10Hz)

let questions = [], currentIndex = 0, score = 0;
let wrongStreak = 0;            // for "two wrong in a row" rule (unchanged)
let correctStreak = 0;          // NEW: real consecutive-correct streak
let elapsed = 0;
let elapsedInterval = null;
let qTimer = null, qRemaining = QUESTION_TIME_MS, qLastTickSec = 3;
let soundOn = true;
let successAutoNav = null;      // NEW: timer for auto-return to Home

/* Elements */
const startBtn = document.getElementById("startBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const shareBtn = document.getElementById("shareBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

const qBox = document.getElementById("questionBox");
const choicesDiv = document.getElementById("choices");
const pillScore = document.getElementById("pillScore");
const pillStreak = document.getElementById("pillStreak");
const progressLabel = document.getElementById("progressLabel");
const elapsedTimeEl = document.getElementById("elapsedTime");
const countdownOverlay = document.getElementById("countdownOverlay");
const countNum = document.getElementById("countNum");
const successSplash = document.getElementById("successSplash");
const gameOverBox = document.getElementById("gameOverBox");
const gameOverText = document.getElementById("gameOverText");
const timerBar = document.getElementById("timerBar");
const qTimerBar = document.getElementById("qTimerBar");
const soundBtn = document.getElementById("soundBtn");
const setLabel = document.getElementById("setLabel");

/* ===== Splash control (robust) ===== */
function killStartSplash() {
  const s = document.getElementById('startSplash');
  if (!s || s.dataset.dismissed === '1') return;
  s.dataset.dismissed = '1';
  s.classList.add('hiding');
  setTimeout(()=> s.remove(), 420);
}
document.addEventListener('DOMContentLoaded', () => setTimeout(killStartSplash, 900));
window.addEventListener('load', () => setTimeout(killStartSplash, 900));
setTimeout(killStartSplash, 4000);

/* ===== Audio + haptics ===== */
function beep(freq=600, dur=0.25) {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = freq;
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.value = 0.25;
    const t0 = ctx.currentTime;
    osc.start(t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.stop(t0 + dur + 0.02);
  } catch {}
}
const beepTick = () => beep(620, 0.22);
const beepGo   = () => beep(950, 0.28);
const sfxCorrect   = () => beep(1020, 0.18);
const sfxIncorrect = () => beep(220, 0.2);
const tickSoft     = () => beep(740, 0.08);
function vibrate(ms=100){ if (navigator.vibrate) navigator.vibrate(ms); }

/* ===== CSV ===== */
function fetchCSV(){
  return new Promise((resolve, reject) => {
    Papa.parse(CSV_URL, {
      download:true, header:true, skipEmptyLines:true,
      complete:(res)=>resolve(res.data),
      error:(err)=>reject(err)
    });
  });
}

/* ===== Utils ===== */
function formatTime(sec){ const m=Math.floor(sec/60), s=sec%60; return `${m}:${s<10?'0':''}${s}`; }
function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* ===== Question timer (10s with final-3s ticks) ===== */
function startQuestionTimer(onTimeout) {
  stopQuestionTimer();
  qRemaining = QUESTION_TIME_MS;
  qLastTickSec = 3;
  qTimerBar.classList.remove('warn');
  qTimerBar.style.width = '100%';

  qTimer = setInterval(() => {
    qRemaining -= QUESTION_TICK_MS;
    const pct = Math.max(0, qRemaining / QUESTION_TIME_MS) * 100;
    qTimerBar.style.width = pct + '%';

    const secsLeft = Math.ceil(qRemaining / 1000);
    if (qRemaining <= 3000) {
      qTimerBar.classList.add('warn');
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
  if (qTimer) { clearInterval(qTimer); qTimer = null; }
}

/* ===== Game flow ===== */
async function startGame() {
  clearTimeout(successAutoNav);
  try {
    successSplash.classList.remove('show'); // ensure hidden
    setLabel && (setLabel.textContent = 'Loading…');

    const data = await fetchCSV();
    questions = shuffleArray(data).slice(0,12);
    currentIndex = 0; score = 0; wrongStreak = 0; correctStreak = 0; elapsed = 0;

    pillScore.textContent = "Score 0";
    pillStreak.textContent = "Streak 0";
    progressLabel.textContent = "Q 0/12";
    gameOverBox.style.display = "none";
    playAgainBtn.style.display = "none";
    playAgainBtn.classList.remove("pulse");
    setLabel && (setLabel.textContent = 'Ready');

    // 3→2→1→GO circular countdown (blue circle)
    let n = 3;
    countNum.textContent = n;
    countdownOverlay.hidden = false;

    const int = setInterval(() => {
      n--;
      if (n > 0) {
        countNum.textContent = n;
        countNum.style.animation = "none"; void countNum.offsetWidth; countNum.style.animation = "popIn .4s ease";
        beepTick();
      } else {
        clearInterval(int);
        countNum.textContent = "GO";
        countNum.style.animation = "none"; void countNum.offsetWidth; countNum.style.animation = "popIn .4s ease";
        beepGo();
        setTimeout(()=>{ countdownOverlay.hidden = true; beginQuiz(); }, 380);
      }
    }, 700);
  } catch (e) {
    qBox.textContent = "Could not load today’s quiz. Please try again.";
    setLabel && (setLabel.textContent = 'Error');
    console.error(e);
  }
}

function beginQuiz() {
  elapsed = 0;
  elapsedTimeEl.textContent = "0:00";
  timerBar.style.width = "0%";
  clearInterval(elapsedInterval);
  elapsedInterval = setInterval(()=>{
    elapsed++;
    elapsedTimeEl.textContent = formatTime(elapsed);
    const pct = Math.min(100, (elapsed/300)*100); // 5 min = full
    timerBar.style.width = pct + "%";
  },1000);
  showQuestion();
}

function showQuestion() {
  if (currentIndex >= 12) return endGame();

  const q = questions[currentIndex];
  qBox.textContent = q?.Question || "—";
  choicesDiv.innerHTML = "";
  ["OptionA","OptionB","OptionC","OptionD"].forEach((k)=>{
    const val = q[k]; if(!val) return;
    const b = document.createElement("button");
    b.textContent = String(val);
    b.onclick = () => handleAnswer(b, q.Answer);
    choicesDiv.appendChild(b);
  });
  progressLabel.textContent = `Q ${currentIndex+1}/12`;

  startQuestionTimer(() => handleTimeout());
}

function handleTimeout() {
  sfxIncorrect(); vibrate(160);
  wrongStreak++;
  correctStreak = 0; // reset streak on timeout
  pillStreak.textContent = `Streak ${correctStreak}`;

  if (wrongStreak >= 2) { endGame("Two wrong in a row!"); return; }

  currentIndex++;
  if (currentIndex >= 12) endGame();
  else showQuestion();
}

function handleAnswer(btn, correctText) {
  stopQuestionTimer();
  [...choicesDiv.querySelectorAll("button")].forEach(b=>b.disabled=true);

  const isCorrect = (btn.textContent||"").trim().toLowerCase() === String(correctText||"").trim().toLowerCase();

  if (isCorrect) {
    btn.classList.add("correct");
    sfxCorrect(); vibrate(60);
    score++;
    wrongStreak = 0;
    correctStreak++; // increment consecutive-correct
  } else {
    btn.classList.add("incorrect");
    sfxIncorrect(); vibrate(160);
    wrongStreak++;
    correctStreak = 0; // reset streak on any wrong
  }

  pillScore.textContent = `Score ${score}`;
  pillStreak.textContent = `Streak ${correctStreak}`;

  if (wrongStreak >= 2) { setTimeout(()=>endGame("Two wrong in a row!"), 700); return; }

  setTimeout(()=>{
    currentIndex++;
    if (currentIndex >= 12) endGame();
    else showQuestion();
  }, 800);
}

function endGame(msg="") {
  clearInterval(elapsedInterval);
  stopQuestionTimer();

  if (msg) {
    gameOverText.textContent = msg;
    gameOverBox.style.display = "block";
    playAgainBtn.style.display = "inline-block";
    playAgainBtn.classList.add("pulse");
  } else {
    // Success path: show splash briefly, then auto-return Home
    countdownOverlay && (countdownOverlay.hidden = true);
    successSplash.removeAttribute('aria-hidden');
    successSplash.classList.remove('show'); // restart anim if needed
    void successSplash.offsetWidth;         // reflow
    successSplash.classList.add('show');

    clearTimeout(successAutoNav);
    successAutoNav = setTimeout(() => {
      window.location.href = "/";
    }, 5000); // 5s auto-return
  }
}

/* ===== Wire UI ===== */
startBtn?.addEventListener("click", startGame);
shuffleBtn?.addEventListener("click", ()=>{
  shuffleArray(questions);
  currentIndex=0;
  wrongStreak=0;
  correctStreak=0;
  pillStreak.textContent = `Streak ${correctStreak}`;
  showQuestion();
});
shareBtn?.addEventListener("click", ()=>{
  const text = `I'm playing Brain ⚡ Bolt! Current score: ${score}/12`;
  if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
  else navigator.clipboard?.writeText(`${text} - ${location.href}`);
});
playAgainBtn?.addEventListener("click", startGame);

// Note: success splash no longer has buttons; no listeners needed
soundBtn?.addEventListener("click", ()=>{
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? "🔊" : "🔇";
});
