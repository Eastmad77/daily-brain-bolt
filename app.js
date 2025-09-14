/* Brain ⚡ Bolt — main app with robust CSV parsing + answer normalization + notifications */

// ===== Config =====
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

// ===== Elements (guard for pages without quiz DOM) =====
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
const btnNotify = document.getElementById('notifyBtn');
const sideMenu = document.getElementById('mmSideMenu');

// ===== Utilities =====
function nzTodayYMD() {
  try {
    const f = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year:'numeric', month:'2-digit', day:'2-digit' });
    const parts = f.formatToParts(new Date()).reduce((o,p)=> (o[p.type]=p.value,o),{});
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch { return new Date().toISOString().slice(0,10); }
}
const today = new Date();
if (elDate) elDate.textContent = nzTodayYMD();

function vibrate(ms=40){ if (navigator.vibrate) try{ navigator.vibrate(ms); }catch(e){} }
const audioCtx = (window.AudioContext) ? new AudioContext() : null;
function beep(freq = 660, dur = 120) {
  if (!audioCtx || !soundOn) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine'; osc.frequency.value = freq; gain.gain.value = 0.08;
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(); setTimeout(()=>osc.stop(), dur);
}

// ===== Menu wiring (works on every page) =====
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
  const within = sideMenu.contains(e.target) || btnMenu?.contains(e.target);
  if (!within) {
    sideMenu.classList.remove('open');
    sideMenu.setAttribute('aria-hidden','true');
  }
});

// ===== Sound toggle =====
btnSound?.addEventListener('click', () => {
  soundOn = !soundOn;
  btnSound.textContent = soundOn ? '🔊' : '🔇';
});

// ===== Notifications (simple daily reminder on next visit) =====
const LS_NOTIFY_KEY = 'bb_notify_enabled';
const LS_LAST_PLAYED = 'bb_last_played_nz';

function canNotify(){ return 'Notification' in window; }

async function requestNotifyPermission(){
  if (!canNotify()) return false;
  if (Notification.permission === 'granted') return true;
  const res = await Notification.requestPermission();
  return res === 'granted';
}
function showLocalNotification(title, body){
  try {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' });
    }
  } catch {}
}
function maybeShowDailyReady(){
  if (!canNotify()) return;
  const enabled = localStorage.getItem(LS_NOTIFY_KEY) === '1';
  if (!enabled) return;
  const last = localStorage.getItem(LS_LAST_PLAYED) || '';
  const todayNZ = nzTodayYMD();
  // If the last played date is before todayNZ, cue a "ready" notification
  if (last && last !== todayNZ) {
    showLocalNotification('Today’s quiz is ready!', 'Come take the new Brain ⚡ Bolt set.');
  }
}

btnNotify?.addEventListener('click', async () => {
  const granted = await requestNotifyPermission();
  if (granted) {
    localStorage.setItem(LS_NOTIFY_KEY, '1');
    showLocalNotification('Notifications on', 'We’ll remind you when a new daily set is ready.');
  } else {
    localStorage.removeItem(LS_NOTIFY_KEY);
    alert('Notifications disabled or not supported.');
  }
});

// ===== CSV loading via PapaParse =====
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

// Answer normalization
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

// ===== Quiz state (only if quiz DOM exists) =====
let rows = [];
let idx = 0;
let wrongStreak = 0;
let elapsed = 0;
let elapsedInterval = null;
let timerRAF = null;
let qStartTime = 0;

async function loadTodays(){
  const key = nzTodayYMD();
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
  if (elGameOver) elGameOver.style.display = 'none';
  if (elQ) elQ.textContent = q.q || '—';
  if (elChoices) {
    elChoices.innerHTML = '';
    q.opts.forEach((opt) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.textContent = opt;
      b.onclick = () => onSelect(b, opt, q);
      elChoices.appendChild(b);
    });
  }
}
function disableChoices(){ if (!elChoices) return; [...document.querySelectorAll('.choice')].forEach(b => { b.classList.add('disabled'); b.disabled = true; }); }
function clearChoiceStates(){ if (!elChoices) return; [...document.querySelectorAll('.choice')].forEach(b => { b.classList.remove('correct','incorrect','disabled'); b.disabled = false; }); }

// Flow
function resetGame(){
  idx = 0; wrongStreak = 0; elapsed = 0;
  if (elapsedInterval){ clearInterval(elapsedInterval); elapsedInterval=null; }
  if (elElapsed) elElapsed.textContent = '0s';
  if (elTimerBar) elTimerBar.style.transform = 'translateX(0)';
  elTimerWrap?.classList.remove('active');
  if (elGameOver) elGameOver.style.display='none';
  if (elQ) elQ.textContent = 'Press Start Quiz';
  if (elChoices) elChoices.innerHTML = '';
  if (elSet) elSet.textContent = 'Ready';
  btnAgain?.classList.remove('pulse');
  btnAgain && (btnAgain.style.display = 'none');
}
function startElapsed(){ if (!elElapsed) return; if (elapsedInterval) clearInterval(elapsedInterval); elapsedInterval = setInterval(()=>{ elapsed++; elElapsed.textContent = `${elapsed}s`; }, 1000); }
function stopElapsed(){ if (elapsedInterval){ clearInterval(elapsedInterval); elapsedInterval=null; } }
function startCountdownThenQuiz(){
  if (!elCountdown) return startQuiz();
  elCountdown.style.display = 'flex';
  elTimerWrap?.classList.remove('active');
  if (elChoices) elChoices.innerHTML = '';
  if (elQ) elQ.textContent = '';
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
    try{ elSet && (elSet.textContent = 'Loading…'); await loadTodays(); elSet && (elSet.textContent = 'Ready'); }
    catch(e){ elSet && (elSet.textContent = 'Error loading set'); return; }
  }
  if (!rows.length) return;
  idx = 0; wrongStreak = 0; elapsed = 0;
  startElapsed();
  if (elElapsed) elElapsed.textContent = '0s';
  elTimerWrap?.classList.add('active');
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
  if (elGameOver) elGameOver.style.display='block';
  if (btnAgain){ btnAgain.style.display='inline-block'; btnAgain.classList.add('pulse'); }
  if (elSet) elSet.textContent = 'Done';
  // Record last played day (NZ)
  localStorage.setItem(LS_LAST_PLAYED, nzTodayYMD());
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
    if (elTimerBar) elTimerBar.style.transform = `translateX(${remainingTranslate}%)`;
    if (pct < 1) { timerRAF = requestAnimationFrame(raf); }
    else { onExpire?.(); }
  };
  timerRAF = requestAnimationFrame(raf);
}
function cancelTimer(){ if (timerRAF) cancelAnimationFrame(timerRAF); timerRAF = null; if (elTimerBar) elTimerBar.style.transform = 'translateX(0)'; }

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
      if (elGameOver) elGameOver.style.display='block';
      if (btnAgain){ btnAgain.style.display='inline-block'; btnAgain.classList.add('pulse'); }
      stopElapsed();
    } else {
      setTimeout(()=>{ clearChoiceStates(); showQuestion(); runTimer(QUIZ_SECONDS, ()=>handleAnswer(false)); }, 700);
    }
  }
}

// Buttons (only if present)
btnStart?.addEventListener('click', () => {
  if (!rows.length){
    loadTodays().then(()=>{ elSet && (elSet.textContent='Ready'); startCountdownThenQuiz(); })
      .catch(()=> elSet && (elSet.textContent='Error loading set'));
  } else {
    startCountdownThenQuiz();
  }
});
btnShuffle?.addEventListener('click', async () => {
  try{
    const bank = (await loadCSV(BANK_CSV_URL)).map(normalizeRow);
    for (let i = bank.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bank[i], bank[j]] = [bank[j], bank[i]]; }
    rows = bank.slice(0,12); resetGame(); if (elQ) elQ.textContent = 'Press Start Quiz';
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

// INIT (runs on all pages)
(function init(){
  maybeShowDailyReady();
  // No-op on content pages if quiz DOM missing
  if (!elSet) return;
  elSet.textContent = 'Ready';
  resetGame();
})();
