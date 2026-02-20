/**
 * shared/constants.js — Constantes compartidas entre cliente y servidor
 * Importar según el entorno (CommonJS en Node, ESM/global en el cliente).
 */

// ── Mapeo de columnas del CSV de Shopify a campos del modelo ─────────────────
const SHOPIFY_CSV_COLUMNS = {
  HANDLE:         'Handle',
  TITLE:          'Title',
  BODY_HTML:      'Body (HTML)',
  VENDOR:         'Vendor',
  TYPE:           'Type',
  TAGS:           'Tags',
  PUBLISHED:      'Published',
  OPT1_NAME:      'Option1 Name',
  OPT1_VALUE:     'Option1 Value',
  OPT2_NAME:      'Option2 Name',
  OPT2_VALUE:     'Option2 Value',
  OPT3_NAME:      'Option3 Name',
  OPT3_VALUE:     'Option3 Value',
  VARIANT_SKU:    'Variant SKU',
  VARIANT_PRICE:  'Variant Price',
  LOCATION:       'Location',
  INCOMING:       'Incoming',
  UNAVAILABLE:    'Unavailable',
  COMMITTED:      'Committed',
  AVAILABLE:      'Available',
  ON_HAND:        'On hand',
};

// ── Endpoints de la API ──────────────────────────────────────────────────────
const API_ENDPOINTS = {
  HEALTH:          '/health',
  LOGIN:           '/api/auth/login',
  REGISTER:        '/api/auth/register',
  INVENTORY:       '/api/inventory',
  INVENTORY_UPLOAD:'/api/inventory/upload',
  CHAT:            '/api/chat/chat',
  SEARCH:          '/api/chat/search',
};

// ── Eventos de sincronización ────────────────────────────────────────────────
const SYNC_EVENTS = {
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  CSV_IMPORTED:    'csv.imported',
  SYNC_COMPLETE:   'sync.complete',
};

// ── Límites y configuración ──────────────────────────────────────────────────
const CONFIG = {
  MAX_FILE_SIZE_MB:   50,
  DEFAULT_PAGE_SIZE:  20,
  MAX_PAGE_SIZE:     100,
  EMBEDDING_DIMS:   1536,
  EMBEDDING_MODEL:  'text-embedding-3-small',
  CHAT_MODEL:       'gpt-4o-mini',
};

// Exportar para Node.js (CommonJS) o exponer como global en el navegador
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SHOPIFY_CSV_COLUMNS, API_ENDPOINTS, SYNC_EVENTS, CONFIG };
} else {
  // Entorno navegador: exponer como globales
  window.SHOPIFY_CSV_COLUMNS = SHOPIFY_CSV_COLUMNS;
  window.API_ENDPOINTS       = API_ENDPOINTS;
  window.SYNC_EVENTS         = SYNC_EVENTS;
  window.CONFIG              = CONFIG;
}
