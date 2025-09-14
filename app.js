/* Brain ⚡ Bolt — main app with robust CSV parsing + answer normalization */
const LIVE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

const QUIZ_SECONDS = 10;
const COUNTDOWN_SECONDS = 3;
const SHOW_CORRECT_TEXT = false;
const AUTO_GAMEOVER_ON_TWO_WRONG = true;

let currentTheme = 'dark';
let soundOn = true;

// Elements
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

// Menu behavior
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
  if (!within) { sideMenu.classList.remove('open'); sideMenu.setAttribute('aria-hidden','true'); }
});

// Sound toggle
btnSound?.addEventListener('click', () => {
  soundOn = !soundOn;
  btnSound.textContent = soundOn ? '🔊' : '🔇';
});

// Audio beeps
const audioCtx = (window.AudioContext) ? new AudioContext() : null;
function beep(freq = 660, dur = 120) {
  if (!audioCtx || !soundOn) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = 0.08;
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(); setTimeout(() => { osc.stop(); }, dur);
}
function vibrate(ms = 40){ if (navigator.vibrate) try { navigator.vibrate(ms); } catch(e){} }

// ===== CSV LOADING =====
function toCsvUrl(u){
  if(!u) return '';
  return u.replace(/\/pubhtml.*/, '/pub?output=csv')
          .replace(/\/edit\?.*$/, '/pub?output=csv')
          .replace(/output=tsv/g,'output=csv');
}
function loadCSV(url){
  return new Promise((resolve,reject)=>{
    const finalUrl = toCsvUrl(url);
    Papa.parse(finalUrl, {
      download: true, header: true, skipEmptyLines: true,
      complete: ({ data }) => resolve(data || []),
      error: (err) => reject(err)
    });
  });
}

// Normalization (fix “correct marked wrong”)
function normText(s){
  return String(s ?? '')
    .replace(/[\u2018\u2019\u201A\u201B]/g,"'")
    .replace(/[\u201C\u201D\u201E]/g,'"')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g,' ')
    .toLowerCase();
}
function normalizeRow(r){
  const opts = [r.OptionA, r.OptionB, r.OptionC, r.OptionD].filter(Boolean).map(v => String(v).trim());
  return {
    date: String(r.Date||'').trim(),
    q: String(r.Question||'').trim(),
    a: String(r.Answer||'').trim(),
    opts,
    expl: String(r.Explanation||'').trim(),
    cat: String(r.Category||'').trim(),
    diff: String(r.Difficulty||'').trim()
  };
}
function isCorrectSelection(row, selected){
  const ans = String(row.a || '').trim();
  const sel = String(selected || '').trim();
  if (/^[ABCD]$/i.test(ans)) {
    const index = 'ABCD'.indexOf(ans[0].toUpperCase());
    const correctText = row.opts[index] || '';
    return normText(sel) === normText(correctText);
  }
  return normText(sel) === normText(ans);
}

let rows = [];
let idx = 0;
let wrongStreak = 0;
let elapsed = 0;
let elapsedInterval = null;
let timerRAF = null;
let qStartTime = 0;

async function loadTodays(){
  const key = today.toISOString().slice(0,10);
  try{
    const live = (await loadCSV(LIVE_CSV_URL)).map(normalizeRow);
    const todays = live.filter(r=>r.date===key);
    if (todays.length >= 1) { rows = todays.slice(0, 12); return; }
  }catch(e){}
  const bank = (await loadCSV(BANK_CSV_URL)).map(normalizeRow);
  rows = bank.slice(0, 12);
}

// Render
function showQuestion(){
  const q = rows[idx];
  if(!q){ endQuiz(); return; }
  elGameOver.style.display = 'none';
  elQ.textContent = q.q || '—';
  elChoices.innerHTML = '';
  q.opts.forEach((opt) => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.textContent = opt;
    b.onclick = () => onSelect(b, opt, q);
    elChoices.appendChild(b);
  });
}
function disableChoices(){ [...document.querySelectorAll('.choice')].forEach(b => { b.classList.add('disabled'); b.disabled = true; }); }
function clearChoiceStates(){ [...document.querySelectorAll('.choice')].forEach(b => { b.classList.remove('correct','incorrect','disabled'); b.disabled = false; }); }

// Flow
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
function startElapsed(){ if (elapsedInterval) clearInterval(elapsedInterval); elapsedInterval = setInterval(()=>{ elapsed++; elElapsed.textContent = `${elapsed}s`; }, 1000); }
function stopElapsed(){ if (elapsedInterval){ clearInterval(elapsedInterval); elapsedInterval=null; } }
function startCountdownThenQuiz(){
  elCountdown.style.display = 'flex';
  elTimerWrap.classList.remove('active');
  elChoices.innerHTML = '';
  elQ.textContent = '';
  let c = COUNTDOWN_SECONDS;
  elCountdown.textContent = c;
  beep(660);
  const tick = setInterval(()=>{
    c -= 1;
    if (c > 0) { elCountdown.textContent = c; beep(660); }
    else { clearInterval(tick); elCountdown.style.display='none'; startQuiz(); }
  }, 1000);
}
async function startQuiz(){
  if (!rows.length) {
    try{ elSet.textContent = 'Loading…'; await loadTodays(); elSet.textContent = 'Ready'; }
    catch(e){ elSet.textContent = 'Error loading set'; return; }
  }
  if (!rows.length) return;
  idx = 0; wrongStreak = 0; elapsed = 0;
  startElapsed();
  elElapsed.textContent = '0s';
  elTimerWrap.classList.add('active');
  nextQuestion();
}
function nextQuestion(){
  if (idx >= rows.length) { endQuiz(); return; }
  clearChoiceStates();
  showQuestion();
  runTimer(QUIZ_SECONDS, () => { handleAnswer(false); });
}
function endQuiz(){
  cancelTimer(); stopElapsed();
  elGameOver.style.display='block';
  btnAgain.style.display='inline-block';
  btnAgain.classList.add('pulse');
  elSet.textContent = 'Done';
}

// Timer
function runTimer(seconds, onExpire){
  cancelTimer();
  const total = seconds * 1000;
  qStartTime = performance.now();
  const raf = (now) => {
    const elapsedMs = now - qStartTime;
    const pct = Math.min(1, elapsedMs / total);
    const remainingTranslate = (1 - pct) * 100;
    elTimerBar.style.transform = `translateX(${remainingTranslate}%)`;
    if (pct < 1) { timerRAF = requestAnimationFrame(raf); }
    else { onExpire?.(); }
  };
  timerRAF = requestAnimationFrame(raf);
}
function cancelTimer(){
  if (timerRAF) cancelAnimationFrame(timerRAF);
  timerRAF = null;
  elTimerBar.style.transform = 'translateX(0)';
}

// Answers
function onSelect(btn, val, row){
  if (btn.classList.contains('disabled')) return;
  disableChoices();
  const correct = isCorrectSelection(row, val);
  handleAnswer(correct, btn);
}
function handleAnswer(correct, btn=null){
  cancelTimer();
  if (correct){
    if (btn){ btn.classList.add('correct'); }
    wrongStreak = 0; beep(820, 100);
    setTimeout(()=>{ idx++; nextQuestion(); }, 600);
  } else {
    if (btn){ btn.classList.add('incorrect'); }
    vibrate(80);
    wrongStreak += 1;
    if (AUTO_GAMEOVER_ON_TWO_WRONG && wrongStreak >= 2){
      elGameOver.style.display='block';
      btnAgain.style.display='inline-block';
      btnAgain.classList.add('pulse');
      stopElapsed();
    } else {
      setTimeout(()=>{ clearChoiceStates(); showQuestion(); runTimer(QUIZ_SECONDS, ()=>handleAnswer(false)); }, 700);
    }
  }
}

// Buttons
btnStart?.addEventListener('click', () => {
  if (!rows.length){
    loadTodays().then(()=>{ elSet.textContent='Ready'; startCountdownThenQuiz(); })
      .catch(()=> elSet.textContent='Error loading set');
  } else {
    startCountdownThenQuiz();
  }
});
btnShuffle?.addEventListener('click', async () => {
  try{
    const bank = (await loadCSV(BANK_CSV_URL)).map(normalizeRow);
    for (let i = bank.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bank[i], bank[j]] = [bank[j], bank[i]];
    }
    rows = bank.slice(0,12);
    resetGame();
    elQ.textContent = 'Press Start Quiz';
  }catch(e){}
});
btnShare?.addEventListener('click', async () => {
  const shareData = { title: 'Brain ⚡ Bolt', text: 'Daily quiz — join me!', url: location.origin + '/' };
  try{
    if (navigator.share) { await navigator.share(shareData); }
    else { await navigator.clipboard.writeText(shareData.url); }
  }catch(e){}
});
btnTheme?.addEventListener('click', () => {
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
btnAgain?.addEventListener('click', () => { btnAgain.classList.remove('pulse'); resetGame(); });

// Init
(function init(){ elSet.textContent = 'Ready'; resetGame(); })();
