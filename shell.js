/* Brain ⚡ Bolt — shell (menu + notification) */

(function(){
  const menuBtn = document.getElementById('mmMenuBtn');
  const sideMenu = document.getElementById('mmSideMenu');
  menuBtn?.addEventListener('click', () => sideMenu?.classList.toggle('open'));

  // Notification toggle inside sidebar
  const notifyItem = document.getElementById('notifyItem');
  const KEY = 'bb_notify_enabled';

  function canNotify(){ return 'Notification' in window; }
  function updateNotifyUI(){
    if (!notifyItem) return;
    const on = localStorage.getItem(KEY) === '1';
    notifyItem.textContent = on ? '🔔 Notifications: ON' : '🔕 Notifications: OFF';
  }
  async function ensurePermission(){
    if (!canNotify()) return false;
    if (Notification.permission === 'granted') return true;
    const r = await Notification.requestPermission();
    return r === 'granted';
  }

  notifyItem?.addEventListener('click', async () => {
    const enabled = localStorage.getItem(KEY) === '1';
    if (enabled) {
      localStorage.removeItem(KEY);
    } else {
      const ok = await ensurePermission();
      if (ok) localStorage.setItem(KEY, '1');
      else alert('Notifications blocked or not supported.');
    }
    updateNotifyUI();
  });

  updateNotifyUI();
})();
