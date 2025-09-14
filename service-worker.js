/* Brain Bolt SW */
const VERSION = 'v1.0.9';
const STATIC_CACHE = `bb-static-${VERSION}`;
const ASSETS = [
  '/', '/index.html', '/style.css', '/app.js',/* ===== CONFIG: update these two URLs to your published CSVs =====
   They must be the "Publish to web" links with ?output=csv&gid=...
*/
const LIVE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

/* ===== DOM ===== */
const elDate = document.getElementById('quizDate');
const elElapsed = document.getElementById('elapsedTime');
const elStatus = document.getElementById('statusMsg');
const elQ = document.getElementById('questionBox');
const elOpts = document.getElementById('options');
const elRes = document.getElementById('resultBox');
const elTimerBar = document.getElementById('timerBar');

const btnStart = document.getElementById('startBtn');
const btnShuffle = document.getElementById('shuffleBtn');
const btnShare = document.getElementById('shareBtn');
const btnPlayAgain = document.getElementById('playAgainBtn');

const menuBtn = document.getElementById('menuBtn');
const soundBtn = document.getElementById('soundBtn');
const sideMenu = document.getElementById('sideMenu');

/* ===== State ===== */
const now = new Date();
const todayKey = [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
elDate.textContent = todayKey;

let rounds = [];       // array of question objects for today
let idx = 0;           // current question index
let score = 0;
let selected = null;
let running = false;

let timerMs = 10000;   // 10 seconds
let timerStart = 0;
let timerRAF = 0;
let elapsedSec = 0;
let elapsedTicker = 0;
let soundOn = true;

/* ===== Utils ===== */
const setStatus = (t) => { if (elStatus) elStatus.textContent = t; };
const norm = (s) => String(s||'').trim();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const beep = () => {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 800;
    g.gain.value = 0.04;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{o.stop(); ctx.close();}, 120);
  } catch(e){}
};
const vibrate = (ms=30) => { if (navigator.vibrate) navigator.vibrate(ms); };

/* ===== Menu ===== */
const openMenu = ()=>{ sideMenu?.classList.add('open'); sideMenu?.setAttribute('aria-hidden','false'); };
const closeMenu = ()=>{ sideMenu?.classList.remove('open'); sideMenu?.setAttribute('aria-hidden','true'); };

menuBtn?.addEventListener('click', openMenu);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeMenu(); });
sideMenu?.addEventListener('click', (e)=>{
  if (e.target.tagName === 'A') closeMenu();
});

/* ===== Splash auto-hide after CSS anim (2.8s) ===== */
window.addEventListener('load', ()=>{
  const splash = document.getElementById('splash');
  setTimeout(()=> splash?.remove(), 3000);
});

/* ===== Timer ===== */
function startTimer(){
  timerStart = performance.now();
  elTimerBar.style.transitionDuration = '0ms';
  elTimerBar.style.width = '100%';
  // next frame, animate to 0% width linearly
  requestAnimationFrame(()=>{
    elTimerBar.style.transitionProperty = 'width';
    elTimerBar.style.transitionTimingFunction = 'linear';
    elTimerBar.style.transitionDuration = `${timerMs}ms`;
    elTimerBar.style.width = '0%';
  });
  // elapsed stopwatch
  const t0 = Date.now();
  clearInterval(elapsedTicker);
  elapsedTicker = setInterval(()=>{
    elapsedSec = Math.floor((Date.now()-t0)/1000);
    elElapsed.textContent = new Date(elapsedSec*1000).toISOString().substring(14,19);
  }, 250);
}

function stopTimer(){
  elTimerBar.style.transitionDuration = '0ms';
  elTimerBar.style.width = '0%';
  clearInterval(elapsedTicker);
}

/* ===== CSV LOADING ===== */
async function loadCSV(url){
  return new Promise((resolve, reject)=>{
    Papa.parse(url + `&cb=${Date.now()}`, {
      download:true, header:true, skipEmptyLines:true,
      complete: ({data}) => resolve(data||[]),
      error: (err) => reject(err)
    });
  });
}

async function loadToday(){
  setStatus('Loading…');
  try {
    let rows = await loadCSV(LIVE_CSV_URL);
    rows = rows.filter(r => r && r.Date && r.Question);
    // if live is empty, fallback to bank
    if (!rows.length) {
      const bankRows = await loadCSV(BANK_CSV_URL);
      rows = bankRows.filter(r => r && r.Date && r.Question && norm(r.Date) === todayKey);
    }
    if (!rows.length) throw new Error('No quiz rows found for today');

    rounds = rows.map(r => ({
      q: r.Question,
      a: [r.OptionA, r.OptionB, r.OptionC, r.OptionD].filter(Boolean),
      ans: r.Answer,
      expl: r.Explanation||'',
      cat: r.Category||'',
      diff: r.Difficulty||'',
    }));
    setStatus('Ready');
    elQ.textContent = 'Press Start Quiz';
    elOpts.innerHTML = '';
    elRes.textContent = '';
    idx = 0; score = 0; selected = null; running = false;
  } catch(e){
    setStatus('Couldn’t load CSV — check Publish settings / URLs');
    elQ.textContent = 'Couldn’t load questions.';
    console.error(e);
  }
}

/* ===== Quiz logic ===== */
function renderQuestion(){
  const cur = rounds[idx];
  if (!cur){
    elRes.textContent = 'Done — great job!';
    btnPlayAgain.classList.remove('hidden');
    stopTimer();
    running = false;
    return;
  }
  elQ.textContent = cur.q || '—';
  elOpts.innerHTML = '';
  elRes.textContent = '';
  selected = null;

  cur.a.forEach((t)=>{
    const b = document.createElement('button');
    b.className = 'choice';
    b.textContent = t;
    b.onclick = () => onSelect(b, t);
    elOpts.appendChild(b);
  });

  // timer
  startTimer();
  // force end if time runs out
  setTimeout(()=>{
    if (!running || selected) return;
    // mark incorrect and move on
    elRes.textContent = 'Time’s up!';
    idx++;
    renderQuestion();
  }, timerMs);
}

function onSelect(btn, val){
  if (selected) return;
  selected = val;
  // style selection
  document.querySelectorAll('.choice').forEach(b => b.classList.add('disabled'));
  const cur = rounds[idx];
  const isCorrect = norm(val).toLowerCase() === norm(cur.ans).toLowerCase();
  if (isCorrect){
    btn.classList.add('correct');
    elRes.textContent = 'Correct!';
    beep();
    idx++; score++;
  }else{
    btn.classList.add('incorrect');
    elRes.textContent = 'Incorrect.';
    vibrate(40);
    idx = 0;  // (simple penalty; change if you want different behavior)
    score = 0;
  }
  stopTimer();
  setTimeout(renderQuestion, 700);
}

/* ===== Buttons (no pop-up notifications) ===== */
btnStart?.addEventListener('click', async ()=>{
  if (!rounds.length) await loadToday();
  running = true;
  idx = 0; score = 0; selected = null;
  renderQuestion();
});
btnShuffle?.addEventListener('click', ()=>{
  if (!rounds.length) return;
  // shuffle current set and restart
  for (let i=rounds.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [rounds[i],rounds[j]] = [rounds[j],rounds[i]];
  }
  idx = 0; score = 0; selected = null;
  running = true;
  renderQuestion();
});
btnShare?.addEventListener('click', async ()=>{
  const msg = `I'm playing Brain Bolt! ${score}/${rounds.length||12} — ${location.href}`;
  try{
    if (navigator.share) await navigator.share({text: msg, url: location.href, title: 'Brain Bolt'});
    else navigator.clipboard?.writeText(msg);
  }catch(e){}
});
btnPlayAgain?.addEventListener('click', ()=>{
  btnPlayAgain.classList.add('hidden');
  idx = 0; score = 0; selected = null; running = true;
  renderQuestion();
});

soundBtn?.addEventListener('click', ()=>{
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? '🔊' : '🔈';
});

/* Initial load (don’t auto-start the game) */
loadToday();

  '/favicon.svg', '/icon-192.png', '/icon-512.png',
  '/app-icon.svg', '/site.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => ![STATIC_CACHE].includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then(r => r || fetch(request).then(resp => resp))
  );
});
