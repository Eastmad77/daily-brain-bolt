document.addEventListener("DOMContentLoaded", () => {
  // Splash
  const splash = document.getElementById("splash");
  setTimeout(() => splash.style.display = "none", 3000);

  // Menu
  const menuBtn = document.getElementById("menuBtn");
  const sideMenu = document.getElementById("sideMenu");
  menuBtn.addEventListener("click", () => {
    sideMenu.classList.toggle("open");
    setTimeout(() => sideMenu.classList.remove("open"), 5000); // auto hide
  });

  // Sound toggle
  const soundBtn = document.getElementById("soundBtn");
  let soundOn = true;
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
  });

  // Quiz
  const startBtn = document.getElementById("startBtn");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const shareBtn = document.getElementById("shareBtn");
  const playAgainBtn = document.getElementById("playAgainBtn");
  const questionBox = document.getElementById("questionBox");
  const optionsBox = document.getElementById("options");
  const resultBox = document.getElementById("resultBox");
  const timerBar = document.getElementById("timerBar");

  let timer;
  let elapsed = 0;

  function startQuiz() {
    elapsed = 0;
    questionBox.textContent = "Question goes here...";
    resultBox.textContent = "";
    timerBar.style.width = "100%";
    animateTimer(10); // 10 sec default
  }

  function animateTimer(seconds) {
    let width = 100;
    const step = 100 / (seconds * 10);
    timer = setInterval(() => {
      width -= step;
      timerBar.style.width = width + "%";
      if (width <= 0) clearInterval(timer);
    }, 100);
  }

  startBtn.addEventListener("click", startQuiz);
  shuffleBtn.addEventListener("click", () => alert("Shuffle pressed"));
  shareBtn.addEventListener("click", () => alert("Share pressed"));
  playAgainBtn.addEventListener("click", startQuiz);
});
