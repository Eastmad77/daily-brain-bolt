/* ===== CONFIG & GLOBALS ===== */

// Google Apps Script Web App (replace with your /exec URL)
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec';

// Google Sheet CSV URLs (leave as your published CSV links)
const BANK_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/.../pub?gid=2009978011&single=true&output=csv';
const LIVE_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/.../pub?gid=1410250735&single=true&output=csv';

// State
let rows = [];
let currentQuestionIndex = 0;
let correctCount = 0;
let elapsedInterval = null;
let elapsedSeconds = 0;

// Elements
const elDate = document.getElementById('dateLabel');
const elSet = document.getElementById('setLabel');
const elProgress = document.getElementById('progressLabel');
const elCountdown = document.getElementById('countdown');
const elTimerBar = document.getElementById('timerBar');
const elElapsed = document.getElementById('elapsedTime');
const elQ = document.getElementById('questionBox');
const elChoices = document.getElementById('choices');
const elGameOver = document.getElementById('gameOverBox');
const elGameOverText = document.getElementById('gameOverText');
const btnStart = document.getElementById('startBtn');
const btnAgain = document.getElementById('playAgainBtn');
const menuBtn = document.getElementById('mmMenuBtn');
const sideMenu = document.getElementById('mmSideMenu');
const btnSound = document.getElementById('soundBtn');
const btnNotify = document.getElementById('notifyBtn');
const successSplash = document.getElementById('successSplash');
const ssDismiss = document.getElementById('ssDismiss');

/* ===== DATE (NZ) ===== */
function nzTodayYMD() {
  try {
    const f = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year:'numeric', month:'2-digit', day:'2-digit' });
    const p = f.formatToParts(new Date()).reduce((o,x)=> (o[x.type]=x.value,o),{});
    return `${p.year}-${p.month}-${p.day}`;
  } catch { return new Date().toISOString().slice(0,10); }
}
elDate && (elDate.textContent = nzTodayYMD());

/* ===== SOUND: correct-only beep ===== */
let soundEnabled = true;
let beepAudio;
function ensureAudio(){ if (!beepAudio) beepAudio = new Audio('/sounds/correct-beep.mp3'); }
function playBeep(){ if (!soundEnabled) return; try{ ensureAudio(); beepAudio.currentTime=0; beepAudio.play(); }catch{} }
btnSound?.addEventListener('click', ()=>{ soundEnabled = !soundEnabled; btnSound.textContent = soundEnabled ? '🔊' : '🔇'; });

/* ===== MENU ===== */
menuBtn?.addEventListener('click', () => { sideMenu?.classList.toggle('open'); });

/* ===== NOTIFICATIONS (optional local) ===== */
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
  try { if (Notification.permission === 'granted') new Notification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' }); } catch {}
}
function maybeShowDailyReady(){
  if (!canNotify()) return;
  const enabled = localStorage.getItem(LS_NOTIFY_KEY) === '1';
  if (!enabled) return;
  const last = localStorage.getItem(LS_LAST_PLAYED) || '';
  const todayNZ = nzTodayYMD();
  if (last && last !== todayNZ) showLocalNotification('Today’s quiz is ready!', 'Come take the new Brain ⚡ Bolt set.');
}
btnNotify?.addEventListener('click', async ()=>{
  const granted = await requestNotifyPermission();
  if (granted){ localStorage.setItem(LS_NOTIFY_KEY,'1'); showLocalNotification('Notifications on','We’ll remind you when a new daily set is ready.'); }
  else { localStorage.removeItem(LS_NOTIFY_KEY); alert('Notifications disabled or not supported.'); }
});

/* ===== GAS Freshness ===== */
async function ensureFreshLiveSet() {
  try {
    const res = await fetch(`${GAS_WEBAPP_URL}?action=status`, { cache: 'no-store' });
    const data = await res.json();
    // If your status endpoint returns {ok, today, liveDate, count}, check & build as needed
    if (!(data && data.ok)) {
      await fetch(`${GAS_WEBAPP_URL}?action=build`, { cache: 'no-store' });
    }
  } catch (err) {
    console.error('ensureFreshLiveSet error:', err);
  }
}

/* ===== CSV ===== */
async function fetchLiveCSV() {
  try {
    await ensureFreshLiveSet();
    const res = await fetch(LIVE_CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch live CSV');
    const text = await res.text();
    return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
  } catch (err) {
    console.error('Live CSV fetch error:', err);
    return [];
  }
}

/* ===== GAME ===== */
function startElapsedTimer() {
  clearInterval(elapsedInterval);
  elapsedSeconds = 0;
  elElapsed && (elElapsed.textContent = '0:00');
  elTimerBar && (elTimerBar.style.transform = 'scaleX(0)');
  elapsedInterval = setInterval(()=>{
    elapsedSeconds++;
    const m = Math.floor(elapsedSeconds/60), s = elapsedSeconds%60;
    elElapsed && (elElapsed.textContent = `${m}:${s.toString().padStart(2,'0')}`);
    // progress visual (5 min scale)
    const pct = Math.min(1, elapsedSeconds/300);
    elTimerBar && (elTimerBar.style.transform = `scaleX(${pct})`);
  }, 1000);
}
function stopElapsedTimer(){ clearInterval(elapsedInterval); }

function normalizeRow(r){
  return {
    date: String(r.Date||'').trim(),
    q: String(r.Question||'').trim(),
    opts: [r.OptionA, r.OptionB, r.OptionC, r.OptionD].filter(Boolean).map(v=>String(v).trim()),
    ans: String(r.Answer||'').trim()
  };
}
function normText(s){
  return String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
}
function isCorrect(row, selected){
  const ans = row.ans;
  if (/^[ABCD]$/i.test(ans)) {
    const idx = 'ABCD'.indexOf(ans[0].toUpperCase());
    const correctText = row.opts[idx] || '';
    return normText(selected) === normText(correctText);
  }
  return normText(selected) === normText(ans);
}

async function startGame() {
  elSet && (elSet.textContent = 'Loading…');
  const live = await fetchLiveCSV();
  let data = live.map(normalizeRow).filter(x=>x.q && x.opts.length>=2);
  const today = nzTodayYMD();
  const todays = data.filter(r=>r.date===today);
  rows = (todays.length ? todays : data).slice(0,12);

  if (!rows.length) {
    elQ.textContent = "Could not load today’s quiz. Try again later.";
    elSet && (elSet.textContent = 'Error');
    return;
  }

  currentQuestionIndex = 0;
  correctCount = 0;
  elProgress && (elProgress.textContent = `Q 0/12`);
  elGameOver && (elGameOver.style.display='none');
  btnAgain && (btnAgain.style.display='none');
  elSet && (elSet.textContent = 'Ready');

  startElapsedTimer();
  showQuestion();
}

function showQuestion(){
  const r = rows[currentQuestionIndex];
  if (!r) { endGame(); return; }
  elQ && (elQ.textContent = r.q || '—');
  elChoices && (elChoices.innerHTML = '');
  r.opts.forEach(opt=>{
    const b = document.createElement('button');
    b.className = 'choice';
    b.textContent = opt;
    b.onclick = ()=>handleAnswer(b, r);
    elChoices.appendChild(b);
  });
  elProgress && (elProgress.textContent = `Q ${currentQuestionIndex+1}/12`);
}

function disableChoices(){
  [...document.querySelectorAll('.choice')].forEach(b=>{ b.disabled = true; b.classList.add('disabled'); });
}

function handleAnswer(btn, row){
  if (!btn || btn.disabled) return;
  disableChoices();
  const correct = isCorrect(row, btn.textContent);
  if (correct){ btn.classList.add('correct'); playBeep(); correctCount++; }
  else { btn.classList.add('incorrect'); if (navigator.vibrate) navigator.vibrate(160); }
  // Mark the correct one
  if (/^[ABCD]$/i.test(row.ans)) {
    const idx = 'ABCD'.indexOf(row.ans[0].toUpperCase());
    const correctText = row.opts[idx] || '';
    [...document.querySelectorAll('.choice')].forEach(b=>{ if (normText(b.textContent)===normText(correctText)) b.classList.add('correct'); });
  } else {
    [...document.querySelectorAll('.choice')].forEach(b=>{ if (normText(b.textContent)===normText(row.ans)) b.classList.add('correct'); });
  }
  setTimeout(()=>{
    currentQuestionIndex++;
    if (currentQuestionIndex >= 12) endGame();
    else showQuestion();
  }, 900);
}

function endGame(){
  stopElapsedTimer();
  const total = rows.length || 12;
  const mm = Math.floor(elapsedSeconds/60);
  const ss = String(elapsedSeconds%60).padStart(2,'0');
  const scoreLine = `You answered ${correctCount} / ${total} correctly in ${mm}:${ss}!`;

  elGameOver && (elGameOver.style.display='block');
  if (elGameOverText) elGameOverText.textContent = scoreLine;

  btnAgain && (btnAgain.style.display='inline-block');
  localStorage.setItem(LS_LAST_PLAYED, nzTodayYMD());
  showSuccessSplash();
}

/* ===== Success splash ===== */
function showSuccessSplash(){
  if (!successSplash) return;
  successSplash.classList.add('show');
  ssDismiss?.addEventListener('click', ()=>successSplash.classList.remove('show'), { once:true });
  setTimeout(()=> successSplash.classList.remove('show'), 2500);
}

/* ===== Share: include score + elapsed time ===== */
function shareScore(text) {
  if (navigator.share) {
    navigator.share({
      title: 'Brain ⚡ Bolt',
      text,
      url: window.location.href
    }).catch(err => console.error('Share failed:', err));
  } else {
    navigator.clipboard.writeText(`${text} - ${window.location.href}`)
      .then(()=>alert('Score copied to clipboard!'))
      .catch(()=>alert('Could not copy to clipboard.'));
  }
}

// Game Over "Play Again"
document.getElementById('goPlayAgain')?.addEventListener('click', (e) => {
  e.preventDefault();
  startGame();
});

// Game Over "Share" — includes score + time
document.getElementById('goShareScore')?.addEventListener('click', (e) => {
  e.preventDefault();
  const total = rows.length || 12;
  const mm = Math.floor(elapsedSeconds/60);
  const ss = String(elapsedSeconds%60).padStart(2,'0');
  const text = `I scored ${correctCount}/${total} in ${mm}:${ss} on today’s Brain ⚡ Bolt quiz!`;
  shareScore(text);
});

// Success Splash "Play Again"
document.getElementById('ssPlayAgain')?.addEventListener('click', (e) => {
  e.preventDefault();
  successSplash.classList.remove('show');
  startGame();
});

// Success Splash "Share" — includes score + time
document.getElementById('ssShareScore')?.addEventListener('click', (e) => {
  e.preventDefault();
  const total = rows.length || 12;
  const mm = Math.floor(elapsedSeconds/60);
  const ss = String(elapsedSeconds%60).padStart(2,'0');
  const text = `I scored ${correctCount}/${total} in ${mm}:${ss} on today’s Brain ⚡ Bolt quiz!`;
  shareScore(text);
});

/* ===== INIT & Buttons ===== */
document.getElementById('startBtn')?.addEventListener('click', startGame);
document.getElementById('playAgainBtn')?.addEventListener('click', startGame);

(function init(){
  maybeShowDailyReady();
  elSet && (elSet.textContent = 'Ready');
})();
