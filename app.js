/* The Daily BrainBolt — App Logic (updated)
   - Fix: clearer question text (white via CSS)
   - Smooth 10s orange timer bar
   - Elapsed time counter
   - Live CSV first, Bank CSV fallback
   - Start / Shuffle / Share
   - Answer choice turns green/red; "Play again" inline with Shuffle
*/

/* ---------- CONFIG ---------- */
const LIVE_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFv0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

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
const elFeedback    = $("#feedback");
const btnStart      = $("#startBtn");
const btnShuffle    = $("#shuffleBtn");
const btnShare      = $("#shareBtn");
const btnPlayAgain  = $("#playAgain");

/* ---------- STATE ---------- */
let allRows = [];
let todays = [];
let idx = 0;
let score = 0;

let timerStartMs = 0;
let timerRAF = null;
let questionDeadline = 0;

let quizStartedAt = 0;
let elapsedRAF = null;

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
function startElapsed(){ if(!elElapsed) return; quizStartedAt=performance.now(); cancelAnimationFrame(elapsedRAF); const tick=()=>{ const ms=performance.now()-quizStartedAt; const sec=Math.floor(ms/1000); const m=Math.floor(sec/60); const s=sec%60; elElapsed.textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; elapsedRAF=requestAnimationFrame(tick); }; elapsedRAF=requestAnimationFrame(tick); }
function stopElapsed(){ cancelAnimationFrame(elapsedRAF); }

/* ---------- CSV ---------- */
async function fetchCsvRows(url){
  const u = url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();
  const resp = await fetch(u, { cache: "no-store" });
  if (!resp.ok) throw new Error("CSV HTTP " + resp.status);
  const text = await resp.text();
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true, skipEmptyLines: true,
      complete: ({ data }) => resolve((data||[]).filter(r=>r&&r.Question)),
      error: reject
    });
  });
}

async function loadData(){
  const dateKey = todayKey();
  elDate && (elDate.textContent = dateKey);
  try{
    const live = await fetchCsvRows(LIVE_CSV);
    allRows = live;
    todays = live.filter(r => norm(r.Date) === dateKey);
    if (!todays.length){
      const bank = await fetchCsvRows(BANK_CSV);
      todays = bank.slice(0,12);
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
  elFeedback && (elFeedback.textContent=""); elFeedback && (elFeedback.className="feedback");
  elOptions && (elOptions.innerHTML="");
  btnPlayAgain && (btnPlayAgain.style.display="none");

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
  document.querySelectorAll(".choice").forEach(el => el.classList.add("disabled"));

  const isCorrect = norm(value).toLowerCase() === norm(q.Answer).toLowerCase();
  if (btnEl){
    btnEl.classList.remove("disabled");
    btnEl.classList.add(isCorrect ? "result-correct" : "result-wrong");
  }

  elFeedback && (elFeedback.className = "feedback " + (isCorrect ? "correct" : "incorrect"));
  elFeedback && (elFeedback.textContent = isCorrect ? "Correct!" : "Incorrect");

  cancelAnimationFrame(timerRAF); // stop bar

  if (isCorrect){
    score++; idx++; updateMeta();
    setTimeout(showQuestion, AUTO_ADVANCE_DELAY);
  } else {
    btnPlayAgain && (btnPlayAgain.style.display="inline-flex"); // inline with Shuffle
    stopElapsed();
  }
}

/* ---------- Timer ---------- */
function startQuestionTimer(){
  timerStartMs = performance.now();
  questionDeadline = timerStartMs + SECONDS_PER_QUESTION*1000;
  setTimerPercent(0);

  function tick(){
    const now=performance.now();
    const total=questionDeadline-timerStartMs;
    const remain=Math.max(0, questionDeadline-now);
    const pct=Math.min(100, ((total-remain)/total)*100);
    setTimerPercent(pct);

    if (remain>0){
      timerRAF=requestAnimationFrame(tick);
    } else {
      // timeout
      document.querySelectorAll(".choice").forEach(el => el.classList.add("disabled"));
      elFeedback && (elFeedback.className="feedback incorrect");
      elFeedback && (elFeedback.textContent="Time’s up");
      btnPlayAgain && (btnPlayAgain.style.display="inline-flex");
      stopElapsed();
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
