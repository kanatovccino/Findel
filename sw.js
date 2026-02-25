const cacheName = 'findel-v1';
const staticAssets = [
  './',
  './index.html',
  './manifest.json'
];

// Установка: кэшируем файлы
self.addEventListener('install', async (event) => {
  const cache = await caches.open(cacheName);
  await cache.addAll(staticAssets);
});

// Работа с запросами: сначала смотрим в кэш
self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    cache.put(req, res.clone());
    return res;
  } catch (error) {
    return await cache.match(req);
  }
}