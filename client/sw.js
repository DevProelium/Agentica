/**
 * sw.js — Service Worker de Agentica Inventory
 * Estrategia:
 *  - Instalación: cachea todos los assets estáticos
 *  - Assets estáticos: Cache-First
 *  - Peticiones a la API: Network-First con fallback a caché
 *  - Background Sync: reintenta operaciones encoladas offline
 */

const CACHE_NAME     = 'agentica-v1';
const API_ORIGIN     = self.location.origin;

// Recursos estáticos a pre-cachear durante la instalación
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/db.js',
  '/js/sync.js',
  '/js/wizard.js',
  '/js/dashboard.js',
  '/js/chat-ui.js',
  '/manifest.json',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.min.js',
];

// ── Instalación ──────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-cacheando assets estáticos');
      // addAll puede fallar si alguna URL no responde; usamos add individual con tolerancia a fallos
      return Promise.allSettled(
        STATIC_ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  // Activar inmediatamente sin esperar a que se cierre la pestaña anterior
  self.skipWaiting();
});

// ── Activación ───────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Eliminando caché obsoleta:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Tomar control de todos los clientes activos inmediatamente
  self.clients.claim();
});

// ── Interceptación de peticiones (Fetch) ─────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptar peticiones HTTP/HTTPS
  if (!request.url.startsWith('http')) return;

  // Peticiones a la API: Network-First con fallback a caché
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Assets estáticos: Cache-First
  event.respondWith(cacheFirst(request));
});

/**
 * Estrategia Network-First: intenta la red, si falla devuelve caché.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request.clone());
    // Cachear respuestas exitosas GET de la API
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Sin red y sin caché: respuesta offline básica
    return new Response(
      JSON.stringify({ error: 'Sin conexión. Modo offline.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Estrategia Cache-First: devuelve caché si existe, sino va a la red.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Fallback HTML para navegación offline
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Offline', { status: 503 });
  }
}

// ── Background Sync ──────────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-inventory') {
    console.log('[SW] Background Sync: sync-inventory disparado');
    event.waitUntil(
      // Notificar a todos los clientes para que procesen la cola
      self.clients.matchAll().then((clients) =>
        clients.forEach((client) =>
          client.postMessage({ type: 'BACKGROUND_SYNC', tag: 'sync-inventory' })
        )
      )
    );
  }
});

// ── Mensajes desde el cliente ─────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
