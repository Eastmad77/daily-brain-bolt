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

const now = new Date();
const todayKey = [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
elToday.textContent = todayKey;

let allRows = [], todays = [], idx = 0, score = 0, selected = null, timer = null, timeLeft = 10;

function status(msg) { elStatus.textContent = msg; console.log("[CSV]", msg); }
const norm = s => String(s||'').trim();

function loadCSV(url, fallbackUrl) {
  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: ({ data }) => {
      const rows = (data || []).filter(r => r && r.Date && r.Question);
      if (!rows.length && fallbackUrl) {
        loadCSV(fallbackUrl, null);
        return;
      }
      allRows = rows;
      todays = rows.filter(r => norm(r.Date) === todayKey);
      if (!todays.length) todays = rows.slice(0, 12);
      resetAndStart();
    },
    error: (err) => {
      console.error("CSV error", err);
      if (fallbackUrl) loadCSV(fallbackUrl, null);
      else status("Error loading CSV");
    }
  });
}

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

// Timer
function startTimer() {
  timeLeft = 10;
  elTimerWrap.style.display = "flex";
  elTimerBar.style.right = "0%";
  elTimerText.textContent = timeLeft + "s";
  timer = setInterval(() => {
    timeLeft--;
    elTimerBar.style.right = ((10 - timeLeft) * 10) + "%";
    elTimerText.textContent = timeLeft + "s";
    if (timeLeft <= 0) {
      clearTimer();
      reveal(todays[idx]);
    }
  }, 1000);
}
function clearTimer() { if (timer) clearInterval(timer); timer = null; }

// Shuffle helper
function shuffleArray(arr) {
  return arr.map(v => ({ v, sort: Math.random() }))
    .sort((a,b) => a.sort - b.sort)
    .map(({v}) => v);
}

// Button actions
document.getElementById('startBtn').addEventListener('click', () => {
  resetAndStart();
});
document.getElementById('shuffleBtn').addEventListener('click', () => {
  todays = shuffleArray(allRows).slice(0, 12);
  resetAndStart();
});
document.getElementById('shareBtn').addEventListener('click', async () => {
  const shareData = {
    title: 'The Daily BrainBolt',
    text: 'Try today’s quiz on The Daily BrainBolt!',
    url: window.location.href
  };
  try {
    if (navigator.share) await navigator.share(shareData);
    else alert("Copy this link:\n" + shareData.url);
  } catch(e) { console.error(e); }
});

// Start by loading CSV
loadCSV(CSV_URL_LIVE, CSV_URL_BANK);
