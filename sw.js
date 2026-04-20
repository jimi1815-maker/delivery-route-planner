/* =====================================================
   Service Worker — 離線快取策略
   =====================================================
   策略: Cache-first for static assets
   - 安裝時預快取核心靜態檔案 (HTML/CSS/JS/manifest)
   - 攔截 fetch 時，靜態資源優先從快取讀取
   - API 呼叫與外部資源 (地圖圖磚、Geocode) 不攔截，直接放行
   - 版本更新時自動清除舊快取
   ===================================================== */

/** 快取版本名稱，更新靜態資源時需遞增版本號 */
const CACHE_NAME = 'route-planner-v3';

/** 預快取的核心靜態資源清單 */
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './js/constants.js',
  './js/csv.js',
  './js/geocoding.js',
  './js/map.js',
  './js/delivered.js',
  './js/settings.js',
  './js/ui.js',
  './manifest.json',
];

/**
 * Install 事件 — 預快取所有靜態資源
 * skipWaiting() 確保新版 SW 立即接管，不等待舊頁面關閉
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

/**
 * Activate 事件 — 清除舊版本快取
 * clients.claim() 讓新 SW 立即控制所有已開啟的頁面
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/**
 * Fetch 事件 — 攔截網路請求
 * - API 呼叫 (geocode)、地圖圖磚等外部請求直接放行，不做快取
 * - 本地靜態資源採用 cache-first 策略：快取有就用快取，沒有才發網路請求
 */
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 不攔截 API 呼叫與外部資源 — 讓瀏覽器正常處理
  if (url.includes('/api/') || url.includes('nominatim') || url.includes('photon.komoot') || url.includes('tile.openstreetmap')) {
    return;
  }

  // Cache-first: 快取命中直接回傳，否則 fallback 到網路
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  );
});
