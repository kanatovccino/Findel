const cacheName = 'findel-v2';
const staticAssets = [
  './',
  './index.html',
  './manifest.json',
  './src/css/style.css',
  './src/js/scripts.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// Установка: кэшируем файлы
self.addEventListener('install', async (event) => {
  const cache = await caches.open(cacheName);
  await cache.addAll(staticAssets);
});

// Работа с запросами: сначала смотрим в кэш
self.addEventListener('fetch', (event) => {
  // Игнорируем запросы от расширений Chrome (chrome-extension://)
  if (!(event.request.url.indexOf('http') === 0)) return; 

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