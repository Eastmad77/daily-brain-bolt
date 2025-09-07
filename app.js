/** Published Google Sheet link (pubhtml, not pubcsv) */
const PUBHTML_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRrjRRrlWpb8tC3iMA6S0hEFLMpkg2cAxLKFqE9Vy-aVQCwv1D5WKYCxHuwo9edF1M_0sBdJEsQ96-c/pubhtml";

/** Tab gids */
const LIVE_GID = "1410250735"; // live
const BANK_GID = "2009978011"; // bank (fallback)
/* The Daily BrainBolt – App Logic (resilient CSV loader + 10s timer + share) */

/** 👇 UPDATE THIS to your *published to web* URL (pubhtml) */
const PUBHTML_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRrjRRrlWpb8tC3iMA6S0hEFLMpkg2cAxLKFqE9Vy-aVQCwv1D5WKYCxHuwo9edF1M_0sBdJEsQ96-c/pubhtml";

/** 👇 If you know the gid for the live tab, set it here (you told me `1410250735` earlier) */
const LIVE_GID = "1410250735"; // 'live' tab gid
const BANK_GID = "2009978011"; // optional: 'bank' tab gid (fallback)

/* Build robust CSV candidates from a pubhtml link */
function buildCsvCandidates(pubhtml, liveGid, bankGid) {
  // Ensure we start from .../pubhtml
  const base = pubhtml.replace(/\/pub(\?.*)?$/, "/pubhtml");
  // Derive the /pub endpoint
  const pubRoot = base.replace(/pubhtml(\?.*)?$/, "pub");
  const t = Date.now();

  const urls = [];
  if (liveGid) urls.push(`${pubRoot}?output=csv&gid=${liveGid}&cb=${t}`);
  if (bankGid) urls.push(`${pubRoot}?output=csv&gid=${bankGid}&cb=${t}`);
  // generic csv (first sheet) as last resort
  urls.push(`${pubRoot}?output=csv&cb=${t}`);

  return urls;
}

/* Elements */
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

const btnStart = document.getElementById('startBtn');
const btnShuffle = document.getElementById('shuffleBtn');
const btnShare = document.getElementById('shareBtn');

const timerFill = document.getElementById('timerFill');
const timerLabel = document.getElementById('timerLabel');

/* Date label */
const now = new Date();
const todayKey = [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
elToday.textContent = todayKey;

/* State */
let allRows = [], todays = [], idx = 0, score = 0, selected = null;
let csvLoaded = false;
let timerId = null, timeLeft = 10;
const norm = s => String(s||'').trim();

/* Status helper */
function status(msg) { elStatus.textContent = msg; console.log("[Quiz]", msg); }

/* CSV loader with retries */
async function loadCsvOnce() {
  if (csvLoaded) return true;

  const candidates = buildCsvCandidates(PUBHTML_URL, LIVE_GID, BANK_GID);
  status("Loading CSV…");

  for (const url of candidates) {
    try {
      const ok = await parseCsv(url);
      if (ok) { csvLoaded = true; return true; }
    } catch (e) {
      console.warn("CSV attempt failed:", url, e);
    }
  }

  const helpHtml = [
    "Couldn’t load CSV. Ensure the sheet is <em>File → Share → Publish to the web (entire document)</em>,",
    " and that your <strong>live</strong> tab’s gid is correct.",
    `<br><small>Try opening this candidate directly: <a href="${candidates[0]}" target="_blank" rel="noopener">${candidates[0]}</a></small>`
  ].join('');
  elMetaText.innerHTML = helpHtml;
  status("Error fetching CSV. Check Publish settings, permissions, and tab names.");
  return false;
}

/* Parse via PapaParse */
function parseCsv(csvUrl) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const rows = (data || []).filter(r => r && r.Date && r.Question);
        status(`Loaded ${rows.length} rows from ${csvUrl}`);
        if (!rows.length) { return reject(new Error("No rows")); }
        allRows = rows;
        // pick today's; else first 12 as a fallback
        todays = rows.filter(r => norm(r.Date) === todayKey);
        if (!todays.length) todays = rows.slice(0, 12);
        resolve(true);
      },
      error: (err) => reject(err)
    });
  });
}

/* Quiz flow */
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

function clearTimer() {
  if (timerId) cancelAnimationFrame(timerId);
  timerId = null;
  timeLeft = 10;
  timerFill.style.width = '0%';
  timerFill.classList.remove('urgent');
  timerLabel.textContent = '10';
}

function startTimer(onTimeUp) {
  clearTimer();
  const start = performance.now();
  const duration = 10 * 1000;

  function tick(ts) {
    const elapsed = ts - start;
    const remainingMs = Math.max(0, duration - elapsed);
    timeLeft = Math.ceil(remainingMs / 1000);
    const pct = ((duration - remainingMs) / duration) * 100;
    timerFill.style.width = `${pct}%`;
    timerLabel.textContent = String(timeLeft);
    if (timeLeft <= 3) timerFill.classList.add('urgent');

    if (remainingMs <= 0) {
      timerFill.style.width = '100%';
      onTimeUp?.();
    } else {
      timerId = requestAnimationFrame(tick);
    }
  }
  timerId = requestAnimationFrame(tick);
}

function showQuestion() {
  const q = todays[idx];
  if (!q) {
    elFB.innerHTML = "<div class='correct'>Nice! Done for today.</div>";
    elPlayAgain.style.display = "inline-flex";
    elPlayAgain.onclick = () => { resetAndStart(); };
    clearTimer();
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

  // start the 10s countdown for this question
  startTimer(() => {
    // time up -> reveal wrong if user hasn’t chosen
    if (!selected) {
      elFB.innerHTML = `<div class="wrong">⏱️ Time's up! Correct: <strong>${q.Answer || '—'}</strong></div>`;
      setTimeout(() => { idx++; updateMeta(); showQuestion(); }, 900);
    }
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
  reveal(q);
});

function reveal(q) {
  const isCorrect = norm(selected).toLowerCase() === norm(q.Answer).toLowerCase();
  const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : '';
  elFB.innerHTML = isCorrect
    ? `<div class="correct">✅ Correct! ${expl}</div>`
    : `<div class="wrong">❌ Not quite. Correct: <strong>${q.Answer}</strong> ${expl}</div>`;

  clearTimer();

  setTimeout(() => {
    if (isCorrect) { score++; idx++; }
    else { idx = 0; score = 0; }
    updateMeta();
    showQuestion();
  }, 900);
}

/* Start buttons */
btnStart?.addEventListener('click', async () => {
  // keep layout stable while “loading…”
  btnStart.disabled = true; btnShuffle.disabled = true;
  try {
    const ok = await loadCsvOnce();
    if (!ok) return; // error message already shown
    resetAndStart();
  } finally {
    btnStart.disabled = false; btnShuffle.disabled = false;
  }
});

btnShuffle?.addEventListener('click', async () => {
  btnStart.disabled = true; btnShuffle.disabled = true;
  try {
    const ok = await loadCsvOnce();
    if (!ok) return;
    // shuffle today's set
    for (let i = todays.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [todays[i], todays[j]] = [todays[j], todays[i]];
    }
    resetAndStart();
  } finally {
    btnStart.disabled = false; btnShuffle.disabled = false;
  }
});

/* Share */
btnShare?.addEventListener('click', async () => {
  const shareData = {
    title: 'The Daily BrainBolt',
    text: `I’m playing The Daily BrainBolt – quick trivia with a 10s timer. Join me!`,
    url: location.origin
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      alert('Link copied to clipboard!');
    }
  } catch (e) {
    console.log('Share failed', e);
  }
});

/* Initial meta */
elMetaText.innerHTML = `Click <strong>Start Quiz</strong> to begin.`;
status("Ready.");
