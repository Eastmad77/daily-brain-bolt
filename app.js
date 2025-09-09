// === CONFIG: your Google Sheet published CSVs ===
const CSV_LIVE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const CSV_BANK_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

// === Elements ===
const elQ = document.getElementById('question');
const elOpts = document.getElementById('options');
const elFB = document.getElementById('feedback');
const elProgText = document.getElementById('progressText');
const elProgFill = document.getElementById('progressFill');
const elScore = document.getElementById('score');
const elToday = document.getElementById('today');
const elStatus = document.getElementById('statusBadge');
const elTimerBar = document.getElementById('timerBar');
const elElapsed = document.getElementById('elapsed');

const btnStart = document.getElementById('startBtn');
const btnShuffle = document.getElementById('shuffleBtn');
const btnShare = document.getElementById('shareBtn');
const btnPlayAgain = document.getElementById('playAgain');

// === Date ===
const now = new Date();
const todayKey = [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
elToday.textContent = todayKey;

// === State ===
let liveRows = [], bankRows = [];
let todays = [];
let idx = 0, score = 0, selected = null;
let attemptsForThisQ = 0;

// Timer state (per-question)
const QUESTION_MS = 10000;
let rafId = null, tStart = 0, timerRunning = false;

// Elapsed session timer
let sessionStart = 0, elapsedRaf = null, elapsedRunning = false;

function norm(s){ return String(s||'').trim(); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

function updateMeta(){
  elProgText.textContent = `${idx}/${todays.length || 0}`;
  const pct = (todays.length ? (idx / todays.length) : 0) * 100;
  elProgFill.style.width = `${pct}%`;
  elScore.textContent = String(score);
}

function setStatusReady(text='Press Start Quiz'){
  elStatus.textContent = text;
  elStatus.classList.add('ready');
  elStatus.classList.remove('playing');
}

function setStatusPlaying(text='Playing'){
  elStatus.textContent = text;
  elStatus.classList.add('playing');
  elStatus.classList.remove('ready');
}

// ---- Per-question timer (orange bar) ----
function resetQTimer(){
  if(rafId) cancelAnimationFrame(rafId);
  rafId = null; timerRunning = false;
  elTimerBar.style.width = '0%';
}
function startQTimer(onExpire){
  resetQTimer();
  tStart = performance.now();
  timerRunning = true;
  const tick = (tNow) => {
    if(!timerRunning) return;
    const p = Math.min(1, (tNow - tStart) / QUESTION_MS);
    elTimerBar.style.width = (p*100).toFixed(2) + '%';
    if(p >= 1){ timerRunning = false; onExpire?.(); return; }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

// ---- Elapsed session timer (small display) ----
function fmt(ms){
  const s = Math.floor(ms/1000);
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  return `${mm}:${ss}`;
}
function startElapsed(){
  stopElapsed();
  sessionStart = performance.now();
  elapsedRunning = true;
  const loop = () => {
    if(!elapsedRunning) return;
    const delta = performance.now() - sessionStart;
    elElapsed.textContent = fmt(delta);
    elapsedRaf = requestAnimationFrame(loop);
  };
  elapsedRaf = requestAnimationFrame(loop);
}
function stopElapsed(){
  if(elapsedRaf) cancelAnimationFrame(elapsedRaf);
  elapsedRaf = null; elapsedRunning = false;
}

// ---- Render question ----
function renderQuestion(){
  const q = todays[idx];
  if(!q){
    elFB.innerHTML = `<div class="chip ok">Nice! Done for today.</div>`;
    setStatusReady('Complete');
    resetQTimer();
    stopElapsed();
    btnPlayAgain.style.display = 'inline-block';
    return;
  }

  attemptsForThisQ = 0;
  selected = null;
  elFB.innerHTML = '';
  setStatusPlaying(`${q.Difficulty || '—'} • ${q.Category || 'Quiz'}`);

  elQ.textContent = q.Question || '—';
  elOpts.innerHTML = '';

  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  opts.forEach(optText => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = optText;
    btn.onclick = () => handleSelection(optText, q);
    elOpts.appendChild(btn);
  });

  startQTimer(() => {
    // time up = incorrect attempt
    attemptsForThisQ++;
    if(attemptsForThisQ === 1){
      elFB.innerHTML = `<div class="chip warn">Time’s up — incorrect, try again</div>`;
      restartSameQuestion();
    } else {
      elFB.innerHTML = `<div class="chip warn">Incorrect. Quiz ended.</div>`;
      endQuiz();
    }
  });
}

function disableChoices(disabled=true){
  document.querySelectorAll('.choice').forEach(b=>{
    b.classList.toggle('disabled', disabled);
    b.disabled = disabled;
  });
}

function restartSameQuestion(){
  // Restart same q: reset timer and options enabled
  disableChoices(false);
  startQTimer(() => {
    attemptsForThisQ++;
    if(attemptsForThisQ === 1){
      elFB.innerHTML = `<div class="chip warn">Time’s up — incorrect, try again</div>`;
      restartSameQuestion();
    } else {
      elFB.innerHTML = `<div class="chip warn">Incorrect. Quiz ended.</div>`;
      endQuiz();
    }
  });
}

function endQuiz(){
  // Stop timers, disable choices, show Play Again
  timerRunning = false; if(rafId) cancelAnimationFrame(rafId); rafId=null;
  stopElapsed();
  disableChoices(true);
  btnPlayAgain.style.display = 'inline-block';
  setStatusReady('End');
}

function handleSelection(val, q){
  // Auto-evaluate on click
  if(!q) return;
  const isCorrect = norm(val).toLowerCase() === norm(q.Answer).toLowerCase();

  // stop question timer
  timerRunning = false; if(rafId) cancelAnimationFrame(rafId); rafId=null;

  if(isCorrect){
    elFB.innerHTML = `<div class="chip ok">Correct!</div>`;
    score++; idx++;
    updateMeta();
    setTimeout(()=> renderQuestion(), 650);
  } else {
    attemptsForThisQ++;
    if(attemptsForThisQ === 1){
      elFB.innerHTML = `<div class="chip warn">Incorrect, try again</div>`;
      restartSameQuestion();
    } else {
      elFB.innerHTML = `<div class="chip warn">Incorrect. Quiz ended.</div>`;
      endQuiz();
    }
  }
}

// ---- Data ----
function loadCSV(url){
  return new Promise((resolve,reject)=>{
    Papa.parse(url + "&cb=" + Date.now(), {
      download: true, header: true, skipEmptyLines: true,
      complete: ({data}) => resolve((data||[]).filter(r=>r && r.Question)),
      error: (err) => reject(err)
    });
  });
}

async function initData(){
  try{
    const [live, bank] = await Promise.all([ loadCSV(CSV_LIVE_URL), loadCSV(CSV_BANK_URL) ]);
    liveRows = live; bankRows = bank;

    todays = liveRows.filter(r => norm(r.Date) === todayKey);
    if(!todays.length) todays = bankRows.slice(0,12);

    updateMeta();
    setStatusReady('Press Start Quiz');
    elQ.textContent = '';
    elOpts.innerHTML = '';
    elFB.innerHTML = '';
    elTimerBar.style.width = '0%';
    elElapsed.textContent = '00:00';
    btnPlayAgain.style.display = 'none';
  }catch(e){
    console.error("CSV error", e);
    setStatusReady('Couldn’t load questions. Check publish settings.');
  }
}

// ---- Controls ----
btnStart?.addEventListener('click', () => {
  if(!todays.length){ setStatusReady('No quiz rows found.'); return; }
  idx = 0; score = 0; attemptsForThisQ = 0;
  updateMeta();
  startElapsed();
  renderQuestion();
});
btnShuffle?.addEventListener('click', () => {
  if(!todays.length) return;
  todays = shuffle(todays);
  idx = 0; score = 0; attemptsForThisQ = 0;
  updateMeta();
  startElapsed();
  renderQuestion();
});
btnShare?.addEventListener('click', async () => {
  try{
    const shareData = {
      title: 'The Daily BrainBolt',
      text: 'Today’s BrainBolt is live! Can you ace all 12?',
      url: 'https://dailybrainbolt.com/'
    };
    if(navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(shareData.url);
      alert('Link copied to clipboard!');
    }
  }catch(e){ console.log('Share cancelled or failed', e); }
});
btnPlayAgain?.addEventListener('click', () => {
  btnPlayAgain.style.display = 'none';
  setStatusReady('Press Start Quiz');
  elQ.textContent = '';
  elOpts.innerHTML = '';
  elFB.innerHTML = '';
  elTimerBar.style.width = '0%';
  elElapsed.textContent = '00:00';
  stopElapsed();
});

// GO
initData();
