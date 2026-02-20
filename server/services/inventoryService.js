'use strict';

const csv      = require('csv-parser');
const { Readable } = require('stream');
const pool     = require('../models/db');
const aiService = require('./aiService');

// Mapeo de columnas Shopify CSV → campos de la base de datos
const COL = {
  HANDLE:      'Handle',
  TITLE:       'Title',
  SKU:         'Variant SKU',
  DESCRIPTION: 'Body (HTML)',
  LOCATION:    'Location',
  OPT1_NAME:   'Option1 Name',
  OPT1_VAL:    'Option1 Value',
  OPT2_NAME:   'Option2 Name',
  OPT2_VAL:    'Option2 Value',
  OPT3_NAME:   'Option3 Name',
  OPT3_VAL:    'Option3 Value',
  INCOMING:    'Incoming',
  UNAVAILABLE: 'Unavailable',
  COMMITTED:   'Committed',
  AVAILABLE:   'Available',
  ON_HAND:     'On hand',
  PRICE:       'Variant Price',
};

/**
 * Convierte un valor a entero seguro; devuelve 0 si no es válido.
 * @param {*} val
 * @returns {number}
 */
function safeInt(val) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Convierte un valor a decimal seguro; devuelve null si no es válido.
 * @param {*} val
 * @returns {number|null}
 */
function safeDecimal(val) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Procesa un CSV de inventario (formato Shopify) y hace UPSERT en la base de datos.
 * @param {Buffer|string} fileData - Contenido del archivo CSV
 * @returns {Promise<{inserted: number, updated: number, errors: string[]}>}
 */
function processCSV(fileData) {
  return new Promise((resolve, reject) => {
    const stats = { inserted: 0, updated: 0, errors: [] };
    const rows  = [];

    // Crear stream desde buffer
    const stream = Readable.from(fileData);

    stream
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('error', (err) => reject(err))
      .on('end', async () => {
        for (const row of rows) {
          try {
            const sku   = (row[COL.SKU] || '').trim() || null;
            const title = (row[COL.TITLE] || '').trim();

            // El título es obligatorio para insertar un producto
            if (!title) {
              stats.errors.push(`Fila sin título omitida (SKU: ${sku || 'N/A'})`);
              continue;
            }

            const params = [
              (row[COL.HANDLE]      || '').trim() || null,
              title,
              sku,
              (row[COL.DESCRIPTION] || '').trim() || null,
              (row[COL.LOCATION]    || '').trim() || null,
              (row[COL.OPT1_NAME]   || '').trim() || null,
              (row[COL.OPT1_VAL]    || '').trim() || null,
              (row[COL.OPT2_NAME]   || '').trim() || null,
              (row[COL.OPT2_VAL]    || '').trim() || null,
              (row[COL.OPT3_NAME]   || '').trim() || null,
              (row[COL.OPT3_VAL]    || '').trim() || null,
              safeInt(row[COL.INCOMING]),
              safeInt(row[COL.UNAVAILABLE]),
              safeInt(row[COL.COMMITTED]),
              safeInt(row[COL.AVAILABLE]),
              safeInt(row[COL.ON_HAND]),
              safeDecimal(row[COL.PRICE]),
            ];

            // Si no hay SKU, usar handle como identificador alternativo
            if (!sku) {
              const handle = (row[COL.HANDLE] || '').trim() || null;
              if (!handle) {
                stats.errors.push(`Fila sin SKU ni handle omitida (título: ${title})`);
                continue;
              }
            }

            const query = `
              INSERT INTO products
                (handle, title, sku, description, location,
                 option1_name, option1_value, option2_name, option2_value,
                 option3_name, option3_value,
                 incoming, unavailable, committed, available, on_hand, price)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
              ON CONFLICT (sku) WHERE sku IS NOT NULL DO UPDATE SET
                handle       = EXCLUDED.handle,
                title        = EXCLUDED.title,
                description  = EXCLUDED.description,
                location     = EXCLUDED.location,
                option1_name = EXCLUDED.option1_name,
                option1_value= EXCLUDED.option1_value,
                option2_name = EXCLUDED.option2_name,
                option2_value= EXCLUDED.option2_value,
                option3_name = EXCLUDED.option3_name,
                option3_value= EXCLUDED.option3_value,
                incoming     = EXCLUDED.incoming,
                unavailable  = EXCLUDED.unavailable,
                committed    = EXCLUDED.committed,
                available    = EXCLUDED.available,
                on_hand      = EXCLUDED.on_hand,
                price        = EXCLUDED.price,
                updated_at   = NOW()
              RETURNING (xmax = 0) AS inserted
            `;

            const result = await pool.query(query, params);
            if (result.rows[0].inserted) {
              stats.inserted++;
            } else {
              stats.updated++;
            }
          } catch (err) {
            stats.errors.push(`Error en fila (${row[COL.SKU] || '?'}): ${err.message}`);
          }
        }
        resolve(stats);
      });
  });
}

/**
 * Busca productos. Si se proporciona un texto de búsqueda, usa similitud vectorial.
 * @param {string} [search] - Texto de búsqueda semántica
 * @param {number} [limit=20] - Máximo de resultados
 * @param {number} [offset=0] - Desplazamiento para paginación
 * @returns {Promise<{products: object[], total: number}>}
 */
async function getProducts(search, limit = 20, offset = 0) {
  limit  = Math.min(parseInt(limit, 10)  || 20, 100);
  offset = Math.max(parseInt(offset, 10) || 0,  0);

  if (search && search.trim()) {
    // Búsqueda semántica usando embeddings
    const embedding = await aiService.createEmbedding(search.trim());
    const vectorStr = `[${embedding.join(',')}]`;

    const result = await pool.query(
      `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
       FROM products
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2 OFFSET $3`,
      [vectorStr, limit, offset]
    );

    // Total aproximado para búsqueda vectorial
    const countRes = await pool.query(
      'SELECT COUNT(*) FROM products WHERE embedding IS NOT NULL'
    );

    return {
      products: result.rows,
      total: parseInt(countRes.rows[0].count, 10),
    };
  }

  // Consulta estándar sin búsqueda semántica
  const [dataRes, countRes] = await Promise.all([
    pool.query(
      'SELECT * FROM products ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    ),
    pool.query('SELECT COUNT(*) FROM products'),
  ]);

  return {
    products: dataRes.rows,
    total: parseInt(countRes.rows[0].count, 10),
  };
}

/**
 * Genera y guarda el embedding de un producto en la base de datos.
 * @param {object} product - Producto con al menos id y title
 */
async function generateEmbedding(product) {
  // Construir texto representativo del producto para embeber
  const text = [
    product.title,
    product.description,
    product.sku,
    product.location,
    product.option1_value,
    product.option2_value,
    product.option3_value,
  ]
    .filter(Boolean)
    .join(' ');

  const embedding = await aiService.createEmbedding(text);
  const vectorStr = `[${embedding.join(',')}]`;

  await pool.query(
    'UPDATE products SET embedding = $1::vector WHERE id = $2',
    [vectorStr, product.id]
  );
}

module.exports = { processCSV, getProducts, generateEmbedding };
