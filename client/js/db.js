/**
 * db.js — Capa de persistencia local con Dexie.js (IndexedDB)
 * Almacena productos en caché para funcionamiento offline.
 */

/* global Dexie */

const localDB = new Dexie('AgenticaInventory');

// Esquema de la base de datos local (versión 1)
localDB.version(1).stores({
  // Clave primaria: id (UUID) — índices en sku, handle, title
  products: 'id, sku, handle, title',
  // Cola de operaciones pendientes de sincronizar
  syncQueue: '++id, type, createdAt',
});

/**
 * Guarda o actualiza una lista de productos en IndexedDB.
 * @param {object[]} products
 */
async function saveProducts(products) {
  if (!Array.isArray(products) || products.length === 0) return;
  await localDB.products.bulkPut(products);
}

/**
 * Recupera productos de IndexedDB.
 * @param {string} [searchTerm] - Filtra por título (búsqueda local simple)
 * @param {number} [limit=50]
 * @returns {Promise<object[]>}
 */
async function getLocalProducts(searchTerm, limit = 50) {
  let query = localDB.products.toCollection();

  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.trim().toLowerCase();
    // Búsqueda local simple por coincidencia en título/sku
    query = localDB.products.filter((p) =>
      (p.title && p.title.toLowerCase().includes(term)) ||
      (p.sku   && p.sku.toLowerCase().includes(term))
    );
  }

  return query.limit(limit).toArray();
}

/**
 * Elimina todos los productos del caché local.
 */
async function clearProducts() {
  await localDB.products.clear();
}

/**
 * Agrega una operación a la cola de sincronización offline.
 * @param {'upload'|'update'|'delete'} type
 * @param {object} payload
 */
async function enqueueSync(type, payload) {
  await localDB.syncQueue.add({ type, payload, createdAt: new Date().toISOString() });
}

/**
 * Recupera y limpia toda la cola de sincronización pendiente.
 * @returns {Promise<object[]>}
 */
async function drainSyncQueue() {
  const items = await localDB.syncQueue.toArray();
  await localDB.syncQueue.clear();
  return items;
}
