// expo-service-worker.js
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  
  event.waitUntil(
    self.registration.showNotification(data.title || "CrècheApp", {
      body: data.message || data.body || "Vous avez une nouvelle notification.",
      icon: "/assets/images/icon.png",
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});