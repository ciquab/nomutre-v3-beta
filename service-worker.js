const CACHE_NAME = 'nomutore-v3.3'; // バージョンを更新

// アプリケーションを構成する全ファイル
// これらをキャッシュすることでオフライン起動が可能になります
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './style.css',
    
    // Core Logic & Data
    './main.js',
    './constants.js',
    './store.js',
    './logic.js',
    './service.js',       // New
    './timer.js',         // New
    './dataManager.js',   // New
    './errorHandler.js',  // New

    // UI Modules
    './ui/index.js',
    './ui/dom.js',
    './ui/state.js',
    './ui/beerTank.js',
    './ui/liverRank.js',
    './ui/checkStatus.js',
    './ui/weekly.js',
    './ui/chart.js',
    './ui/logList.js',
    './ui/modal.js',

    // Assets
    './icon-192.png' 
];

// インストール処理
self.addEventListener('install', (event) => {
    self.skipWaiting(); // 新しいSWをすぐに有効化
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[ServiceWorker] Pre-caching app shell');
                return cache.addAll(APP_SHELL);
            })
    );
});

// 古いキャッシュの削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[ServiceWorker] Removing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// リクエスト処理（ネットワーク優先 -> キャッシュフォールバック戦略）
// ※重要なロジック変更を含むため、基本はネットワークを見に行き、
//   オフライン時のみキャッシュを使う戦略の方が安全ですが、
//   PWAとしての高速動作を優先し、ここでは「Stale-While-Revalidate」に近い戦略をとります。
//   ただし、不整合を防ぐため、HTML以外の静的ファイルはキャッシュ優先でも構いません。
//   ここでは既存のコードを踏襲しつつ、安全性重視で実装します。

self.addEventListener('fetch', (event) => {
    // POSTメソッドやchrome-extensionスキームなどはキャッシュしない
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // 1. キャッシュにあればそれを返す
                if (cachedResponse) {
                    // キャッシュを返しつつ、裏でネットワークから最新を取得してキャッシュ更新（Stale-while-revalidate）
                    // これにより次回起動時に最新になる
                    fetch(event.request).then((networkResponse) => {
                         if (networkResponse && networkResponse.status === 200) {
                             const responseToCache = networkResponse.clone();
                             caches.open(CACHE_NAME).then((cache) => {
                                 cache.put(event.request, responseToCache);
                             });
                         }
                    }).catch(() => {/* オフライン時は無視 */});
                    
                    return cachedResponse;
                }

                // 2. キャッシュになければネットワークに取りに行く
                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
                        return networkResponse;
                    }

                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return networkResponse;
                });
            })
    );
});