// Brain ⚡ Bolt — app (fix6)
// - Success splash starts hidden; only shown on win
// - Blue circular countdown always shows (class-based .show)
// - Timer bars restored
// - Menu wired via shell.js
// - Audio initialized on first gesture to avoid autoplay errors

(() => {
  const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";
  const QUESTION_TIME_MS = 10000, QUESTION_TICK_MS = 100;

  // ---------- Audio (init/reuse on user gesture) ----------
  const Sound = {
    ctx:null, gain:null, enabled:true,
    init(){
      if (this.ctx) return;
      try{
        this.ctx = new (window.AudioContext||window.webkitAudioContext)();
        this.gain = this.ctx.createGain(); this.gain.gain.value = 0.25;
        this.gain.connect(this.ctx.destination);
      }catch(e){ console.warn("Audio init failed", e); this.enabled=false; }
    },
    resume(){ if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(()=>{}); },
    tone(freq=600, dur=0.22){
      if (!this.enabled || !this.ctx) return;
      try{
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type="sine"; osc.frequency.value=freq;
        osc.connect(g); g.connect(this.gain);
        g.gain.value=0.9; const t0=this.ctx.currentTime;
        osc.start(t0); g.gain.exponentialRampToValueAtTime(0.0001, t0+dur); osc.stop(t0+dur+.02);
      }catch{}
    }
  };
  const SFX = { correct:()=>Sound.tone(1020,.18), incorrect:()=>Sound.tone(220,.20), tick:()=>Sound.tone(620,.18), go:()=>Sound.tone(950,.22) };

  // ---------- State ----------
  let questions=[], currentIndex=0, score=0, wrongStreak=0, elapsed=0;
  let elapsedInterval=null, qTimer=null, qRemaining=QUESTION_TIME_MS, qLastTickSec=3;
  let soundOn=true;

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const startBtn=$("startBtn"), shuffleBtn=$("shuffleBtn"), shareBtn=$("shareBtn"), playAgainBtn=$("playAgainBtn");
  const qBox=$("questionBox"), choicesDiv=$("choices"), pillScore=$("pillScore"), pillStreak=$("pillStreak");
  const progressLabel=$("progressLabel"), elapsedTimeEl=$("elapsedTime"), setLabel=$("setLabel");
  const countdownOverlay=$("countdownOverlay"), countNum=$("countNum");
  const successSplash=$("successSplash"), gameOverBox=$("gameOverBox"), gameOverText=$("gameOverText");
  const timerBar=$("timerBar"), qTimerBar=$("qTimerBar"), soundBtn=$("soundBtn");

  // Startup splash fade
  window.addEventListener("load", ()=> setTimeout(()=>{
    const s = $("startSplash"); if (s){ s.classList.add("hiding"); setTimeout(()=> s.remove(), 420); }
  }, 1100));

  // ---------- CSV ----------
  function fetchCSV(){
    return new Promise((resolve,reject)=>{
      if (!window.Papa) return reject(new Error("PapaParse missing"));
      Papa.parse(CSV_URL, { download:true, header:true, skipEmptyLines:true,
        complete:(res)=>resolve(res.data), error:(err)=>reject(err) });
    });
  }

  // ---------- Utils ----------
  const fmt = sec => { const m=Math.floor(sec/60), s=sec%60; return `${m}:${s<10?'0':''}${s}`; };
  const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  const vibrate = ms => { if (navigator.vibrate) navigator.vibrate(ms); };

  // ---------- Question timer ----------
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
        if (secsLeft > 0 && secsLeft < qLastTickSec + 1 && soundOn){ SFX.tick(); qLastTickSec = secsLeft; }
      }
      if (qRemaining <= 0){ stopQuestionTimer(); onTimeout && onTimeout(); }
    }, QUESTION_TICK_MS);
  }
  function stopQuestionTimer(){ if (qTimer){ clearInterval(qTimer); qTimer=null; } }

  // ---------- Game flow ----------
  async function startGame(){
    try{
      // Hide success splash if visible
      if (successSplash){
        successSplash.classList.remove("show");
        successSplash.style.display="none";
        successSplash.setAttribute("aria-hidden","true");
      }

      setLabel && (setLabel.textContent="Loading…");
      const data = await fetchCSV();
      questions = shuffle(data).slice(0,12);
      currentIndex=0; score=0; wrongStreak=0; elapsed=0;

      pillScore && (pillScore.textContent="Score 0");
      pillStreak && (pillStreak.textContent="Streak 0");
      progressLabel && (progressLabel.textContent="Q 0/12");
      gameOverBox && (gameOverBox.style.display="none");
      if (playAgainBtn){ playAgainBtn.style.display="none"; playAgainBtn.classList.remove("pulse"); }
      setLabel && (setLabel.textContent="Ready");

      // Countdown — force visible via class
      let n=3;
      if (countdownOverlay && countNum){
        countNum.textContent = n;
        countdownOverlay.classList.add("show");
        const int = setInterval(()=>{
          n--;
          if (n>0){
            countNum.textContent=n;
            countNum.style.animation="none"; void countNum.offsetWidth; countNum.style.animation="popIn .4s ease";
            if (soundOn){ Sound.init(); Sound.resume(); SFX.tick(); }
          } else {
            clearInterval(int);
            countNum.textContent="GO";
            countNum.style.animation="none"; void countNum.offsetWidth; countNum.style.animation="popIn .4s ease";
            if (soundOn){ Sound.init(); Sound.resume(); SFX.go(); }
            setTimeout(()=>{ countdownOverlay.classList.remove("show"); beginQuiz(); }, 380);
          }
        },700);
      } else {
        beginQuiz();
      }
    }catch(e){
      qBox && (qBox.textContent="Could not load today’s quiz. Please try again.");
      setLabel && (setLabel.textContent="Error");
      console.error(e);
    }
  }

  function beginQuiz(){
    elapsed=0; elapsedTimeEl && (elapsedTimeEl.textContent="0:00"); if (timerBar) timerBar.style.width="0%";
    clearInterval(elapsedInterval);
    // overall elapsed (green bar)
    elapsedInterval = setInterval(()=>{
      elapsed++; elapsedTimeEl && (elapsedTimeEl.textContent = fmt(elapsed));
      if (timerBar){
        const pct = Math.min(100, (elapsed/300)*100); // 5 min = full
        timerBar.style.width = pct + "%";
      }
    },1000);
    showQuestion();
  }

  function showQuestion(){
    if (currentIndex >= 12) return endGame();
    const q = questions[currentIndex];
    qBox && (qBox.textContent = q?.Question || "—");
    if (choicesDiv) choicesDiv.innerHTML = "";
    ["OptionA","OptionB","OptionC","OptionD"].forEach(k=>{
      const val = q?.[k]; if(!val || !choicesDiv) return;
      const b = document.createElement("button");
      b.textContent = String(val);
      b.addEventListener("click", ()=> handleAnswer(b, q.Answer));
      choicesDiv.appendChild(b);
    });
    progressLabel && (progressLabel.textContent = `Q ${currentIndex+1}/12`);
    startQuestionTimer(()=> handleTimeout());
  }

  function handleTimeout(){
    if (soundOn){ Sound.init(); Sound.resume(); SFX.incorrect(); }
    vibrate(160);
    wrongStreak++; pillStreak && (pillStreak.textContent = `Streak ${Math.max(0, score - wrongStreak)}`);
    if (wrongStreak >= 2){ endGame("Two wrong in a row!"); return; }
    currentIndex++; (currentIndex >= 12) ? endGame() : showQuestion();
  }

  function handleAnswer(btn, correctText){
    stopQuestionTimer();
    if (choicesDiv) [...choicesDiv.querySelectorAll("button")].forEach(b=>b.disabled=true);
    const isCorrect = (btn.textContent||"").trim().toLowerCase() === String(correctText||"").trim().toLowerCase();
    if (isCorrect){ btn.classList.add("correct"); if (soundOn){ Sound.init(); Sound.resume(); SFX.correct(); } vibrate(60); score++; wrongStreak=0; }
    else { btn.classList.add("incorrect"); if (soundOn){ Sound.init(); Sound.resume(); SFX.incorrect(); } vibrate(160); wrongStreak++; }
    pillScore && (pillScore.textContent = `Score ${score}`);
    pillStreak && (pillStreak.textContent = `Streak ${Math.max(0, score - wrongStreak)}`);
    if (wrongStreak >= 2){ setTimeout(()=>endGame("Two wrong in a row!"), 700); return; }
    setTimeout(()=>{ currentIndex++; (currentIndex >= 12) ? endGame() : showQuestion(); }, 800);
  }

  function endGame(msg=""){
    clearInterval(elapsedInterval); stopQuestionTimer();
    if (msg){
      gameOverText && (gameOverText.textContent = msg);
      gameOverBox && (gameOverBox.style.display = "block");
      if (playAgainBtn){ playAgainBtn.style.display = "inline-block"; playAgainBtn.classList.add("pulse"); }
    } else {
      // success — show overlay
      if (successSplash){
        successSplash.style.display = "grid";
        successSplash.setAttribute("aria-hidden","false");
        successSplash.classList.add("show");
      }
    }
  }

  // Wire buttons
  startBtn?.addEventListener("click", ()=>{ Sound.init(); Sound.resume(); startGame(); });
  shuffleBtn?.addEventListener("click", ()=>{ shuffle(questions); currentIndex=0; wrongStreak=0; showQuestion(); });
  shareBtn?.addEventListener("click", ()=>{
    const text = `I'm playing Brain ⚡ Bolt! Current score: ${score}/12`;
    if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
    else navigator.clipboard?.writeText(`${text} - ${location.href}`);
  });
  playAgainBtn?.addEventListener("click", ()=>{ Sound.init(); Sound.resume(); startGame(); });

  // Success splash buttons
  $("ssPlayAgain")?.addEventListener("click",(e)=>{ e.preventDefault(); if (successSplash){ successSplash.classList.remove("show"); successSplash.style.display="none"; successSplash.setAttribute("aria-hidden","true"); } Sound.init(); Sound.resume(); startGame(); });
  $("ssHomeBtn")?.addEventListener("click", ()=>{ if (successSplash){ successSplash.classList.remove("show"); successSplash.style.display="none"; successSplash.setAttribute("aria-hidden","true"); } });
  $("ssShareScore")?.addEventListener("click",(e)=>{
    e.preventDefault();
    const text = `I scored ${score}/12 on today’s Brain ⚡ Bolt!`;
    if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
    else navigator.clipboard?.writeText(`${text} - ${location.href}`);
  });

  // Sound toggle
  soundBtn?.addEventListener("click", ()=>{
    soundOn = !soundOn;
    if (soundOn){ Sound.init(); Sound.resume(); }
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
  });
})();
