/* firebase-messaging-sw.js */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// This must match /firebase-config.js (public, safe to include)
firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
});

const messaging = firebase.messaging();

// Optional: handle background messages (customize the notification)
messaging.onBackgroundMessage((payload) => {
  const title = (payload && payload.notification && payload.notification.title) || 'The Daily BrainBolt';
  const options = {
    body: (payload && payload.notification && payload.notification.body) || 'New quiz is ready!',
    icon: '/icon-192.png',
    badge: '/icon-192.png'
  };
  self.registration.showNotification(title, options);
});
