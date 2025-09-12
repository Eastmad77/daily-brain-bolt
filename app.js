/* Brain ⚡ Bolt — app.js (fixes + countdown + smooth timer + sound/vibration + menu) */

/* ====== CONFIG: CSV URLs (make sure these are your live links) ====== */
const LIVE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

/* ====== DOM ====== */
const elQ = document.getElementById('question');
const elOpts = document.getElementById('options');
const elFB = document.getElementById('feedback');
const elMetaText = document.getElementById('metaText');
const elToday = document.getElementById('today');
const elProgText = document.getElementById('progressText');
const elProgFill = document.getElementById('progressFill');
const elScore = document.getElementById('score');
const elStatus = document.getElementById('statusline');
const elTimerFill = document.getElementById('timerFill');
const elElapsed = document.getElementById('elapsed');
const startBtn = document.getElementById('startBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const shareBtn = document.getElementById('shareBtn');
const playAgainBtn = document.getElementById('playAgain');
const menuBtn = document.getElementById('menuBtn');
const sideMenu = document.getElementById('sideMenu');
const soundBtn = document.getElementById('soundBtn');
const themeBtn = document.getElementById('themeBtn');

const now = new Date();
const todayKey = [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
if (elToday) elToday.textContent = todayKey;
const yearEl = document.getElementById('year'); if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* ====== STATE ====== */
let allRows = [], todays = [], idx = 0, score = 0;
let selected = null, wrongStreak = 0;
let quizStarted = false;
let elapsedTimer = null, elapsedStartMs = 0;
let roundTimer = null, roundMsLeft = 0;
let soundOn = JSON.parse(localStorage.getItem('bb_sound') || 'true');
updateSoundIcon();

function updateSoundIcon(){ if (soundBtn) soundBtn.textContent = soundOn ? '🔊' : '🔇'; }

/* ====== AUDIO / VIBRATION ====== */
let audioCtx = null;
function ensureAudioCtx(){ if (!audioCtx) { try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){} } }
function beep(freq=440, ms=120, type='sine', gain=0.06){
  if (!soundOn) return;
  ensureAudioCtx(); if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start();
  setTimeout(()=>{ osc.stop(); }, ms);
}
function buzz(pattern=[60,40,60]){ try{ navigator.vibrate && navigator.vibrate(pattern); }catch(e){} }

/* ====== MENU ====== */
let menuAutoHide = null;
function openMenu(){
  sideMenu?.classList.add('open');
  sideMenu?.setAttribute('aria-hidden','false');
  if (menuAutoHide) clearTimeout(menuAutoHide);
  menuAutoHide = setTimeout(closeMenu, 5000);
}
function closeMenu(){
  sideMenu?.classList.remove('open');
  sideMenu?.setAttribute('aria-hidden','true');
}
menuBtn?.addEventListener('click', openMenu);

/* close menu if user taps outside (mobile) */
document.addEventListener('click', (e)=>{
  if (!sideMenu?.classList.contains('open')) return;
  const within = sideMenu.contains(e.target) || e.target === menuBtn;
  if (!within) closeMenu();
});

/* ====== THEME ====== */
themeBtn?.addEventListener('click', ()=>{
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
});

/* ====== SOUND TOGGLE ====== */
soundBtn?.addEventListener('click', ()=>{
  soundOn = !soundOn;
  localStorage.setItem('bb_sound', JSON.stringify(soundOn));
  updateSoundIcon();
  if (soundOn) { ensureAudioCtx(); beep(520,120,'sine',0.05); }
});

/* ====== SPLASH ====== */
window.addEventListener('load', ()=>{
  const splash = document.getElementById('splash');
  if (splash) setTimeout(()=> splash.remove(), 1800); // remove when animation ends
});

/* ====== CSV LOAD ====== */
function status(msg){
  if (!elStatus) return;
  elStatus.textContent = msg;
  elStatus.style.display = msg ? 'block' : 'none';
  console.log('[CSV]', msg);
}
const norm = s => String(s||'').trim();

async function loadCSVs(){
  status('Loading questions…');
  try{
    const live = await loadCSV(LIVE_CSV_URL);
    const bank = await loadCSV(BANK_CSV_URL);
    const rows = (live.length ? live : bank).filter(r => r && r.Question);
    allRows = rows;
    todays = rows.filter(r => norm(r.Date) === todayKey);
    if (!todays.length) {
      // fallback: first 12 from rows
      todays = rows.slice(0,12);
    }
    status(''); // hide
    elMetaText.textContent = "Ready";
    updateMeta();
    // DO NOT auto-start
  }catch(e){
    console.error(e);
    status('Couldn’t load CSV. Check publish link & permissions.');
    elMetaText.textContent = "Ready";
  }
}
function loadCSV(url){
  return new Promise((resolve, reject)=>{
    Papa.parse(url + (url.includes('?')?'&':'?') + "cb=" + Date.now(), {
      download:true, header:true, skipEmptyLines:true,
      complete: ({data}) => resolve(data||[]),
      error: err => reject(err)
    });
  });
}

/* ====== QUIZ FLOW ====== */
function resetRoundState(){
  idx = 0; score = 0; selected = null; wrongStreak = 0;
  if (!todays.length && allRows.length) todays = allRows.slice(0,12);
  updateMeta();
  elFB.innerHTML = '';
  playAgainBtn.style.display = 'none';
  showReadyUI();
}
function showReadyUI(){
  elQ.textContent = "Press “Start Quiz”";
  elOpts.innerHTML = '';
  stopElapsed();
  stopTimerBar();
  setElapsed(0);
}
function updateMeta(){
  elProgText.textContent = `${Math.min(idx, todays.length)}/${todays.length || 0}`;
  elProgFill.style.width = `${todays.length ? (idx / todays.length) * 100 : 0}%`;
  elScore.textContent = String(score);
}

function showQuestion(){
  const q = todays[idx];
  if (!q){
    // end of set (success)
    stopElapsed();
    stopTimerBar();
    elQ.textContent = "Done for today. Great work!";
    elOpts.innerHTML = '';
    elFB.innerHTML = '';
    playAgainBtn.style.display = 'inline-flex';
    return;
  }
  selected = null;
  elFB.innerHTML = '';
  playAgainBtn.style.display = 'none';

  elMetaText.textContent = `${q.Difficulty || '—'} • ${q.Category || 'Quiz'}`;
  elQ.textContent = q.Question || '—';

  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  elOpts.innerHTML = '';
  opts.forEach((txt) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = txt;
    btn.onclick = () => onSelect(btn, txt, q);
    elOpts.appendChild(btn);
  });

  // start smooth 10s timer for this question
  startTimerBar(10_000, ()=>{ // times up -> treat as wrong attempt
    handleReveal(false, q, true);
  });
}

function onSelect(btn, val, q){
  // highlight selection
  document.querySelectorAll('.choice').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selected = val;
  // check immediately (no Show Answer button)
  if (!q) return;
  const isCorrect = norm(val).toLowerCase() === norm(q.Answer).toLowerCase();
  handleReveal(isCorrect, q, false, btn);
}

function handleReveal(isCorrect, q, timeoutFired=false, clickedBtn=null){
  // stop question timer
  stopTimerBar();

  // audio/vibration
  if (isCorrect){
    beep(420,120,'sine',0.05);
  }else{
    beep(200,120,'sine',0.05);
    buzz([60,40,60]);
  }

  // visual outline on chosen
  const btns = [...document.querySelectorAll('.choice')];
  btns.forEach(b => b.disabled = true);
  if (clickedBtn){
    clickedBtn.classList.add(isCorrect ? 'correct' : 'wrong');
  }else{
    // if time out, mark none, just show a quick wrong pulse on all
    btns.forEach(b => b.classList.add('wrong'));
  }

  if (isCorrect){
    wrongStreak = 0;
    score++; idx++;
    updateMeta();
    setTimeout(()=> showQuestion(), 650);
  }else{
    wrongStreak++;
    if (wrongStreak >= 2){
      // game over — show in question box
      stopElapsed();
      elQ.textContent = "Game Over";
      elOpts.innerHTML = '';
      playAgainBtn.style.display = 'inline-flex';
    }else{
      // retry same question once more automatically
      setTimeout(()=>{
        // reset choices (same q)
        showQuestion();
      }, 700);
    }
  }
}

/* ====== TIMER BAR (smooth, right -> left) ====== */
function startTimerBar(ms, onDone){
  // reset instantly
  elTimerFill.style.transition = 'none';
  elTimerFill.style.transform = 'scaleX(1)'; // full
  // next frame, animate to 0
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      elTimerFill.style.transition = `transform ${ms}ms linear`;
      elTimerFill.style.transform = 'scaleX(0)';
      clearTimeout(roundTimer);
      roundTimer = setTimeout(()=> onDone && onDone(), ms);
    });
  });
}
function stopTimerBar(){
  elTimerFill.style.transition = 'none';
  elTimerFill.style.transform = 'scaleX(0)';
  clearTimeout(roundTimer);
}

/* ====== ELAPSED TIMER ====== */
function startElapsed(){
  elapsedStartMs = Date.now();
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(()=>{
    const s = (Date.now() -
