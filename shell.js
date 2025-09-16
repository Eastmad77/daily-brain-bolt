// ===== Brain ⚡ Bolt — shell.js v3.4 =====
// Shared nav + notification toggle

document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("mmMenuBtn");
  const sideMenu = document.getElementById("mmSideMenu");
  const notifyItem = document.getElementById("notifyItem");

  if (menuBtn && sideMenu) {
    menuBtn.addEventListener("click", () => {
      const open = sideMenu.classList.contains("open");
      sideMenu.classList.toggle("open", !open);
      sideMenu.setAttribute("aria-hidden", open);
    });
  }

  if (notifyItem) {
    notifyItem.addEventListener("click", () => {
      if (notifyItem.textContent.includes("OFF")) {
        notifyItem.textContent = "🔔 Notifications: ON";
        alert("You will be reminded daily!");
      } else {
        notifyItem.textContent = "🔕 Notifications: OFF";
      }
    });
  }
});
