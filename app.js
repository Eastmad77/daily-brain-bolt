/* Brain ⚡ Bolt — App (v321) — fixes:
   - Remove duplicate global: use window.__bbKillSplash
   - Centered hero is CSS-only (no JS changes needed here)
   - Countdown + sounds + vibration + early-end logic retained
*/

const LIVE_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv';

let rows=[], currentQuestionIndex=0, correctCount=0, wrongStreak=0, elapsedInterval=null, elapsedSeconds=0, streak=0;

const elDate=document.getElementById('dateLabel');
const elSet=document.getElementById('setLabel');
const elProgress=document.getElementById('progressLabel');
const elTimerBar=document.getElementById('timerBar');
const elElapsed=document.getElementById('elapsedTime');
const elQ=document.getElementById('questionBox');
const elChoices=document.getElementById('choices');
const elGameOver=document.getElementById('gameOverBox');
const elGameOverText=document.getElementById('gameOverText');
const btnStart=document.getElementById('startBtn');
const btnAgain=document.getElementById('playAgainBtn');
const btnShare=document.getElementById('shareBtn');
const btnShuffle=document.getElementById('shuffleBtn');
const menuBtn=document.getElementById('mmMenuBtn');
const sideMenu=document.getElementById('mmSideMenu');
const soundBtn=document.getElementById('soundBtn');
const notifyBtn=document.getElementById('notifyBtn');
const successSplash=document.getElementById('successSplash');
const countdownOverlay=document.getElementById('countdownOverlay');
const countNum=document.getElementById('countNum');
const pillScore=document.getElementById('pillScore');
const pillStreak=document.getElementById('pillStreak');

const LS_NOTIFY_KEY='bb_notify_enabled', LS_LAST_PLAYED='bb_last_played_nz';

function nzTodayYMD(){ try{ const f=new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}); const p=f.formatToParts(new Date()).reduce((o,x)=>(o[x.type]=x.value,o),{}); return `${p.year}-${p.month}-${p.day}`;}catch{return new Date().toISOString().slice(0,10);} }
elDate && (elDate.textContent=nzTodayYMD());

menuBtn?.addEventListener('click',()=> sideMenu?.classList.toggle('open'));

/* Audio (WebAudio) */
let soundEnabled=true; soundBtn?.addEventListener('click',()=>{ soundEnabled=!soundEnabled; soundBtn.textContent=soundEnabled?'🔊':'🔇'; });
let audioCtx=null; function ensureCtx(){ if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); }
function tone(freq=880,ms=120,vol=0.2){ if(!soundEnabled) return; try{ ensureCtx(); const t0=audioCtx.currentTime; const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type='square'; o.frequency.value=freq; g.gain.value=vol; o.connect(g); g.connect(audioCtx.destination); o.start(t0); g.gain.exponentialRampToValueAtTime(0.0001,t0+ms/1000); o.stop(t0+ms/1000+0.02);}catch{} }
function beepTick(){ tone(620,140,0.22); } function beepGo(){ tone(950,180,0.28); }
function playCorrect(){ tone(1020,120,0.25); }
function playIncorrect(){ tone(220,160,0.28); }

/* Notifications */
function canNotify(){return 'Notification' in window}
async function requestNotifyPermission(){ if(!canNotify())return false; if(Notification.permission==='granted')return true; return (await Notification.requestPermission())==='granted';}
function showLocalNotification(t,b){ try{ if(Notification.permission==='granted') new Notification(t,{body:b,icon:'/icon-192.png',badge:'/icon-192.png'});}catch{} }
function maybeShowDailyReady(){ if(!canNotify())return; const en=localStorage.getItem(LS_NOTIFY_KEY)==='1'; if(!en)return; const last=localStorage.getItem(LS_LAST_PLAYED)||''; const today=nzTodayYMD(); if(last && last!==today) showLocalNotification('Today’s quiz is ready!','Come take the new Brain ⚡ Bolt set.'); }
notifyBtn?.addEventListener('click', async()=>{ const ok=await requestNotifyPermission(); if(ok){localStorage.setItem(LS_NOTIFY_KEY,'1'); showLocalNotification('Notifications on','We’ll remind you when a new daily set is ready.');} else {localStorage.removeItem(LS_NOTIFY_KEY); alert('Notifications disabled or not supported.');}});

/* CSV */
async function fetchLiveCSV(){ const res=await fetch(LIVE_CSV_URL,{cache:'no-store'}); if(!res.ok) throw new Error(`Live CSV ${res.status}`); const text=await res.text(); return Papa.parse(text,{header:true,skipEmptyLines:true}).data;}
function normalizeRow(r){ return {date:String(r.Date||'').trim(), q:String(r.Question||'').trim(), opts:[r.OptionA,r.OptionB,r.OptionC,r.OptionD].filter(Boolean).map(v=>String(v).trim()), ans:String(r.Answer||'').trim()};}
function normText(s){ return String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase(); }
function isCorrect(row,selected){ const ans=row.ans; if(/^[ABCD]$/i.test(ans)){ const idx='ABCD'.indexOf(ans[0].toUpperCase()); const correctText=row.opts[idx]||''; return normText(selected)===normText(correctText);} return normText(selected)===normText(ans);}

/* Timer */
function startElapsedTimer(){ clearInterval(elapsedInterval); elapsedSeconds=0; elElapsed&&(elElapsed.textContent='0:00'); elTimerBar&&(elTimerBar.style.transform='scaleX(0)'); elapsedInterval=setInterval(()=>{ elapsedSeconds++; const m=Math.floor(elapsedSeconds/60), s=elapsedSeconds%60; elElapsed&&(elElapsed.textContent=`${m}:${s.toString().padStart(2,'0')}`); elTimerBar&&(elTimerBar.style.transform=`scaleX(${Math.min(1,elapsedSeconds/300)})`); },1000);}
function stopElapsedTimer(){ clearInterval(elapsedInterval); }

/* Countdown */
async function runCountdown(sec=3){ if(!countdownOverlay||!countNum) return; countdownOverlay.classList.add('show'); for(let i=sec;i>=1;i--){ countNum.textContent=String(i); beepTick(); await new Promise(r=>setTimeout(r,700)); } countNum.textContent='GO'; beepGo(); await new Promise(r=>setTimeout(r,400)); countdownOverlay.classList.remove('show'); }

/* Game */
function updateHUD(){ elProgress&&(elProgress.textContent=`Q ${Math.min(currentQuestionIndex+1,12)}/12`); pillScore&&(pillScore.textContent=`Score ${correctCount}`); pillStreak&&(pillStreak.textContent=`Streak ${streak}`); }

async function startGame(){
  try{
    elSet&&(elSet.textContent='Loading…');
    const live=await fetchLiveCSV();
    let data=live.map(normalizeRow).filter(x=>x.q && x.opts.length>=2);
    const todays=data.filter(r=>r.date===nzTodayYMD());
    rows=(todays.length?todays:data).slice(0,12);
    if(!rows.length) throw new Error('No rows');

    currentQuestionIndex=0; correctCount=0; wrongStreak=0; streak=0;
    elGameOver&&(elGameOver.style.display='none'); btnAgain&&(btnAgain.style.display='none'); btnAgain?.classList.remove('pulse');
    elSet&&(elSet.textContent='Ready'); btnShare&&(btnShare.style.display='inline-block');

    await runCountdown(3);
    startElapsedTimer(); showQuestion();
  }catch(err){
    console.error('startGame error:',err);
    elQ && (elQ.textContent='Could not load today’s quiz. Please check the LIVE CSV link.');
    elSet&&(elSet.textContent='Error');
  }
}

function showQuestion(){
  const r=rows[currentQuestionIndex]; if(!r){ endGame(); return; }
  elQ&&(elQ.textContent=r.q||'—'); elChoices&&(elChoices.innerHTML='');
  r.opts.forEach(opt=>{ const b=document.createElement('button'); b.className='choice'; b.textContent=opt; b.onclick=()=>handleAnswer(b,r); elChoices.appendChild(b); });
  updateHUD();
}
function disableChoices(){ [...document.querySelectorAll('.choice')].forEach(b=>{ b.disabled=true; b.classList.add('disabled'); }); }

function handleAnswer(btn,row){
  if(!btn || btn.disabled) return;
  disableChoices();
  const correct=isCorrect(row,btn.textContent);

  if(correct){ btn.classList.add('correct'); playCorrect(); if(navigator.vibrate) navigator.vibrate(60); correctCount++; wrongStreak=0; streak++; }
  else { btn.classList.add('incorrect'); playIncorrect(); if(navigator.vibrate) navigator.vibrate(160); wrongStreak++; streak=0; }

  if(/^[ABCD]$/i.test(row.ans)){ const idx='ABCD'.indexOf(row.ans[0].toUpperCase()); const correctText=row.opts[idx]||''; [...document.querySelectorAll('.choice')].forEach(b=>{ if(normText(b.textContent)===normText(correctText)) b.classList.add('correct'); }); }
  else { [...document.querySelectorAll('.choice')].forEach(b=>{ if(normText(b.textContent)===normText(row.ans)) b.classList.add('correct'); }); }

  updateHUD();

  if(wrongStreak>=2){ setTimeout(()=>endGame(true),700); return; }

  setTimeout(()=>{ currentQuestionIndex++; if(currentQuestionIndex>=Math.min(12,rows.length)) endGame(false); else showQuestion(); },900);
}

function endGame(early=false){
  stopElapsedTimer();
  const total=Math.min(12,rows.length||12), mm=Math.floor(elapsedSeconds/60), ss=String(elapsedSeconds%60).padStart(2,'0');
  const text=`${early?'Ended early after two misses. ':''}You answered ${correctCount} / ${total} in ${mm}:${ss}.`;
  elGameOverText&&(elGameOverText.textContent=text);
  elGameOver&&(elGameOver.style.display='block');
  btnAgain&&(btnAgain.style.display='inline-block'); btnAgain&&btnAgain.classList.add('pulse');
  try{ localStorage.setItem(LS_LAST_PLAYED,nzTodayYMD()); }catch{}
  document.getElementById('successSplash')?.classList.add('show');
}

/* Shuffle & Share */
function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function shuffleGame(){ if(!rows.length) return; rows=shuffleArray(rows); currentQuestionIndex=0; correctCount=0; wrongStreak=0; streak=0; elGameOver&&(elGameOver.style.display='none'); btnAgain&&(btnAgain.style.display='none'); btnAgain?.classList.remove('pulse'); startElapsedTimer(); showQuestion(); }
function shareScore(text){ if(navigator.share){ navigator.share({title:'Brain ⚡ Bolt',text,url:location.href}).catch(()=>{}); } else { navigator.clipboard.writeText(`${text} - ${location.href}`).then(()=>alert('Score copied!')).catch(()=>alert('Could not copy.')); } }
function shareCurrent(){ const total=Math.min(12,rows.length||12); const mm=Math.floor(elapsedSeconds/60); const ss=String(elapsedSeconds%60).padStart(2,'0'); shareScore(`I'm playing Brain ⚡ Bolt! Current score: ${correctCount}/${total} in ${mm}:${ss}.`); }

/* Wire UI */
btnStart?.addEventListener('click',startGame);
btnAgain?.addEventListener('click',startGame);
btnShuffle?.addEventListener('click',shuffleGame);
btnShare?.addEventListener('click',shareCurrent);
document.getElementById('ssPlayAgain')?.addEventListener('click',e=>{e.preventDefault(); document.getElementById('successSplash')?.classList.remove('show'); startGame();});
document.getElementById('ssShareScore')?.addEventListener('click',e=>{e.preventDefault(); const total=Math.min(12,rows.length||12); const mm=Math.floor(elapsedSeconds/60); const ss=String(elapsedSeconds%60).padStart(2,'0'); shareScore(`I scored ${correctCount}/${total} in ${mm}:${ss} on today’s Brain ⚡ Bolt!`);});

/* Splash removal — namespaced (no const redeclare) */
if(!window.__bbKillSplash){ window.__bbKillSplash=()=>document.getElementById('startSplash')?.remove(); }
window.addEventListener('load',()=>setTimeout(window.__bbKillSplash,1200));
document.addEventListener('DOMContentLoaded',()=>setTimeout(window.__bbKillSplash,1600));

(function init(){ maybeShowDailyReady(); elSet&&(elSet.textContent='Ready'); elProgress&&(elProgress.textContent='Q 0/12');})();
