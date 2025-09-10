// /app.js

// CSV Links
const LIVE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

// Elements
const elQ = document.getElementById('question');
const elOpts = document.getElementById('options');
const elProgText = document.getElementById('progressText');
const elProgFill = document.getElementById('progressFill');
const elScore = document.getElementById('score');
const elFB = document.getElementById('feedback');
const elToday = document.getElementById('today');
const elStart = document.getElementById('startBtn');
const elShuffle = document.getElementById('shuffleBtn');
const elShare = document.getElementById('shareBtn');
const elPlayAgain = document.getElementById('playAgain');
const elTimerBar = document.getElementById('timerBar');
const elElapsed = document.getElementById('elapsed');

const now = new Date();
const todayKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
elToday.textContent = todayKey;

// State
let allRows = [], todays = [], idx = 0, score = 0;
let wrongCount = 0;
let startTime, timerInterval, elapsedInterval, timerSeconds = 10;

// Helpers
const norm = s => String(s || '').trim();
function updateMeta() {
  elProgText.textContent = `${idx}/${todays.length || 0}`;
  elScore.textContent = score;
  const pct = (todays.length ? (idx / todays.length) : 0) * 100;
  elProgFill.style.width = `${pct}%`;
}
function startElapsed() {
  startTime = Date.now();
  elapsedInterval = setInterval(() => {
    const diff = Math.floor((Date.now() - startTime) / 1000);
    const m = String(Math.floor(diff / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    elElapsed.textContent = `${m}:${s}`;
  }, 1000);
}
function stopElapsed() {
  clearInterval(elapsedInterval);
}
function playSound(type) {
  if (type === 'correct') {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    osc.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.15);
  } else if (type === 'wrong' && navigator.vibrate) {
    navigator.vibrate(150);
  }
}
function startTimer(callback) {
  clearInterval(timerInterval);
  let time = timerSeconds;
  function tick() {
    const pct = ((timerSeconds - time) / timerSeconds) * 100;
    elTimerBar.style.setProperty('--tw', pct + '%');
    if (time <= 0) {
      clearInterval(timerInterval);
      callback();
    }
    time--;
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}
function stopTimer() {
  clearInterval(timerInterval);
  elTimerBar.style.setProperty('--tw', '0%');
}

// Load CSV
function loadCSV() {
  Papa.parse(LIVE_URL, {
    download: true,
    header: true,
    complete: ({ data }) => {
      const rows = (data || []).filter(r => r && r.Date && r.Question);
      if (!rows.length) {
        elQ.textContent = "No quiz rows found.";
        return;
      }
      todays = rows.filter(r => norm(r.Date) === todayKey);
      if (!todays.length) todays = rows.slice(0, 12);
      allRows = todays;
      resetAndStart();
    }
  });
}

// Flow
function resetAndStart() {
  idx = 0; score = 0; wrongCount = 0;
  updateMeta();
  showQuestion();
  startElapsed();
}
function showQuestion() {
  const q = todays[idx];
  if (!q) {
    elQ.textContent = "🎉 Done for today!";
    elOpts.innerHTML = '';
    elPlayAgain.style.display = 'inline-flex';
    stopTimer();
    stopElapsed();
    return;
  }
  elQ.textContent = q.Question;
  elOpts.innerHTML = '';
  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  opts.forEach((optText) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = optText;
    btn.onclick = () => handleChoice(btn, q, optText);
    elOpts.appendChild(btn);
  });
  startTimer(() => handleChoice(null, q, null));
}
function handleChoice(btn, q, val) {
  stopTimer();
  const correct = norm(val).toLowerCase() === norm(q.Answer).toLowerCase();
  document.querySelectorAll('.choice').forEach(b => {
    b.disabled = true;
    if (b.textContent === q.Answer) {
      if (correct) b.classList.add('result-correct');
    }
  });
  if (btn) {
    if (correct) {
      btn.classList.add('result-correct');
      playSound('correct');
      score++; idx++; wrongCount = 0;
      setTimeout(() => { updateMeta(); showQuestion(); }, 800);
    } else {
      btn.classList.add('result-wrong');
      playSound('wrong');
      wrongCount++;
      if (wrongCount >= 2) {
        elFB.textContent = "❌ Game Over";
        stopElapsed();
        elPlayAgain.style.display = 'inline-flex';
      } else {
        setTimeout(() => { showQuestion(); }, 1000);
      }
    }
  }
}

// Buttons
elStart.addEventListener('click', resetAndStart);
elShuffle.addEventListener('click', () => {
  todays = allRows.sort(() => Math.random() - 0.5).slice(0, 12);
  resetAndStart();
});
elShare.addEventListener('click', () => {
  if (navigator.share) {
    navigator.share({
      title: "The Daily BrainBolt",
      text: "Play today’s quiz now!",
      url: "https://dailybrainbolt.com/"
    });
  } else {
    alert("Copy link: https://dailybrainbolt.com/");
  }
});
elPlayAgain.addEventListener('click', resetAndStart);

// Init
loadCSV();
