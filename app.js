// Brain ⚡ Bolt — App v3.11
// - Countdown uses .show class (no hidden attr) so blue circle always renders
// - Timers fully wired (overall green bar + 10s per-question bar)
// - Success splash/buttons stable

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const QUESTION_TIME_MS = 10000;   // 10s
const QUESTION_TICK_MS = 100;     // smooth updates

let questions = [], currentIndex = 0, score = 0, wrongStreak = 0, elapsed = 0;
let elapsedInterval = null;
let qTimer = null, qRemaining = QUESTION_TIME_MS, qLastTickSec = 3;
let soundOn = true;

/* Elements */
const $ = (id) => document.getElementById(id);
const startBtn = $("startBtn");
const shuffleBtn = $("shuffleBtn");
const shareBtn = $("shareBtn");
const playAgainBtn = $("playAgainBtn");

const qBox = $("questionBox");
const choicesDiv = $("choices");
const pillScore = $("pillScore");
const pillStreak = $("pillStreak");
const progressLabel = $("progressLabel");
const elapsedTimeEl = $("elapsedTime");
const countdownOverlay = $("countdownOverlay");
const countNum = $("countNum");
const successSplash = $("successSplash");
const gameOverBox = $("gameOverBox");
const gameOverText = $("gameOverText");
const timerBar = $("timerBar");
const qTimerBar = $("qTimerBar");
const soundBtn = $("soundBtn");
const setLabel = $("setLabel");

/* ===== Startup Splash ===== */
function killStartSplash() {
  const s = $("startSplash");
  if (!s) return;
  s.classList.add("hiding");
  setTimeout(() => s.remove(), 420);
}
window.addEventListener("load", () => setTimeout(killStartSplash, 1100));

/* ===== Audio (simple + safe) ===== */
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
const beepTick = () => beep(620, 0.20);
const beepGo   = () => beep(950, 0.22);
const sfxCorrect   = () => beep(1020, 0.18);
const sfxIncorrect = () => beep(220, 0.20);
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
function fmt(sec){ const m=Math.floor(sec/60), s=sec%60; return `${m}:${s<10?'0':''}${s}`; }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j]]; } return a; }

/* ===== 10s per-question timer ===== */
function startQuestionTimer(onTimeout) {
  stopQuestionTimer();
  if (!qTimerBar) return;

  qRemaining = QUESTION_TIME_MS;
  qLastTickSec = 3;
  qTimerBar.classList.remove("warn");
  qTimerBar.style.width = "100%";

  qTimer = setInterval(() => {
    qRemaining -= QUESTION_TICK_MS;
    const pct = Math.max(0, qRemaining / QUESTION_TIME_MS) * 100;
    qTimerBar.style.width = pct + "%";

    const secsLeft = Math.ceil(qRemaining / 1000);
    if (qRemaining <= 3000) {
      qTimerBar.classList.add("warn");
      if (secsLeft > 0 && secsLeft < qLastTickSec + 1) {
        beepTick();
        qLastTickSec = secsLeft;
      }
    }

    if (qRemaining <= 0) {
      stopQuestionTimer();
      onTimeout && onTimeout();
    }
  }, QUESTION_TICK_MS);
}
function stopQuestionTimer(){ if (qTimer){ clearInterval(qTimer); qTimer = null; } }

/* ===== Game flow ===== */
async function startGame() {
  try {
    // Hide success overlay if it was shown
    successSplash?.classList.remove("show");
    setLabel && (setLabel.textContent = "Loading…");

    const data = await fetchCSV();
    questions = shuffle(data).slice(0,12);
    currentIndex = 0; score = 0; wrongStreak = 0; elapsed = 0;

    pillScore && (pillScore.textContent = "Score 0");
    pillStreak && (pillStreak.textContent = "Streak 0");
    progressLabel && (progressLabel.textContent = "Q 0/12");
    gameOverBox && (gameOverBox.style.display = "none");
    playAgainBtn && (playAgainBtn.style.display = "none");
    playAgainBtn && playAgainBtn.classList.remove("pulse");
    setLabel && (setLabel.textContent = "Ready");

    // Countdown — use class .show (no hidden attr)
    let n = 3;
    if (countdownOverlay && countNum) {
      countNum.textContent = n;
      countdownOverlay.classList.add("show");
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
          setTimeout(() => {
            countdownOverlay.classList.remove("show");
            beginQuiz();
          }, 380);
        }
      }, 700);
    } else {
      beginQuiz();
    }
  } catch (e) {
    qBox && (qBox.textContent = "Could not load today’s quiz. Please try again.");
    setLabel && (setLabel.textContent = "Error");
    console.error(e);
  }
}

function beginQuiz(){
  elapsed = 0;
  elapsedTimeEl && (elapsedTimeEl.textContent = "0:00");
  timerBar && (timerBar.style.width = "0%");
  clearInterval(elapsedInterval);
  elapsedInterval = setInterval(() => {
    elapsed++;
    elapsedTimeEl && (elapsedTimeEl.textContent = fmt(elapsed));
    if (timerBar){
      const pct = Math.min(100, (elapsed/300)*100); // 5 min = full
      timerBar.style.width = pct + "%";
    }
  }, 1000);
  showQuestion();
}

function showQuestion(){
  if (currentIndex >= 12) return endGame();
  const q = questions[currentIndex];
  qBox && (qBox.textContent = q?.Question || "—");
  if (choicesDiv) choicesDiv.innerHTML = "";
  ["OptionA","OptionB","OptionC","OptionD"].forEach(k=>{
    const val = q?.[k]; if(!val || !choicesDiv) return;
    const b = document.createElement("button");
    b.textContent = String(val);
    b.addEventListener("click", ()=> handleAnswer(b, q.Answer));
    choicesDiv.appendChild(b);
  });
  progressLabel && (progressLabel.textContent = `Q ${currentIndex+1}/12`);
  startQuestionTimer(()=> handleTimeout());
}

function handleTimeout(){
  sfxIncorrect(); vibrate(160);
  wrongStreak++;
  pillStreak && (pillStreak.textContent = `Streak ${Math.max(0, score - wrongStreak)}`);
  if (wrongStreak >= 2) { endGame("Two wrong in a row!"); return; }
  currentIndex++; (currentIndex >= 12) ? endGame() : showQuestion();
}

function handleAnswer(btn, correctText){
  stopQuestionTimer();
  if (choicesDiv) [...choicesDiv.querySelectorAll("button")].forEach(b=>b.disabled=true);

  const isCorrect = (btn.textContent||"").trim().toLowerCase() === String(correctText||"").trim().toLowerCase();
  if (isCorrect){ btn.classList.add("correct"); sfxCorrect(); vibrate(60); score++; wrongStreak=0; }
  else{ btn.classList.add("incorrect"); sfxIncorrect(); vibrate(160); wrongStreak++; }

  pillScore && (pillScore.textContent = `Score ${score}`);
  pillStreak && (pillStreak.textContent = `Streak ${Math.max(0, score - wrongStreak)}`);

  if (wrongStreak >= 2) { setTimeout(()=>endGame("Two wrong in a row!"), 700); return; }
  setTimeout(()=>{ currentIndex++; (currentIndex >= 12) ? endGame() : showQuestion(); }, 800);
}

function endGame(msg=""){
  clearInterval(elapsedInterval);
  stopQuestionTimer();
  if (msg){
    gameOverText && (gameOverText.textContent = msg);
    gameOverBox && (gameOverBox.style.display = "block");
    playAgainBtn && (playAgainBtn.style.display = "inline-block");
    playAgainBtn && playAgainBtn.classList.add("pulse");
  } else {
    // success
    successSplash?.classList.remove("show");
    void successSplash?.offsetWidth;
    successSplash?.classList.add("show");
  }
}

/* ===== Wire UI ===== */
startBtn?.addEventListener("click", startGame);
shuffleBtn?.addEventListener("click", ()=>{ shuffle(questions); currentIndex=0; wrongStreak=0; showQuestion(); });
shareBtn?.addEventListener("click", ()=>{
  const text = `I'm playing Brain ⚡ Bolt! Current score: ${score}/12`;
  if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
  else navigator.clipboard?.writeText(`${text} - ${location.href}`);
});
playAgainBtn?.addEventListener("click", startGame);

/* Success overlay buttons */
$("ssPlayAgain")?.addEventListener("click", (e)=>{ e.preventDefault(); successSplash?.classList.remove("show"); startGame(); });
$("ssShareScore")?.addEventListener("click", (e)=>{
  e.preventDefault();
  const text = `I scored ${score}/12 on today’s Brain ⚡ Bolt!`;
  if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
  else navigator.clipboard?.writeText(`${text} - ${location.href}`);
});

/* Sound toggle */
soundBtn?.addEventListener("click", ()=>{ soundOn=!soundOn; soundBtn.textContent = soundOn ? "🔊" : "🔇"; });
