/* Brain ⚡ Bolt – App core
   Fixes:
   - Splash every load (no auto-start)
   - Working menu + buttons (shuffle/theme/home/sound)
   - 3s countdown with beeps, then start quiz
   - Timer smooth (orange), elapsed clock
   - Improved chip contrast; green/red outline only
   - Hides "loading today's set" under Ready
*/

/* === CONFIG: your published CSVs (Live preferred, Bank fallback) === */
const CSV_LIVE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const CSV_BANK = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

/* === Elements === */
const elQ = document.getElementById('question');
const elOpts = document.getElementById('options');
const elFB = document.getElementById('feedback');
const elMetaText = document.getElementById('metaText');
const elToday = document.getElementById('today');
const elProgText = document.getElementById('progressText');
const elProgFill = document.getElementById('progressFill');
const elTimerFill = document.getElementById('timerFill');
const elScore = document.getElementById('score');
const elPlayAgain = document.getElementById('playAgain');
const elStatus = document.getElementById('statusline');
const elSubtitle = document.getElementById('subtitle');

const btnStart = document.getElementById('startBtn');
const btnShuffle = document.getElementById('shuffleBtn');
const btnShare = document.getElementById('shareBtn');

const btnMenu = document.getElementById('mmMenuBtn');
const sideMenu = document.getElementById('mmSideMenu');
const btnHome = document.getElementById('homeBtn');
const btnTheme = document.getElementById('themeBtn');
const btnSound = document.getElementById('soundBtn');

const splash = document.getElementById('splash');

/* === State === */
const now = new Date();
const todayKey = [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
elToday.textContent = todayKey;

let allRows = [], todays = [];
let idx = 0, score = 0;
let selected = null;
let timerDur = 10; // seconds
let timerStart = null;
let timerReq = null;
let elapsedStart = null;
let elapsedReq = null;
let soundOn = true;
let consecutiveWrong = 0;
let hasStarted = false;

/* === Menu / Buttons === */
function openMenu() {
  sideMenu?.classList.add('open');
  sideMenu?.setAttribute('aria-hidden','false');
  // auto-hide after 5s
  setTimeout(() => {
    sideMenu?.classList.remove('open');
    sideMenu?.setAttribute('aria-hidden','true');
  }, 5000);
}
function closeMenu() {
  sideMenu?.classList.remove('open');
  sideMenu?.setAttribute('aria-hidden','true');
}
btnMenu?.addEventListener('click', openMenu);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeMenu(); });

btnHome?.addEventListener('click', () => { window.location.href = '/index.html'; });
btnTheme?.addEventListener('click', () => {
  // simple theme toggle by flipping bg variables
  const r = document.documentElement;
  const isAlt = r.dataset.alt === '1';
  if (isAlt) {
    r.style.setProperty('--bg', '#0E1E27');
    r.style.setProperty('--bg-2', '#152B36');
    r.dataset.alt = '0';
  } else {
    r.style.setProperty('--bg', '#0B1B22');
    r.style.setProperty('--bg-2', '#0E2530');
    r.dataset.alt = '1';
  }
});
btnSound?.addEventListener('click', () => {
  soundOn = !soundOn;
  btnSound.textContent = soundOn ? '🔊' : '🔇';
});

/* === Audio (beeps) === */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function beep(freq=660, ms=110, volume=0.05){
  if(!soundOn) return;
  try {
    if(!audioCtx) audioCtx = new AudioCtx();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = volume;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); }, ms);
  } catch(e){}
}
function vib(ms=30){
  if(!soundOn) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}

/* === CSV Loader === */
function status(msg){ elStatus.textContent = msg || ''; console.log('[CSV]', msg); }
function norm(s){ return String(s||'').trim(); }

async function loadCSV(url){
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}
function parseCSV(text){
  // simple CSV parser (assumes no embedded commas in quoted fields)
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(',');
  const data = lines.map(line=>{
    // handle basic quoted commas
    const cells = [];
    let cur = '', inQ = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"' && line[i+1] === '"'){ cur+='"'; i++; continue; }
      if (ch === '"'){ inQ = !inQ; continue; }
      if (ch === ',' && !inQ){ cells.push(cur); cur=''; continue; }
      cur += ch;
    }
    cells.push(cur);
    const row = {};
    headers.forEach((h,ix)=> row[h.trim()] = (cells[ix] ?? '').trim());
    return row;
  });
  return data;
}

/* === Quiz control === */
function updateMeta(){
  elProgText.textContent = `${idx}/${todays.length || 0}`;
  const pct = (todays.length ? (idx / todays.length) : 0) * 100;
  elProgFill.style.width = `${pct}%`;
  elScore.textContent = String(score);
}
function stopTimer(){
  timerStart = null;
  cancelAnimationFrame(timerReq);
  elTimerFill.style.width = '0%';
}
function stopElapsed(){
  elapsedStart = null;
  cancelAnimationFrame(elapsedReq);
}
function runElapsed(){
  if(!elapsedStart) elapsedStart = performance.now();
  const t = performance.now();
  const sec = (t - elapsedStart)/1000;
  document.getElementById('elapsed').textContent = `${sec.toFixed(1)}s`;
  elapsedReq = requestAnimationFrame(runElapsed);
}
function runTimer(){
  if(!timerStart) timerStart = performance.now();
  const t = performance.now();
  const elapsed = (t - timerStart)/1000;
  const remain = Math.max(0, timerDur - elapsed);
  const pct = ((timerDur - remain)/timerDur)*100; // fill left->right
  elTimerFill.style.width = `${pct}%`;
  if (remain <= 0){
    // time up -> wrong
    markWrongAndAdvance(true);
    return;
  }
  timerReq = requestAnimationFrame(runTimer);
}

function countdown3(cb){
  // Fancy overlay countdown
  const overlay = document.createElement('div');
  overlay.className = 'count-overlay';
  overlay.innerHTML = `<div class="count-badge"><span id="countNum">3</span></div>`;
  document.body.appendChild(overlay);

  let n = 3;
  const tick = () => {
    const el = document.getElementById('countNum');
    if (!el) return;
    el.textContent = String(n);
    beep(660 - (3-n)*60, 100, 0.06);
    if (n<=1){
      setTimeout(()=>{
        overlay.remove();
        cb();
      }, 350);
    }
    n--;
    if (n>=1) setTimeout(tick, 800);
  };
  setTimeout(tick, 50);
}

/* Selection logic */
function onSelect(btn, val){
  if (!hasStarted) return; // ignore before start
  document.querySelectorAll('.choice').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selected = val;

  // Auto-reveal: check immediately; apply outline color
  const q = todays[idx];
  if (!q) return;
  const correct = norm(selected).toLowerCase() === norm(q.Answer).toLowerCase();
  if (correct){
    btn.classList.add('correct');
    beep(760, 120, 0.07);
    vib(30);
    consecutiveWrong = 0;
    setTimeout(()=>advance(true), 450);
  } else {
    btn.classList.add('wrong');
    beep(260, 140, 0.06);
    vib(90);
    markWrongAndAdvance(false);
  }
}

function markWrongAndAdvance(fromTimeout){
  consecutiveWrong++;
  // first wrong -> reset same question
  if (consecutiveWrong === 1){
    setTimeout(()=>{
      // Re-ask: do not show correct answer, just reset selections
      showQuestion(); // same idx
    }, 550);
  } else {
    // second wrong -> end game
    endGame();
  }
}

function advance(isCorrect){
  if (isCorrect) score++;
  idx++;
  updateMeta();
  if (idx >= todays.length){
    // finished
    elFB.innerHTML = `<span class="gameover">All done — great run!</span>`;
    stopTimer(); stopElapsed();
    elPlayAgain.style.display = "inline-flex";
    return;
  }
  showQuestion();
}

function showQuestion(){
  stopTimer();
  const q = todays[idx];
  elFB.textContent = '';
  selected = null;

  if (!q){
    elQ.textContent = "Nice! Done for today.";
    elPlayAgain.style.display = "inline-flex";
    return;
  }

  consecutiveWrong = 0;
  elMetaText.textContent = `${q.Difficulty || '—'} • ${q.Category || 'Quiz'}`;
  elQ.textContent = q.Question || '—';

  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  elOpts.innerHTML = '';
  opts.forEach((optText) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = optText;
    btn.onmouseenter = () => btn.style.background = 'rgba(74,201,255,0.16)';
    btn.onmouseleave = () => btn.style.background = '';
    btn.onclick = () => onSelect(btn, optText);
    elOpts.appendChild(btn);
  });

  // start per-question timer & elapsed if first question
  timerStart = null;
  requestAnimationFrame(runTimer);
  if (!elapsedStart) requestAnimationFrame(runElapsed);
}

/* Start / Shuffle / Share */
btnStart.addEventListener('click', () => {
  if (!allRows.length){
    status("Loading questions first…");
    return;
  }
  if (hasStarted) return;
  // countdown then start
  countdown3(()=>{
    hasStarted = true;
    idx = 0; score = 0; selected = null;
    updateMeta();
    elSubtitle.textContent = 'Good luck!';
    showQuestion();
  });
});

btnShuffle.addEventListener('click', () => {
  if (!allRows.length) return;
  todays = shuffle(allRows).slice(0, 12);
  hasStarted = false;
  stopTimer(); stopElapsed();
  elSubtitle.textContent = 'Ready';
  elQ.textContent = 'Press “Start Quiz”';
  elOpts.innerHTML = '';
  elFB.textContent = '';
  idx = 0; score = 0; updateMeta();
});

btnShare.addEventListener('click', async () => {
  try {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: 'Brain ⚡ Bolt', text: 'Try today’s Brain ⚡ Bolt!', url });
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied!');
    }
  } catch(e){}
});

/* Play again */
elPlayAgain.addEventListener('click', () => {
  hasStarted = false; stopTimer(); stopElapsed();
  idx = 0; score = 0; updateMeta();
  elSubtitle.textContent = 'Ready';
  elQ.textContent = 'Press “Start Quiz”';
  elOpts.innerHTML = '';
  elFB.textContent = '';
  elPlayAgain.style.display = 'none';
});

/* Helpers */
function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

/* Boot */
(async function init(){
  elSubtitle.textContent = 'Ready';   // do NOT show “loading today’s set…”
  try{
    status('Loading…');
    const dataLive = await loadCSV(CSV_LIVE);
    const rows = (dataLive || []).filter(r => r && r.Question);
    if (rows.length){
      todays = rows.slice(0, 12);
      allRows = rows;
      status(`Loaded ${rows.length} rows (live)`);
    } else {
      throw new Error('No live rows');
    }
  } catch(e){
    try {
      const dataBank = await loadCSV(CSV_BANK);
      const rows = (dataBank || []).filter(r => r && r.Question);
      todays = rows.slice(0, 12);
      allRows = rows;
      status(`Loaded ${rows.length} rows (bank)`);
    } catch(e2){
      status('Couldn’t load CSV. Check Publish and GIDs.');
    }
  } finally {
    // Splash will fade by CSS timer; do nothing else here.
    setTimeout(()=>{ splash?.remove(); }, 2200);
  }
})();
