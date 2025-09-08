// Firebase Cloud Messaging Service Worker (compat build)
// Must live at: https://dailybrainbolt.com/firebase-messaging-sw.js

// Load compat SDKs (so we get global `firebase` in a worker)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize with the SAME config as /firebase-config.js
firebase.initializeApp({
  apiKey: "AIzaSyDfjcMzAl-Tll0xsHri91VHiMdTGmd7b2k",
  authDomain: "dailybrainbolt.firebaseapp.com",
  projectId: "dailybrainbolt",
  storageBucket: "dailybrainbolt.firebasestorage.app",
  messagingSenderId: "118224143962",
  appId: "1:118224143962:web:43d85714b96ac1357e7a63",
  measurementId: "G-M0P3TSCF8P"
});

const messaging = firebase.messaging();

// Background messages (when site is in background/closed)
messaging.onBackgroundMessage((payload) => {
  // Fallbacks in case payload.notification is missing
  const title = (payload.notification && payload.notification.title) || 'The Daily BrainBolt';
  const body  = (payload.notification && payload.notification.body)  || 'Today’s quiz is ready — keep your streak alive!';
  const icon  = '/icon-192.png';

  self.registration.showNotification(title, {
    body,
    icon,
    badge: '/icon-192.png',
    data: { url: 'https://dailybrainbolt.com/' }
  });
});

// Clicking the notification opens the site
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('https://dailybrainbolt.com/'));
});
