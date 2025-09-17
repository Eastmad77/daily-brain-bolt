// Brain ⚡ Bolt — app (fix5)
// - Countdown overlay uses .show (no hidden attr), guarantees blue circle appears
// - Timer bars restored (overall green + per question with warning state)
// - Sidebar menu wired and not blocked by overlays
// - Audio engine created on first user gesture (avoids autoplay errors)

(() => {
  const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";
  const QUESTION_TIME_MS = 10000, QUESTION_TICK_MS = 100;

  // ========= Audio (init only on user gesture) =========
  const Sound = {
    ctx: null, gain: null, enabled: true,
    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.25;
        this.gain.connect(this.ctx.destination);
      } catch (e) {
        console.warn("Audio init failed:", e);
        this.enabled = false;
      }
    },
    resume() {
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(()=>{});
      }
    },
    beep(freq=600, dur=0.25) {
      if (!this.enabled || !this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sine"; osc.frequency.value = freq;
        osc.connect(g); g.connect(this.gain);
        g.gain.value = 0.9;
        const t0 = this.ctx.currentTime;
        osc.start(t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.stop(t0 + dur + 0.02);
      } catch(e){ /* ignore */ }
    }
  };
  const sfx = {
    correct(){ if (Sound.enabled) Sound.beep(1020, .18); },
    incorrect(){ if (Sound.enabled) Sound.beep(220, .20); },
    tick(){ if (Sound.enabled) Sound.beep(620, .18); },
    go(){ if (Sound.enabled) Sound.beep(950, .22); }
  };

  // ========= State =========
  let questions = [], currentIndex = 0, score = 0, wrongStreak = 0, elapsed = 0;
  let elapsedInterval = null, qTimer = null, qRemaining = QUESTION_TIME_MS, qLastTickSec = 3;
  let soundOn = true;

  // ========= DOM helpers =========
  const $ = id => document.getElementById(id);
  const setText = (el, txt) => { if (el) el.textContent = txt; };
  const show = (el) => { if (el){ el.classList.add("show"); el.setAttribute("aria-hidden","false"); } };
  const hide = (el) => { if (el){ el.classList.remove("show"); el.setAttribute("aria-hidden","true"); } };
  const fmt = sec => { const m=Math.floor(sec/60), s=sec%60; return `${m}:${s<10?'0':''}${s}`; };
  const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

  // ========= CSV =========
  function fetchCSV(){
    return new Promise((resolve,reject)=>{
      if (!window.Papa) return reject(new Error("PapaParse not loaded"));
      Papa.parse(CSV_URL, { download:true, header:true, skipEmptyLines:true,
        complete:(res)=>resolve(res.data), error:(err)=>reject(err) });
    });
  }

  // ========= Cached elements =========
  let startBtn, shuffleBtn, shareBtn, playAgainBtn, qBox, choicesDiv, pillScore, pillStreak, progressLabel,
      elapsedTimeEl, countdownOverlay, countNum, successSplash, gameOverBox, gameOverText, timerBar, qTimerBar,
      soundBtn, setLabel, mmMenuBtn, mmSideMenu, ssPlayAgain, ssHomeBtn, ssShareScore;

  function cacheEls(){
    startBtn = $("startBtn"); shuffleBtn = $("shuffleBtn"); shareBtn = $("shareBtn"); playAgainBtn = $("playAgainBtn");
    qBox = $("questionBox"); choicesDiv = $("choices"); pillScore = $("pillScore"); pillStreak = $("pillStreak");
    progressLabel = $("progressLabel"); elapsedTimeEl = $("elapsedTime");
    countdownOverlay = $("countdownOverlay"); countNum = $("countNum");
    successSplash = $("successSplash"); gameOverBox = $("gameOverBox"); gameOverText = $("gameOverText");
    timerBar = $("timerBar"); qTimerBar = $("qTimerBar"); soundBtn = $("soundBtn"); setLabel = $("setLabel");
    mmMenuBtn = $("mmMenuBtn"); mmSideMenu = $("mmSideMenu");
    ssPlayAgain = $("ssPlayAgain"); ssHomeBtn = $("ssHomeBtn"); ssShareScore = $("ssShareScore");
  }

  function ensureSuccessHidden(){ hide(successSplash); successSplash && (successSplash.style.pointerEvents="none"); }
  function showSuccess(){ successSplash && (successSplash.style.pointerEvents="auto"); show(successSplash); }

  // ========= Timers =========
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
        if (secsLeft > 0 && secsLeft < qLastTickSec + 1 && soundOn){ sfx.tick(); qLastTickSec = secsLeft; }
      }
      if (qRemaining <= 0){ stopQuestionTimer(); onTimeout && onTimeout(); }
    }, QUESTION_TICK_MS);
  }
  function stopQuestionTimer(){ if (qTimer){ clearInterval(qTimer); qTimer=null; } }

  // ========= Game Flow =========
  async function startGame(){
    try{
      // Initialize audio on first user action
      Sound.init(); Sound.resume();
      ensureSuccessHidden();
      setText(setLabel, "Loading…");
      const data = await fetchCSV();
      questions = shuffle(data).slice(0,12);
      currentIndex = 0; score = 0; wrongStreak = 0; elapsed = 0;

      setText(pillScore, "Score 0"); setText(pillStreak, "Streak 0");
      setText(progressLabel, "Q 0/12");
      if (gameOverBox) gameOverBox.style.display = "none";
      if (playAgainBtn){ playAgainBtn.style.display = "none"; playAgainBtn.classList.remove("pulse"); }
      setText(setLabel, "Ready");

      // Countdown — force visible with class
      let n = 3;
      setText(countNum, n);
      show(countdownOverlay);
      const int = setInterval(()=>{
        n--;
        if (n>0){
          setText(countNum, n);
          countNum.style.animation = "none"; void countNum.offsetWidth; countNum.style.animation = "popIn .4s ease";
          if (soundOn) sfx.tick();
        } else {
          clearInterval(int);
          setText(countNum, "GO");
          countNum.style.animation = "none"; void countNum.offsetWidth; countNum.style.animation = "popIn .4s ease";
          if (soundOn) sfx.go();
          setTimeout(()=>{ hide(countdownOverlay); beginQuiz(); }, 380);
        }
      }, 700);
    }catch(e){
      setText(qBox, "Could not load today’s quiz. Please try again.");
      setText(setLabel, "Error");
      console.error(e);
    }
  }

  function beginQuiz(){
    elapsed = 0; setText(elapsedTimeEl, "0:00"); if (timerBar) timerBar.style.width = "0%";
    clearInterval(elapsedInterval);
    elapsedInterval = setInterval(()=>{
      elapsed++; setText(elapsedTimeEl, fmt(elapsed));
      if (timerBar){
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
    if (soundOn) sfx.incorrect(); navigator.vibrate?.(160);
    wrongStreak++; setText(pillStreak, `Streak ${Math.max(0, score - wrongStreak)}`);
    if (wrongStreak >= 2){ endGame("Two wrong in a row!"); return; }
    currentIndex++; (currentIndex >= 12) ? endGame() : showQuestion();
  }

  function handleAnswer(btn, correctText){
    stopQuestionTimer();
    if (choicesDiv) [...choicesDiv.querySelectorAll("button")].forEach(b=>b.disabled=true);
    const isCorrect = (btn.textContent||"").trim().toLowerCase() === String(correctText||"").trim().toLowerCase();
    if (isCorrect){ btn.classList.add("correct"); if (soundOn) sfx.correct(); navigator.vibrate?.(60); score++; wrongStreak=0; }
    else { btn.classList.add("incorrect"); if (soundOn) sfx.incorrect(); navigator.vibrate?.(160); wrongStreak++; }
    setText(pillScore, `Score ${score}`); setText(pillStreak, `Streak ${Math.max(0, score - wrongStreak)}`);
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

  // ========= Boot & wiring =========
  document.addEventListener("DOMContentLoaded", () => {
    cacheEls();

    // Start splash fades out after load
    window.addEventListener("load", ()=> setTimeout(()=>{
      const s = $("startSplash"); if (s){ s.classList.add("hiding"); setTimeout(()=> s.remove(), 420); }
    }, 1100));

    // Buttons
    startBtn?.addEventListener("click", ()=>{ Sound.init(); Sound.resume(); startGame(); });
    shuffleBtn?.addEventListener("click", ()=>{ shuffle(questions); currentIndex=0; wrongStreak=0; showQuestion(); });
    shareBtn?.addEventListener("click", ()=>{
      const text = `I'm playing Brain ⚡ Bolt! Current score: ${score}/12`;
      if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
      else navigator.clipboard?.writeText(`${text} - ${location.href}`);
    });
    playAgainBtn?.addEventListener("click", ()=>{ Sound.init(); Sound.resume(); startGame(); });

    // Success splash controls
    ssPlayAgain?.addEventListener("click", (e)=>{ e.preventDefault(); hide(successSplash); Sound.init(); Sound.resume(); startGame(); });
    ssHomeBtn?.addEventListener("click", ()=>{ hide(successSplash); /* anchor navigates */ });
    ssShareScore?.addEventListener("click", (e)=>{
      e.preventDefault();
      const text = `I scored ${score}/12 on today’s Brain ⚡ Bolt!`;
      if (navigator.share) navigator.share({title:"Brain ⚡ Bolt", text, url: location.href}).catch(()=>{});
      else navigator.clipboard?.writeText(`${text} - ${location.href}`);
    });

    // Sound toggle
    soundBtn?.addEventListener("click", ()=>{
      soundOn = !soundOn;
      if (soundOn) { Sound.init(); Sound.resume(); }
      soundBtn.textContent = soundOn ? "🔊" : "🔇";
    });

    // Sidebar menu
    mmMenuBtn?.addEventListener("click", ()=>{
      if (!mmSideMenu) return;
      // ensure it’s above countdown
      mmSideMenu.classList.toggle("open");
      mmSideMenu.setAttribute("aria-hidden", String(!mmSideMenu.classList.contains("open")));
    });

    // Close sidebar when clicking a link
    mmSideMenu?.querySelectorAll("a,button").forEach(el=>{
      el.addEventListener("click", ()=> {
        mmSideMenu.classList.remove("open");
        mmSideMenu.setAttribute("aria-hidden","true");
      });
    });
  });
})();
