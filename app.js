/* Brain ⚡ Bolt — main app */

// =========================
// CONFIG (edit these if needed)
// =========================
const LIVE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

const QUIZ_SECONDS = 10;                // timer per question
const COUNTDOWN_SECONDS = 3;            // visible countdown before first question
const SHOW_CORRECT_TEXT = false;        // we color outline only; no "Correct!" text panel
const AUTO_GAMEOVER_ON_TWO_WRONG = true;

// Theme state (light/dark toggle)
let currentTheme = 'dark';

// Sound / haptics state
let soundOn = true;

// =========================
// ELEMENTS
// =========================
const elDate = document.getElementById('dateLabel');
const elSet = document.getElementById('setLabel');
const elCountdown = document.getElementById('countdown');
const elTimerWrap = document.getElementById('timerWrapper');
const elTimerBar = document.getElementById('timerBar');
const elElapsed = document.getElementById('elapsedTime');
const elQ = document.getElementById('questionBox');
const elChoices = document.getElementById('choices');
const elGameOver = document.getElementById('gameOverBox');
const btnStart = document.getElementById('startBtn');
const btnShuffle = document.getElementById('shuffleBtn');
const btnShare = document.getElementById('shareBtn');
const btnTheme = document.getElementById('themeBtn');
const btnAgain = document.getElementById('playAgainBtn');
const btnMenu = document.getElementById('mmMenuBtn');
const btnSound = document.getElementById('soundBtn');
const sideMenu = document.getElementById('mmSideMenu');

const today = new Date();
elDate.textContent = today.toISOString().slice(0,10);

// Splash menu open/close
let menuAutoHideTO = null;
btnMenu?.addEventListener('click', () => {
  sideMenu?.classList.add('open');
  sideMenu?.setAttribute('aria-hidden', 'false');
  if (menuAutoHideTO) clearTimeout(menuAutoHideTO);
  menuAutoHideTO = setTimeout(() => {
    sideMenu?.classList.remove('open');
    sideMenu?.setAttribute('aria-hidden', 'true');
  }, 5000);
});
document.addEventListener('click', (e) => {
  if (!sideMenu?.classList.contains('open')) return;
  const within = sideMenu.contains(e.target) || btnMenu.contains(e.target);
  if (!within) {
    sideMenu.classList.remove('open');
    sideMenu.setAttribute('aria-hidden', 'true');
  }
});

// Sound toggle
btnSound?.addEventListener('click', () => {
  soundOn = !soundOn;
  btnSound.textContent = soundOn ? '🔊' : '🔇';
});

// ==============
// Audio beeps
// ==============
const audioCtx = (window.AudioContext) ? new AudioContext() : null;
function beep(freq = 660, dur = 120) {
  if (!audioCtx || !soundOn) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = 0.08;
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start();
  setTimeout(() => { osc.stop(); }, dur);
}
function vibrate(ms = 40){ if (navigator.vibrate) try { navigator.vibrate(ms); } catch(e){} }

// =========================
// DATA
// =========================
let rows = [];      // today's questions
let idx = 0;
let wrongStreak = 0;
let elapsed = 0;
let elapsedInterval = null;
let timerRAF = null;
let qStartTime = 0;

// parse CSV minimally
async function fetchCSV(url){
  const res = await fetch(url, {cache:'no-store'});
  if(!res.ok) throw new Error('CSV fetch failed');
  const text = await res.text();

  // Basic CSV parse (no quotes in your dataset ideally)
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  const out = [];
  for(let i=1;i<lines.length;i++){
    const cols = lines[i].split(',');
    const obj = {};
    headers.forEach((h,ix) => obj[h.trim()] = (cols[ix]||'').trim());
    out.push(obj);
  }
  return out;
}

function normalizeRow(r){
  return {
    date: (r.Date||'').trim(),
    q: (r.Question||'').trim(),
    a: (r.Answer||'').trim(),
    opts: [r.OptionA, r.OptionB, r.OptionC, r.OptionD].filter(Boolean).map(s=>s.trim()),
    expl: (r.Explanation||'').trim(),
    cat: (r.Category||'').trim(),
    diff: (r.Difficulty||'').trim()
  };
}

async function loadTodays(){
  // Try live first
  try{
    const live = (await fetchCSV(LIVE_CSV_URL)).map(normalizeRow);
    const key = today.toISOString().slice(0,10);
    const todays = live.filter(r=>r.date===key);
    if (todays.length >= 1) {
      rows = todays.slice(0, 12);
      return;
    }
  }catch(e){ /* ignore, fallback to bank */ }

  // Fallback: take first 12 bank rows
  const bank = (await fetchCSV(BANK_CSV_URL)).map(normalizeRow);
  rows = bank.slice(0, 12);
}

// =========================
// RENDER
// =========================
function showQuestion(){
  const q = rows[idx];
  if(!q){
    endQuiz(); // safety
    return;
  }
  elGameOver.style.display = 'none';
  elQ.textContent = q.q || '—';

  elChoices.innerHTML = '';
  q.opts.forEach((opt) => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.textContent = opt;
    b.onclick = () => onSelect(b, opt, q.a);
    elChoices.appendChild(b);
  });
}

function disableChoices(){
  [...document.querySelectorAll('.choice')].forEach(b => b.classList.add('disabled'));
}

function clearChoiceStates(){
  [...document.querySelectorAll('.choice')].forEach(b => b.classList.remove('correct','incorrect','disabled'));
}

// =========================
// QUIZ FLOW
// =========================
function resetGame(){
  idx = 0; wrongStreak = 0; elapsed = 0;
  if (elapsedInterval){ clearInterval(elapsedInterval); elapsedInterval=null; }
  elElapsed.textContent = '0s';
  elTimerBar.style.transform = 'translateX(0)';
  elTimerWrap.classList.remove('active');
  elGameOver.style.display='none';
  elQ.textContent = 'Press Start Quiz';
  elChoices.innerHTML = '';
  elSet.textContent = 'Ready';
  btnAgain.classList.remove('pulse');
  btnAgain.style.display = 'none';
}
function startElapsed(){
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = setInterval(()=>{ elapsed++; elElapsed.textContent = `${elapsed}s`; }, 1000);
}
function stopElapsed(){
  if (elapsedInterval){ clearInterval(elapsedInterval); elapsedInterval=null; }
}

function startCountdownThenQuiz(){
  // 3..2..1 with beeps
  elCountdown.style.display = 'flex';
  elTimerWrap.classList.remove('active');
  elChoices.innerHTML = '';
  elQ.textContent = '';
  let c = COUNTDOWN_SECONDS;
  elCountdown.textContent = c;
  beep(660);
  const tick = setInterval(()=>{
    c -= 1;
    if (c > 0) {
      elCountdown.textContent = c;
      beep(660);
    } else {
      clearInterval(tick);
      elCountdown.style.display='none';
      startQuiz();
    }
  }, 1000);
}

async function startQuiz(){
  // prevent auto-start if not loaded rows
  if (!rows.length) {
    try{
      elSet.textContent = 'Loading…';
      await loadTodays();
      elSet.textContent = 'Ready';
    }catch(e){
      elSet.textContent = 'Error loading set';
      return;
    }
  }
  if (!rows.length) return;

  idx = 0; wrongStreak = 0; elapsed = 0;
  startElapsed();
  elElapsed.textContent = '0s';
  elTimerWrap.classList.add('active');
  nextQuestion();
}

function nextQuestion(){
  if (idx >= rows.length) {
    endQuiz();
    return;
  }
  clearChoiceStates();
  showQuestion();
  runTimer(QUIZ_SECONDS, () => {
    // time up → treat as incorrect attempt
    handleAnswer(false);
  });
}

function endQuiz(){
  cancelTimer();
  stopElapsed();
  elGameOver.style.display='block';
  btnAgain.style.display='inline-block';
  btnAgain.classList.add('pulse');
  elSet.textContent = 'Done';
}

// =========================
// TIMER — smooth (right→left)
// =========================
function runTimer(seconds, onExpire){
  cancelTimer();
  const total = seconds * 1000;
  qStartTime = performance.now();
  const raf = (now) => {
    const elapsedMs = now - qStartTime;
    const pct = Math.min(1, elapsedMs / total);
    const remainingTranslate = (1 - pct) * 100; // 100% → 0% from right
    elTimerBar.style.transform = `translateX(${remainingTranslate}%)`;
    if (pct < 1) {
      timerRAF = requestAnimationFrame(raf);
    } else {
      onExpire?.();
    }
  };
  timerRAF = requestAnimationFrame(raf);
}
function cancelTimer(){
  if (timerRAF) cancelAnimationFrame(timerRAF);
  timerRAF = null;
  elTimerBar.style.transform = 'translateX(0)';
}

// =========================
// ANSWER HANDLING
// =========================
function onSelect(btn, val, answer){
  if (btn.classList.contains('disabled')) return;

  // disable other choices from spamming
  disableChoices();

  const correct = (String(val).trim().toLowerCase() === String(answer).trim().toLowerCase());
  handleAnswer(correct, btn);
}

function handleAnswer(correct, btn=null){
  cancelTimer();

  if (correct){
    if (btn){ btn.classList.add('correct'); }
    wrongStreak = 0;
    beep(820, 100);
    // small delay then next
    setTimeout(()=>{ idx++; nextQuestion(); }, 600);
  } else {
    if (btn){ btn.classList.add('incorrect'); }
    vibrate(80);
    wrongStreak += 1;

    if (AUTO_GAMEOVER_ON_TWO_WRONG && wrongStreak >= 2){
      // game ends
      elGameOver.style.display='block';
      btnAgain.style.display='inline-block';
      btnAgain.classList.add('pulse');
      stopElapsed();
    } else {
      // retry same question (no reveal)
      setTimeout(()=>{ clearChoiceStates(); showQuestion(); runTimer(QUIZ_SECONDS, ()=>handleAnswer(false)); }, 700);
    }
  }
}

// =========================
// BUTTONS
// =========================
btnStart?.addEventListener('click', () => {
  // Ensure data is loaded, then start countdown
  if (!rows.length){
    loadTodays().then(()=>{ elSet.textContent='Ready'; startCountdownThenQuiz(); })
      .catch(()=> elSet.textContent='Error loading set');
  } else {
    startCountdownThenQuiz();
  }
});

btnShuffle?.addEventListener('click', async () => {
  try{
    const bank = (await fetchCSV(BANK_CSV_URL)).map(normalizeRow);
    // pick any 12 at random
    for (let i = bank.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bank[i], bank[j]] = [bank[j], bank[i]];
    }
    rows = bank.slice(0,12);
    resetGame();
    elQ.textContent = 'Press Start Quiz';
  }catch(e){
    alert('Could not shuffle from bank.');
  }
});

btnShare?.addEventListener('click', async () => {
  const shareData = { title: 'Brain ⚡ Bolt', text: 'Daily quiz — join me!', url: 'https://dailybrainbolt.com/' };
  try{
    if (navigator.share) { await navigator.share(shareData); }
    else { await navigator.clipboard.writeText(shareData.url); alert('Link copied!'); }
  }catch(e){}
});

btnTheme?.addEventListener('click', () => {
  // simple toggle that flips --bg / --bg-2 quickly
  if (currentTheme === 'dark'){
    document.documentElement.style.setProperty('--bg', '#f8fbfc');
    document.documentElement.style.setProperty('--bg-2','#e5f1f6');
    document.documentElement.style.setProperty('--panel','#ffffff');
    document.documentElement.style.setProperty('--text','#0a1a20');
    currentTheme = 'light';
  } else {
    document.documentElement.style.setProperty('--bg', '#162022');
    document.documentElement.style.setProperty('--bg-2','#2A3840');
    document.documentElement.style.setProperty('--panel','#0E1E27');
    document.documentElement.style.setProperty('--text','#ffffff');
    currentTheme = 'dark';
  }
});

btnAgain?.addEventListener('click', () => {
  btnAgain.classList.remove('pulse');
  resetGame();
});

// =========================
// INIT
// =========================
(function init(){
  elSet.textContent = 'Ready';  // no "loading today’s set…" under Ready
  resetGame();
})();
