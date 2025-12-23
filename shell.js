// ===== Brain ⚡ Bolt — shell.js v3.7 (null-safe) =====
document.addEventListener("DOMContentLoaded", () => {
  const menuBtn    = document.getElementById("mmMenuBtn");
  const sideMenu   = document.getElementById("mmSideMenu");
  const notifyItem = document.getElementById("notifyItem");

  let hideTimer = null;
  const hasMenu = !!sideMenu;

  function openMenu(){ if(!hasMenu) return; sideMenu.classList.add("open"); sideMenu.setAttribute("aria-hidden","false"); restartHideTimer(); }
  function closeMenu(){ if(!hasMenu) return; sideMenu.classList.remove("open"); sideMenu.setAttribute("aria-hidden","true"); clearTimeout(hideTimer); hideTimer=null; }
  function toggleMenu(){ if(!hasMenu) return; sideMenu.classList.contains("open") ? closeMenu() : openMenu(); }
  function restartHideTimer(){ if(!hasMenu) return; clearTimeout(hideTimer); hideTimer=setTimeout(closeMenu, 5000); }

  if (menuBtn && hasMenu) {
    menuBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
  }

  if (hasMenu) {
    document.addEventListener("click", (e) => {
      if (!sideMenu.classList.contains("open")) return;
      if (!sideMenu.contains(e.target) && e.target !== menuBtn) closeMenu();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sideMenu.classList.contains("open")) closeMenu(); });
    sideMenu.addEventListener("click", (e) => {
      const a = e.target.tagName === "A" ? e.target : e.target.closest("a");
      if (a) { closeMenu(); return; }
      restartHideTimer();
    });
  }

  if (notifyItem) {
    notifyItem.addEventListener("click", () => {
      const off = notifyItem.textContent.includes("OFF");
      notifyItem.textContent = off ? "🔔 Notifications: ON" : "🔕 Notifications: OFF";
      if (off) alert("You will be reminded daily!");
    });
  }

  // Consistent service worker registration
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js?v=5100').catch(()=>{});
  }
});
