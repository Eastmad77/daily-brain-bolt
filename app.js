// Attach success splash handlers
document.addEventListener("DOMContentLoaded", () => {
  const ssPlayAgain = document.getElementById("ssPlayAgain");
  const ssHomeBtn = document.getElementById("ssHomeBtn");
  const ssShareScore = document.getElementById("ssShareScore");
  const successSplash = document.getElementById("successSplash");

  if (ssPlayAgain) {
    ssPlayAgain.addEventListener("click", () => {
      successSplash.setAttribute("aria-hidden","true");
      successSplash.style.display="none";
      startGame();
    });
  }

  if (ssHomeBtn) {
    ssHomeBtn.addEventListener("click", () => {
      successSplash.setAttribute("aria-hidden","true");
      successSplash.style.display="none";
      window.location.href="/";
    });
  }

  if (ssShareScore) {
    ssShareScore.addEventListener("click", () => {
      const text = `I scored ${score}/12 on Brain ⚡ Bolt!`;
      if (navigator.share) {
        navigator.share({title:"Brain ⚡ Bolt", text, url:location.href});
      } else {
        navigator.clipboard.writeText(text);
        alert("Score copied to clipboard!");
      }
    });
  }
});
