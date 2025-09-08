/* The Daily BrainBolt — app.js (full) */

/* ====== Config: Google Sheet (Published) ====== */
/** Your published document id (from the pubhtml link) */
const SHEET_ID = "2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG";

/** Tab gids */
const LIVE_GID = "1410250735"; // live tab
const BANK_GID = "2009978011"; // bank tab

/** CSV endpoints (published) */
const CSV_URL_LIVE = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&gid=${LIVE_GID}`;
const CSV_URL_BANK = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&gid=${BANK_GID}`;

/* ====== DOM ====== */
const elQ          = document.getElementById('question');
const elOpts       = document.getElementById('options');
const elShow       = document.getElementById('showAnswerBtn');
const elFB         = document.getElementById('feedback');
const elMetaText   = document.getElementById('metaText');
const elToday      = document.getElementById('today');
const elProgText   = document.getElementById('progressText');
const elProgFill   = document.getElementById('progressFill');
const elScore      = document.getElementById('score');
const elPlayAgain  = document.getElementById('playAgain');
const elStatus     = document.getElementById('statusline'); // visually hidden (.sr-only)
const elStart      = document.getElementById('startBtn');
const elShuffle    = document.getElementById('shuffleBtn');
const elShare      = document.getElementById('shareBtn');
const elTimerBar   = document.getElementById('timerBar');
const elTimerText  = document.getElementById('timerText');
const elTimerWrap  = document.getElementById('timerWrap');

/* ====== State ====== */
const now = new Date();
const todayKey = [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
elToday.textContent = todayKey;

let allRows = [];     // full rows from live or bank
let todays = [];      // today's playable set (live preferred)
let idx = 0;          // question index
let score = 0;        // running score
let selected = null;  // selected option text
let roundActive = false;
let timerId = null;
let timerSecs = 10;

/* ====== Helpers ====== */
function status(msg){ elStatus.textContent = msg; console.log("[CSV]", msg); }
const norm = s => String(s||'').trim();

function updateMeta(){
  elProgText.textContent = `${Math.min(idx, todays.length)}/${todays.length || 0}`;
  const pct = (todays.length ? (idx / todays.length) : 0) * 100;
  elProgFill.style.width = `${pct}%`;
  elScore.textContent = String(score);
}

function setQuestionFont(qText){
  elQ.classList.remove('q-long','q-xlong');
  const len = (qText || '').length;
  if (len > 160) elQ.classList.add('q-xlong');
  else if (len > 110) elQ.classList.add('q-long');
}

/* ====== Timer ====== */
function startTimer(seconds = 10){
  stopTimer();
  timerSecs = seconds;
  elTimerWrap.setAttribute('aria-hidden','false');

  // reset bar instantly, then animate to 0
  elTimerBar.style.transition = 'none';
  elTimerBar.style.width = '100%';
  elTimerText.textContent = `${timerSecs}s`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      elTimerBar.style.transition = `width ${seconds}s linear`;
      elTimerBar.style.width = '0%';
    });
  });

  timerId = setInterval(() => {
    timerSecs--;
    elTimerText.textContent = `${Math.max(0, timerSecs)}s`;
    if (timerSecs <= 0){
      stopTimer();
      const q = todays[idx];
      if (q) reveal(q, /*timeUp*/true);
    }
  }, 1000);
}
function stopTimer(){
  if (timerId) clearInterval(timerId);
  timerId = null;
  elTimerBar.style.transition = 'none';
}

/* ====== CSV Loading ====== */
function handleRows(rows){
  allRows = rows;
  // Live rows should already be today's date; if using bank fallback, take first 12
  todays = rows.filter(r => r && norm(r.Date) === todayKey);
  if (!todays.length){
    // Fallback to first 12 rows if Date is blank (bank)
    todays = rows.slice(0, 12);
  }
  updateMeta();
  // Don’t auto-start; user presses Start
  elQ.textContent = "Press “Start Quiz” to begin.";
  elOpts.innerHTML = '';
}

function loadCSV(url, fallbackUrl){
  status(`Loading: ${url}`);
  Papa.parse(url + `&cb=${Date.now()}`, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: ({ data }) => {
      // Filter to rows that at least have Question column
      const rows = (data || []).filter(r => r && r.Question);
      status(`Parsed ${rows.length} rows`);
      if (!rows.length && fallbackUrl){
        status("No rows returned; trying fallback…");
        loadCSV(fallbackUrl, null);
        return;
      }
      handleRows(rows);
    },
    error: (err) => {
      console.error("CSV error", err);
      if (fallbackUrl){
        status("Error loading primary; trying fallback…");
        loadCSV(fallbackUrl, null);
      } else {
        status("Error fetching CSV. Check Publish settings and access.");
        elMetaText.textContent = "Error loading CSV";
        elQ.textContent = "Couldn’t load questions.";
      }
    }
  });
}

// Kickoff: prefer live, fallback to bank
loadCSV(CSV_URL_LIVE, CSV_URL_BANK);

/* ====== Quiz Flow ====== */
function resetRound(start = false){
  idx = 0; score = 0; selected = null;
  updateMeta();
  elFB.innerHTML = '';
  elShow.style.display = 'none';
  elPlayAgain.style.display = 'none';
  document.querySelectorAll('.choice').forEach(b => b.classList.remove('disabled','selected'));
  if (start){
    roundActive = true;
    showQuestion();
  } else {
    roundActive = false;
    elQ.textContent = "Press “Start Quiz” to begin.";
    elOpts.innerHTML = '';
    elTimerWrap.setAttribute('aria-hidden','true');
  }
}

function showQuestion(){
  const q = todays[idx];
  if (!q){
    elFB.innerHTML = "<div class='correct'>Nice! Done for today.</div>";
    elPlayAgain.style.display = "inline-flex";
    elPlayAgain.onclick = () => resetRound(true);
    roundActive = false;
    elTimerWrap.setAttribute('aria-hidden','true');
    return;
  }
  selected = null;
  elFB.innerHTML = '';
  elShow.style.display = 'none';
  elPlayAgain.style.display = 'none';

  elMetaText.textContent = `${q.Difficulty || '—'} • ${q.Category || 'Quiz'}`;

  const qText = q.Question || '—';
  elQ.textContent = qText;
  setQuestionFont(qText);

  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  elOpts.innerHTML = '';
  opts.forEach((optText) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = optText;
    btn.onclick = () => onSelect(btn, optText);
    elOpts.appendChild(btn);
  });

  startTimer(10);
}

function onSelect(btn, val){
  if (!roundActive) return;
  document.querySelectorAll('.choice').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selected = val;
  elShow.style.display = 'inline-flex';
}

elShow.addEventListener('click', () => {
  const q = todays[idx];
  if (!q || !selected) return;
  reveal(q, false);
});

function reveal(q, timeUp = false){
  stopTimer();

  let isCorrect = norm(selected).toLowerCase() === norm(q.Answer).toLowerCase();
  if (timeUp) isCorrect = false;

  const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : '';
  elFB.innerHTML = isCorrect
    ? `<div class="correct">✅ Correct! ${expl}</div>`
    : `<div class="wrong">❌ Not quite. Correct: <strong>${q.Answer}</strong> ${expl}</div>`;

  // Lock choices after reveal
  document.querySelectorAll('.choice').forEach(b => b.classList.add('disabled'));

  if (isCorrect){
    score++; idx++;
    updateMeta();
    setTimeout(() => { showQuestion(); }, 700);
  } else {
    // Do NOT auto-restart; wait for Start/Shuffle
    roundActive = false;
    elShow.style.display = 'none';
    elPlayAgain.style.display = 'inline-flex';
    elPlayAgain.onclick = () => resetRound(true);
  }
}

/* ====== CTAs ====== */
elStart.addEventListener('click', () => {
  if (!todays.length){
    // If rows haven't loaded yet, try again (user likely clicked early)
    loadCSV(CSV_URL_LIVE, CSV_URL_BANK);
    // Give Papa a moment, then start if available
    setTimeout(() => resetRound(true), 400);
  } else {
    resetRound(true);
  }
});

elShuffle.addEventListener('click', () => {
  if (!allRows.length) return;
  // If todays empty, take 12 from allRows
  if (!todays.length) todays = allRows.slice(0, 12);
  // Shuffle todays
  todays = todays.map(v => ({v, r: Math.random()})).sort((a,b)=>a.r-b.r).map(p=>p.v);
  resetRound(true);
});

elShare.addEventListener('click', async () => {
  try {
    const url = window.location.href;
    const text = "Try today’s Daily BrainBolt with me ⚡";
    if (navigator.share){
      await navigator.share({ title: "The Daily BrainBolt", text, url });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Link copied! Share it with your friends.");
    }
  } catch (e) {
    console.log("Share failed:", e);
  }
});
