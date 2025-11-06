// firebase-messaging-sw.js (colocar na raiz: /firebase-messaging-sw.js)
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "...",
  authDomain: "teste-b4489.firebaseapp.com",
  databaseURL: "https://teste-b4489-default-rtdb.firebaseio.com",
  projectId: "teste-b4489",
  storageBucket: "teste-b4489.firebasestorage.app",
  messagingSenderId: "198904967734",
  appId: "1:198904967734:web:..."
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Mensagem background:', payload);
  const title = payload.notification?.title || '🔔 Nova notificação';
  const body = payload.notification?.body || '';
  const image = payload.notification?.image;
  const data = payload.data || {};

  const options = {
    body,
    icon: image || '/icon-192x192.png',
    badge: '/badge-72x72.png',
    vibrate: [200,100,200],
    tag: 'os-notification',
    renotify: true,
    data: {
      click_action: data.click_action || 'https://embalagens-ods-t.vercel.app/',
      osId: data.osId || null
    }
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const base = event.notification.data?.click_action || 'https://embalagens-ods-t.vercel.app/';
  const osId = event.notification.data?.osId;
  const final = osId ? `${base}?os=${encodeURIComponent(osId)}` : base;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(base) && 'focus' in client) {
          client.focus();
          client.postMessage({ osId });
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(final);
    })
  );
});
