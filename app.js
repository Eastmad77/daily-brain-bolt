/** The Daily BrainBolt — app.js (auth + notifications + save sessions) */

/* Google Sheet publish ID + gids */
const SHEET_ID = "2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG";
const LIVE_GID = "1410250735";
const BANK_GID = "2009978011";

const CSV_URL_LIVE = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&gid=${LIVE_GID}`;
const CSV_URL_BANK = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&gid=${BANK_GID}`;

/* DOM refs */
const elQ = document.getElementById('question');
const elOpts = document.getElementById('options');
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
const elElapsed = document.getElementById('elapsedChip');

const elSignIn = document.getElementById('signInBtn');
const elSignOut = document.getElementById('signOutBtn');
const elNotify = document.getElementById('notifyBtn');
const elUserBadge = document.getElementById('userBadge');
const elUserPhoto = document.getElementById('userPhoto');
const elUserName = document.getElementById('userName');

/* Today */
const todayKey = new Date().toISOString().slice(0,10);
elToday.textContent = todayKey;

/* State */
let allRows = [], todays = [], idx = 0, score = 0, selected = null;
let timer = null, timeLeft = 10;

/* Elapsed timer */
let elapsedSec = 0, elapsedInterval = null;

/* Utils */
function log(m){ console.log('[BB]', m); elStatus.textContent = m; }
const norm = s => String(s ?? '').trim();
function ready(cb){ (document.readyState === 'complete' || document.readyState === 'interactive') ? cb() : document.addEventListener('DOMContentLoaded', cb); }
function whenPapa(cb){ if (window.Papa) cb(); else setTimeout(()=>whenPapa(cb), 30); }
const mmss = (s) => {
  const m = Math.floor(s/60), r = s % 60;
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
};
function shuffleArray(arr){ return arr.map(v => ({v, r: Math.random()})).sort((a,b)=>a.r-b.r).map(o=>o.v); }

/* Normalize row helpers */
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

/* =========================
   Firebase Init (Compat)
   ========================= */
let fbApp, auth, db, messaging;
function initFirebase(){
  if (!window.FB_CONFIG || !window.firebase) {
    console.error('Firebase config missing. Add your config to /firebase-config.js');
    return;
  }
  fbApp = firebase.initializeApp(window.FB_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
  messaging = firebase.messaging.isSupported() ? firebase.messaging() : null;

  // Auth state listener
  auth.onAuthStateChanged((user) => {
    if (user) {
      elSignIn.style.display = 'none';
      elSignOut.style.display = 'inline-flex';
      elUserBadge.style.display = 'inline-flex';
      elUserName.textContent = user.displayName || user.email || 'Signed in';
      if (user.photoURL) { elUserPhoto.src = user.photoURL; elUserPhoto.alt = user.displayName || 'User'; }
      else { elUserPhoto.src = '/icon-192.png'; elUserPhoto.alt = 'User'; }
    } else {
      elSignIn.style.display = 'inline-flex';
      elSignOut.style.display = 'none';
      elUserBadge.style.display = 'none';
    }
  });

  // Sign-in/out handlers
  elSignIn.addEventListener('click', async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (e) {
      console.error('Sign-in failed:', e);
      alert('Sign-in failed. See console for details.');
    }
  });
  elSignOut.addEventListener('click', async () => {
    try {
      await auth.signOut();
    } catch (e) {
      console.error('Sign-out failed:', e);
    }
  });

  // Notifications
  elNotify.addEventListener('click', async () => {
    if (!messaging) { alert('Notifications are not supported in this browser.'); return; }
    try {
      const status = await Notification.requestPermission();
      if (status !== 'granted') { alert('Notifications permission denied.'); return; }

      // REPLACE with your FCM Web Push key (VAPID) from Firebase Console
      const vapidKey = 'REPLACE_WITH_YOUR_VAPID_KEY';
      const token = await messaging.getToken({ vapidKey });
      console.log('FCM token:', token);
      alert('Notifications enabled!');

      // Optionally save token with user
      const user = auth.currentUser;
      if (user) {
        await db.collection('users').doc(user.uid).set({
          fcmToken: token,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.error('Enable notifications failed:', e);
      alert('Could not enable notifications. Check console.');
    }
  });
}

/* Save session to Firestore when quiz completes */
async function saveSession(){
  try {
    const user = auth && auth.currentUser;
    const payload = {
      date: todayKey,
      score,
      elapsedSec,
      finishedAt: new Date(),
      uid: user ? user.uid : null,
      anon: !user,
    };
    if (!db) return; // If Firebase not configured, simply skip
    await db.collection('sessions').add(payload);
  } catch (e) {
    console.error('Failed to save session:', e);
  }
}

/* =========================
   App (Quiz) logic
   ========================= */
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
      log(`Parsed ${rows.length} rows from CSV`);
      cb(null, rows);
    },
    error: (err) => cb(err || new Error('CSV error'))
  });
}

/* Elapsed timer */
function startElapsed(){
  stopElapsed();
  elapsedSec = 0;
  elElapsed.textContent = mmss(elapsedSec);
  elapsedInterval = setInterval(() => {
    elapsedSec++;
    elElapsed.textContent = mmss(elapsedSec);
  }, 1000);
}
function stopElapsed(){
  if (elapsedInterval){ clearInterval(elapsedInterval); elapsedInterval = null; }
}

/* Init quiz */
function initQuiz(){
  elStart.addEventListener('click', resetAndStart);
  elShuffle.addEventListener('click', () => {
    if (!allRows.length) return;
    todays = shuffleArray(allRows).slice(0,12);
    resetAndStart();
  });
  elShare.addEventListener('click', async () => {
    const shareData = { title: 'The Daily BrainBolt', text: 'Try today’s quiz!', url: window.location.href };
    try{
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(shareData.url); alert('Link copied!'); }
    }catch(e){ console.error('Share failed:', e); }
  });

  loadCSV(CSV_URL_LIVE, (errLive, liveRows) => {
    if (!errLive && liveRows.length){
      allRows = liveRows.slice(); todays = liveRows.slice();
      log(`Using LIVE (${todays.length})`); initUI();
    } else {
      log('LIVE empty/failed; trying BANK…');
      loadCSV(CSV_URL_BANK, (errBank, bankRows) => {
        if (!errBank && bankRows.length){
          allRows = bankRows.slice(); todays = bankRows.slice(0,12);
          log(`Using BANK fallback (${todays.length})`); initUI();
        } else {
          elQ.textContent = "Couldn’t load questions."; log('BANK also empty/failed.');
        }
      });
    }
  });
}

function initUI(){
  idx = 0; score = 0; selected = null;
  updateMeta();
  elFB.innerHTML = '';
  elPlayAgain.style.display = 'none';
  elTimerWrap.style.display = 'none';
  elElapsed.textContent = '00:00';
  stopElapsed();
  elQ.textContent = "Press “Start Quiz” to begin.";
  elOpts.innerHTML = '';
}

function resetAndStart(){
  idx = 0; score = 0; selected = null; updateMeta();
  if (!todays.length){ elQ.textContent = "No quiz rows found."; return; }
  startElapsed();
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
    elFB.innerHTML = "<div class='feedback-banner ok'>🎉 Done for now!</div>";
    elPlayAgain.style.display = 'inline-flex';
    elPlayAgain.onclick = () => { stopElapsed(); resetAndStart(); };
    // quiz finished — save session
    saveSession();
    return;
  }
  selected = null;
  elFB.innerHTML = '';
  elPlayAgain.style.display = 'none';

  elMetaText.textContent = `${q.Difficulty || '—'} • ${q.Category || 'Quiz'}`;
  elQ.textContent = q.Question || '—';

  const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter(Boolean);
  elOpts.innerHTML = '';
  opts.forEach(optText => {
    const btn = document.createElement('button');
    btn.className = 'choice'; btn.textContent = optText;
    btn.onclick = () => onSelect(btn, optText, q);
    elOpts.appendChild(btn);
  });

  startTimer();
}

/* Auto-reveal after selection */
function onSelect(btn, val, q){
  if (!q) return;
  document.querySelectorAll('.choice').forEach(b => { b.classList.remove('selected'); b.classList.add('disabled'); b.disabled = true; });
  btn.classList.add('selected');
  selected = val;

  clearTimer();
  setTimeout(() => reveal(q), 300);
}

function reveal(q){
  const isCorrect = norm(selected).toLowerCase() === norm(q.Answer).toLowerCase();
  const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : '';
  elFB.innerHTML = isCorrect
    ? `<div class="feedback-banner ok">✅ Correct! ${expl}</div>`
    : `<div class="feedback-banner no">❌ Not quite. Correct: <strong>${q.Answer || '—'}</strong> ${expl}</div>`;

  if (isCorrect){ score++; idx++; }
  updateMeta();

  setTimeout(() => {
    document.querySelectorAll('.choice').forEach(b => { b.classList.remove('disabled','selected'); b.disabled = false; });
    showQuestion();
  }, 900);
}

/* Smooth 10s timer using scaleX (orange bar) */
function startTimer(){
  timeLeft = 10;
  elTimerWrap.style.display = 'block';

  // reset instantly
  elTimerBar.style.transition = 'none';
  elTimerBar.style.transform = 'scaleX(1)';
  elTimerText.textContent = timeLeft + 's';

  // force reflow
  void elTimerBar.offsetWidth;

  // animate to zero over 10s (smooth)
  elTimerBar.style.transition = 'transform 10s linear';
  elTimerBar.style.transform = 'scaleX(0)';

  timer = setInterval(() => {
    timeLeft--;
    elTimerText.textContent = Math.max(0, timeLeft) + 's';
    if (timeLeft <= 0){
      clearTimer();
      const q = todays[idx];
      if (q){
        const expl = q.Explanation ? `<div class="expl">${q.Explanation}</div>` : '';
        elFB.innerHTML = `<div class="feedback-banner no">⌛ Time’s up! Correct: <strong>${q.Answer || '—'}</strong> ${expl}</div>`;
        elPlayAgain.style.display = 'inline-flex';
        elPlayAgain.onclick = () => { stopElapsed(); resetAndStart(); };
      }
    }
  }, 1000);
}
function clearTimer(){
  if (timer) clearInterval(timer);
  timer = null;
  elTimerBar.style.transition = 'none';
  elTimerBar.style.transform = 'scaleX(1)';
}

/* Boot */
ready(() => {
  whenPapa(() => {
    initFirebase();
    initQuiz();
  });
});
