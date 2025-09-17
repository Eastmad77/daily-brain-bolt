// Brain ⚡ Bolt — shell v3.11 (menu toggle + close-on-click)
(function(){
  const menuBtn = document.getElementById("mmMenuBtn");
  const side = document.getElementById("mmSideMenu");
  if (!menuBtn || !side) return;

  menuBtn.addEventListener("click", ()=>{
    side.classList.toggle("open");
    side.setAttribute("aria-hidden", String(!side.classList.contains("open")));
  });

  side.querySelectorAll("a,button").forEach(el=>{
    el.addEventListener("click", ()=>{
      side.classList.remove("open");
      side.setAttribute("aria-hidden","true");
    });
  });
})();
