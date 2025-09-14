/* Brain ⚡ Bolt — main app
   - Splash robust (controlled in index.html)
   - Sounds: countdown ticks + taps + correct/incorrect
   - Vibration on incorrect
   - Subtle elapsed timer near bar
   - Progress: Q n/12
*/

// ===== Config =====
const LIVE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

const QUIZ_SECONDS = 10;
const COUNTDOWN_SECONDS = 3;
const AUTO_GAMEOVER_ON_TWO_WRONG = true;

let currentTheme = 'dark';
let soundOn = true;

// ===== Elements =====
const elDate = document.getElementById('dateLabel');
const elSet = document.getElementById('setLabel');
const elProgress = document.getElementById('progressLabel');
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

const successSplash = document.getElementById('successSplash');
const ssDismiss = document.getElementById('ssDismiss');

// ===== Date (NZ) =====
function nzTodayYMD() {
  try {
    const f = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year:'numeric', month:'2-digit', day:'2-digit' });
    const p = f.formatToParts(new Date()).reduce((o,x)=> (o[x.type]=x.value,o),{});
    return `${p.year}-${p.month}-${p.day}`;
  } catch { return new Date().toISOString().slice(0,10); }
}
elDate && (elDate.textContent = nzTodayYMD());

// ===== Haptics & Audio =====
function vibrate(ms=40){ if (navigator.vibrate) try{ navigator.vibrate(ms); }catch(e){} }

// WebAudio must be resumed after user gesture. We set up lazily.
let audioCtx = null;
function ensureAudio(){
  if (!('AudioContext' in window)) return null;
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq=660, dur=120, type='sine', gainLevel=0.07){
  if (!soundOn) return;
  const ctx = ensureAudio(); if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type; osc.frequency.value = freq; gain.gain.value = gainLevel;
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start();
  setTimeout(()=>{ try{ osc.stop(); }catch(_){} }, dur);
}
function clickSnd(){ tone(480, 60, 'square', 0.05); }
function tickSnd(){ tone(760, 90, 'sine', 0.07); }
function correctSnd(){ tone(820, 120, 'sine', 0.08); }
function wrongSnd(){ tone(220, 160, 'sawtooth', 0.06); }

// Pre-bind some user gestures to unlock audio early
['click','touchstart','keydown'].forEach(ev => {
  window.addEventListener(ev, () => ensureAudio(), { once:true, passive:true });
});

// ===== Menu =====
let menuAutoHideTO = null;
btnMenu?.addEventListener('click', () => {
  clickSnd();
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

// Force splash on Home
document.querySelectorAll('a[data-home-link]').forEach(a=>{
  a.addEventListener('click', ()=>{
    try{ sessionStorage.setItem('bb_forceSplash','1'); }catch(e){}
  });
});

// Sound toggle
btnSound?.addEventListener('click', ()=>{
  clickSnd();
  soundOn = !soundOn;
  btnSound.textContent = soundOn ? '🔊' : '🔇';
});

// ===== Notifications (local) =====
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
  if (last && last !== todayNZ) {
    showLocalNotification('Today’s quiz is ready!', 'Come take the new Brain ⚡ Bolt set.');
  }
}
btnNotify?.addEventListener('click', async () => {
  clickSnd();
  const granted = await requestNotifyPermission();
  if (granted) {
    localStorage.setItem(LS_NOTIFY_KEY, '1');
    showLocalNotification('Notifications on', 'We’ll remind you when a new daily set is ready.');
  } else {
    localStorage.removeItem(LS_NOTIFY_KEY);
    alert('Notifications disabled or not supported.');
  }
});

// ===== CSV loading =====
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

// Answer normalization (supports A/B/C/D or text)
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
  const opts = [r.OptionA, r.OptionB, r.OptionC, r.OptionD].filter(v => v !== undefined).map(v => String(v).trim());
  return {
    date: String(r.Date||'').trim(),
    q: String(r.Question||'').trim(),
    a: String(r.Answer||'').trim(), // letter OR text
    opts,
    expl: String(r.Explanation||'').trim(),
    cat: String(r.Category||'').trim(),
    diff: String(r.Difficulty||'').trim()
  };
}
function isCorrectSelection(row, selected){
  const ans = String(row.a || '').trim();
  const sel = String(selected || '').trim();
  // If the answer is a letter, map to option text
  if (/^[ABCD]$/i.test(ans)) {
    const index = 'ABCD'.indexOf(ans[0].toUpperCase());
    const correctText = row.opts[index] || '';
    return normText(sel) === normText(correctText);
  }
  // Otherwise text-to-text
  return normText(sel) === normText(ans);
}

// ===== Quiz state =====
let rows = [];
let idx = 0;              // current question index
let correctCount = 0;     // progress
let wrongStreak = 0;
let elapsedSec = 0;
let elapsedTimer = null;
let timerRAF = null;
let qStartTime = 0;

function updateProgress(){ elProgress && (elProgress.textContent = `Q ${Math.min(correctCount + (idx < rows.length ? 0 : 0), 12)}/${rows.length || 12}`); }
function resetProgress(){ correctCount = 0; elProgress && (elProgress.textContent = `Q 0/12`); }

function formatElapsed(s){
  const m = Math.floor(s/60), sec = s%60;
  return `${m}:${sec.toString().padStart(2,'0')}`;
}
function startElapsed(){
  if (!elElapsed) return;
  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedSec = 0; elElapsed.textContent = formatElapsed(elapsedSec);
  elapsedTimer = setInterval(()=>{ elapsedSec++; elElapsed.textContent = formatElapsed(elapsedSec); }, 1000);
}
function stopElapsed(){
  if (elapsedTimer){ clearInterval(elapsedTimer); elapsedTimer=null; }
}

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

function showQuestion(){
  const q = rows[idx];
  if(!q){ endQuiz(true); return; }
  elGameOver && (elGameOver.style.display = 'none');
  elQ && (elQ.textContent = q.q || '—');
  if (elChoices) {
    elChoices.innerHTML = '';
    q.opts.forEach((opt) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.textContent = opt;
      b.onclick = () => { clickSnd(); onSelect(b, opt, q); };
      elChoices.appendChild(b);
    });
  }
}
function disableChoices(){ if (!elChoices) return; [...document.querySelectorAll('.choice')].forEach(b => { b.classList.add('disabled'); b.disabled = true; }); }
function clearChoiceStates(){ if (!elChoices) return; [...document.querySelectorAll('.choice')].forEach(b => { b.classList.remove('correct','incorrect','disabled'); b.disabled = false; }); }

function resetGame(){
  idx = 0; wrongStreak = 0; stopElapsed();
  resetProgress();
  elElapsed && (elElapsed.textContent = '0:00');
  if (elTimerBar) elTimerBar.style.transform = 'translateX(0)';
  elTimerWrap?.classList.remove('active');
  elGameOver && (elGameOver.style.display='none');
  elQ && (elQ.textContent = 'Press Start Quiz');
  elChoices && (elChoices.innerHTML = '');
  elSet && (elSet.textContent = 'Ready');
  btnAgain?.classList.remove('pulse');
  btnAgain && (btnAgain.style.display = 'none');
}

function startCountdownThenQuiz(){
  if (!elCountdown) return startQuiz();
  elCountdown.style.display = 'flex';
  elTimerWrap?.classList.remove('active');
  elChoices && (elChoices.innerHTML = '');
  elQ && (elQ.textContent = '');
  let c = COUNTDOWN_SECONDS;
  elCountdown.textContent = c;
  tickSnd();
  const tick = setInterval(()=>{
    c -= 1;
    if (c > 0) { elCountdown.textContent = c; tickSnd(); }
    else { clearInterval(tick); elCountdown.style.display='none'; startQuiz(); }
  }, 1000);
}

async function startQuiz(){
  if (!rows.length) {
    try{ elSet && (elSet.textContent = 'Loading…'); await loadTodays(); elSet && (elSet.textContent = 'Ready'); }
    catch(e){ elSet && (elSet.textContent = 'Error loading set'); return; }
  }
  if (!rows.length) return;
  idx = 0; wrongStreak = 0; correctCount = 0; updateProgress();
  startElapsed();
  elTimerWrap?.classList.add('active');
  nextQuestion();
}

function nextQuestion(){
  if (idx >= rows.length) { endQuiz(true); return; }
  clearChoiceStates();
  showQuestion();
  runTimer(QUIZ_SECONDS, () => { handleAnswer(false); });
}

function endQuiz(completed=false){
  cancelTimer(); stopElapsed();
  if (completed){
    showSuccessSplash();
  } else {
    elGameOver && (elGameOver.style.display='block');
    if (btnAgain){ btnAgain.style.display='inline-block'; btnAgain.classList.add('pulse'); }
    elSet && (elSet.textContent = 'Done');
  }
  localStorage.setItem(LS_LAST_PLAYED, nzTodayYMD());
}

function runTimer(seconds, onExpire){
  cancelTimer();
  const total = seconds * 1000;
  qStartTime = performance.now();
  const raf = (now) => {
    const elapsedMs = now - qStartTime;
    const pct = Math.min(1, elapsedMs / total);
    const remainingTranslate = (1 - pct) * 100;
    elTimerBar && (elTimerBar.style.transform = `translateX(${remainingTranslate}%)`);
    if (pct < 1) { timerRAF = requestAnimationFrame(raf); }
    else { onExpire?.(); }
  };
  timerRAF = requestAnimationFrame(raf);
}
function cancelTimer(){ if (timerRAF) cancelAnimationFrame(timerRAF); timerRAF = null; elTimerBar && (elTimerBar.style.transform = 'translateX(0)'); }

function onSelect(btn, val, row){
  if (btn.classList.contains('disabled')) return;
  disableChoices();
  const correct = isCorrectSelection(row, val);
  handleAnswer(correct, btn);
}

function handleAnswer(correct, btn=null){
  cancelTimer();
  if (correct){
    correctSnd();
    btn && btn.classList.add('correct');
    wrongStreak = 0;
    correctCount = Math.min(correctCount + 1, rows.length);
    updateProgress();
    setTimeout(()=>{ idx++; nextQuestion(); }, 600);
  } else {
    wrongSnd(); vibrate(80);
    btn && btn.classList.add('incorrect');
    wrongStreak += 1;
    if (AUTO_GAMEOVER_ON_TWO_WRONG && wrongStreak >= 2){
      elGameOver && (elGameOver.style.display='block');
      if (btnAgain){ btnAgain.style.display='inline-block'; btnAgain.classList.add('pulse'); }
      elSet && (elSet.textContent = 'Done');
      stopElapsed();
    } else {
      setTimeout(()=>{ clearChoiceStates(); showQuestion(); runTimer(QUIZ_SECONDS, ()=>handleAnswer(false)); }, 700);
    }
  }
}

// ===== Success splash control =====
function showSuccessSplash(){
  if (!successSplash) return;
  successSplash.classList.add('show');
  vibrate(30);
  const hide = () => {
    successSplash.classList.remove('show');
    elGameOver && (elGameOver.style.display='block');
    if (btnAgain){ btnAgain.style.display='inline-block'; btnAgain.classList.add('pulse'); }
    elSet && (elSet.textContent = 'Done');
  };
  ssDismiss?.addEventListener('click', hide, { once:true });
  setTimeout(hide, 2300);
}

// ===== Buttons =====
btnStart?.addEventListener('click', () => {
  clickSnd();
  if (!rows.length){
    loadTodays().then(()=>{ elSet && (elSet.textContent='Ready'); startCountdownThenQuiz(); })
      .catch(()=> elSet && (elSet.textContent='Error loading set'));
  } else {
    startCountdownThenQuiz();
  }
});
btnShuffle?.addEventListener('click', async () => {
  clickSnd();
  try{
    const bank = (await loadCSV(BANK_CSV_URL)).map(normalizeRow);
    for (let i = bank.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bank[i], bank[j]] = [bank[j], bank[i]]; }
    rows = bank.slice(0,12); resetGame(); elQ && (elQ.textContent = 'Press Start Quiz');
  }catch(e){}
});
btnShare?.addEventListener('click', async () => {
  clickSnd();
  const shareData = { title: 'Brain ⚡ Bolt', text: 'Daily quiz — join me!', url: location.origin + '/' };
  try{
    if (navigator.share) { await navigator.share(shareData); }
    else { await navigator.clipboard.writeText(shareData.url); }
  }catch(e){}
});
btnTheme?.addEventListener('click', () => {
  clickSnd();
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
btnAgain?.addEventListener('click', () => { clickSnd(); btnAgain.classList.remove('pulse'); resetGame(); });

// INIT
(function init(){
  maybeShowDailyReady();
  elSet && (elSet.textContent = 'Ready');
  resetGame();
})();
