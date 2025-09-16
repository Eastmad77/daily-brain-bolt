/* Brain ⚡ Bolt — App (2025-09 premium)
   - Premium layout support
   - Answer text white via CSS
   - Countdown (3..2..1) with WebAudio beeps
   - Elapsed timer (top bar) restored
   - Sounds + vibration on correct & incorrect
   - End game after 2 consecutive incorrect answers (Play Again pulses)
   - Header sound + notification buttons
*/

/* ===== CONFIG ===== */
const LIVE_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv';

/* ===== STATE ===== */
let rows = [];
let currentQuestionIndex = 0;
let correctCount = 0;
let wrongStreak = 0;
let elapsedInterval = null;
let elapsedSeconds = 0;
let streak = 0;

/* ===== ELs ===== */
const elDate = document.getElementById('dateLabel');
const elSet = document.getElementById('setLabel');
const elProgress = document.getElementById('progressLabel');
const elTimerBar = document.getElementById('timerBar');
const elElapsed = document.getElementById('elapsedTime');
const elQ = document.getElementById('questionBox');
const elChoices = document.getElementById('choices');
const elGameOver = document.getElementById('gameOverBox');
const elGameOverText = document.getElementById('gameOverText');
const btnStart = document.getElementById('startBtn');
const btnAgain = document.getElementById('playAgainBtn');
const btnShare = document.getElementById('shareBtn');
const btnShuffle = document.getElementById('shuffleBtn');
const menuBtn = document.getElementById('mmMenuBtn');
const sideMenu = document.getElementById('mmSideMenu');
const soundBtn = document.getElementById('soundBtn');
const notifyBtn = document.getElementById('notifyBtn');
const successSplash = document.getElementById('successSplash');
const countdownOverlay = document.getElementById('countdownOverlay');
const countNum = document.getElementById('countNum');
const pillScore = document.getElementById('pillScore');
const pillStreak = document.getElementById('pillStreak');

/* ===== CONSTS ===== */
const LS_NOTIFY_KEY = 'bb_notify_enabled';
const LS_LAST_PLAYED = 'bb_last_played_nz';

/* ===== Date (NZ) ===== */
function nzTodayYMD() {
  try {
    const f = new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'});
    const p = f.formatToParts(new Date()).reduce((o,x)=>(o[x.type]=x.value,o),{});
    return `${p.year}-${p.month}-${p.day}`;
  } catch { return new Date().toISOString().slice(0,10); }
}
elDate && (elDate.textContent = nzTodayYMD());

/* ===== Menu ===== */
menuBtn?.addEventListener('click', () => sideMenu?.classList.toggle('open'));

/* ===== Audio & Vibration ===== */
let soundEnabled = true;
soundBtn?.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
});

// WebAudio generator for countdown ticks (no extra files required)
let audioCtx = null;
function ensureCtx(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
function tone(freq=880, ms=120, vol=0.2){
  if(!soundEnabled) return;
  try{
    ensureCtx();
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type='square'; osc.frequency.value=freq;
    gain.gain.value=vol;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms/1000);
    osc.stop(t0 + ms/1000 + 0.02);
  }catch{}
}
function beepTick(n){ tone(620, 140, 0.22); }   // 3..2..1 ticks
function beepGo(){ tone(950, 180, 0.28); }      // GO

// Answer sounds (using WebAudio so we don’t depend on asset MP3s)
function playCorrect(){ tone(1020, 120, 0.25); }
function playIncorrect(){ tone(220, 160, 0.28); }

/* ===== Notifications ===== */
function canNotify(){ return 'Notification' in window; }
async function requestNotifyPermission(){ if(!canNotify())return false; if(Notification.permission==='granted')return true; return (await Notification.requestPermission())==='granted'; }
function showLocalNotification(title,body){ try{ if(Notification.permission==='granted') new Notification(title,{body,icon:'/icon-192.png',badge:'/icon-192.png'});}catch{} }
function maybeShowDailyReady(){
  if(!canNotify())return; const enabled=localStorage.getItem(LS_NOTIFY_KEY)==='1'; if(!enabled)return;
  const last=localStorage.getItem(LS_LAST_PLAYED)||''; const today=nzTodayYMD();
  if(last && last!==today) showLocalNotification('Today’s quiz is ready!','Come take the new Brain ⚡ Bolt set.');
}
notifyBtn?.addEventListener('click', async()=>{
  const ok=await requestNotifyPermission();
  if(ok){ localStorage.setItem(LS_NOTIFY_KEY,'1'); showLocalNotification('Notifications on','We’ll remind you when a new daily set is ready.'); }
  else { localStorage.removeItem(LS_NOTIFY_KEY); alert('Notifications disabled or not supported.'); }
});

/* ===== CSV ===== */
async function fetchLiveCSV(){
  const res = await fetch(LIVE_CSV_URL,{cache:'no-store'});
  if(!res.ok) throw new Error(`Live CSV ${res.status}`);
  const text = await res.text();
  return Papa.parse(text,{header:true,skipEmptyLines:true}).data;
}
function normalizeRow(r){
  return {
    date: String(r.Date||'').trim(),
    q: String(r.Question||'').trim(),
    opts: [r.OptionA,r.OptionB,r.OptionC,r.OptionD].filter(Boolean).map(v=>String(v).trim()),
    ans: String(r.Answer||'').trim()
  };
}
function normText(s){ return String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase(); }
function isCorrect(row,selected){
  const ans=row.ans;
  if(/^[ABCD]$/i.test(ans)){
    const idx='ABCD'.indexOf(ans[0].toUpperCase());
    const correctText=row.opts[idx]||'';
    return normText(selected)===normText(correctText);
  }
  return normText(selected)===normText(ans);
}

/* ===== Timer ===== */
function startElapsedTimer(){
  clearInterval(elapsedInterval);
  elapsedSeconds=0; elElapsed&&(elElapsed.textContent='0:00'); elTimerBar&&(elTimerBar.style.transform='scaleX(0)');
  elapsedInterval=setInterval(()=>{
    elapsedSeconds++;
    const m=Math.floor(elapsedSeconds/60), s=elapsedSeconds%60;
    elElapsed&&(elElapsed.textContent=`${m}:${s.toString().padStart(2,'0')}`);
    elTimerBar&&(elTimerBar.style.transform=`scaleX(${Math.min(1,elapsedSeconds/300)})`);
  },1000);
}
function stopElapsedTimer(){ clearInterval(elapsedInterval); }

/* ===== Countdown ===== */
async function runCountdown(sec=3){
  if(!countdownOverlay||!countNum) return;
  countdownOverlay.classList.add('show');
  for(let i=sec;i>=1;i--){
    countNum.textContent = String(i);
    beepTick(i);
    await new Promise(r=>setTimeout(r, 700));
  }
  countNum.textContent = 'GO';
  beepGo();
  await new Promise(r=>setTimeout(r, 400));
  countdownOverlay.classList.remove('show');
}

/* ===== Game Flow ===== */
function updateHUD(){
  document.getElementById('progressLabel')&&(document.getElementById('progressLabel').textContent=`Q ${Math.min(currentQuestionIndex+1,12)}/12`);
  pillScore && (pillScore.textContent = `Score ${correctCount}`);
  pillStreak && (pillStreak.textContent = `Streak ${streak}`);
}

async function startGame(){
  try{
    elSet&&(elSet.textContent='Loading…');
    const live = await fetchLiveCSV();
    let data=live.map(normalizeRow).filter(x=>x.q && x.opts.length>=2);
    const todays = data.filter(r=>r.date===nzTodayYMD());
    rows = (todays.length ? todays : data).slice(0,12);
    if(!rows.length) throw new Error('No rows');

    // reset state
    currentQuestionIndex=0; correctCount=0; wrongStreak=0; streak=0;
    elGameOver&&(elGameOver.style.display='none'); btnAgain&&(btnAgain.style.display='none'); btnAgain?.classList.remove('pulse');
    elSet&&(elSet.textContent='Ready'); btnShare&&(btnShare.style.display='inline-block');

    await runCountdown(3);      // ✅ visible + audio countdown
    startElapsedTimer();
    showQuestion();
  }catch(err){
    console.error('startGame error:', err);
    elQ && (elQ.textContent = 'Could not load today’s quiz. Please check the LIVE CSV link.');
    elSet && (elSet.textContent = 'Error');
  }
}

function showQuestion(){
  const r = rows[currentQuestionIndex]; if(!r){ endGame(); return; }
  elQ && (elQ.textContent=r.q||'—');
  elChoices && (elChoices.innerHTML='');
  r.opts.forEach(opt=>{
    const b=document.createElement('button');
    b.className='choice';
    b.textContent=opt;
    b.onclick=()=>handleAnswer(b,r);
    elChoices.appendChild(b);
  });
  updateHUD();
}

function disableChoices(){ [...document.querySelectorAll('.choice')].forEach(b=>{ b.disabled=true; b.classList.add('disabled'); }); }

function handleAnswer(btn,row){
  if(!btn || btn.disabled) return;
  disableChoices();

  const correct = isCorrect(row, btn.textContent);

  if(correct){
    btn.classList.add('correct');
    playCorrect();
    if(navigator.vibrate) navigator.vibrate(60);    // ✅ vibration on correct
    correctCount++; wrongStreak=0; streak++;
  }else{
    btn.classList.add('incorrect');
    playIncorrect();
    if(navigator.vibrate) navigator.vibrate(160);   // ✅ vibration on incorrect
    wrongStreak++; streak=0;
  }

  // mark correct option
  if(/^[ABCD]$/i.test(row.ans)){
    const idx='ABCD'.indexOf(row.ans[0].toUpperCase());
    const correctText=row.opts[idx]||'';
    [...document.querySelectorAll('.choice')].forEach(b=>{ if(normText(b.textContent)===normText(correctText)) b.classList.add('correct'); });
  }else{
    [...document.querySelectorAll('.choice')].forEach(b=>{ if(normText(b.textContent)===normText(row.ans)) b.classList.add('correct'); });
  }

  updateHUD();

  // Early end after 2 consecutive incorrect
  if(wrongStreak>=2){
    setTimeout(()=>endGame(true), 700);
    return;
  }

  setTimeout(()=>{
    currentQuestionIndex++;
    if(currentQuestionIndex>=Math.min(12,rows.length)) endGame(false);
    else showQuestion();
  }, 900);
}

function endGame(early=false){
  stopElapsedTimer();
  const total=Math.min(12, rows.length||12);
  const mm=Math.floor(elapsedSeconds/60), ss=String(elapsedSeconds%60).padStart(2,'0');
  const text = `${early ? 'Ended early after two misses. ' : ''}You answered ${correctCount} / ${total} in ${mm}:${ss}.`;
  elGameOverText && (elGameOverText.textContent = text);
  elGameOver && (elGameOver.style.display='block');
  btnAgain && (btnAgain.style.display='inline-block');
  btnAgain && btnAgain.classList.add('pulse');
  try{ localStorage.setItem(LS_LAST_PLAYED, nzTodayYMD()); }catch{}
  // Optional success splash
  document.getElementById('successSplash')?.classList.add('show');
}

/* Shuffle & Share */
function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function shuffleGame(){ if(!rows.length) return; rows=shuffleArray(rows); currentQuestionIndex=0; correctCount=0; wrongStreak=0; streak=0; elGameOver&&(elGameOver.style.display='none'); btnAgain&&(btnAgain.style.display='none'); btnAgain?.classList.remove('pulse'); startElapsedTimer(); showQuestion(); }
function shareScore(text){ if(navigator.share){ navigator.share({title:'Brain ⚡ Bolt',text,url:location.href}).catch(()=>{}); } else { navigator.clipboard.writeText(`${text} - ${location.href}`).then(()=>alert('Score copied!')).catch(()=>alert('Could not copy.')); } }
function shareCurrent(){ const total=Math.min(12, rows.length||12); const mm=Math.floor(elapsedSeconds/60); const ss=String(elapsedSeconds%60).padStart(2,'0'); shareScore(`I'm playing Brain ⚡ Bolt! Current score: ${correctCount}/${total} in ${mm}:${ss}.`); }

/* Wire UI */
btnStart?.addEventListener('click', startGame);
btnAgain?.addEventListener('click', startGame);
btnShuffle?.addEventListener('click', shuffleGame);
btnShare?.addEventListener('click', shareCurrent);
document.getElementById('ssPlayAgain')?.addEventListener('click', e=>{e.preventDefault(); document.getElementById('successSplash')?.classList.remove('show'); startGame();});
document.getElementById('ssShareScore')?.addEventListener('click', e=>{e.preventDefault(); const total=Math.min(12, rows.length||12); const mm=Math.floor(elapsedSeconds/60); const ss=String(elapsedSeconds%60).padStart(2,'0'); shareScore(`I scored ${correctCount}/${total} in ${mm}:${ss} on today’s Brain ⚡ Bolt!`);});

/* Startup splash removal */
const killSplash=()=>document.getElementById('startSplash')?.remove();
window.addEventListener('load',()=>setTimeout(killSplash,1200));
document.addEventListener('DOMContentLoaded',()=>setTimeout(killSplash,1600));

/* Boot */
(function init(){
  maybeShowDailyReady();
  elSet && (elSet.textContent='Ready');
  document.getElementById('progressLabel')&&(document.getElementById('progressLabel').textContent='Q 0/12');
})();
