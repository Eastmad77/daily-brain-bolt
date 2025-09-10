// /firebase-messaging-sw.js
// Firebase Cloud Messaging service worker (compat build)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

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

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'The Daily BrainBolt';
  const body  = payload.notification?.body  || 'Today’s quiz is ready — keep your streak alive!';
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: 'https://dailybrainbolt.com/' }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('https://dailybrainbolt.com/'));
});
