/* Brain ⚡ Bolt — App (accent palette applied via CSS) */

/* CONFIG */
const GAS_WEBAPP_URL = ''; // disabled
const LIVE_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv';

/* STATE */
let rows=[], currentQuestionIndex=0, correctCount=0, elapsedInterval=null, elapsedSeconds=0;

/* ELs */
const elDate=document.getElementById('dateLabel'), elSet=document.getElementById('setLabel'), elProgress=document.getElementById('progressLabel');
const elTimerBar=document.getElementById('timerBar'), elElapsed=document.getElementById('elapsedTime');
const elQ=document.getElementById('questionBox'), elChoices=document.getElementById('choices');
const elGameOver=document.getElementById('gameOverBox'), elGameOverText=document.getElementById('gameOverText');
const menuBtn=document.getElementById('mmMenuBtn'), sideMenu=document.getElementById('mmSideMenu');
const successSplash=document.getElementById('successSplash'), ssDismiss=document.getElementById('ssDismiss');
const btnStart=document.getElementById('startBtn'), btnAgain=document.getElementById('playAgainBtn'), btnShare=document.getElementById('shareBtn');
const soundBtn=document.getElementById('soundBtn'), notifyBtn=document.getElementById('notifyBtn');

/* CONST */
const LS_NOTIFY_KEY='bb_notify_enabled', LS_LAST_PLAYED='bb_last_played_nz';

/* NZ date */
function nzTodayYMD(){ try{ const f=new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}); const p=f.formatToParts(new Date()).reduce((o,x)=>(o[x.type]=x.value,o),{}); return `${p.year}-${p.month}-${p.day}`;}catch{return new Date().toISOString().slice(0,10);}}
elDate && (elDate.textContent=nzTodayYMD());

/* Menu */
menuBtn?.addEventListener('click',()=>{sideMenu?.classList.toggle('open');});

/* Sounds (answers only) */
let soundEnabled=true, audioCorrect, audioIncorrect;
soundBtn?.addEventListener('click',()=>{soundEnabled=!soundEnabled; soundBtn.textContent=soundEnabled?'🔊':'🔇';});
function ensureAudio(){ if(!audioCorrect) audioCorrect=new Audio('/sounds/correct-beep.mp3'); if(!audioIncorrect) audioIncorrect=new Audio('/sounds/incorrect-buzz.mp3');}
function playCorrect(){ if(!soundEnabled) return; try{ ensureAudio(); audioCorrect.currentTime=0; audioCorrect.play(); }catch{} }
function playIncorrect(){ if(!soundEnabled) return; try{ ensureAudio(); audioIncorrect.currentTime=0; audioIncorrect.play(); }catch{} }

/* Notifications (optional) */
function canNotify(){ return 'Notification' in window; }
async function requestNotifyPermission(){ if(!canNotify()) return false; if(Notification.permission==='granted') return true; return (await Notification.requestPermission())==='granted';}
function showLocalNotification(title,body){ try{ if(Notification.permission==='granted') new Notification(title,{body,icon:'/icon-192.png',badge:'/icon-192.png'});}catch{} }
function maybeShowDailyReady(){ if(!canNotify())return; const enabled=localStorage.getItem(LS_NOTIFY_KEY)==='1'; if(!enabled)return; const last=localStorage.getItem(LS_LAST_PLAYED)||''; const today=nzTodayYMD(); if(last && last!==today) showLocalNotification('Today’s quiz is ready!','Come take the new Brain ⚡ Bolt set.');}
notifyBtn?.addEventListener('click', async()=>{ const ok=await requestNotifyPermission(); if(ok){localStorage.setItem(LS_NOTIFY_KEY,'1'); showLocalNotification('Notifications on','We’ll remind you when a new daily set is ready.');} else {localStorage.removeItem(LS_NOTIFY_KEY); alert('Notifications disabled or not supported.');}});

/* CSV */
async function fetchLiveCSV(){ const res=await fetch(LIVE_CSV_URL,{cache:'no-store'}); if(!res.ok) throw new Error(`Live CSV ${res.status}`); const text=await res.text(); return Papa.parse(text,{header:true,skipEmptyLines:true}).data;}
function normalizeRow(r){ return {date:String(r.Date||'').trim(), q:String(r.Question||'').trim(), opts:[r.OptionA,r.OptionB,r.OptionC,r.OptionD].filter(Boolean).map(v=>String(v).trim()), ans:String(r.Answer||'').trim()};}
function normText(s){ return String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase(); }
function isCorrect(row,selected){ const ans=row.ans; if(/^[ABCD]$/i.test(ans)){ const idx='ABCD'.indexOf(ans[0].toUpperCase()); const correctText=row.opts[idx]||''; return normText(selected)===normText(correctText);} return normText(selected)===normText(ans);}

/* Timer */
function startElapsedTimer(){ clearInterval(elapsedInterval); elapsedSeconds=0; elElapsed&&(elElapsed.textContent='0:00'); elTimerBar&&(elTimerBar.style.transform='scaleX(0)'); elapsedInterval=setInterval(()=>{ elapsedSeconds++; const m=Math.floor(elapsedSeconds/60), s=elapsedSeconds%60; elElapsed&&(elElapsed.textContent=`${m}:${s.toString().padStart(2,'0')}`); const pct=Math.min(1,elapsedSeconds/300); elTimerBar&&(elTimerBar.style.transform=`scaleX(${pct})`); },1000);}
function stopElapsedTimer(){ clearInterval(elapsedInterval);}

/* Game */
async function startGame(){
  try{
    elSet&&(elSet.textContent='Loading…');
    const live=await fetchLiveCSV();
    let data=live.map(normalizeRow).filter(x=>x.q && x.opts.length>=2);
    const today=nzTodayYMD(); const todays=data.filter(r=>r.date===today);
    rows=(todays.length?todays:data).slice(0,12);
    if(!rows.length) throw new Error('No rows');
    currentQuestionIndex=0; correctCount=0;
    elProgress&&(elProgress.textContent=`Q 0/12`);
    elGameOver&&(elGameOver.style.display='none');
    btnAgain&&(btnAgain.style.display='none'); btnShare&&(btnShare.style.display='none');
    elSet&&(elSet.textContent='Ready');
    startElapsedTimer(); showQuestion();
  }catch(err){
    console.error('startGame error:',err);
    elQ.textContent='Could not load today’s quiz. Please check the LIVE CSV link.';
    elSet&&(elSet.textContent='Error');
  }
}
function showQuestion(){
  const r=rows[currentQuestionIndex]; if(!r){ endGame(); return; }
  elQ&&(elQ.textContent=r.q||'—'); elChoices&&(elChoices.innerHTML='');
  r.opts.forEach(opt=>{ const b=document.createElement('button'); b.className='choice'; b.textContent=opt; b.onclick=()=>handleAnswer(b,r); elChoices.appendChild(b); });
  elProgress&&(elProgress.textContent=`Q ${currentQuestionIndex+1}/12`);
}
function disableChoices(){ [...document.querySelectorAll('.choice')].forEach(b=>{ b.disabled=true; b.classList.add('disabled'); }); }
function handleAnswer(btn,row){
  if(!btn || btn.disabled) return;
  disableChoices();
  const correct=isCorrect(row,btn.textContent);
  if(correct){ btn.classList.add('correct'); playCorrect(); }
  else { btn.classList.add('incorrect'); playIncorrect(); if(navigator.vibrate) navigator.vibrate(160); }
  if(/^[ABCD]$/i.test(row.ans)){ const idx='ABCD'.indexOf(row.ans[0].toUpperCase()); const correctText=row.opts[idx]||''; [...document.querySelectorAll('.choice')].forEach(b=>{ if(normText(b.textContent)===normText(correctText)) b.classList.add('correct'); }); }
  else { [...document.querySelectorAll('.choice')].forEach(b=>{ if(normText(b.textContent)===normText(row.ans)) b.classList.add('correct'); }); }
  setTimeout(()=>{ currentQuestionIndex++; if(currentQuestionIndex>=12) endGame(); else showQuestion(); },900);
}
function endGame(){
  stopElapsedTimer();
  const total=rows.length||12, mm=Math.floor(elapsedSeconds/60), ss=String(elapsedSeconds%60).padStart(2,'0');
  const text=`You answered ${correctCount} / ${total} correctly in ${mm}:${ss}!`;
  elGameOverText && (elGameOverText.textContent=text);
  elGameOver && (elGameOver.style.display='block');
  btnAgain&&(btnAgain.style.display='inline-block'); btnShare&&(btnShare.style.display='inline-block');
  try{ localStorage.setItem(LS_LAST_PLAYED,nzTodayYMD()); }catch{}
  showSuccessSplash();
}

/* Success splash */
function showSuccessSplash(){ if(!successSplash) return; successSplash.classList.add('show'); ssDismiss?.addEventListener('click',()=>successSplash.classList.remove('show'),{once:true}); setTimeout(()=>successSplash.classList.remove('show'),2500); }

/* Share */
function shareScore(text){ if(navigator.share){ navigator.share({title:'Brain ⚡ Bolt',text,url:location.href}).catch(()=>{}); } else { navigator.clipboard.writeText(`${text} - ${location.href}`).then(()=>alert('Score copied!')).catch(()=>alert('Could not copy.')); } }
document.getElementById('goPlayAgain')?.addEventListener('click',e=>{e.preventDefault(); startGame();});
document.getElementById('goShareScore')?.addEventListener('click',e=>{e.preventDefault(); const total=rows.length||12; const mm=Math.floor(elapsedSeconds/60); const ss=String(elapsedSeconds%60).padStart(2,'0'); shareScore(`I scored ${correctCount}/${total} in ${mm}:${ss} on today’s Brain ⚡ Bolt quiz!`);});
document.getElementById('ssPlayAgain')?.addEventListener('click',e=>{e.preventDefault(); successSplash.classList.remove('show'); startGame();});
document.getElementById('ssShareScore')?.addEventListener('click',e=>{e.preventDefault(); const total=rows.length||12; const mm=Math.floor(elapsedSeconds/60); const ss=String(elapsedSeconds%60).padStart(2,'0'); shareScore(`I scored ${correctCount}/${total} in ${mm}:${ss} on today’s Brain ⚡ Bolt quiz!`);});

/* Init */
btnStart?.addEventListener('click',startGame);
btnAgain?.addEventListener('click',startGame);
function killSplash(){ const s=document.querySelector('.splash'); if(s) s.remove(); }
document.addEventListener('DOMContentLoaded',()=>setTimeout(killSplash,2200));
window.addEventListener('load',()=>setTimeout(killSplash,2200));
(function init(){ maybeShowDailyReady(); elSet&&(elSet.textContent='Ready');})();
