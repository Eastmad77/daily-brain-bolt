function endGame(msg="") {
  clearInterval(elapsedInterval);
  stopQuestionTimer();

  if (msg) {
    gameOverText.textContent = msg;
    gameOverBox.style.display = "block";
    playAgainBtn.style.display = "inline-block";
    playAgainBtn.classList.add("pulse");
  } else {
    // FIX: ensure success splash is interactive
    countdownOverlay && (countdownOverlay.hidden = true); // defensive
    successSplash.removeAttribute('aria-hidden');
    successSplash.classList.remove('show'); // restart animation if needed
    void successSplash.offsetWidth;        // reflow
    successSplash.classList.add('show');
  }
}
