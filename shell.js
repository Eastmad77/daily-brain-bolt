// Brain ⚡ Bolt — shell.js
// Menu toggle + close-on-click for sidebar. Tiny, dependency-free.

(() => {
  const menuBtn = document.getElementById("menuToggle");
  const side = document.getElementById("sideMenu");
  if (!menuBtn || !side) return;

  menuBtn.addEventListener("click", () => {
    side.classList.toggle("open");
    side.setAttribute("aria-hidden", String(!side.classList.contains("open")));
  });

  // Close sidebar after any click inside (links or buttons)
  side.querySelectorAll("a,button").forEach((el) => {
    el.addEventListener("click", () => {
      side.classList.remove("open");
      side.setAttribute("aria-hidden", "true");
    });
  });

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && side.classList.contains("open")) {
      side.classList.remove("open");
      side.setAttribute("aria-hidden", "true");
    }
  });
})();
