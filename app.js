/** The Daily BrainBolt — app.js (robust headers + date matching + cache-bust) **/

/** Published Google Sheet link */
const SHEET_ID = "2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG";

/** Tab gids */
const LIVE_GID = "1410250735"; // live tab
const BANK_GID = "2009978011"; // bank tab

/** Build CSV URLs (with a dynamic cache-buster added later) */
const CSV_URL_LIVE_BASE = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&gid=${LIVE_GID}`;
const CSV_URL_BANK_BASE = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&gid=${BANK_GID}`;

/* DOM */
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
const elTimerWrap = document.getElementById('timerWrap');
const elTimerBar = document.getElementById('timerBar');
const elTimerText = document.getElementById('timerText');

/* Today (YYYY-MM-DD) */
const todayKey = new Date().toISOString().slice(0,10);
elToday.textContent = todayKey;

/* State */
let allRows = [], todays = [], idx = 0, score = 0, selected = null;
let timer = null, timeLeft = 10;

/* Utils */
function log(msg){ console.log(msg); elStatus.textContent = msg; }
const norm = s => String(s ?? '').trim();

/* Case/space-insensitive field accessor */
function g(row, names){
  for (const name of names){
    // try exact
    if (row[name] != null) return row[name];
  }
  const keys = Object.keys(row);
  for (const name of names){
    const target = norm(name).toLowerCase().replace(/\s+/g,'');
    for (const k of keys){
      const kk = norm(k).toLowerCase().replace(/\s+/g,'');
      if (kk === target) return row[k];
    }
  }
  return '';
}

/* Try to normalize a Date cell to YYYY-MM-DD */
function toYYYYMMDD(val){
  const s = norm(val);
  if (!s) return '';
  // already looks like yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // try Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return '';
}

/* CSV loading */
function loadCSV(urlBase, fallbackBase){
  const url = urlBase + (urlBase.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  log(`Loading CSV: ${url}`);
  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: ({data}) => {
      const rows = (data || [])
        .filter(r => g(r, ['Question'])) // must at least have Question
        .map(r => ({
          Date:        toYYYYMMDD(g(r, ['Date'])),
          Question:    g(r, ['Question']),
          OptionA:     g(r, ['OptionA','Option A']),
          OptionB:     g(r, ['OptionB','Option B']),
          OptionC:     g(r, ['OptionC','Option C']),
          OptionD:     g(r, ['OptionD','Option D']),
          Answer:      g(r, ['Answer','Correct','Correct Answer']),
          Explanation: g(r, ['Explanation','Expl','Notes']),
          Category:    g(r, ['Category','Topic']),
          Difficulty:  g(r, ['Difficulty','Level'])
        }));
      log(`Parsed ${rows.length} rows`);
      if (!rows.length && fallbackBase){
        log('No rows from primary; trying fallback…');
        loadCSV(fallbackBase, null);
        return;
      }
      handleRows(rows);
    },
    error: (err) => {
      console.error('CSV error', err);
      if (fallbackBase){
        log('Primary failed; trying fallback…');
        loadCSV(fallbackBase, null);
      } else {
        elQ.textContent = "Couldn’t load questions.";
        log('Error loading CSV (no fallback).');
      }
    }
  });
}

function handleRows(rows){
  allRows = rows;
  // Prefer today matches (live), else fallback to first 12 from whatever we have
  const todaysMatches = rows.filter(r => r.Date === todayKey);
  log(`Today matches: ${todaysMatches.length} (today=${todayKey})`);
  todays = todaysMatches.length ? todaysMatches : rows.slice(0, 12);

  // Prep UI (don’t auto-start)
  idx = 0; score = 0; selected = null;
  updateMeta();
  elFB.innerHTML = '';
  elShow.style.display = 'none';
  elPlayAgain.style.display = 'none';
  elTimerWrap.style.display = 'none';
  if (!todays.length){
    elQ.textContent = "No quiz rows found. (Check sheet headers and publish settings.)";
  } else {
    elQ.textContent = "Press “Start Quiz” to begin.";
  }
  elOpts.innerHTML = '';
}

/* Quiz flow */
function resetAndStart(){
  idx = 0; score = 0; selected = null;
  updateMeta();
  if (!todays.length){ elQ.textContent = "No quiz rows found."; return; }
  showQuestion();
}
function updateMeta(){
  elProgText.textContent = `${idx}/${todays.length || 0}`;
  const pct = (todays.length ? (idx / todays.length) : 0) * 100;
  elProgFill.style.width = `${pct}%`;
  elScore.textContent = String(score);
}
function showQuestion(){
  clearTimer();
  const q = todays[idx];
  if (!q){
    elFB.innerHTML = "<div class='correct'>🎉 Done for today!</div>";
    elPlayAgain.style.display = 'inline-flex';
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

  startTimer();
}
function onSelect(btn, val){
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
    : `<div class="wrong">❌ Not quite. Correct: <strong>${q.Answer || '—'}</strong> ${expl}</div>`;
  if (isCorrect){ score++; idx++; }
  updateMeta();
  setTimeout(showQuestion, 900);
});

/* Timer */
function startTimer(){
  timeLeft = 10;
  elTimerWrap.style.display = 'flex';
  elTimerBar.style.right = '0%';
  elTimerText.textContent = timeLeft + 's';
  timer = setInterval(() => {
    timeLeft--;
    elTimerBar.style.right = ((10 - timeLeft) * 10) + '%';
    elTimerText.textContent = Math.max(0, timeLeft) + 's';
    if (timeLeft <= 0){
      clearTimer();
      const q = todays[idx];
      if (q){ // treat as wrong
        const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : '';
        elFB.innerHTML = `<div class="wrong">⌛ Time’s up! Correct: <strong>${q.Answer || '—'}</strong> ${expl}</div>`;
        updateMeta();
        // Wait for Start/Shuffle to continue (no auto-reset)
        elShow.style.display = 'none';
        elPlayAgain.style.display = 'inline-flex';
        elPlayAgain.onclick = resetAndStart;
      }
    }
  }, 1000);
}
function clearTimer(){ if (timer) clearInterval(timer); timer = null; }

/* Shuffle + Share */
function shuffleArray(arr){
  return arr.map(v => ({v, r: Math.random()})).sort((a,b)=>a.r-b.r).map(o=>o.v);
}
elStart.addEventListener('click', resetAndStart);
elShuffle.addEventListener('click', () => {
  if (!allRows.length) return;
  todays = shuffleArray(allRows).slice(0,12);
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
      alert('Link copied to clipboard!');
    }
  } catch(e){ console.error('Share failed:', e); }
});

/* Kickoff: prefer live, fallback to bank (with cache-busting) */
loadCSV(CSV_URL_LIVE_BASE, CSV_URL_BANK_BASE);
