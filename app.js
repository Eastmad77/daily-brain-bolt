/** The Daily BrainBolt — app.js (wait for Papa + DOM, LIVE-first, wider layout) */

/** Google Sheet publish ID */
const SHEET_ID = "2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG";
const LIVE_GID = "1410250735";
const BANK_GID = "2009978011";

const CSV_URL_LIVE = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&gid=${LIVE_GID}`;
const CSV_URL_BANK = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&gid=${BANK_GID}`;

/* DOM refs */
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

/* Today */
const todayKey = new Date().toISOString().slice(0,10);
elToday.textContent = todayKey;

/* State */
let allRows = [], todays = [], idx = 0, score = 0, selected = null;
let timer = null, timeLeft = 10;

/* Helpers */
function log(msg){ console.log(msg); elStatus.textContent = msg; }
const norm = s => String(s ?? '').trim();

/* Wait for DOM + Papa */
function ready(cb){
  if (document.readyState === 'complete' || document.readyState === 'interactive') cb();
  else document.addEventListener('DOMContentLoaded', cb);
}
function whenPapa(cb){
  if (window.Papa) cb();
  else setTimeout(() => whenPapa(cb), 30);
}

/* case/space-insensitive getter */
function g(row, names){
  for (const name of names){ if (row[name] != null) return row[name]; }
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
function normalizeRows(data){
  return (data || [])
    .filter(r => g(r, ['Question']))
    .map(r => ({
      Date:        norm(g(r, ['Date'])),
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
}

/* CSV loader */
function loadCSV(url, cb){
  const withBust = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  log(`Loading CSV: ${withBust}`);
  Papa.parse(withBust, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: ({data}) => {
      const rows = normalizeRows(data);
      log(`Parsed ${rows.length} rows from ${url}`);
      cb(null, rows);
    },
    error: (err) => cb(err || new Error('CSV error'))
  });
}

/* Init flow: LIVE first; if empty, BANK (first 12) */
function init(){
  // buttons (now guaranteed to wire because we waited for DOM)
  elStart.addEventListener('click', resetAndStart);
  elShuffle.addEventListener('click', () => {
    if (!allRows.length) return;
    todays = shuffleArray(allRows).slice(0,12);
    resetAndStart();
  });
  elShare.addEventListener('click', async () => {
    const shareData = { title: 'The Daily BrainBolt', text: 'Try today’s quiz!', url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(shareData.url); alert('Link copied to clipboard!'); }
    } catch(e){ console.error('Share failed:', e); }
  });

  // load CSV
  loadCSV(CSV_URL_LIVE, (errLive, liveRows) => {
    if (!errLive && liveRows.length){
      allRows = liveRows.slice();
      todays = liveRows.slice(); // use live as-is
      log(`Using LIVE: ${todays.length} rows`);
      initUI();
    } else {
      log('LIVE empty/failed; trying BANK…');
      loadCSV(CSV_URL_BANK, (errBank, bankRows) => {
        if (!errBank && bankRows.length){
          allRows = bankRows.slice();
          todays = bankRows.slice(0,12);
          log(`Using BANK fallback: ${todays.length} rows`);
          initUI();
        } else {
          elQ.textContent = "Couldn’t load questions. Check publish settings.";
          log('BANK also empty/failed.');
        }
      });
    }
  });
}

function initUI(){
  idx = 0; score = 0; selected = null;
  updateMeta();
  elFB.innerHTML = '';
  elShow.style.display = 'none';
  elPlayAgain.style.display = 'none';
  elTimerWrap.style.display = 'none';
  elQ.textContent = "Press “Start Quiz” to begin.";
  elOpts.innerHTML = '';
}

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
    elFB.innerHTML = "<div class='correct'>🎉 Done for now!</div>";
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
  elTimerWrap.style.display = 'block';
  elTimerBar.style.right = '0%';
  elTimerText.textContent = timeLeft + 's';
  timer = setInterval(() => {
    timeLeft--;
    elTimerBar.style.right = ((10 - timeLeft) * 10) + '%';
    elTimerText.textContent = Math.max(0, timeLeft) + 's';
    if (timeLeft <= 0){
      clearTimer();
      const q = todays[idx];
      if (q){
        const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : '';
        elFB.innerHTML = `<div class="wrong">⌛ Time’s up! Correct: <strong>${q.Answer || '—'}</strong> ${expl}</div>`;
        elShow.style.display = 'none';
        elPlayAgain.style.display = 'inline-flex';
        elPlayAgain.onclick = resetAndStart;
      }
    }
  }, 1000);
}
function clearTimer(){ if (timer) clearInterval(timer); timer = null; }

/* Shuffle */
function shuffleArray(arr){
  return arr.map(v => ({v, r: Math.random()})).sort((a,b)=>a.r-b.r).map(o=>o.v);
}

/* Boot */
ready(() => whenPapa(init));
