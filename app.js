<script>
// ===========================
// Brain ⚡ Bolt — App Script
// ===========================

// ---- CONFIG ----
const LIVE_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

const QUIZ_LEN = 12;
const PER_QUESTION_SECONDS = 10;

// ---- STATE ----
let allRows = [];
let todays = [];
let idx = 0;
let score = 0;
let selected = null;
let answeredWrongStreak = 0;

let timerId = null;
let timerStart = 0;
let elapsedTick = null;
let audioCtx = null;
let muted = false;

// ---- DOM ----
const qs  = (s, root=document) => root.querySelector(s);
const qsa = (s, root=document) => [...root.querySelectorAll(s)];

// Layout
const elSplash     = qs('#splash');
const elHero       = qs('.hero');
const elToday      = qs('#today');
const elMetaText   = qs('#metaText');
const elStatus     = qs('#statusline');
const elQuestion   = qs('#question');
const elOptions    = qs('#options');
const elScore      = qs('#score');
const elProgText   = qs('#progressText');
const elProgFill   = qs('#progressFill');
const elTimerBar   = qs('#timerBar');
const elElapsed    = qs('#elapsed');
const elFeedback   = qs('#feedback');

// Controls
const btnStart   = qs('#startBtn');
const btnShuffle = qs('#shuffleBtn');
const btnShare   = qs('#shareBtn');
const btnPlay    = qs('#playAgain');
const btnTheme   = qs('#themeToggle');
const btnMute    = qs('#muteBtn');

// Menu (works on all pages that include these)
const btnMenu    = qs('#mmMenuBtn');
const sideMenu   = qs('#mmSideMenu');

// ---- UTIL ----
const todayKey = () => {
  const now = new Date();
  return [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
};

function status(msg){ if(elStatus) elStatus.textContent = msg || ''; }
function setMeta(s){ if(elMetaText) elMetaText.textContent = s || ''; }
function setQuestion(s){ if(elQuestion) elQuestion.textContent = s || ''; }
function setProgress(){
  if(!elProgText || !elProgFill) return;
  elProgText.textContent = `${Math.min(idx, todays.length)}/${todays.length || 0}`;
  const pct = todays.length ? (idx / todays.length) * 100 : 0;
  elProgFill.style.width = `${pct}%`;
  elScore.textContent = String(score);
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

// ---- AUDIO / HAPTICS ----
function ensureAudio(){
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(freq=880, ms=120, gain=0.05){
  if(muted) return;
  const ctx = ensureAudio();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g); g.connect(ctx.destination);
  o.start();
  setTimeout(()=>{ o.stop(); }, ms);
}
function vibrate(ms=40){
  if(navigator.vibrate) navigator.vibrate(ms);
}

// Countdown 3-2-1-Go
function countdown3(onDone){
  const overlay = document.createElement('div');
  overlay.className = 'count-overlay';
  overlay.innerHTML = `
    <div class="count-pod">
      <div id="countDigit" class="count-digit">3</div>
    </div>`;
  document.body.appendChild(overlay);

  const seq = [3,2,1,'Go!'];
  let i = 0;
  const tick = () => {
    const d = qs('#countDigit', overlay);
    d.textContent = seq[i];
    // fancy beep: go higher as we approach "Go!"
    if(seq[i]==='Go!'){ beep(1200,120,0.06); vibrate(30); }
    else { beep(700 + (i*120),120,0.04); }
    i++;
    if(i<seq.length) setTimeout(tick, 700);
    else setTimeout(()=>{ overlay.remove(); onDone && onDone(); }, 400);
  };
  tick();
}

// ---- TIMER ----
// Smooth leftwards fill (right -> left) over PER_QUESTION_SECONDS
function startQuestionTimer(onExpire){
  stopQuestionTimer();
  const total = PER_QUESTION_SECONDS * 1000;
  const start = performance.now();
  elTimerBar.style.transition = 'none';
  elTimerBar.style.transform = 'scaleX(1)';
  elTimerBar.getBoundingClientRect(); // reflow
  elTimerBar.style.transition = `transform ${PER_QUESTION_SECONDS}s linear`;
  // scale from right to left:
  elTimerBar.style.transformOrigin = 'right center';
  requestAnimationFrame(()=> {
    elTimerBar.style.transform = 'scaleX(0)';
  });

  timerId = setTimeout(()=>{
    stopQuestionTimer();
    onExpire && onExpire();
  }, total);

  // elapsed clock
  timerStart = Date.now();
  if(elElapsed){
    if(elapsedTick) clearInterval(elapsedTick);
    elapsedTick = setInterval(()=>{
      const sec = Math.floor((Date.now()-timerStart)/1000);
      const mm = String(Math.floor(sec/60)).padStart(2,'0');
      const ss = String(sec%60).padStart(2,'0');
      elElapsed.textContent = `${mm}:${ss}`;
    }, 250);
  }
}
function stopQuestionTimer(){
  if(timerId){ clearTimeout(timerId); timerId = null; }
  if(elTimerBar){
    elTimerBar.style.transition = 'none';
    elTimerBar.style.transform = 'scaleX(1)';
  }
  if(elapsedTick){ clearInterval(elapsedTick); elapsedTick = null; }
}

// ---- CSV ----
async function fetchCSV(url){
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error(`CSV fetch ${res.status}`);
  const text = await res.text();
  // very small CSV parser (no quotes w/ commas support — assumed clean sheet)
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line=>{
    // handle commas inside Explanation by splitting only first 11 commas
    let parts = [];
    let curr = '';
    let commas = 0;
    for (let ch of line){
      if(ch===',' && commas < headers.length-1){ parts.push(curr); curr=''; commas++; }
      else curr += ch;
    }
    parts.push(curr);
    const obj = {};
    headers.forEach((h,i)=> obj[h.trim()] = (parts[i]||'').trim());
    return obj;
  });
}

async function loadData(){
  setMeta(''); // don’t show “loading today’s set…”
  status('Loading questions…');

  // Try live first
  try{
    const live = await fetchCSV(LIVE_CSV);
    const rows = (live||[]).filter(r => r && r.Question);
    if(rows.length){
      status(`Loaded ${rows.length} from live`);
      return rows.slice(0, QUIZ_LEN);
    }
  }catch(e){ console.warn('live csv failed', e); }

  // Fallback bank
  try{
    const bank = await fetchCSV(BANK_CSV);
    const rows = (bank||[]).filter(r => r && r.Question);
    status(`Loaded ${rows.length} from bank`);
    // pick the first daily slice of 12
    return rows.slice(0, QUIZ_LEN);
  }catch(e){
    console.error('bank csv failed', e);
    status('Could not load questions.');
    return [];
  }
}

// ---- QUIZ FLOW ----
function resetQuizSet(set){
  todays = [...set];
  idx = 0;
  score = 0;
  answeredWrongStreak = 0;
  setProgress();
  setMeta('Ready');
  setQuestion('Press Start Quiz');
  elOptions.innerHTML = '';
  elFeedback.innerHTML = '';
  stopQuestionTimer();
}

function revealOutcome(isCorrect, q){
  if(isCorrect){
    // subtle green flash + beep
    beep(880,120,0.06); vibrate(18);
    elFeedback.innerHTML = `<div class="badge correct-badge">Correct</div>`;
    score++;
    idx++;
    answeredWrongStreak = 0;
    setProgress();
    setTimeout(showQuestion, 600);
  }else{
    // red flash + buzz
    beep(220,120,0.04); vibrate(60);
    answeredWrongStreak++;
    elFeedback.innerHTML = `<div class="badge wrong-badge">Incorrect — try again</div>`;
    if(answeredWrongStreak >= 2){
      // Game over
      stopQuestionTimer();
      elFeedback.innerHTML = `<div class="badge gameover-badge">Game Over</div>`;
      btnPlay.style.display = 'inline-flex';
      // disable option buttons
      qsa('.choice').forEach(b => b.disabled = true);
    }else{
      // Restart same question after a short beat
      setTimeout(()=> { showQuestion(/*retrySame*/true); }, 800);
    }
  }
}

function wireOptionButtons(q){
  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  elOptions.innerHTML = '';
  opts.forEach((label) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = label;
    btn.onmouseenter = ()=> btn.classList.add('hovering');
    btn.onmouseleave = ()=> btn.classList.remove('hovering');
    btn.onclick = () => {
      if(btn.disabled) return;
      qsa('.choice').forEach(b => b.classList.remove('selected','correct','incorrect'));
      btn.classList.add('selected');
      const isCorrect = (label.trim().toLowerCase() === (q.Answer||'').trim().toLowerCase());
      // visual outlines only; don’t show the correct answer text
      btn.classList.add(isCorrect ? 'correct' : 'incorrect');
      stopQuestionTimer();
      revealOutcome(isCorrect, q);
    };
    elOptions.appendChild(btn);
  });
}

function showQuestion(retrySame=false){
  elFeedback.innerHTML = '';
  if(idx >= todays.length){
    setMeta('Done for today!');
    elQuestion.textContent = 'Nice! You finished the set.';
    btnPlay.style.display = 'inline-flex';
    elOptions.innerHTML = '';
    stopQuestionTimer();
    return;
  }
  const q = todays[retrySame ? idx : idx];
  setMeta(`${q.Difficulty||'—'} • ${q.Category||'Quiz'}`);
  setQuestion(q.Question || '—');
  wireOptionButtons(q);
  btnPlay.style.display = 'none';

  // start per-question timer
  startQuestionTimer(()=>{
    // timer expired counts as incorrect attempt
    qsa('.choice').forEach(b => b.classList.add('timeout'));
    revealOutcome(false, q);
  });
}

async function startQuiz(){
  // 3-second countdown before first question
  countdown3(async ()=>{
    // ensure set is loaded
    if(!todays.length){
      resetQuizSet(await loadData());
    }
    idx = 0; score=0; answeredWrongStreak=0;
    setProgress();
    showQuestion();
  });
}

function shuffleSet(){
  if(!todays.length) return;
  for(let i=todays.length-1;i>0;i--){
    const j = Math.floor(Math.random()* (i+1));
    [todays[i], todays[j]] = [todays[j], todays[i]];
  }
  idx = 0; score = 0; answeredWrongStreak=0;
  setProgress();
  setMeta('Shuffled');
  setTimeout(()=> setMeta('Ready'), 600);
  setQuestion('Press Start Quiz');
  elOptions.innerHTML = '';
  elFeedback.innerHTML = '';
  stopQuestionTimer();
}

// ---- THEME ----
function toggleTheme(){
  const html = document.documentElement;
  const cur = html.getAttribute('data-theme') || 'dark';
  html.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
}
function toggleMute(){
  muted = !muted;
  if(btnMute) btnMute.textContent = muted ? '🔇' : '🔊';
}

// ---- MENU ----
function openMenu(){
  if(!sideMenu) return;
  sideMenu.classList.add('open');
  sideMenu.setAttribute('aria-hidden','false');
  // auto-hide after 5s of no interaction
  setTimeout(()=>{
    if(sideMenu.classList.contains('open')) closeMenu();
  }, 5000);
}
function closeMenu(){
  if(!sideMenu) return;
  sideMenu.classList.remove('open');
  sideMenu.setAttribute('aria-hidden','true');
}

// ---- SHARE ----
async function doShare(){
  const url = location.origin + '/';
  const text = `I’m playing Brain ⚡ Bolt — daily quiz! Join me: ${url}`;
  try{
    if(navigator.share){
      await navigator.share({ title:'Brain ⚡ Bolt', text, url });
    }else{
      await navigator.clipboard.writeText(text);
      alert('Share text copied!');
    }
  }catch(e){}
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async ()=>{
  // today label
  if(elToday) elToday.textContent = todayKey();

  // splash in, then out (only on index pages that have #splash)
  if(elSplash){
    elSplash.classList.remove('hidden'); // show
    setTimeout(()=> elSplash.classList.add('hidden'), 1600);
  }

  // DO NOT show "loading today’s set…" beneath Ready
  setMeta('Ready');
  status('');

  // wire buttons (guard if not present on content pages)
  btnStart && (btnStart.onclick = startQuiz);
  btnShuffle && (btnShuffle.onclick = shuffleSet);
  btnShare && (btnShare.onclick = doShare);
  btnPlay && (btnPlay.onclick = async ()=>{
    resetQuizSet(await loadData());
    setMeta('Ready');
    setQuestion('Press Start Quiz');
  });

  btnTheme && (btnTheme.onclick = toggleTheme);
  btnMute && (btnMute.onclick = toggleMute);

  // menu
  btnMenu && (btnMenu.onclick = openMenu);
  // close menu by clicking outside
  sideMenu && sideMenu.addEventListener('click', e=>{
    if(e.target === sideMenu) closeMenu();
  });

  // preload data but don’t auto-start
  try{
    const set = await loadData();
    resetQuizSet(set);
  }catch(e){ /* handled in loadData */ }

  // service worker (if present)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  }
});
</script>
