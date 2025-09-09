// === CONFIG: your Google Sheet published CSVs ===
// LIVE (today's set)
const CSV_LIVE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";
// BANK (fallback 12)
const CSV_BANK_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

// === Elements ===
const elQ = document.getElementById('question');
const elOpts = document.getElementById('options');
const elShow = document.getElementById('showAnswerBtn');
const elFB = document.getElementById('feedback');
const elProgText = document.getElementById('progressText');
const elProgFill = document.getElementById('progressFill');
const elScore = document.getElementById('score');
const elToday = document.getElementById('today');
const elStatus = document.getElementById('statusBadge');

const btnStart = document.getElementById('startBtn');
const btnShuffle = document.getElementById('shuffleBtn');
const btnShare = document.getElementById('shareBtn');

// === Date ===
const now = new Date();
const todayKey = [ now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0') ].join('-');
elToday.textContent = todayKey;

// === State ===
let liveRows = [], bankRows = [];
let todays = [];
let idx = 0, score = 0, selected = null;

function norm(s){ return String(s||'').trim(); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

function updateMeta(){
  elProgText.textContent = `${idx}/${todays.length || 0}`;
  const pct = (todays.length ? (idx / todays.length) : 0) * 100;
  elProgFill.style.width = `${pct}%`;
  elScore.textContent = String(score);
}

function renderQuestion(){
  const q = todays[idx];
  if(!q){
    elFB.innerHTML = `<div class="correct">Nice! Done for today.</div>`;
    elStatus.textContent = 'Ready'; elStatus.classList.remove('playing'); elStatus.classList.add('ready');
    return;
  }
  selected = null;
  elFB.innerHTML = '';
  elShow.style.display = 'none';

  elStatus.textContent = `${q.Difficulty || '—'} • ${q.Category || 'Quiz'}`;
  elStatus.classList.add('playing'); elStatus.classList.remove('ready');

  elQ.textContent = q.Question || '—';
  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  elOpts.innerHTML = '';
  opts.forEach((optText) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = optText;
    btn.onclick = () => onSelect(btn, optText, q);
    elOpts.appendChild(btn);
  });
}

function onSelect(btn, val, q){
  document.querySelectorAll('.choice').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selected = val;
  elShow.style.display = 'inline-flex';
}

elShow?.addEventListener('click', () => {
  const q = todays[idx];
  if(!q || !selected) return;
  reveal(q);
});

function reveal(q){
  const isCorrect = norm(selected).toLowerCase() === norm(q.Answer).toLowerCase();
  const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : '';
  elFB.innerHTML = isCorrect
    ? `<div class="correct">✅ Correct! ${expl}</div>`
    : `<div class="wrong">❌ Not quite. Correct: <strong>${q.Answer}</strong> ${expl}</div>`;
  // move next (correct advances; wrong resets)
  setTimeout(() => {
    if(isCorrect){ score++; idx++; }
    else { idx = 0; score = 0; }
    updateMeta();
    renderQuestion();
  }, 900);
}

// === Loaders ===
function loadCSV(url){
  return new Promise((resolve,reject)=>{
    Papa.parse(url + "&cb=" + Date.now(), {
      download: true, header: true, skipEmptyLines: true,
      complete: ({data}) => resolve((data||[]).filter(r=>r && r.Question)),
      error: (err) => reject(err)
    });
  });
}

async function initData(){
  try{
    [liveRows, bankRows] = await Promise.all([
      loadCSV(CSV_LIVE_URL),
      loadCSV(CSV_BANK_URL)
    ]);
    // Today’s set
    todays = liveRows.filter(r => norm(r.Date) === todayKey);
    if(!todays.length){
      // fallback first 12 from bank
      todays = bankRows.slice(0,12);
    }
    updateMeta();
    elStatus.textContent = 'Press Start Quiz'; elStatus.classList.add('ready'); elStatus.classList.remove('playing');
    elQ.textContent = ''; elOpts.innerHTML = '';
  }catch(e){
    console.error("CSV error", e);
    elStatus.textContent = 'Couldn’t load questions. Check publish settings.'; elStatus.classList.add('ready');
  }
}

// === Controls ===
btnStart?.addEventListener('click', () => {
  if(!todays.length){ elStatus.textContent = 'No quiz rows found.'; return; }
  idx = 0; score = 0; selected = null;
  updateMeta(); renderQuestion();
});

btnShuffle?.addEventListener('click', () => {
  if(!todays.length) return;
  todays = shuffle(todays);
  idx = 0; score = 0; selected = null;
  updateMeta(); renderQuestion();
});

btnShare?.addEventListener('click', async () => {
  try{
    const shareData = {
      title: 'The Daily BrainBolt',
      text: 'Today’s BrainBolt is live! Can you ace all 12?',
      url: 'https://dailybrainbolt.com/'
    };
    if(navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(shareData.url);
      alert('Link copied to clipboard!');
    }
  }catch(e){ console.log('Share cancelled or failed', e); }
});

// === GO ===
initData();
