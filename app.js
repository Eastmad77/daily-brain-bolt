/* ===== CONFIG & GLOBALS ===== */

// ===== Google Apps Script Web App (fill with your /exec URL) =====
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec';

// ===== Google Sheet CSV URLs =====
const BANK_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/.../pub?gid=2009978011&single=true&output=csv';
const LIVE_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/.../pub?gid=1410250735&single=true&output=csv';

let rows = [];
let currentQuestionIndex = 0;
let correctCount = 0;
let gameStarted = false;
let elapsedInterval = null;
let elapsedSeconds = 0;
let currentTheme = 'light';

// ===== Audio =====
let beepAudio;
function ensureAudio() {
  if (!beepAudio) {
    beepAudio = new Audio('/sounds/correct-beep.mp3');
  }
}
function playBeep() {
  try { ensureAudio(); beepAudio.currentTime = 0; beepAudio.play(); } catch {}
}

// ===== GAS Helper =====
async function ensureFreshLiveSet() {
  try {
    const res = await fetch(`${GAS_WEBAPP_URL}?action=status`, { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok || !data.todayReady) {
      await fetch(`${GAS_WEBAPP_URL}?action=build`, { cache: 'no-store' });
    }
  } catch (err) {
    console.error("ensureFreshLiveSet error:", err);
  }
}

// ===== CSV Loader =====
async function fetchLiveCSV() {
  try {
    await ensureFreshLiveSet();
    const res = await fetch(LIVE_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch live CSV");
    const text = await res.text();
    return Papa.parse(text, { header: true }).data;
  } catch (err) {
    console.error("Live CSV fetch error:", err);
    return [];
  }
}

// ===== Game Logic =====
async function startGame() {
  rows = await fetchLiveCSV();
  if (!rows.length) {
    document.getElementById('questionBox').textContent = "Could not load today’s quiz. Try again later.";
    return;
  }
  currentQuestionIndex = 0;
  correctCount = 0;
  elapsedSeconds = 0;
  document.getElementById('progressLabel').textContent = `Q 0/12`;
  document.getElementById('gameOverBox').style.display = 'none';
  document.getElementById('playAgainBtn').style.display = 'none';
  gameStarted = true;
  startElapsedTimer();
  showQuestion();
}

function startElapsedTimer() {
  clearInterval(elapsedInterval);
  elapsedInterval = setInterval(() => {
    elapsedSeconds++;
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    document.getElementById('elapsedTime').textContent = `${mins}:${secs.toString().padStart(2,'0')}`;
    const pct = (elapsedSeconds / 300); // scale bar ~5 min max
    document.getElementById('timerBar').style.transform = `scaleX(${Math.min(pct,1)})`;
  }, 1000);
}

function stopElapsedTimer() {
  clearInterval(elapsedInterval);
}

function showQuestion() {
  const q = rows[currentQuestionIndex];
  if (!q) { endGame(); return; }
  document.getElementById('questionBox').textContent = q.Question;
  const choiceBox = document.getElementById('choices');
  choiceBox.innerHTML = '';
  ['OptionA','OptionB','OptionC','OptionD'].forEach(opt => {
    if (q[opt]) {
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.textContent = q[opt];
      btn.onclick = () => handleAnswer(btn, q);
      choiceBox.appendChild(btn);
    }
  });
  document.getElementById('progressLabel').textContent = `Q ${currentQuestionIndex+1}/12`;
}

function handleAnswer(btn, q) {
  const correct = q.Answer.trim();
  if (btn.textContent.trim() === correct) {
    btn.classList.add('correct');
    playBeep(); // only beep on correct
    correctCount++;
  } else {
    btn.classList.add('incorrect');
    if (navigator.vibrate) navigator.vibrate(200);
  }
  Array.from(document.querySelectorAll('.choice')).forEach(b => {
    b.disabled = true;
    if (b.textContent.trim() === correct) b.classList.add('correct');
  });
  setTimeout(() => {
    currentQuestionIndex++;
    if (currentQuestionIndex >= 12) {
      endGame();
    } else {
      showQuestion();
    }
  }, 1200);
}

function endGame() {
  stopElapsedTimer();
  gameStarted = false;
  document.getElementById('gameOverBox').style.display = 'block';
  document.getElementById('gameOverBox').textContent = `You answered ${correctCount} / 12 correctly!`;
  document.getElementById('playAgainBtn').style.display = 'inline-block';
  showSuccessSplash();
}

// ===== Success Splash =====
function showSuccessSplash() {
  const ss = document.getElementById('successSplash');
  ss.classList.add('show');
  document.getElementById('ssDismiss').onclick = () => {
    ss.classList.remove('show');
  };
}

// ===== Menu Toggle =====
const menuBtn = document.getElementById('mmMenuBtn');
const sideMenu = document.getElementById('mmSideMenu');
menuBtn?.addEventListener('click', () => {
  sideMenu.classList.toggle('open');
});

// ===== Theme Toggle =====
const btnTheme = document.getElementById('themeBtn');
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  currentTheme = theme;
  localStorage.setItem('theme', theme);
}
function updateThemeIcon(){
  btnTheme.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
}
btnTheme?.addEventListener('click', () => {
  const next = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  updateThemeIcon();
});
applyTheme(localStorage.getItem('theme') || 'light');
updateThemeIcon();

// ===== Sound Toggle =====
const btnSound = document.getElementById('soundBtn');
let soundEnabled = true;
btnSound?.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  btnSound.textContent = soundEnabled ? '🔊' : '🔇';
});
function playBeep() {
  if (!soundEnabled) return;
  try { ensureAudio(); beepAudio.currentTime = 0; beepAudio.play(); } catch {}
}

// ===== Notify Button (placeholder) =====
document.getElementById('notifyBtn')?.addEventListener('click', () => {
  alert("Daily quiz notifications will be available soon!");
});

// ===== Buttons =====
document.getElementById('startBtn')?.addEventListener('click', startGame);
document.getElementById('playAgainBtn')?.addEventListener('click', startGame);
