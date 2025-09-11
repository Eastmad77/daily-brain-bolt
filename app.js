// /app.js

// === CSV URLs ===
const LIVE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

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

const muteBtn = document.getElementById('muteBtn');
const themeToggle = document.getElementById('themeToggle');

const now = new Date();
const todayKey = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
if (elToday) elToday.textContent = todayKey;

// State
let allRows = [], todays = [], idx = 0, score = 0, wrongCount = 0;
let startTime, elapsedInterval, timerInterval;
let timerSeconds = 10;
let muted = localStorage.getItem('bb_muted') === '1';
let theme = localStorage.getItem('bb_theme') || 'dark';
applyTheme(theme); updateMuteIcon();

// Splash: show briefly, then fade out + short vibration
document.addEventListener('DOMContentLoaded', () => {
  const s = document.getElementById('splash');
  if (!s) return;
  setTimeout(()=>{ try{navigator.vibrate && navigator.vibrate(50);}catch(e){} }, 450);
  setTimeout(()=>{ s.classList.add('fade-out'); }, 900);
  setTimeout(()=>{ s.remove(); }, 1700);
});

// Helpers
const norm = s => String(s||'').trim();

function updateMeta() {
  elProgText.textContent = `${idx}/${todays.length || 0}`;
  elScore.textContent = score;
  const pct = (todays.length ? (idx / todays.length) : 0) * 100;
  elProgFill.style.width = `${pct}%`;
}
function clearFB(){ elFB.textContent=''; }

function startElapsed() {
  startTime = Date.now();
  if (elapsedInterval) clearInterval(elapsedInterval);
  elElapsed.textContent = '00:00';
  elapsedInterval = setInterval(() => {
    const diff = Math.floor((Date.now() - startTime)/1000);
    const m = String(Math.floor(diff/60)).padStart(2,'0');
    const s = String(diff%60).padStart(2,'0');
    elElapsed.textContent = `${m}:${s}`;
  }, 1000);
}
function stopElapsed(){ clearInterval(elapsedInterval); }

function playSound(type) {
  if (muted) return;
  try{
    if (type === 'correct') {
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type='sine'; osc.frequency.value=520;
      gain.gain.value=0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'wrong' && navigator.vibrate) {
      navigator.vibrate(140);
    }
  }catch(e){}
}

function startTimer(onExpire) {
  if (!elTimerBar) return;
  stopTimer();
  const totalMs = timerSeconds * 1000;
  const step = 100;
  let elapsed = 0;
  elTimerBar.style.setProperty('--tw', '100%'); // right->left
  timerInterval = setInterval(() => {
    elapsed += step;
    let remain = Math.max(0, 1 - (elapsed/totalMs));
    elTimerBar.style.setProperty('--tw', (remain*100).toFixed(1) + '%');
    if (elapsed >= totalMs) { stopTimer(); onExpire(); }
  }, step);
}
function stopTimer(){ if (timerInterval) clearInterval(timerInterval); elTimerBar?.style.setProperty('--tw', '0%'); }

function loadCSV() {
  Papa.parse(LIVE_URL + "&cb=" + Date.now(), {
    download:true, header:true,
    complete: ({ data }) => {
      const rows = (data || []).filter(r => r && r.Question);
      if (!rows.length) { elQ.textContent = "No quiz rows found."; return; }
      let todaysRows = rows.filter(r => norm(r.Date) === todayKey);
      if (!todaysRows.length) todaysRows = rows.slice(0,12);
      todays = todaysRows;
      allRows = rows;
      elQ.textContent = "Ready";
      elOpts.innerHTML = '';
      elQ.classList.remove('gameover');
      clearFB(); updateMeta();
    },
    error: () => {
      elQ.textContent = "Error loading CSV.";
    }
  });
}

function resetSession() {
  idx=0; score=0; wrongCount=0;
  updateMeta(); clearFB();
  elPlayAgain.style.display='none';
  elPlayAgain.classList.remove('pulse','playagain');
  elQ.classList.remove('gameover');
  startElapsed();
}

function startSession() {
  if (!todays || todays.length===0) return;
  resetSession(); showQuestion();
}

function showQuestion() {
  clearFB();
  const q = todays[idx];
  if (!q) {
    elQ.classList.remove('gameover');
    elQ.textContent = "🎉 Done!";
    elOpts.innerHTML = '';
    stopTimer(); stopElapsed();
    elPlayAgain.style.display = 'inline-flex';
    elPlayAgain.classList.add('pulse','playagain');
    return;
  }
  elQ.classList.remove('gameover');
  elQ.textContent = q.Question || '—';
  elOpts.innerHTML = '';
  [q.OptionA,q.OptionB,q.OptionC,q.OptionD].filter(Boolean).forEach((optText) => {
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
  const isCorrect = (val != null) && (norm(val).toLowerCase() === norm(q.Answer).toLowerCase());
  document.querySelectorAll('.choice').forEach(b => b.classList.add('disabled'));
  if (btn) btn.classList.add(isCorrect ? 'result-correct' : 'result-wrong');

  if (isCorrect) {
    playSound('correct');
    score++; idx++; wrongCount=0;
    updateMeta();
    setTimeout(()=>showQuestion(), 800);
  } else {
    playSound('wrong');
    wrongCount++;
    if (wrongCount >= 2) {
      elQ.classList.add('gameover');
      elQ.textContent = "Game Over";
      stopElapsed();
      elPlayAgain.style.display = 'inline-flex';
      elPlayAgain.classList.add('pulse','playagain');
    } else {
      setTimeout(()=>showQuestion(), 900);
    }
  }
}

// Share/Buttons
elStart?.addEventListener('click', startSession);
elShuffle?.addEventListener('click', () => {
  if (!allRows || !allRows.length) return;
  todays = allRows.slice().sort(()=>Math.random()-0.5).slice(0,12);
  startSession();
});
elShare?.addEventListener('click', () => {
  if (navigator.share) {
    navigator.share({
      title: "BrainBolt",
      text: "Play today’s quiz now!",
      url: "https://dailybrainbolt.com/"
    }).catch(()=>{});
  } else {
    alert("Copy link: https://dailybrainbolt.com/");
  }
});
elPlayAgain?.addEventListener('click', startSession);

// Mute toggle
muteBtn?.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('bb_muted', muted ? '1' : '0');
  updateMuteIcon();
});
function updateMuteIcon(){
  if (!muteBtn) return;
  muteBtn.classList.toggle('active', muted);
  muteBtn.textContent = muted ? '🔇' : '🔊';
}

// Theme toggle
themeToggle?.addEventListener('click', () => {
  theme = (theme === 'dark') ? 'light' : 'dark';
  localStorage.setItem('bb_theme', theme);
  applyTheme(theme);
});
function applyTheme(t){
  if (t === 'light') document.body.setAttribute('data-theme','light');
  else document.body.removeAttribute('data-theme');
}

// Init
loadCSV();
