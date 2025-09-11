let questions = [];
let current = 0;
let score = 0;
let timerInterval;
let elapsedInterval;
let elapsedSec = 0;
let wrongStreak = 0;

const startBtn = document.getElementById('startBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const shareBtn = document.getElementById('shareBtn');
const playAgain = document.getElementById('playAgain');
const questionEl = document.getElementById('question');
const optionsEl = document.getElementById('options');
const feedback = document.getElementById('feedback');
const gameOverEl = document.getElementById('gameOver');
const scoreEl = document.getElementById('score');
const progressText = document.getElementById('progressText');
const timerBar = document.getElementById('timerBar');
const elapsedEl = document.getElementById('elapsed');

// Start quiz
startBtn.addEventListener('click', () => startQuiz());
shuffleBtn.addEventListener('click', () => startQuiz(true));
playAgain.addEventListener('click', () => startQuiz(true));

// Load CSV
async function loadQuestions() {
  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv&gid=1410250735";
  const res = await fetch(url);
  const text = await res.text();
  return text.trim().split("\n").slice(1).map(line => {
    const [date, q, a, b, ans, c, d] = line.split(",");
    return { q, choices:[a,b,c,d], ans };
  });
}

// Start
async function startQuiz(shuffle=false) {
  questions = await loadQuestions();
  if (shuffle) questions.sort(() => Math.random() - .5);

  current=0; score=0; wrongStreak=0;
  scoreEl.textContent = 0;
  progressText.textContent = `0/${questions.length}`;
  gameOverEl.style.display='none';
  playAgain.style.display='none';
  elapsedSec=0;
  updateQuestion();
  startElapsed();
}

// Question
function updateQuestion() {
  const q = questions[current];
  if (!q) { endQuiz(); return; }
  questionEl.textContent = q.q;
  optionsEl.innerHTML = "";
  q.choices.forEach(c=>{
    const btn=document.createElement("button");
    btn.className="choice";
    btn.textContent=c;
    btn.onclick=()=>selectAnswer(btn,q);
    optionsEl.appendChild(btn);
  });
  startTimer();
  progressText.textContent=`${current+1}/${questions.length}`;
}

// Select
function selectAnswer(btn,q) {
  if (btn.textContent===q.ans) {
    btn.classList.add("correct");
    score++; scoreEl.textContent=score;
    wrongStreak=0;
    setTimeout(()=>nextQuestion(),800);
  } else {
    btn.classList.add("incorrect");
    wrongStreak++;
    if (wrongStreak>=2) {
      endQuiz();
    } else {
      setTimeout(()=>updateQuestion(),800);
    }
  }
}

// Timer
function startTimer() {
  clearInterval(timerInterval);
  let time=10;
  timerBar.style.width="100%";
  timerInterval=setInterval(()=>{
    time-=0.1;
    timerBar.style.width=`${(time/10)*100}%`;
    if (time<=0) {
      clearInterval(timerInterval);
      wrongStreak++;
      if (wrongStreak>=2) endQuiz(); else updateQuestion();
    }
  },100);
}

// Elapsed
function startElapsed() {
  clearInterval(elapsedInterval);
  elapsedInterval=setInterval(()=>{
    elapsedSec++;
    elapsedEl.textContent=`${elapsedSec}s`;
  },1000);
}

// End
function endQuiz() {
  clearInterval(timerInterval);
  clearInterval(elapsedInterval);
  gameOverEl.style.display='block';
  gameOverEl.textContent='Game Over';
  playAgain.style.display='inline-block';
}

// Menu auto-hide
const menuBtn=document.getElementById('mmMenuBtn');
const sideMenu=document.getElementById('mmSideMenu');
menuBtn?.addEventListener('click',()=>{
  sideMenu.classList.add('open');
  setTimeout(()=>sideMenu.classList.remove('open'),5000);
});
