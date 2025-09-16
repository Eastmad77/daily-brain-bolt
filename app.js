// ===== Brain ⚡ Bolt — App.js v3.4 =====

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

let questions = [], currentIndex = 0, score = 0, wrongStreak = 0, elapsed = 0;
let timerInterval = null, elapsedInterval = null;
let soundOn = true;

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
const timerBar = document.getElementById("timerBar");

const countdownOverlay = document.getElementById("countdownOverlay");
const countNum = document.getElementById("countNum");
const successSplash = document.getElementById("successSplash");
const gameOverBox = document.getElementById("gameOverBox");
const gameOverText = document.getElementById("gameOverText");

function beep() {
  if (!soundOn) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine"; osc.frequency.value = 600;
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
  osc.stop(ctx.currentTime + 0.3);
}
function vibrate(ms = 100) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

async function fetchCSV() {
  return new Promise((resolve, reject) => {
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      complete: (res) => resolve(res.data),
      error: (err) => reject(err)
    });
  });
}

async function startGame() {
  questions = await fetchCSV();
  shuffleArray(questions);
  currentIndex = 0; score = 0; wrongStreak = 0; elapsed = 0;
  pillScore.textContent = "Score 0"; pillStreak.textContent = "Streak 0";
  progressLabel.textContent = "Q 0/12";
  gameOverBox.style.display = "none"; playAgainBtn.style.display = "none";
  showCountdown();
}

function showCountdown() {
  let n = 3; countNum.textContent = n; countdownOverlay.hidden = false;
  const int = setInterval(() => {
    n--; countNum.textContent = n;
    if (n <= 0) {
      clearInterval(int);
      countdownOverlay.hidden = true;
      beginQuiz();
    } else { beep(); }
  }, 1000);
}

function beginQuiz() {
  elapsed = 0;
  elapsedInterval = setInterval(() => {
    elapsed++; elapsedTimeEl.textContent = formatTime(elapsed);
  }, 1000);
  showQuestion();
}

function showQuestion() {
  if (currentIndex >= 12) return endGame();
  const q = questions[currentIndex];
  qBox.textContent = q.Question;
  choicesDiv.innerHTML = "";
  ["OptionA","OptionB","OptionC","OptionD"].forEach((opt) => {
    const btn = document.createElement("button");
    btn.textContent = q[opt];
    btn.onclick = () => handleAnswer(btn, q.Answer);
    choicesDiv.appendChild(btn);
  });
  progressLabel.textContent = `Q ${currentIndex+1}/12`;
}

function handleAnswer(btn, correct) {
  if (btn.textContent === correct) {
    btn.classList.add("correct");
    score++; wrongStreak = 0;
    if (soundOn) beep();
  } else {
    btn.classList.add("incorrect");
    wrongStreak++;
    vibrate(200);
    if (wrongStreak >= 2) return endGame("Two wrong in a row!");
  }
  pillScore.textContent = `Score ${score}`;
  pillStreak.textContent = `Streak ${Math.max(0, score-wrongStreak)}`;
  setTimeout(() => {
    currentIndex++;
    if (currentIndex >= 12) endGame();
    else showQuestion();
  }, 800);
}

function endGame(msg = "") {
  clearInterval(elapsedInterval);
  if (msg) {
    gameOverText.textContent = msg;
    gameOverBox.style.display = "block";
    playAgainBtn.style.display = "inline-block";
    playAgainBtn.classList.add("pulse");
  } else {
    successSplash.hidden = false;
  }
}

function shuffleArray(arr) {
  for (let i = arr.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* Utils */
function formatTime(sec) {
  const m = Math.floor(sec/60); const s = sec%60;
  return `${m}:${s<10?"0":""}${s}`;
}

/* Event Listeners */
startBtn.onclick = startGame;
shuffleBtn.onclick = () => { shuffleArray(questions); showQuestion(); };
shareBtn.onclick = () => { navigator.share?.({ title:"Brain Bolt", text:`I scored ${score}/12!`, url:location.href }); };
playAgainBtn.onclick = startGame;
document.getElementById("ssPlayAgain").onclick = startGame;
document.getElementById("ssShareScore").onclick = () => { navigator.share?.({ title:"Brain Bolt", text:`I scored ${score}/12!`, url:location.href }); };
document.getElementById("soundBtn").onclick = () => {
  soundOn = !soundOn;
  document.getElementById("soundBtn").textContent = soundOn ? "🔊" : "🔇";
};
