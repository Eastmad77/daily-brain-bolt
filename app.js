// ===== Brain ⚡ Bolt — App.js v3.10.2 =====

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const QUESTION_TIME_MS = 10000;
const QUESTION_TICK_MS = 100;

let questions = [], currentIndex = 0, score = 0, wrongStreak = 0, elapsed = 0;
let elapsedInterval = null;
let qTimer = null, qRemaining = QUESTION_TIME_MS, qLastTickSec = 3;
let soundOn = true;

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

/* ===== Splash Control ===== */
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

/* ===== Utils (beep/vibrate/CSV/etc.) ===== */
// (keep your existing beep/timer/shuffle helpers here unchanged)

/* ===== Game Flow ===== */
// (keep startGame, beginQuiz, showQuestion, handleTimeout, handleAnswer unchanged)

function endGame(msg="") {
  clearInterval(elapsedInterval);
  if (qTimer) { clearInterval(qTimer); qTimer = null; }

  if (msg) {
    gameOverText.textContent = msg;
    gameOverBox.style.display = "block";
    playAgainBtn.style.display = "inline-block";
    playAgainBtn.classList.add("pulse");
  } else {
    countdownOverlay && (countdownOverlay.hidden = true);
    successSplash.removeAttribute('aria-hidden');
    successSplash.classList.remove('show');
    void successSplash.offsetWidth;
    successSplash.classList.add('show');
  }
}

/* ===== Wire UI ===== */
startBtn?.addEventListener("click", startGame);
shuffleBtn?.addEventListener("click", ()=>{ /* … */ });
shareBtn?.addEventListener("click", ()=>{ /* … */ });
playAgainBtn?.addEventListener("click", startGame);

/* Success Overlay Buttons */
document.getElementById("ssPlayAgain")?.addEventListener("click", (e)=>{
  e.preventDefault();
  successSplash.classList.remove('show');
  startGame();
});
document.getElementById("ssShareScore")?.addEventListener("click", (e)=>{
  e.preventDefault();
  const text = `I scored ${score}/12 on today’s Brain ⚡ Bolt!`;
  if (navigator.share) {
    navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
  } else {
    navigator.clipboard?.writeText(`${text} - ${location.href}`);
  }
});
/* NEW: Home button defensive handler */
document.getElementById("ssHomeBtn")?.addEventListener("click", (e)=>{
  e.preventDefault();
  successSplash.classList.remove('show');
  window.location.href = "/";
});

soundBtn?.addEventListener("click", ()=>{
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? "🔊" : "🔇";
});
