/** The Daily BrainBolt — fixed “No quiz rows found” issue **/

const SHEET_ID = "2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG";
const LIVE_GID = "1410250735";
const BANK_GID = "2009978011";

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
const elStart = document.getElementById('startBtn');
const elShuffle = document.getElementById('shuffleBtn');
const elShare = document.getElementById('shareBtn');

const todayKey = new Date().toISOString().slice(0, 10); // always YYYY-MM-DD
elToday.textContent = todayKey;

let allRows = [], todays = [], idx = 0, score = 0, selected = null;

function status(msg) { elStatus.textContent = msg; console.log("[CSV]", msg); }
const norm = s => String(s||'').trim();

/* ========== CSV Loader ========== */
function loadCSV(url, fallbackUrl) {
  Papa.parse(url + "&cb=" + Date.now(), {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: ({ data }) => {
      const rows = (data || []).filter(r => r.Question);
      status(`Parsed ${rows.length} rows from ${url}`);

      if (!rows.length && fallbackUrl) {
        status("Trying fallback sheet…");
        loadCSV(fallbackUrl, null);
        return;
      }

      allRows = rows;
      todays = rows.filter(r => norm(r.Date) === todayKey);

      status(`Found ${todays.length} rows for today (${todayKey})`);

      // fallback if today is empty
      if (!todays.length) {
        todays = rows.slice(0, 12);
        status(`No matching today; using first ${todays.length} rows instead.`);
      }

      initUI();
    },
    error: (err) => {
      console.error("CSV error", err);
      if (fallbackUrl) loadCSV(fallbackUrl, null);
      else elQ.textContent = "Couldn’t load questions.";
    }
  });
}

/* ========== UI / Quiz ========== */
function initUI() {
  idx = 0; score = 0; selected = null;
  updateMeta();
  elQ.textContent = "Press “Start Quiz” to begin.";
  elOpts.innerHTML = '';
  elFB.innerHTML = '';
  elShow.style.display = 'none';
  elPlayAgain.style.display = 'none';
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
  const q = todays[idx];
  if (!q) {
    elFB.innerHTML = "<div class='correct'>🎉 Done for today!</div>";
    elPlayAgain.style.display = "inline-flex";
    elPlayAgain.onclick = resetAndStart;
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
  opts.forEach(optText => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = optText;
    btn.onclick = () => onSelect(btn, optText);
    elOpts.appendChild(btn);
  });
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
  const isCorrect = norm(selected).toLowerCase() === norm(q.Answer).toLowerCase();
  const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : '';
  elFB.innerHTML = isCorrect
    ? `<div class="correct">✅ Correct! ${expl}</div>`
    : `<div class="wrong">❌ Not quite. Correct: <strong>${q.Answer}</strong> ${expl}</div>`;
  if (isCorrect) { score++; idx++; }
  updateMeta();
  setTimeout(showQuestion, 1000);
});

/* ========== Buttons ========== */
elStart.addEventListener('click', resetAndStart);
elShuffle.addEventListener('click', () => {
  todays = shuffleArray(allRows).slice(0, 12);
  resetAndStart();
});
elShare.addEventListener('click', async () => {
  const shareData = {
    title: 'The Daily BrainBolt',
    text: 'Try today’s quiz!',
    url: window.location.href
  };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(shareData.url);
      alert("Link copied to clipboard!");
    }
  } catch(e) { console.error("Share failed:", e); }
});

/* ========== Helper ========== */
function shuffleArray(arr) {
  return arr.map(v => ({ v, r: Math.random() }))
            .sort((a,b) => a.r - b.r)
            .map(o => o.v);
}

/* ========== Kickoff ========== */
loadCSV(CSV_URL_LIVE, CSV_URL_BANK);
