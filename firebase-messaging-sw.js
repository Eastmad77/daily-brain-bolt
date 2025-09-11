// Firebase Cloud Messaging SW (compat build)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "YOUR_REAL_API_KEY",
  authDomain: "dailybrainbolt.firebaseapp.com",
  projectId: "dailybrainbolt",
  storageBucket: "dailybrainbolt.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'BrainBolt';
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
