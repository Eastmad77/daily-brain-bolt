/* ===============================================
   Brain ⚡ Bolt — App Script
   =============================================== */

/** ==== CONFIG — paste your CSV URLs here ==== */
const LIVE_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735"; // live
const BANK_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011"; // bank fallback

/** Settings */
const QUESTION_TIME_SEC = 10; // timer per question
const COUNTDOWN_SEC = 3;      // countdown before start
const AUTO_RETRY_ONCE = true; // one auto-retry on first incorrect
let SOUND_ON = true;

/** DOM hooks */
const dateLabel   = document.getElementById('dateLabel');
const setLabel    = document.getElementById('setLabel');
const countdownEl = document.getElementById('countdown');
const timerBar    = document.getElementById('timerBar');
const elapsedEl   = document.getElementById('elapsedTime');
const qBox        = document.getElementById('questionBox');
const choicesEl   = document.getElementById('choices');
const gameOverBox = document.getElementById('gameOverBox');

const startBtn    = document.getElementById('startBtn');
const shuffleBtn  = document.getElementById('shuffleBtn');
const shareBtn    = document.getElementById('shareBtn');
const themeBtn    = document.getElementById('themeBtn');
const playAgainBtn= document.getElementById('playAgainBtn');

/** State */
let allRows = [];
let todays = [];
let idx = 0;
let score = 0;
let incorrectStreak = 0;
let questionStartMs = 0;
let elapsedTimer = null;
let questionTimer = null;

/* ============================
   Utilities
   ============================ */
const todayKey = (() => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
})();

function beep(freq = 660, duration = 130, volume = 0.06) {
  if (!SOUND_ON) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(volume, ctx.currentTime);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + duration/1000);
  } catch (e) { /* audio unsupported */ }
}
function vibrate(ms = 60) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

/** Lightweight CSV parser (supports quoted fields) */
function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field=''; }
      else if (c === '\r') { /* ignore */ }
      else field += c;
    }
    i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function csvToObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, i) => obj[h] = (r[i] ?? '').trim());
    return obj;
  });
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

/* ============================
   Data Loading
   ============================ */
async function loadCSV(url) {
  const res = await fetch(url + '&cb=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP '+res.status);
  const text = await res.text();
  return csvToObjects(text);
}
async function loadData() {
  dateLabel.textContent = todayKey;
  setLabel.textContent = "Ready";
  qBox.textContent = "Press Start Quiz";
  choicesEl.innerHTML = "";

  try {
    let rows = await loadCSV(LIVE_CSV);
    if (!rows.length) throw new Error('Live empty');
    allRows = rows;
  } catch(e) {
    try {
      let rows = await loadCSV(BANK_CSV);
      allRows = rows;
    } catch(e2) {
      qBox.textContent = "Couldn’t load questions. Check sheet publish settings.";
      return;
    }
  }

  // Filter rows for today if Date column provided; else take first 12
  todays = allRows.filter(r => (r.Date||'') === todayKey);
  if (!todays.length) todays = allRows.slice(0, 12);

  // Ensure each has fields
  todays = todays.map(r => ({
    Question: r.Question || '',
    OptionA: r.OptionA || '',
    OptionB: r.OptionB || '',
    OptionC: r.OptionC || '',
    OptionD: r.OptionD || '',
    Answer:  r.Answer  || '',
    Explanation: r.Explanation || '',
    Category: r.Category || 'Quiz',
    Difficulty: r.Difficulty || '—'
  }));
}

/* ============================
   UI helpers
   ============================ */
function clearTimers() {
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
  if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
}
function resetUI() {
  clearTimers();
  idx = 0; score = 0; incorrectStreak = 0;
  qBox.textContent = "Press Start Quiz";
  gameOverBox.style.display = "none";
  playAgainBtn.style.display = "none";
  timerBar.style.width = "100%";
  elapsedEl.textContent = "0s";
  choicesEl.innerHTML = "";
}
function renderQuestion() {
  const q = todays[idx];
  if (!q) {
    qBox.textContent = "Nice! Done for today.";
    playAgainBtn.style.display = "block";
    return;
  }
  setLabel.textContent = `${q.Difficulty} • ${q.Category}`;
  qBox.textContent = q.Question;
  choicesEl.innerHTML = "";

  const options = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  options.forEach(opt => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.textContent = opt;
    b.onclick = () => onSelect(b, opt, q);
    choicesEl.appendChild(b);
  });

  startTimersForQuestion();
}
function disableChoices() {
  [...document.querySelectorAll('.choice')].forEach(b => b.classList.add('disabled'));
}

/* ============================
   Timer & Countdown
   ============================ */
function startTimersForQuestion() {
  // Smooth step update using interval drives width (10s)
  const total = QUESTION_TIME_SEC;
  questionStartMs = performance.now();
  let elapsedS = 0;

  // Reset bar to full, then step down
  timerBar.style.width = "100%";
  if (elapsedTimer) clearInterval(elapsedTimer);

  elapsedTimer = setInterval(() => {
    elapsedS = Math.min(total, (performance.now() - questionStartMs)/1000);
    const remainingPct = Math.max(0, (1 - elapsedS/total)) * 100;
    timerBar.style.width = `${remainingPct}%`;
    elapsedEl.textContent = `${Math.floor((performance.now() - sessionStartMs)/1000)}s`;
    if (elapsedS >= total) {
      clearInterval(elapsedTimer);
      handleTimeUp();
    }
  }, 100);
}

let sessionStartMs = 0;
function startCountdownThenQuiz() {
  let n = COUNTDOWN_SEC;
  countdownEl.style.display = "block";
  countdownEl.textContent = n;
  const t = setInterval(() => {
    beep(520, 110, 0.07);
    n--;
    if (n <= 0) {
      clearInterval(t);
      countdownEl.style.display = "none";
      sessionStartMs = performance.now();
      renderQuestion();
    } else {
      countdownEl.textContent = n;
    }
  }, 1000);
}

/* ============================
   Answer handling
   ============================ */
function onSelect(btn, val, q) {
  if (btn.classList.contains('disabled')) return;
  [...document.querySelectorAll('.choice')].forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  // Auto check after short delay
  setTimeout(() => {
    const isCorrect = (val||'').trim().toLowerCase() === (q.Answer||'').trim().toLowerCase();
    if (isCorrect) {
      btn.classList.add('correct');
      beep(780, 120, 0.08);
      incorrectStreak = 0;
      idx++;
      setTimeout(() => { renderQuestion(); }, 600);
    } else {
      btn.classList.add('incorrect');
      vibrate(80);
      if (AUTO_RETRY_ONCE && incorrectStreak === 0) {
        incorrectStreak = 1;
        // restart same question
        setTimeout(() => { renderQuestion(); }, 700);
      } else {
        incorrectStreak = 2;
        endGame();
      }
    }
  }, 250);
}

function handleTimeUp() {
  // Treat as incorrect path
  vibrate(80);
  if (AUTO_RETRY_ONCE && incorrectStreak === 0) {
    incorrectStreak = 1;
    renderQuestion(); // restart same
  } else {
    incorrectStreak = 2;
    endGame();
  }
}

function endGame() {
  clearTimers();
  disableChoices();
  gameOverBox.style.display = "block";
  playAgainBtn.style.display = "block";
  playAgainBtn.classList.add('pulse');
}

/* ============================
   Button wiring
   ============================ */
startBtn?.addEventListener('click', async () => {
  // Make sure we have data
  if (!allRows.length) await loadData();
  if (!todays.length) {
    qBox.textContent = "No quiz rows found.";
    return;
  }
  // Reset then countdown
  idx = 0; score = 0; incorrectStreak = 0;
  gameOverBox.style.display = "none";
  playAgainBtn.style.display = "none";
  choicesEl.innerHTML = "";
  elapsedEl.textContent = "0s";
  timerBar.style.width = "100%";
  setLabel.textContent = "Ready";
  startCountdownThenQuiz();
});

shuffleBtn?.addEventListener('click', () => {
  if (!todays.length) return;
  todays = shuffle(todays);
  idx = 0; incorrectStreak = 0; gameOverBox.style.display = "none"; playAgainBtn.style.display = "none";
  renderQuestion();
});

playAgainBtn?.addEventListener('click', () => {
  playAgainBtn.classList.remove('pulse');
  idx = 0; score = 0; incorrectStreak = 0;
  gameOverBox.style.display = "none";
  renderQuestion();
});

shareBtn?.addEventListener('click', async () => {
  const url = location.href;
  const title = "Brain ⚡ Bolt";
  const text = "Daily trivia, riddles & logic challenges. Join me!";
  try {
    if (navigator.share) await navigator.share({ title, text, url });
    else {
      await navigator.clipboard.writeText(url);
      alert("Link copied!");
    }
  } catch { /* canceled */ }
});

themeBtn?.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
});

document.getElementById('soundBtn')?.addEventListener('click', () => {
  SOUND_ON = !SOUND_ON;
});

/* Menu auto-hide (index has its own minimal handler too) */
const mmMenuBtn = document.getElementById('mmMenuBtn');
const mmSideMenu = document.getElementById('mmSideMenu');
mmMenuBtn?.addEventListener('click', () => {
  mmSideMenu?.classList.add('open');
  setTimeout(() => mmSideMenu?.classList.remove('open'), 5000);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') mmSideMenu?.classList.remove('open'); });

/* ============================
   Startup
   ============================ */
window.addEventListener('DOMContentLoaded', async () => {
  dateLabel.textContent = todayKey;
  setLabel.textContent = "Ready";
  qBox.textContent = "Press Start Quiz";
  try { await loadData(); } catch {}
});
