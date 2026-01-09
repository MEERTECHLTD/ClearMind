const CACHE_NAME = 'clearmind-v6';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/clearmindlogo.png',
  '/widgets/tasks-widget.json',
  '/widgets/habits-widget.json',
  '/widgets/quick-note-widget.json',
  '/widgets/daily-progress-widget.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  let urlToOpen = '/';

  // Route to appropriate page based on notification type
  if (data) {
    switch (data.type) {
      case 'task':
        urlToOpen = '/?view=tasks';
        break;
      case 'application':
        urlToOpen = '/?view=applications';
        break;
      case 'event':
        urlToOpen = '/?view=calendar';
        break;
      default:
        urlToOpen = '/';
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Open a new window if no existing one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle push events (for future server-side push)
self.addEventListener('push', (event) => {
  let data = { title: 'ClearMind', body: 'You have a new notification' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/clearmindlogo.png',
    badge: '/clearmindlogo.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    requireInteraction: true,
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('fetch', (event) => {
  // Handle navigation requests (SPA fallback)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached response if found
      if (response) {
        return response;
      }

      // Clone the request because it's a stream
      const fetchRequest = event.request.clone();

      return fetch(fetchRequest).then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
          return response;
        }

        // Clone the response because it's a stream
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Return cached index.html for navigation fallback
        return caches.match('/index.html');
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});