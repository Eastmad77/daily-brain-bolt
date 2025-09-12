/* Brain Bolt – app.js */

/** CSV endpoints (LIVE / BANK) */
const LIVE_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

/** Elements */
const elSplash = document.getElementById('splash');
const elQ = document.getElementById('question');
const elOpts = document.getElementById('options');
const elMetaText = document.getElementById('metaText');
const elToday = document.getElementById('today');
const elProgText = document.getElementById('progressText');
const elProgFill = document.getElementById('progressFill');
const elScore = document.getElementById('score');
const elStatus = document.getElementById('statusline');
const elTimer = document.getElementById('timerFill');
const elElapsed = document.getElementById('elapsed');
const elFB = document.getElementById('feedback');
const elPlayAgain = document.getElementById('playAgain');
const btnStart = document.getElementById('startBtn');
const btnShuffle = document.getElementById('shuffleBtn');
const btnShare = document.getElementById('shareBtn');
const btnMenu = document.getElementById('mmMenuBtn');
const sideMenu = document.getElementById('mmSideMenu');
const btnSignIn = document.getElementById('btnSignIn') || document.getElementById('btnSignIn2');
const btnNotify = document.getElementById('btnNotify') || document.getElementById('btnNotify2');
const themeToggle = document.getElementById('themeToggle');
const muteBtn = document.getElementById('muteBtn');

/** Date */
const now = new Date();
const todayKey = [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
if (elToday) elToday.textContent = todayKey;

/** State */
let todays=[], idx=0, score=0, selected=null;
let inRound=false, wrongStreak=0;
let timerRAF=null, startTs=null, elapsedTimer=null;
const ROUND_MS = 10000; // 10s
let muted=false;

/** Splash control (homepage only) */
(function splashShow(){
  if (!elSplash) return; // not on this page
  // Animate: show logo first, then title halfway, then fade out
  setTimeout(()=>{ document.querySelector('.splash-title')?.style.setProperty('opacity','1'); }, 600);
  setTimeout(()=>{ document.querySelector('.splash-sub')?.style.setProperty('opacity','1'); }, 850);
  setTimeout(()=>{
    elSplash.style.opacity='0';
    setTimeout(()=>{ elSplash.remove(); }, 350);
  }, 1700);
})();

/** Menu open/close + auto-hide */
let menuTimer=null;
btnMenu?.addEventListener('click', () => {
  sideMenu?.classList.add('open');
  sideMenu?.setAttribute('aria-hidden','false');
  if (menuTimer) clearTimeout(menuTimer);
  menuTimer = setTimeout(() => {
    sideMenu?.classList.remove('open');
    sideMenu?.setAttribute('aria-hidden','true');
  }, 5000);
});
document.addEventListener('keydown', e => { if (e.key==='Escape') closeMenu(); });
function closeMenu() {
  sideMenu?.classList.remove('open');
  sideMenu?.setAttribute('aria-hidden','true');
}

/** Theme toggle */
themeToggle?.addEventListener('click', ()=>{
  const isDark = document.documentElement.getAttribute('data-theme')!=='light';
  document.documentElement.setAttribute('data-theme', isDark?'light':'dark');
});

/** Sound toggle */
muteBtn?.addEventListener('click', ()=>{
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
});

/** Utilities */
function status(msg){ if (elStatus) elStatus.textContent = msg; console.log('[APP]', msg); }
const norm = s => String(s||'').trim();
function play(id){
  if (muted) return;
  const el = document.getElementById(id);
  if (el) { el.currentTime=0; el.play().catch(()=>{}); }
}
function vibrate(ms){ if (navigator.vibrate) try{ navigator.vibrate(ms); }catch{} }

/** CSV loader */
async function fetchCSV(url){
  const u = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  const res = await fetch(u, { cache:'no-store' });
  if (!res.ok) throw new Error('HTTP '+res.status);
  const text = await res.text();
  return parseCSV(text);
}
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  const headers = lines[0].split(',').map(h=>h.trim());
  const rows = lines.slice(1).map(line => {
    // simple split (assumes no embedded commas)
    const cols = line.split(',');
    const obj={};
    headers.forEach((h,i)=> obj[h]=cols[i]!==undefined?cols[i].trim():'');
    return obj;
  });
  return { headers, rows };
}

/** Build set */
async function buildSet(){
  try{
    status('Loading today’s set…');
    const { rows } = await fetchCSV(LIVE_CSV);
    const valid = rows.filter(r => r && r.Date && r.Question);
    if (!valid.length){
      status('No live rows; loading from bank…');
      const bk = await fetchCSV(BANK_CSV);
      todays = bk.rows.slice(0,12);
    } else {
      todays = valid;
    }
    idx=0; score=0; wrongStreak=0; selected=null; inRound=false;
    updateMeta();
    if (elQ) elQ.textContent = 'Press Start Quiz';
    if (elOpts) elOpts.innerHTML = '';
    if (elFB) elFB.innerHTML = '';
    if (elPlayAgain) elPlayAgain.style.display='none';
    resetTimerBar();
  }catch(err){
    console.error(err);
    status('Couldn’t load CSV. Ensure sheet is Published to the web.');
    if (elQ) elQ.textContent = 'Press Start Quiz';
  }
}

/** Meta/Progress */
function updateMeta(){
  if (!elProgText || !elProgFill || !elScore) return;
  elProgText.textContent = `${idx}/${todays.length||0}`;
  const pct = (todays.length ? (idx/todays.length) : 0) * 100;
  elProgFill.style.width = `${pct}%`;
  elScore.textContent = String(score);
}

/** Timer */
function resetTimerBar(){ cancelAnimationFrame(timerRAF); if (elTimer) elTimer.style.width='100%'; startTs=null; }
function startTimer(){
  resetTimerBar();
  startTs = performance.now();
  const step = (ts)=>{
    const t = ts - startTs;
    const p = Math.min(1, t/ROUND_MS);
    if (elTimer) elTimer.style.width = `${(1-p)*100}%`; // right-to-left fill
    if (p<1 && inRound) { timerRAF = requestAnimationFrame(step); }
    else if (p>=1 && inRound) { onReveal(false, null, true); }
  };
  timerRAF = requestAnimationFrame(step);
}
function startElapsed(){
  const t0 = Date.now();
  clearInterval(elapsedTimer);
  if (!elElapsed) return;
  elapsedTimer = setInterval(()=>{
    const s = Math.floor((Date.now()-t0)/1000);
    elElapsed.textContent = s+'s';
  }, 250);
}
function stopElapsed(){ clearInterval(elapsedTimer); }

/** Show question */
function showQuestion(){
  const q = todays[idx];
  if (!q){
    if (elFB) elFB.innerHTML = `<div class="gameover">Nice! Done for today.</div>`;
    if (elPlayAgain) elPlayAgain.style.display='inline-flex';
    return;
  }
  inRound = true;
  wrongStreak = 0;
  if (elFB) elFB.innerHTML='';
  if (elPlayAgain) elPlayAgain.style.display='none';
  if (elMetaText) elMetaText.textContent = `${q.Difficulty||'—'} • ${q.Category||'Quiz'}`;
  if (elQ) elQ.textContent = q.Question || '—';
  if (elOpts) elOpts.innerHTML = '';
  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  opts.forEach((optText)=>{
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = optText;
    btn.onmouseenter = ()=> btn.style.background='var(--blue-2, #4AC9FF20)';
    btn.onmouseleave = ()=> btn.style.background='';
    btn.onclick = ()=> onSelect(btn, optText);
    elOpts?.appendChild(btn);
  });
  startTimer();
}

/** Select + auto reveal */
function onSelect(btn, val){
  if (!inRound) return;
  document.querySelectorAll('.choice').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selected = val;
  const q = todays[idx];
  if (!q) return;
  const correct = norm(val).toLowerCase() === norm(q.Answer).toLowerCase();
  onReveal(correct, btn, false);
}

/** Reveal logic */
function onReveal(isCorrect, btn, timedOut){
  inRound=false;
  cancelAnimationFrame(timerRAF);

  if (isCorrect){
    btn?.classList.add('correct');
    play('sndCorrect');
    wrongStreak=0;
    score++; idx++;
    updateMeta();
    setTimeout(()=> showQuestion(), 700);
  } else {
    btn?.classList.add('wrong');
    play('sndWrong'); vibrate(80);
    wrongStreak++;
    if (wrongStreak>=2 || timedOut){
      stopElapsed();
      if (elFB) elFB.innerHTML = `<div class="gameover">Game Over</div>`;
      if (elPlayAgain) elPlayAgain.style.display='inline-flex';
      document.querySelectorAll('.choice').forEach(b=>{ b.classList.add('disabled'); b.disabled=true; });
    } else {
      // restart same question
      setTimeout(()=>{
        inRound=true;
        document.querySelectorAll('.choice').forEach(b=>{ b.classList.remove('wrong','selected'); });
        resetTimerBar(); startTimer();
      }, 600);
    }
  }
}

/** Controls */
btnStart?.addEventListener('click', ()=>{
  if (!todays.length){ buildSet().then(()=>{ startElapsed(); showQuestion(); }); }
  else { startElapsed(); showQuestion(); }
});
btnShuffle?.addEventListener('click', async ()=>{
  await buildSet();
});
btnShare?.addEventListener('click', async ()=>{
  const shareData = { title:'Brain Bolt', text:`I’m playing Brain Bolt! Can you beat my score?`, url: location.origin + '/' };
  try{
    if (navigator.share) await navigator.share(shareData);
    else alert('Share not supported on this device.');
  }catch{}
});
elPlayAgain?.addEventListener('click', ()=>{
  buildSet().then(()=>{ /* wait for Start */ });
});

/** Firebase placeholders (safe) */
btnSignIn?.addEventListener('click', ()=>{
  alert('Sign-in disabled in this build. Configure Firebase to enable.');
});
btnNotify?.addEventListener('click', async ()=>{
  if (!('Notification' in window)) return alert('Notifications not supported.');
  const perm = await Notification.requestPermission();
  if (perm!=='granted') return alert('Notifications not enabled.');
  new Notification('Brain Bolt', { body:'You’ll get a ping when the daily quiz is ready!', icon:'/icon-192.png' });
});

/** Boot */
buildSet();
