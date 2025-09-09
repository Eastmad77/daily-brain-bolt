/* The Daily BrainBolt — App Logic
   - Smooth 10s timer bar (orange)
   - Elapsed time counter
   - Live CSV first, Bank CSV fallback
   - Start / Shuffle / Share buttons
   - Defensive: safe on non-index pages
*/

/* ---------- CONFIG ---------- */

// Published Google Sheets (CSV) — Live & Bank (use gid=...)
const LIVE_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
const BANK_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

const SECONDS_PER_QUESTION = 10; // smooth orange bar
const AUTO_ADVANCE_DELAY = 800;   // ms after correct before next

/* ---------- DOM LOOKUPS (graceful) ---------- */
const $ = (sel) => document.querySelector(sel);

const elScore       = $("#score");
const elProgressTxt = $("#progressText");
const elProgFill    = $("#progressFill");
const elTimerBar    = $("#timerBar");     // uses CSS var --tw for fill width
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

/* ---------- HELPERS ---------- */
function todayKeyNZ() {
  // Format YYYY-MM-DD in NZ time (UTC+12/+13 depending DST)
  const now = new Date();
  // Convert to NZT by using the NZ locale date parts
  // Simpler: just take local system date for now:
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth()+1).padStart(2,"0");
  const dd = String(now.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function norm(s){ return String(s||"").trim(); }

function setProgress(i, total){
  if (!elProgressTxt || !elProgFill) return;
  elProgressTxt.textContent = `${i}/${total}`;
  const pct = total ? (i/total)*100 : 0;
  elProgFill.style.width = `${pct}%`;
}

function setTimerPercent(pct){
  if (!elTimerBar) return;
  // CSS variable consumed by #timerBar::after { width: var(--tw, 0%) }
  elTimerBar.style.setProperty("--tw", `${pct}%`);
}

function startElapsed(){
  if (!elElapsed) return;
  quizStartedAt = performance.now();
  cancelAnimationFrame(elapsedRAF);
  const tick = () => {
    const ms = performance.now() - quizStartedAt;
    const sec = Math.floor(ms/1000);
    const m = Math.floor(sec/60);
    const s = sec % 60;
    elElapsed.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    elapsedRAF = requestAnimationFrame(tick);
  };
  elapsedRAF = requestAnimationFrame(tick);
}

function stopElapsed(){
  cancelAnimationFrame(elapsedRAF);
}

/* ---------- CSV LOADING ---------- */
async function fetchCsvRows(url){
  const cacheBust = url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();
  const resp = await fetch(cacheBust, { cache: "no-store" });
  if (!resp.ok) throw new Error("CSV HTTP " + resp.status);
  const text = await resp.text();

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const rows = (data||[]).filter(r => r && r.Question);
        resolve(rows);
      },
      error: reject
    });
  });
}

async function loadData(){
  const dateKey = todayKeyNZ();
  if (elDate) elDate.textContent = dateKey;

  try{
    let rows = await fetchCsvRows(LIVE_CSV);
    allRows = rows;
    todays = rows.filter(r => norm(r.Date) === dateKey);
    if (!todays.length){
      // fallback to bank
      const bank = await fetchCsvRows(BANK_CSV);
      // first 12 from bank
      todays = bank.slice(0, 12);
    }
    if (!todays.length){
      if (elMetaText) elMetaText.textContent = "No quiz rows found.";
      if (elQuestion) elQuestion.textContent = "No quiz rows found.";
    } else {
      if (elMetaText) elMetaText.textContent = "Ready";
      if (elQuestion) elQuestion.textContent = "Press Start Quiz";
    }
  }catch(err){
    console.error("CSV load error", err);
    if (elMetaText) elMetaText.textContent = "Error loading CSV";
    if (elQuestion) elQuestion.textContent = "Couldn’t load CSV.";
  }
}

/* ---------- QUIZ FLOW ---------- */
function resetQuiz(){
  idx = 0; score = 0;
  updateMeta();
  if (todays.length) showQuestion();
}

function updateMeta(){
  setProgress(idx, todays.length || 0);
  if (elScore) elScore.textContent = String(score);
}

function showQuestion(){
  // cancel running timers
  cancelAnimationFrame(timerRAF);
  setTimerPercent(0);

  elFeedback && (elFeedback.textContent = "");
  elOptions && (elOptions.innerHTML = "");
  if (!todays.length){
    elQuestion && (elQuestion.textContent = "No quiz rows found.");
    return;
  }

  const q = todays[idx];
  if (!q){
    // finished
    elQuestion && (elQuestion.textContent = "Nice! Done for today.");
    btnPlayAgain && (btnPlayAgain.style.display = "inline-flex");
    stopElapsed();
    return;
  }

  // meta + question
  if (elMetaText) elMetaText.textContent = `${q.Difficulty || '—'} • ${q.Category || 'Quiz'}`;
  if (elQuestion) elQuestion.textContent = q.Question || "—";

  // options
  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  opts.forEach((optText) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = optText;
    b.addEventListener("click", () => onSelect(q, optText, b));
    elOptions && elOptions.appendChild(b);
  });

  // start question timer
  startQuestionTimer();
}

function onSelect(q, value, btnEl){
  // disable all choices visual while judging
  document.querySelectorAll(".choice").forEach(el => el.classList.add("disabled"));

  const isCorrect = norm(value).toLowerCase() === norm(q.Answer).toLowerCase();
  if (elFeedback){
    elFeedback.textContent = "";
    elFeedback.className = "feedback " + (isCorrect ? "correct" : "incorrect");
    elFeedback.textContent = isCorrect ? "Correct!" : "Incorrect";
  }

  cancelAnimationFrame(timerRAF); // stop timer on answer

  if (isCorrect){
    score++;
    idx++;
    updateMeta();
    setTimeout(showQuestion, AUTO_ADVANCE_DELAY);
  } else {
    // show Play again, stop elapsed, do not auto reveal correct answer
    btnPlayAgain && (btnPlayAgain.style.display = "inline-flex");
    stopElapsed();
  }
}

/* ---------- TIMER (smooth) ---------- */
function startQuestionTimer(){
  timerStartMs = performance.now();
  questionDeadline = timerStartMs + SECONDS_PER_QUESTION * 1000;
  setTimerPercent(0);

  function tick(){
    const now = performance.now();
    const total = questionDeadline - timerStartMs;
    const remain = Math.max(0, questionDeadline - now);
    const pct = Math.min(100, ((total - remain)/total)*100); // 0→100 fill
    setTimerPercent(pct);

    if (remain > 0){
      timerRAF = requestAnimationFrame(tick);
    } else {
      // time out = incorrect round end
      document.querySelectorAll(".choice").forEach(el => el.classList.add("disabled"));
      if (elFeedback){
        elFeedback.className = "feedback incorrect";
        elFeedback.textContent = "Time’s up";
      }
      btnPlayAgain && (btnPlayAgain.style.display = "inline-flex");
      stopElapsed();
    }
  }
  timerRAF = requestAnimationFrame(tick);
}

/* ---------- BUTTONS ---------- */
btnStart && btnStart.addEventListener("click", () => {
  if (!todays.length){
    // try to reload if we had an earlier failure
    loadData().then(() => {
      if (todays.length){
        btnPlayAgain && (btnPlayAgain.style.display = "none");
        startElapsed();
        resetQuiz();
      }
    });
    return;
  }
  btnPlayAgain && (btnPlayAgain.style.display = "none");
  startElapsed();
  resetQuiz();
});

btnShuffle && btnShuffle.addEventListener("click", () => {
  if (!todays.length) return;
  todays = shuffle(todays);
  btnPlayAgain && (btnPlayAgain.style.display = "none");
  startElapsed();
  resetQuiz();
});

btnShare && btnShare.addEventListener("click", async () => {
  const shareData = {
    title: "The Daily BrainBolt",
    text: "Think fast ⚡ Try today’s 12-question BrainBolt quiz.",
    url: "https://dailybrainbolt.com/"
  };
  try{
    if (navigator.share){
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareData.url);
      alert("Link copied!");
    }
  }catch(e){ console.warn("Share canceled/failed", e); }
});

btnPlayAgain && btnPlayAgain.addEventListener("click", () => {
  btnPlayAgain.style.display = "none";
  startElapsed();
  resetQuiz();
});

/* ---------- INIT ---------- */
(function init(){
  // Only index has quiz UI, but safe to call everywhere
  loadData();
})();
