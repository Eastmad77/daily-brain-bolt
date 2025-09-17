// Brain ⚡ Bolt — app (fix4)
// Restores blue circle countdown + makes it always show
// Restores timer bars; main elapsed timer is now green
// Defensive DOM access

(() => {
  const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";
  const QUESTION_TIME_MS = 10000, QUESTION_TICK_MS = 100;

  let questions = [], currentIndex = 0, score = 0, wrongStreak = 0, elapsed = 0;
  let elapsedInterval = null;
  let qTimer = null, qRemaining = QUESTION_TIME_MS, qLastTickSec = 3;
  let soundOn = true;

  const $ = id => document.getElementById(id);
  const setText = (el, txt) => { if (el) el.textContent = txt; };
  const showEl = (el, forceFlex=false) => { if (el){ el.hidden = false; el.style.display = forceFlex ? "flex" : ""; } };
  const hideEl = el => { if (el){ el.hidden = true; el.style.display = "none"; } };
  const fmt = sec => { const m=Math.floor(sec/60), s=sec%60; return `${m}:${s<10?'0':''}${s}`; };
  const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

  // Audio/Haptics
  function beep(freq=600, dur=0.25){
    if (!soundOn) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type="sine"; osc.frequency.value=freq;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.value=.25; const t0=ctx.currentTime;
      osc.start(t0); gain.gain.exponentialRampToValueAtTime(.0001,t0+dur); osc.stop(t0+dur+.02);
    } catch {}
  }
  const beepTick=()=>beep(620,.22), beepGo=()=>beep(950,.28), sfxCorrect=()=>beep(1020,.18), sfxIncorrect=()=>beep(220,.2), tickSoft=()=>beep(740,.08);
  const vibrate = ms => { if (navigator.vibrate) navigator.vibrate(ms); };

  function fetchCSV(){
    return new Promise((resolve,reject)=>{
      if (!window.Papa) return reject(new Error("PapaParse not loaded"));
      Papa.parse(CSV_URL, { download:true, header:true, skipEmptyLines:true,
        complete:(res)=>resolve(res.data), error:(err)=>reject(err) });
    });
  }

  // Cache els
  let startBtn, shuffleBtn, shareBtn, playAgainBtn, qBox, choicesDiv, pillScore, pillStreak, progressLabel,
      elapsedTimeEl, countdownOverlay, countNum, successSplash, gameOverBox, gameOverText, timerBar, qTimerBar,
      soundBtn, setLabel, ssPlayAgain, ssHomeBtn, ssShareScore;
  function cacheEls(){
    startBtn = $("startBtn"); shuffleBtn = $("shuffleBtn"); shareBtn = $("shareBtn"); playAgainBtn = $("playAgainBtn");
    qBox = $("questionBox"); choicesDiv = $("choices"); pillScore = $("pillScore"); pillStreak = $("pillStreak");
    progressLabel = $("progressLabel"); elapsedTimeEl = $("elapsedTime");
    countdownOverlay = $("countdownOverlay"); countNum = $("countNum");
    successSplash = $("successSplash"); gameOverBox = $("gameOverBox"); gameOverText = $("gameOverText");
    timerBar = $("timerBar"); qTimerBar = $("qTimerBar"); soundBtn = $("soundBtn"); setLabel = $("setLabel");
    ssPlayAgain = $("ssPlayAgain"); ssHomeBtn = $("ssHomeBtn"); ssShareScore = $("ssShareScore");
  }

  function ensureSuccessHidden(){
    hideEl(successSplash);
    if (successSplash){
      successSplash.classList.remove("show");
      successSplash.setAttribute("aria-hidden","true");
      successSplash.style.pointerEvents = "none";
    }
  }
  function showSuccess(){
    if (!successSplash) return;
    successSplash.style.pointerEvents = "auto";
    successSplash.removeAttribute("hidden"); successSplash.style.display = "";
    successSplash.setAttribute("aria-hidden","false");
    successSplash.classList.remove("show"); void successSplash.offsetWidth; successSplash.classList.add("show");
  }

  function startQuestionTimer(onTimeout){
    stopQuestionTimer(); if (!qTimerBar) return;
    qRemaining = QUESTION_TIME_MS; qLastTickSec = 3;
    qTimerBar.classList.remove("warn"); qTimerBar.style.width = "100%";
    qTimer = setInterval(()=>{
      qRemaining -= QUESTION_TICK_MS;
      const pct = Math.max(0, qRemaining/QUESTION_TIME_MS)*100;
      qTimerBar.style.width = pct + "%";
      const secsLeft = Math.ceil(qRemaining/1000);
      if (qRemaining <= 3000){
        qTimerBar.classList.add("warn");
        if (secsLeft > 0 && secsLeft < qLastTickSec + 1){ tickSoft(); qLastTickSec = secsLeft; }
      }
      if (qRemaining <= 0){ stopQuestionTimer(); onTimeout && onTimeout(); }
    }, QUESTION_TICK_MS);
  }
  function stopQuestionTimer(){ if (qTimer){ clearInterval(qTimer); qTimer=null; } }

  async function startGame(){
    try{
      ensureSuccessHidden();
      setText(setLabel, "Loading…");
      const data = await fetchCSV();
      questions = shuffle(data).slice(0,12);
      currentIndex = 0; score = 0; wrongStreak = 0; elapsed = 0;

      setText(pillScore, "Score 0");
      setText(pillStreak, "Streak 0");
      setText(progressLabel, "Q 0/12");
      if (gameOverBox) gameOverBox.style.display = "none";
      if (playAgainBtn){ playAgainBtn.style.display = "none"; playAgainBtn.classList.remove("pulse"); }
      setText(setLabel, "Ready");

      // 3 → 2 → 1 → GO (blue circle)
      let n = 3;
      if (countNum && countdownOverlay){
        setText(countNum, n);
        countdownOverlay.classList.add("show"); // force flex display
        showEl(countdownOverlay, true);
        const int = setInterval(()=>{
          n--;
          if (n>0){
            setText(countNum, n);
            countNum.style.animation = "none"; void countNum.offsetWidth; countNum.style.animation = "popIn .4s ease";
            beepTick();
          } else {
            clearInterval(int);
            setText(countNum, "GO");
            countNum.style.animation = "none"; void countNum.offsetWidth; countNum.style.animation = "popIn .4s ease";
            beepGo();
            setTimeout(()=>{
              countdownOverlay.classList.remove("show");
              hideEl(countdownOverlay);
              beginQuiz();
            }, 380);
          }
        }, 700);
      } else {
        beginQuiz();
      }
    }catch(e){
      setText(qBox, "Could not load today’s quiz. Please try again.");
      setText(setLabel, "Error");
      console.error(e);
    }
  }

  function beginQuiz(){
    elapsed = 0; setText(elapsedTimeEl, "0:00"); if (timerBar) timerBar.style.width = "0%";
    clearInterval(elapsedInterval);
    // Main elapsed timer (green bar)
    elapsedInterval = setInterval(()=>{
      elapsed++; setText(elapsedTimeEl, fmt(elapsed));
      if (timerBar){
        // fills to 100% at 5 minutes; adjust if you want slower/faster
        const pct = Math.min(100, (elapsed/300)*100);
        timerBar.style.width = pct + "%";
      }
    },1000);
    showQuestion();
  }

  function showQuestion(){
    if (currentIndex >= 12) return endGame();
    const q = questions[currentIndex];
    setText(qBox, q?.Question || "—");
    if (choicesDiv) choicesDiv.innerHTML = "";
    ["OptionA","OptionB","OptionC","OptionD"].forEach(k=>{
      const val = q?.[k]; if(!val || !choicesDiv) return;
      const b = document.createElement("button");
      b.textContent = String(val);
      b.addEventListener("click", ()=> handleAnswer(b, q.Answer));
      choicesDiv.appendChild(b);
    });
    setText(progressLabel, `Q ${currentIndex+1}/12`);
    startQuestionTimer(()=> handleTimeout());
  }

  function handleTimeout(){
    sfxIncorrect(); vibrate(160);
    wrongStreak++; setText(pillStreak, `Streak ${Math.max(0, score - wrongStreak)}`);
    if (wrongStreak >= 2){ endGame("Two wrong in a row!"); return; }
    currentIndex++; (currentIndex >= 12) ? endGame() : showQuestion();
  }

  function handleAnswer(btn, correctText){
    stopQuestionTimer();
    if (choicesDiv) [...choicesDiv.querySelectorAll("button")].forEach(b=>b.disabled=true);
    const isCorrect = (btn.textContent||"").trim().toLowerCase() === String(correctText||"").trim().toLowerCase();
    if (isCorrect){ btn.classList.add("correct"); sfxCorrect(); vibrate(60); score++; wrongStreak=0; }
    else { btn.classList.add("incorrect"); sfxIncorrect(); vibrate(160); wrongStreak++; }
    setText(pillScore, `Score ${score}`);
    setText(pillStreak, `Streak ${Math.max(0, score - wrongStreak)}`);
    if (wrongStreak >= 2){ setTimeout(()=>endGame("Two wrong in a row!"), 700); return; }
    setTimeout(()=>{ currentIndex++; (currentIndex >= 12) ? endGame() : showQuestion(); }, 800);
  }

  function endGame(msg=""){
    clearInterval(elapsedInterval); stopQuestionTimer();
    if (msg){
      setText(gameOverText, msg);
      if (gameOverBox) gameOverBox.style.display = "block";
      if (playAgainBtn){ playAgainBtn.style.display = "inline-block"; playAgainBtn.classList.add("pulse"); }
    } else {
      showSuccess();
    }
  }

  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    cacheEls();
    // hide success on boot
    ensureSuccessHidden();

    // soften/remove start splash after a beat
    window.addEventListener("load", ()=> setTimeout(()=>{
      const s = $("startSplash"); if (s){ s.classList.add("hiding"); setTimeout(()=> s.remove(), 420); }
    }, 1300));

    // wire actions
    startBtn && startBtn.addEventListener("click", startGame);
    shuffleBtn && shuffleBtn.addEventListener("click", ()=>{ shuffle(questions); currentIndex=0; wrongStreak=0; showQuestion(); });
    shareBtn && shareBtn.addEventListener("click", ()=>{
      const text = `I'm playing Brain ⚡ Bolt! Current score: ${score}/12`;
      if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
      else navigator.clipboard?.writeText(`${text} - ${location.href}`);
    });
    playAgainBtn && playAgainBtn.addEventListener("click", startGame);

    // success splash
    ssPlayAgain && ssPlayAgain.addEventListener("click", (e)=>{ e.preventDefault(); ensureSuccessHidden(); startGame(); });
    ssHomeBtn && ssHomeBtn.addEventListener("click", ()=>{ ensureSuccessHidden(); /* link handles nav */ });
    ssShareScore && ssShareScore.addEventListener("click", (e)=>{
      e.preventDefault();
      const text = `I scored ${score}/12 on today’s Brain ⚡ Bolt!`;
      if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
      else navigator.clipboard?.writeText(`${text} - ${location.href}`);
    });

    // sound
    soundBtn && soundBtn.addEventListener("click", ()=>{ soundOn = !soundOn; soundBtn.textContent = soundOn ? "🔊" : "🔇"; });
  });
})();
