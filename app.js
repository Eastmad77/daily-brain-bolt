/* ===== CONFIG & GLOBALS ===== */

// ===== Google Apps Script Web App (fill with your /exec URL) =====
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec';

// ===== Google Sheet CSV URLs =====
const BANK_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/.../pub?gid=2009978011&single=true&output=csv';
const LIVE_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/.../pub?gid=1410250735&single=true&output=csv';

// Globals
let rows = [];
let currentTheme = 'light';

/* ===== UTILITIES ===== */

function nzTodayYMD(){
  const now = new Date();
  const f = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year:'numeric', month:'2-digit', day:'2-digit' });
  const parts = f.formatToParts(now).reduce((o,x)=> (o[x.type]=x.value,o),{});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function withBust(url){ 
  const sep = url.includes('?') ? '&' : '?'; 
  return `${url}${sep}_cb=${Date.now()}`; 
}

/* ===== GOOGLE APPS SCRIPT INTEGRATION ===== */

async function gasStatus(){
  if (!GAS_WEBAPP_URL) return { ok:false, error:'No GAS url' };
  const res = await fetch(`${GAS_WEBAPP_URL}?action=status`, { cache:'no-store' });
  return await res.json();
}

async function gasBuild(){
  if (!GAS_WEBAPP_URL) return { ok:false, error:'No GAS url' };
  const res = await fetch(`${GAS_WEBAPP_URL}?action=build`, { method:'GET', cache:'no-store' });
  return await res.json();
}

async function ensureFreshLiveSet(){
  try{
    const todayNZ = nzTodayYMD();
    let s = await gasStatus();
    if (s.ok && s.liveDate === todayNZ && s.count === 12) return true;

    await gasBuild();
    for (let i=0;i<3;i++){
      await new Promise(r=>setTimeout(r, 1200));
      s = await gasStatus();
      if (s.ok && s.liveDate === todayNZ && s.count === 12) return true;
    }
    return false;
  }catch(_){
    return false;
  }
}

/* ===== CSV LOADER ===== */

function toCsvUrl(url){ return url; }

function loadCSV(url){
  return new Promise((resolve,reject)=>{
    const finalUrl = withBust(toCsvUrl(url));
    Papa.parse(finalUrl, {
      download: true, header: true, skipEmptyLines: true,
      complete: ({ data }) => resolve(data || []),
      error: (err) => reject(err)
    });
  });
}

/* ===== GAME DATA LOADING ===== */

function normalizeRow(r){
  return {
    date: String(r.Date||'').trim(),
    q: String(r.Question||'').trim(),
    a: String(r.OptionA||'').trim(),
    b: String(r.OptionB||'').trim(),
    c: String(r.OptionC||'').trim(),
    d: String(r.OptionD||'').trim(),
    answer: String(r.Answer||'').trim(),
    explanation: String(r.Explanation||'').trim(),
    category: String(r.Category||'').trim(),
    diff: String(r.Difficulty||'').trim(),
    id: String(r.ID||'').trim()
  };
}

async function loadTodays(){
  const key = nzTodayYMD();

  const liveReady = await ensureFreshLiveSet();

  try{
    const live = (await loadCSV(LIVE_CSV_URL)).map(normalizeRow);
    const todays = live.filter(r=>r.date===key);
    if (todays.length >= 1) { rows = todays.slice(0, 12); return; }
  }catch(e){
    // continue to BANK fallback
  }

  try{
    const bank = (await loadCSV(BANK_CSV_URL)).map(normalizeRow);
    rows = bank.slice(0,12);
  }catch(e){
    rows = [];
  }
}

/* ===== THEME SETUP ===== */

const rootEl = document.documentElement;
let saved = localStorage.getItem('bb_theme');
if (!saved) {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    saved = 'dark';
  } else {
    saved = 'light';
  }
}
currentTheme = saved;
applyTheme(currentTheme);

function applyTheme(theme){
  if (theme === 'light'){
    rootEl.setAttribute('data-theme','light');
  } else {
    rootEl.removeAttribute('data-theme');
    theme = 'dark';
  }
  localStorage.setItem('bb_theme', theme);
  currentTheme = theme;
}

// ===== THEME TOGGLE BUTTON WITH ICON =====
const btnTheme = document.getElementById('themeBtn');
function updateThemeIcon(){
  btnTheme.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
}
btnTheme?.addEventListener('click', () => {
  const next = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  updateThemeIcon();
});
updateThemeIcon();

/* ===== INIT ===== */

window.addEventListener('DOMContentLoaded', async () => {
  await loadTodays();
  // then start your quiz render function
  startGame();
});

function startGame(){
  // your existing quiz start logic here
}
