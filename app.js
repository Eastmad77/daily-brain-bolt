/* The Daily BrainBolt — App Logic (outline-only feedback + sound/vibration)
   - Backgrounds updated via CSS
   - NO big feedback banners; selection shows outline color only
   - First wrong => retry; Second wrong => game over + Play again
   - Smooth 10s timer + elapsed counter
   - Correct = subtle beep; Incorrect = short vibration (if supported)
*/

/* ---------- CONFIG ---------- */
const LIVE_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

const SECONDS_PER_QUESTION = 10;
const AUTO_ADVANCE_DELAY = 800;

/* ---------- DOM ---------- */
const $ = s => document.querySelector(s);
const elScore       = $("#score");
const elProgressTxt = $("#progressText");
const elProgFill    = $("#progressFill");
const elTimerBar    = $("#timerBar");
const elElapsed     = $("#elapsed");
const elMetaText    = $("#metaText");
const elDate        = $("#today");
const elQuestion    = $("#question");
const elOptions     = $("#options");
const elFeedback    = $("#feedback"); // kept for a11y text (visually subtle)
const btnStart      = $("#startBtn");
const btnShuffle    = $("#shuffleBtn");
const btnShare      = $("#shareBtn");
const btnPlayAgain  = $("#playAgain");

/* ---------- STATE ---------- */
let todays = [];
let idx = 0;
let score = 0;

let timerRAF = null;
let quizStartedAt = 0;
let elapsedRAF = null;

let attemptCount = 0; // per-question attempts

/* ---------- Helpers ---------- */
function todayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth()+1).padStart(2,"0");
  const dd = String(now.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function shuffle(a){ const x=a.slice(); for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [x[i],x[j]]=[x[j],x[i]];} return x; }
function norm(s){ return String(s||"").trim(); }
function setProgress(i,t){ if(!elProgressTxt||!elProgFill)return; elProgressTxt.textContent=`${i}/${t}`; elProgFill.style.width=`${t?(i/t)*100:0}%`; }
function setTimerPercent(p){ if(elTimerBar) elTimerBar.style.setProperty("--tw", `${p}%`); }

/* Elapsed timer (quiz run time) */
function startElapsed(){ if(!elElapsed) return; quizStartedAt=performance.now(); cancelAnimationFrame(elapsedRAF); const tick=()=>{ const ms=performance.now()-quizStartedAt; const sec=Math.floor(ms/1000); const m=Math.floor(sec/60); const s=sec%60; elElapsed.textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; elapsedRAF=requestAnimationFrame(tick); }; elapsedRAF=requestAnimationFrame(tick); }
function stopElapsed(){ cancelAnimationFrame(elapsedRAF); }

/* Subtle beep on correct via Web Audio */
function playCorrectBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 520;     // soft mid tone
    g.gain.value = 0.04;         // very subtle
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); ctx.close(); }, 140);
  } catch {}
}

/* Short vibration on wrong (if supported) */
function buzzWrong() {
  if (navigator.vibrate) {
    // short buzz pattern
    navigator.vibrate([80]);
  }
}

/* ---------- CSV ---------- */
async function fetchCsvRows(url){
  const u = url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();
  const resp = await fetch(u, { cache: "no-store" });
  if (!resp.ok) throw new Error("CSV HTTP " + resp.status);
  const text = await resp.text();
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true, skipEmptyLines: true,
      complete: ({ data }) => resolve((data||[]).filter(r => r && r.Question)),
      error: reject
    });
  });
}

async function loadData(){
  const dateKey = todayKey();
  elDate && (elDate.textContent = dateKey);
  try{
    const live = await fetchCsvRows(LIVE_CSV);
    let todaysLive = live.filter(r => norm(r.Date) === dateKey);
    if (!todaysLive.length){
      const bank = await fetchCsvRows(BANK_CSV);
      todays = bank.slice(0,12);
    } else {
      todays = todaysLive;
    }
    if (!todays.length){
      elMetaText && (elMetaText.textContent = "No quiz rows found.");
      elQuestion && (elQuestion.textContent = "No quiz rows found.");
    } else {
      elMetaText && (elMetaText.textContent = "Ready");
      elQuestion && (elQuestion.textContent = "Press Start Quiz");
    }
  }catch(e){
    console.error("CSV load error", e);
    elMetaText && (elMetaText.textContent = "Error loading CSV");
    elQuestion && (elQuestion.textContent = "Couldn’t load CSV.");
  }
}

/* ---------- Quiz ---------- */
function resetQuiz(){ idx=0; score=0; updateMeta(); todays.length && showQuestion(); }
function updateMeta(){ setProgress(idx, todays.length||0); elScore && (elScore.textContent=String(score)); }

function showQuestion(){
  cancelAnimationFrame(timerRAF); setTimerPercent(0);
  if (elFeedback){ elFeedback.textContent=""; } // silent a11y area
  elOptions && (elOptions.innerHTML="");
  btnPlayAgain && (btnPlayAgain.style.display="none");
  attemptCount = 0;

  if (!todays.length){ elQuestion && (elQuestion.textContent="No quiz rows found."); return; }

  const q = todays[idx];
  if (!q){
    elQuestion && (elQuestion.textContent = "Nice! Done for today.");
    btnPlayAgain && (btnPlayAgain.style.display="inline-flex");
    stopElapsed();
    return;
  }

  elMetaText && (elMetaText.textContent = `${q.Difficulty || '—'} • ${q.Category || 'Quiz'}`);
  elQuestion && (elQuestion.textContent = q.Question || "—");

  const opts = [q.OptionA,q.OptionB,q.OptionC,q.OptionD].filter(Boolean);
  opts.forEach(text=>{
    const b=document.createElement("button");
    b.className="choice";
    b.textContent=text;
    b.addEventListener("click",()=>onSelect(q,text,b));
    elOptions && elOptions.appendChild(b);
  });

  startQuestionTimer();
}

function onSelect(q, value, btnEl){
  // Prevent double clicks while we compute result
  document.querySelectorAll(".choice").forEach(el => el.classList.add("disabled"));

  const isCorrect = norm(value).toLowerCase() === norm(q.Answer).toLowerCase();

  // Style only the BORDER (no big banners)
  document.querySelectorAll(".choice").forEach(el => el.classList.remove("result-correct","result-wrong"));
  if (btnEl){
    btnEl.classList.add(isCorrect ? "result-correct" : "result-wrong");
    // keep only outline feedback, no fill change
  }

  cancelAnimationFrame(timerRAF);

  if (isCorrect){
    playCorrectBeep();
    score++; idx++; updateMeta();
    setTimeout(showQuestion, AUTO_ADVANCE_DELAY);
  } else {
    buzzWrong();
    attemptCount += 1;
    if (attemptCount === 1){
      // First wrong => reset same question after short pause
      setTimeout(()=>{
        document.querySelectorAll(".choice").forEach(el =>
          el.classList.remove("disabled","result-correct","result-wrong")
        );
        startQuestionTimer();
      }, 600);
    } else {
      // Second wrong => game over
      btnPlayAgain && (btnPlayAgain.style.display="inline-flex");
      stopElapsed();
    }
  }
}

/* ---------- Timer ---------- */
function startQuestionTimer(){
  const start = performance.now();
  const deadline = start + SECONDS_PER_QUESTION*1000;
  setTimerPercent(0);

  function tick(){
    const now=performance.now();
    const total=deadline-start;
    const remain=Math.max(0, deadline-now);
    const pct=Math.min(100, ((total-remain)/total)*100);
    setTimerPercent(pct);

    if (remain>0){
      timerRAF=requestAnimationFrame(tick);
    } else {
      // timeout counts as a wrong attempt
      document.querySelectorAll(".choice").forEach(el => el.classList.add("disabled"));
      buzzWrong();
      attemptCount += 1;
      if (attemptCount === 1){
        setTimeout(()=>{
          document.querySelectorAll(".choice").forEach(el => el.classList.remove("disabled","result-correct","result-wrong"));
          startQuestionTimer();
        }, 600);
      } else {
        btnPlayAgain && (btnPlayAgain.style.display="inline-flex");
        stopElapsed();
      }
    }
  }
  timerRAF=requestAnimationFrame(tick);
}

/* ---------- Buttons ---------- */
btnStart && btnStart.addEventListener("click", ()=>{
  if (!todays.length){
    loadData().then(()=>{
      if (todays.length){
        btnPlayAgain && (btnPlayAgain.style.display="none");
        startElapsed();
        resetQuiz();
      }
    });
    return;
  }
  btnPlayAgain && (btnPlayAgain.style.display="none");
  startElapsed();
  resetQuiz();
});

btnShuffle && btnShuffle.addEventListener("click", ()=>{
  if (!todays.length) return;
  todays = shuffle(todays);
  btnPlayAgain && (btnPlayAgain.style.display="none");
  startElapsed();
  resetQuiz();
});

btnShare && btnShare.addEventListener("click", async ()=>{
  const shareData = {
    title: "The Daily BrainBolt",
    text: "Think fast ⚡ Try today’s 12-question BrainBolt quiz.",
    url: "https://dailybrainbolt.com/"
  };
  try{
    if (navigator.share) await navigator.share(shareData);
    else { await navigator.clipboard.writeText(shareData.url); alert("Link copied!"); }
  }catch(e){ console.warn("Share canceled/failed", e); }
});

btnPlayAgain && btnPlayAgain.addEventListener("click", ()=>{
  btnPlayAgain.style.display="none";
  startElapsed();
  resetQuiz();
});

/* ---------- Init ---------- */
(function init(){
  loadData();
})();
