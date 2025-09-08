/** The Daily BrainBolt — app.js (fixed CSV parsing & cache-busting) */

/** Published Google Sheet link */
const SHEET_ID = "2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG";

/** Tab gids */
const LIVE_GID = "1410250735"; // live tab
const BANK_GID = "2009978011"; // bank tab

/** Build CSV URLs */
const CSV_URL_LIVE = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&gid=${LIVE_GID}`;
const CSV_URL_BANK = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&gid=${BANK_GID}`;

const elQ = document.getElementById('question');
const elOpts = document.getElementById('options');
const elShow = document.getElementById('showAnswerBtn');
const elFB = document.getElementById('feedback');
const elMetaText = document.getElementById('metaText');
const elToday = document.getElementById('today');
const elProgText = document.getElementById('progressText');
const elProgFill = document.getElementById('progressFill');
const elScore = document.getElementById('score');
const elPlayAgain = document.getElementById('playAgain');
const elStatus = document.getElementById('statusline');
const elTimerWrap = document.getElementById('timerWrap');
const elTimerBar = document.getElementById('timerBar');
const elTimerText = document.getElementById('timerText');
const elStart = document.getElementById('startBtn');
const elShuffle = document.getElementById('shuffleBtn');
const elShare = document.getElementById('shareBtn');

const now = new Date();
const todayKey = [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
elToday.textContent = todayKey;

let allRows = [], todays = [], idx = 0, score = 0, selected = null, timer = null, timeLeft = 10;

function status(msg) { elStatus.textContent = msg; console.log("[CSV]", msg); }
const norm = s => String(s||'').trim();

/* ========== CSV Loading (fixed filter) ========== */
function loadCSV(url, fallbackUrl) {
  const bust = url.includes('?') ? '&cb=' + Date.now() : '?cb=' + Date.now();
  status(`Loading: ${url}`);
  Papa.parse(url + bust, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: ({ data }) => {
      // ✅ Only require Question, not Date (bank often has blank Date)
      const rows = (data || []).filter(r => r && r.Question);
      status(`Parsed ${rows.length} rows`);
      if (!rows.length && fallbackUrl) {
        status("No rows; trying fallback…");
        loadCSV(fallbackUrl, null);
        return;
      }
      handleRows(rows);
    },
    error: (err) => {
      console.error("CSV error", err);
      if (fallbackUrl) {
        status("Primary failed; trying fallback…");
        loadCSV(fallbackUrl, null);
      } else {
        status("Error loading CSV. Check Publish settings/permissions.");
        elQ.textContent = "Couldn’t load questions.";
      }
    }
  });
}

function handleRows(rows){
  allRows = rows;
  // Prefer today's set if Date matches; otherwise take first 12 as fallback
  todays = rows.filter(r => norm(r.Date) === todayKey);
  if (!todays.length) todays = rows.slice(0, 12);

  // Don’t auto-start; prompt user
  idx = 0; score = 0; selected = null;
  updateMeta();
  elFB.innerHTML = '';
  elShow.style.display = 'none';
  elPlayAgain.style.display = 'none';
  elQ.textContent = "Press “Start Quiz” to begin.";
  elOpts.innerHTML = '';
  elTimerWrap.style.display = "none";
}

/* ========== Quiz Flow ========== */
function resetAndStart() {
  idx = 0; score = 0; selected = null;
  updateMeta();
  if (!todays.length) { elQ.textContent = "No quiz rows found."; return; }
  showQuestion();
}

function updateMeta() {
  elProgText.textContent = `${idx}/${todays.length || 0}`;
  const pct = (todays.length ? (idx / todays.length) : 0) * 100;
  elProgFill.style.width = `${pct}%`;
  elScore.textContent = String(score);
}

function showQuestion() {
  clearTimer();
  const q = todays[idx];
  if (!q) {
    elFB.innerHTML = "<div class='correct'>Nice! Done for today.</div>";
    elPlayAgain.style.display = "inline-flex";
    elPlayAgain.onclick = () => resetAndStart();
    return;
  }
  selected = null;
  elFB.innerHTML = '';
  elShow.style.display = 'none';
  elPlayAgain.style.display = 'none';

  elMetaText.textContent = `${q.Difficulty || '—'} • ${q.Category || 'Quiz'}`;
  elQ.textContent = q.Question || '—';

  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  elOpts.innerHTML = '';
  opts.forEach((optText) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = optText;
    btn.onclick = () => onSelect(btn, optText);
    elOpts.appendChild(btn);
  });

  startTimer();
}

function onSelect(btn, val) {
  document.querySelectorAll('.choice').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selected = val;
  elShow.style.display = 'inline-flex';
}

elShow.addEventListener('click', () => {
  const q = todays[idx];
  if (!q || !selected) return;
  reveal(q);
});

function reveal(q) {
  clearTimer();
  const isCorrect = norm(selected).toLowerCase() === norm(q.Answer).toLowerCase();
  const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : '';
  elFB.innerHTML = isCorrect
    ? `<div class="correct">✅ Correct! ${expl}</div>`
    : `<div class="wrong">❌ Not quite. Correct: <strong>${q.Answer}</strong> ${expl}</div>`;
  document.querySelectorAll('.choice').forEach(b => b.classList.add('disabled'));
  if (isCorrect) { score++; idx++; }
  updateMeta();
}

/* ========== Timer ========== */
function startTimer() {
  timeLeft = 10;
  elTimerWrap.style.display = "flex";
  elTimerBar.style.right = "0%";
  elTimerText.textContent = timeLeft + "s";
  timer = setInterval(() => {
    timeLeft--;
    elTimerBar.style.right = ((10 - timeLeft) * 10) + "%";
    elTimerText.textContent = Math.max(0, timeLeft) + "s";
    if (timeLeft <= 0) {
      clearTimer();
      reveal(todays[idx]);
    }
  }, 1000);
}
function clearTimer() { if (timer) clearInterval(timer); timer = null; }

/* ========== Shuffle helper & Buttons ========== */
function shuffleArray(arr) {
  return arr.map(v => ({ v, r: Math.random() }))
            .sort((a,b) => a.r - b.r)
            .map(o => o.v);
}

elStart.addEventListener('click', () => resetAndStart());
elShuffle.addEventListener('click', () => {
  if (!allRows.length) return;            // nothing loaded yet
  todays = shuffleArray(allRows).slice(0, 12);
  resetAndStart();
});
elShare.addEventListener('click', async () => {
  const shareData = {
    title: 'The Daily BrainBolt',
    text: 'Try today’s quiz on The Daily BrainBolt!',
    url: window.location.href
  };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(shareData.url);
      alert("Link copied! Share it with your friends.");
    }
  } catch(e) { console.error("Share failed:", e); }
});

/* ========== Kickoff (prefer live, fallback to bank) ========== */
loadCSV(CSV_URL_LIVE, CSV_URL_BANK);
