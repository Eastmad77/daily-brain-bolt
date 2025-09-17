// Brain ⚡ Bolt — app.js (clean version)

(() => {
  const CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";
  const QUESTION_TIME_MS = 10000;
  const QUESTION_TICK_MS = 100;

  let questions = [];
  let currentIndex = 0;
  let score = 0;
  let wrongStreak = 0;
  let elapsed = 0;
  let elapsedInterval = null;
  let qTimer = null;
  let qRemaining = QUESTION_TIME_MS;
  let qLastTickSec = 3;
  let soundOn = true;

  const $ = (id) => document.getElementById(id);
  const setText = (el, txt) => { if (el) el.textContent = txt; };
  const showEl = (el, flex=false) => { if (el){ el.hidden = false; el.style.display = flex ? "flex" : ""; } };
  const hideEl = (el) => { if (el){ el.hidden = true; el.style.display = "none"; } };
  const fmt = (sec) => { const m = Math.floor(sec/60), s = sec%60; return `${m}:${s<10?"0":""}${s}`; };
  const shuffle = (a) => { for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

  // --- Audio / Vibration ---
  function beep(freq=600, dur=0.2){
    if (!soundOn) return;
    try {
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type="sine"; osc.frequency.value=freq;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.value=.25; const t0=ctx.currentTime;
      osc.start(t0); gain.gain.exponentialRampToValueAtTime(.0001, t0+dur);
      osc.stop(t0+dur+.05);
    } catch(e){ console.warn("Audio blocked", e); }
  }
  const sfxCorrect = () => beep(1020,.18);
  const sfxIncorrect = () => beep(220,.2);
  const beepTick = () => beep(620,.22);
  const beepGo = () => beep(950,.28);
  const vibrate = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };

  // --- CSV ---
  function fetchCSV(){
    return new Promise((resolve,reject)=>{
      if (!window.Papa) return reject(new Error("PapaParse missing"));
      Papa.parse(CSV_URL, {
        download:true, header:true, skipEmptyLines:true,
        complete:(res)=>resolve(res.data),
        error:(err)=>reject(err)
      });
    });
  }

  // --- Cache Elements ---
  let startBtn, shuffleBtn, shareBtn, playAgainBtn, qBox, choicesDiv, pillScore, pillStreak, progressLabel,
      elapsedTimeEl, countdownOverlay, countNum, successSplash, gameOverBox, gameOverText, timerBar, qTimerBar,
      soundBtn, setLabel, ssPlayAgain, ssHomeBtn, ssShareScore;
  function cacheEls(){
    startBtn=$("startBtn"); shuffleBtn=$("shuffleBtn"); shareBtn=$("shareBtn"); playAgainBtn=$("playAgainBtn");
    qBox=$("questionBox"); choicesDiv=$("choices"); pillScore=$("pillScore"); pillStreak=$("pillStreak");
    progressLabel=$("progressLabel"); elapsedTimeEl=$("elapsedTime");
    countdownOverlay=$("countdownOverlay"); countNum=$("countNum");
    successSplash=$("successSplash"); gameOverBox=$("gameOverBox"); gameOverText=$("gameOverText");
    timerBar=$("timerBar"); qTimerBar=$("qTimerBar"); soundBtn=$("soundBtn"); setLabel=$("setLabel");
    ssPlayAgain=$("ssPlayAgain"); ssHomeBtn=$("ssHomeBtn"); ssShareScore=$("ssShareScore");
  }

  function ensureSuccessHidden(){
    if (!successSplash) return;
    successSplash.classList.remove("show");
    successSplash.style.display="none";
    successSplash.setAttribute("aria-hidden","true");
  }
  function showSuccess(){
    if (!successSplash) return;
    successSplash.style.display="grid";
    successSplash.setAttribute("aria-hidden","false");
    successSplash.classList.add("show");
  }

  // --- Question Timer ---
  function startQuestionTimer(onTimeout){
    stopQuestionTimer(); if (!qTimerBar) return;
    qRemaining=QUESTION_TIME_MS; qLastTickSec=3;
    qTimerBar.style.width="100%";
    qTimer=setInterval(()=>{
      qRemaining -= QUESTION_TICKMS;
      const pct=Math.max(0,qRemaining/QUESTION_TIME_MS)*100;
      qTimerBar.style.width=pct+"%";
      const secsLeft=Math.ceil(qRemaining/1000);
      if (qRemaining<=3000){
        if (secsLeft>0 && secsLeft<qLastTickSec+1){ beepTick(); qLastTickSec=secsLeft; }
      }
      if (qRemaining<=0){ stopQuestionTimer(); onTimeout && onTimeout(); }
    },QUESTION_TICK_MS);
  }
  function stopQuestionTimer(){ if (qTimer){ clearInterval(qTimer); qTimer=null; } }

  // --- Start Game ---
  async function startGame(){
    try {
      ensureSuccessHidden();
      setText(setLabel,"Loading…");
      const data=await fetchCSV();
      questions=shuffle(data).slice(0,12);
      currentIndex=0; score=0; wrongStreak=0; elapsed=0;
      setText(pillScore,"Score 0"); setText(pillStreak,"Streak 0"); setText(progressLabel,"Q 0/12");
      if (gameOverBox) gameOverBox.style.display="none";
      if (playAgainBtn){ playAgainBtn.style.display="none"; playAgainBtn.classList.remove("pulse"); }
      setText(setLabel,"Ready");

      // Countdown
      let n=3;
      if (countNum && countdownOverlay){
        setText(countNum,n);
        countdownOverlay.classList.add("show"); showEl(countdownOverlay,true);
        const int=setInterval(()=>{
          n--;
          if (n>0){
            setText(countNum,n);
            countNum.style.animation="none"; void countNum.offsetWidth; countNum.style.animation="popIn .4s ease";
            beepTick();
          } else {
            clearInterval(int);
            setText(countNum,"GO");
            countNum.style.animation="none"; void countNum.offsetWidth; countNum.style.animation="popIn .4s ease";
            beepGo();
            setTimeout(()=>{ countdownOverlay.classList.remove("show"); hideEl(countdownOverlay); beginQuiz(); },500);
          }
        },800);
      } else {
        beginQuiz();
      }
    } catch(e){
      setText(qBox,"Could not load today’s quiz.");
      setText(setLabel,"Error");
      console.error(e);
    }
  }

  function beginQuiz(){
    elapsed=0; setText(elapsedTimeEl,"0:00"); if(timerBar) timerBar.style.width="0%";
    clearInterval(elapsedInterval);
    elapsedInterval=setInterval(()=>{
      elapsed++; setText(elapsedTimeEl,fmt(elapsed));
      if (timerBar){ const pct=Math.min(100,(elapsed/300)*100); timerBar.style.width=pct+"%"; }
    },1000);
    showQuestion();
  }

  // --- Show Question ---
  function showQuestion(){
    if (currentIndex>=12) return endGame();
    const q=questions[currentIndex];
    setText(qBox,q?.Question||"—");
    if (choicesDiv) choicesDiv.innerHTML="";
    ["OptionA","OptionB","OptionC","OptionD"].forEach(k=>{
      const val=q?.[k]; if(!val||!choicesDiv) return;
      const b=document.createElement("button");
      b.textContent=String(val);
      b.addEventListener("click",()=>handleAnswer(b,q.Answer));
      choicesDiv.appendChild(b);
    });
    setText(progressLabel,`Q ${currentIndex+1}/12`);
    startQuestionTimer(()=>handleTimeout());
  }

  function handleTimeout(){
    sfxIncorrect(); vibrate(150);
    wrongStreak++; setText(pillStreak,`Streak ${Math.max(0,score-wrongStreak)}`);
    if (wrongStreak>=2){ endGame("Two wrong in a row!"); return; }
    currentIndex++; (currentIndex>=12)?endGame():showQuestion();
  }

  function handleAnswer(btn,correctText){
    stopQuestionTimer();
    if (choicesDiv) [...choicesDiv.querySelectorAll("button")].forEach(b=>b.disabled=true);
    const isCorrect=(btn.textContent||"").trim().toLowerCase()===String(correctText||"").trim().toLowerCase();
    if (isCorrect){ btn.classList.add("correct"); sfxCorrect(); vibrate(60); score++; wrongStreak=0; }
    else { btn.classList.add("incorrect"); sfxIncorrect(); vibrate(160); wrongStreak++; }
    setText(pillScore,`Score ${score}`);
    setText(pillStreak,`Streak ${Math.max(0,score-wrongStreak)}`);
    if (wrongStreak>=2){ setTimeout(()=>endGame("Two wrong in a row!"),700); return; }
    setTimeout(()=>{ currentIndex++; (currentIndex>=12)?endGame():showQuestion(); },800);
  }

  // --- End Game ---
  function endGame(msg=""){
    clearInterval(elapsedInterval); stopQuestionTimer();
    if (msg){
      setText(gameOverText,msg);
      gameOverBox && (gameOverBox.style.display="block");
      playAgainBtn && (playAgainBtn.style.display="inline-block");
    } else {
      showSuccess();
    }
  }

  // --- Boot ---
  document.addEventListener("DOMContentLoaded",()=>{
    cacheEls();
    ensureSuccessHidden();
    window.addEventListener("load",()=>setTimeout(()=>{ const s=$("startSplash"); if(s){ s.classList.add("hiding"); setTimeout(()=>s.remove(),500); } },1200));

    startBtn && startBtn.addEventListener("click",startGame);
    shuffleBtn && shuffleBtn.addEventListener("click",()=>{ shuffle(questions); currentIndex=0; wrongStreak=0; showQuestion(); });
    shareBtn && shareBtn.addEventListener("click",()=>{
      const text=`I'm playing Brain ⚡ Bolt! Score: ${score}/12`;
      if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url:location.href}).catch(()=>{});
      else navigator.clipboard?.writeText(text+" "+location.href);
    });
    playAgainBtn && playAgainBtn.addEventListener("click",startGame);

    ssPlayAgain && ssPlayAgain.addEventListener("click",(e)=>{e.preventDefault(); ensureSuccessHidden(); startGame();});
    ssHomeBtn && ssHomeBtn.addEventListener("click",(e)=>{e.preventDefault(); ensureSuccessHidden(); location.href="/";});
    ssShareScore && ssShareScore.addEventListener("click",(e)=>{e.preventDefault();
      const text=`I scored ${score}/12 on Brain ⚡ Bolt!`;
      if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url:location.href}).catch(()=>{});
      else navigator.clipboard?.writeText(text+" "+location.href);
    });

    soundBtn && soundBtn.addEventListener("click",()=>{ soundOn=!soundOn; soundBtn.textContent=soundOn?"🔊":"🔇"; });
  });
})();
