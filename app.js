// ===== Brain ⚡ Bolt — App.js v3.5 (splash animation + success match) =====

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

let questions = [], currentIndex = 0, score = 0, wrongStreak = 0, elapsed = 0;
let elapsedInterval = null;
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
const countdownOverlay = document.getElementById("countdownOverlay");
const countNum = document.getElementById("countNum");
const successSplash = document.getElementById("successSplash");
const gameOverBox = document.getElementById("gameOverBox");
const gameOverText = document.getElementById("gameOverText");
const timerBar = document.getElementById("timerBar");
const soundBtn = document.getElementById("soundBtn");
const setLabel = document.getElementById("setLabel");

/* ===== Splash control ===== */
function killStartSplash() {
  const s = document.getElementById('startSplash');
  if (!s) return;
  s.classList.add('hiding');
  setTimeout(()=> s.remove(), 420);
}
// delay slightly so the animation plays
window.addEventListener('load', () => setTimeout(killStartSplash, 1300));

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
const beepGo = () => beep(950, 0.28);
const sfxCorrect = () => beep(1020, 0.18);
const sfxIncorrect = () => beep(220, 0.2);
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

/* ===== Game flow ===== */
async function startGame() {
  try {
    successSplash.classList.remove('show'); // ensure hidden
    setLabel && (setLabel.textContent = 'Loading…');

    const data = await fetchCSV();
    questions = shuffleArray(data).slice(0,12);
    currentIndex = 0; score = 0; wrongStreak = 0; elapsed = 0;

    pillScore.textContent = "Score 0";
    pillStreak.textContent = "Streak 0";
    progressLabel.textContent = "Q 0/12";
    gameOverBox.style.display = "none";
    playAgainBtn.style.display = "none";
    playAgainBtn.classList.remove("pulse");
    setLabel && (setLabel.textContent = 'Ready');

    // countdown
    let n = 3; countNum.textContent = n; countdownOverlay.hidden = false;
    const int = setInterval(() => {
      n--;
      if (n > 0) { countNum.textContent = n; beepTick(); }
      else {
        clearInterval(int);
        countNum.textContent = "GO";
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
    const pct = Math.min(100, (elapsed/300)*100);
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
}

function handleAnswer(btn, correctText) {
  [...choicesDiv.querySelectorAll("button")].forEach(b=>b.disabled=true);
  const isCorrect = (btn.textContent||"").trim().toLowerCase() === String(correctText||"").trim().toLowerCase();

  if (isCorrect) { btn.classList.add("correct"); sfxCorrect(); vibrate(60); score++; wrongStreak=0; }
  else { btn.classList.add("incorrect"); sfxIncorrect(); vibrate(160); wrongStreak++; }

  pillScore.textContent = `Score ${score}`;
  pillStreak.textContent = `Streak ${Math.max(0, score - wrongStreak)}`;

  if (wrongStreak >= 2) { setTimeout(()=>endGame("Two wrong in a row!"), 700); return; }

  setTimeout(()=>{
    currentIndex++;
    if (currentIndex >= 12) endGame();
    else showQuestion();
  }, 800);
}

function endGame(msg="") {
  clearInterval(elapsedInterval);
  if (msg) {
    gameOverText.textContent = msg;
    gameOverBox.style.display = "block";
    playAgainBtn.style.display = "inline-block";
    playAgainBtn.classList.add("pulse");
  } else {
    // trigger success splash with same animation palette
    successSplash.setAttribute('aria-hidden', 'false');
    successSplash.classList.remove('show'); // restart
    // force reflow
    void successSplash.offsetWidth;
    successSplash.classList.add('show');
  }
}

/* ===== Wire UI ===== */
startBtn?.addEventListener("click", startGame);
shuffleBtn?.addEventListener("click", ()=>{ shuffleArray(questions); currentIndex=0; wrongStreak=0; showQuestion(); });
shareBtn?.addEventListener("click", ()=>{
  const text = `I'm playing Brain ⚡ Bolt! Current score: ${score}/12`;
  if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
  else navigator.clipboard?.writeText(`${text} - ${location.href}`);
});
playAgainBtn?.addEventListener("click", startGame);
document.getElementById("ssPlayAgain")?.addEventListener("click", (e)=>{e.preventDefault(); successSplash.classList.remove('show'); startGame();});
document.getElementById("ssShareScore")?.addEventListener("click", (e)=>{
  e.preventDefault();
  const text = `I scored ${score}/12 on today’s Brain ⚡ Bolt!`;
  if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
  else navigator.clipboard?.writeText(`${text} - ${location.href}`);
});
document.getElementById("soundBtn")?.addEventListener("click", ()=>{
  soundOn = !soundOn;
  document.getElementById("soundBtn").textContent = soundOn ? "🔊" : "🔇";
});
