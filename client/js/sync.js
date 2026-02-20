/**
 * sync.js — Lógica de sincronización en segundo plano
 * Gestiona la sincronización entre IndexedDB y la API cuando hay conexión.
 */

/* global saveProducts, drainSyncQueue, API_BASE, getAuthHeaders */

const SYNC_INTERVAL_MS = 60_000; // Sincronización automática cada 60 segundos

/**
 * Devuelve la URL base de la API desde constantes compartidas.
 */
function getApiBase() {
  return (typeof API_BASE !== 'undefined' ? API_BASE : '') || 'http://localhost:3000';
}

/**
 * Obtiene headers de autorización desde localStorage.
 */
function authHeaders() {
  const token = localStorage.getItem('agentica_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Sincroniza productos desde la API al almacenamiento local (IndexedDB).
 * @param {number} [limit=200] - Cuántos productos descargar
 */
async function syncProducts(limit = 200) {
  const indicator = document.getElementById('sync-status');
  if (indicator) { indicator.classList.add('syncing'); indicator.title = 'Sincronizando…'; }

  try {
    const res = await fetch(`${getApiBase()}/api/inventory?limit=${limit}`, {
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { products } = await res.json();
    if (products && products.length > 0) {
      await saveProducts(products);
      console.log(`[Sync] ${products.length} productos guardados en caché local`);
    }

    if (indicator) {
      indicator.classList.remove('syncing', 'offline');
      indicator.style.color = 'var(--success)';
      indicator.title = `Sincronizado: ${new Date().toLocaleTimeString()}`;
    }
  } catch (err) {
    console.warn('[Sync] Sin conexión o error al sincronizar:', err.message);
    if (indicator) {
      indicator.classList.remove('syncing');
      indicator.classList.add('offline');
      indicator.title = 'Sin conexión — modo offline';
    }
  }
}

/**
 * Procesa la cola de operaciones pendientes cuando hay conectividad.
 * Sube archivos o aplica cambios encolados durante el modo offline.
 */
async function processSyncQueue() {
  if (!navigator.onLine) return;

  const pending = await drainSyncQueue();
  if (pending.length === 0) return;

  console.log(`[Sync] Procesando ${pending.length} operaciones pendientes…`);

  for (const item of pending) {
    try {
      if (item.type === 'upload' && item.payload.fileBase64) {
        // Reconstruir el archivo desde base64 y re-intentar la subida
        const binary = atob(item.payload.fileBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'text/csv' });
        const formData = new FormData();
        formData.append('file', blob, item.payload.fileName || 'inventory.csv');

        await fetch(`${getApiBase()}/api/inventory/upload`, {
          method:  'POST',
          headers: authHeaders(),
          body:    formData,
        });
        console.log('[Sync] Subida CSV pendiente completada');
      }
    } catch (err) {
      console.error('[Sync] Error procesando cola:', err.message);
    }
  }
}

/**
 * Registra sincronización en background usando la Background Sync API si está disponible.
 */
async function registerBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-inventory');
      console.log('[Sync] Background Sync registrado');
    } catch (err) {
      console.warn('[Sync] Background Sync no soportado:', err.message);
    }
  }
}

// ── Inicialización ───────────────────────────────────────────────────────────

// Sincronizar cuando se recupera la conexión
window.addEventListener('online', () => {
  console.log('[Sync] Conexión restaurada — sincronizando…');
  syncProducts();
  processSyncQueue();
});

window.addEventListener('offline', () => {
  const indicator = document.getElementById('sync-status');
  if (indicator) { indicator.classList.add('offline'); indicator.title = 'Sin conexión'; }
});

// Sincronización automática periódica
setInterval(() => {
  if (navigator.onLine && localStorage.getItem('agentica_token')) {
    syncProducts();
  }
}, SYNC_INTERVAL_MS);
