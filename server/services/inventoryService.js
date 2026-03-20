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
 * @param {string} tenantId - ID del tenant
 * @param {string|null} branchId - ID de la sucursal (NULL para matriz)
 * @returns {Promise<{inserted: number, updated: number, errors: string[]}>}
 */
function processCSV(fileData, tenantId, branchId) {
  return new Promise((resolve, reject) => {
    const stats = { inserted: 0, updated: 0, errors: [] };
    const rows  = [];

    // Convertir el buffer a string primero para detectar BOM o encoding utf-8
    let content = fileData.toString('utf8');
    // Eliminar BOM si existe (común en Excel)
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    // Normalización de reportes Sicar / Otros (Saltar metadata de Excel)
    let lines = content.split(/\r?\n/);
    let headerRowIndex = 0;
    
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const lineStr = lines[i].toLowerCase();
        // Detectar tabla real
        if (lineStr.includes('clave') && lineStr.includes('cant')) {
            headerRowIndex = i;
            break;
        }
        if (lineStr.includes('title') && lineStr.includes('variant sku')) {
            headerRowIndex = i;
            break;
        }
    }
    
    if (headerRowIndex > 0) {
        lines = lines.slice(headerRowIndex);
    }

    if (lines.length > 0) {
        // Mapeo adaptativo: convertir "Clave" y "Cant" a formato esperado
        const hCols = lines[0].split(',').map(c => c.replace(/^"|"$/g, '').trim().toLowerCase());
        if (hCols.includes('clave') && !hCols.includes('title')) {
            const mappedHeaders = hCols.map(h => {
                if (h === 'clave') return 'Variant SKU';
                if (h.startsWith('cant')) return 'Available';
                if (h.startsWith('descrip')) return 'Title';
                return h;
            });
            lines[0] = mappedHeaders.join(',');
        }
    }
    
    content = lines.join('\n');

    // Crear stream desde string limpio
    const stream = Readable.from(content);

    stream
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim(), // Limpiar headers
      }))
      .on('data', (row) => rows.push(row))
      .on('error', (err) => reject(err))
      .on('end', async () => {
        // Validación básica de headers
        if (rows.length > 0) {
            const firstRow = rows[0];
            const hasTitle = Object.keys(firstRow).some(k => k.toLowerCase() === 'title');
            if (!hasTitle) {
                 stats.errors.push(`ERROR CRÍTICO: No se encontró la columna 'Title'. Headers detectados: ${Object.keys(firstRow).join(', ')}`);
                 // Intentaremos procesar igual por si es un error de casing sutil
            }
        }

        for (const row of rows) {
          try {
            const sku   = (row[COL.SKU] || '').trim() || null;
            // Buscar 'Title' o 'title' o cualquier variante
            let titleVal = row[COL.TITLE];
            if (!titleVal) {
                // Fallback case-insensitive
                const key = Object.keys(row).find(k => k.toLowerCase() === 'title');
                if (key) titleVal = row[key];
            }
            const title = (titleVal || '').trim();

            // Auto-generar título para reportes como Sicar que no tienen nombre del artículo
            let finalTitle = title;
            if (!finalTitle && sku) {
              finalTitle = `Producto ${sku}`;
            }

            // El título es obligatorio para insertar un producto
            if (!finalTitle) {
              stats.errors.push(`Fila sin título ni SKU omitida - Datos: ${JSON.stringify(row)}`);
              continue;
            }

            const params = [
              tenantId,
              branchId,
              (row[COL.HANDLE]      || '').trim() || null,
              finalTitle,
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
                (tenant_id, branch_id, handle, title, sku, description, location,
                 option1_name, option1_value, option2_name, option2_value,
                 option3_name, option3_value,
                 incoming, unavailable, committed, available, on_hand, price,
                 cost, price_retail, price_mid, price_wholesale)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                      $20,$21,$22,$23)
              ON CONFLICT (tenant_id, sku) WHERE sku IS NOT NULL DO UPDATE SET
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
                cost         = EXCLUDED.cost,
                price_retail = EXCLUDED.price_retail,
                price_mid    = EXCLUDED.price_mid,
                price_wholesale = EXCLUDED.price_wholesale,
                updated_at   = NOW()
              RETURNING (xmax = 0) AS inserted
            `;

            const queryParams = [
              tenantId,
              branchId,
              cleanText(row[COL.HANDLE]),
              cleanText(row[COL.TITLE]) || (row[COL.SKU] ? `Producto ${row[COL.SKU]}` : 'Sin Título'),
              cleanText(row[COL.SKU]),
              cleanText(row[COL.DESCRIPTION]),
              cleanText(row[COL.LOCATION]),
              cleanText(row[COL.OPT1_NAME]),
              cleanText(row[COL.OPT1_VALUE]),
              cleanText(row[COL.OPT2_NAME]),
              cleanText(row[COL.OPT2_VALUE]),
              cleanText(row[COL.OPT3_NAME]),
              cleanText(row[COL.OPT3_VALUE]),
              safeInt(row[COL.INCOMING]),
              safeInt(row[COL.UNAVAILABLE]),
              safeInt(row[COL.COMMITTED]),
              safeInt(row[COL.AVAILABLE]),
              safeInt(row[COL.ON_HAND]),
              safeDecimal(row[COL.PRICE]),
              safeDecimal(row[COL.COST] || 0), // Assuming COST index or default
              safeDecimal(row[COL.PRICE_RETAIL] || row[COL.PRICE] || 0),
              safeDecimal(row[COL.PRICE_MID] || 0),
              safeDecimal(row[COL.PRICE_WHOLESALE] || 0)
            ];

            const result = await pool.query(query, queryParams);
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
 * @param {string} tenantId - ID del tenant
 * @param {string|null} branchId - ID de la sucursal (NULL para admin de tenant)
 * @param {string} [search] - Texto de búsqueda semántica
 * @param {number} [limit=20] - Máximo de resultados
 * @param {number} [offset=0] - Desplazamiento para paginación
 * @returns {Promise<{products: object[], total: number}>}
 */
async function getProducts(tenantId, branchId, search, limit = 20, offset = 0) {
  limit  = Math.min(parseInt(limit, 10)  || 20, 100);
  offset = Math.max(parseInt(offset, 10) || 0,  0);

  // Construir condición WHERE según branchId
  let whereClause = 'WHERE tenant_id = $1';
  let countWhereClause = 'WHERE tenant_id = $1';
  const queryParams = [tenantId];
  const countParams = [tenantId];

  if (branchId !== null && branchId !== undefined) {
    // Usuario de sucursal: solo productos de su sucursal o matriz (branch_id IS NULL)
    whereClause += ' AND (branch_id = $2 OR branch_id IS NULL)';
    countWhereClause += ' AND (branch_id = $2 OR branch_id IS NULL)';
    queryParams.push(branchId);
    countParams.push(branchId);
  }
  // Si branchId es NULL (admin de tenant), no filtramos por branch

  if (search && search.trim()) {
    // Búsqueda semántica usando embeddings
    const embedding = await aiService.createEmbedding(search.trim());
    const vectorStr = `[${embedding.join(',')}]`;

    // Insertar el embedding como primer parámetro en queryParams
    const searchParams = [vectorStr, ...queryParams, limit, offset];
    const searchWhere = whereClause.replace(/\$1/g, '$2').replace(/\$2/g, '$3'); // desplazar placeholders
    const searchWhereWithEmbedding = `${searchWhere} AND embedding IS NOT NULL`;

    const result = await pool.query(
      `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
       FROM products
       ${searchWhereWithEmbedding}
       ORDER BY embedding <=> $1::vector
       LIMIT $${searchParams.length - 1} OFFSET $${searchParams.length}`,
      searchParams
    );

    // Total aproximado para búsqueda vectorial con mismos filtros
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM products ${countWhereClause} AND embedding IS NOT NULL`,
      countParams
    );

    return {
      products: result.rows,
      total: parseInt(countRes.rows[0].count, 10),
    };
  }

  // Consulta estándar sin búsqueda semántica
  const [dataRes, countRes] = await Promise.all([
    pool.query(
      `SELECT * FROM products ${whereClause} ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, limit, offset]
    ),
    pool.query(`SELECT COUNT(*) FROM products ${countWhereClause}`, countParams),
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

/**
 * Ajusta el stock de un producto (incremento/decremento) y registra el movimiento.
 * @param {string} tenantId - ID del tenant
 * @param {string} branchId - ID de la sucursal
 * @param {string} sku - SKU del producto
 * @param {number} quantity - Cantidad a ajustar (positivo=entrada, negativo=salida)
 * @param {string} type - 'adjustment', 'purchase', 'sale', 'transfer_in'
 * @param {string} reason - Razón del ajuste (ej: 'quick_scan', 'shrinkage')
 * @param {string} userId - ID del usuario que realiza la acción
 */
async function adjustStock(tenantId, branchId, sku, quantity, type, reason, userId) {
  const client = await pool.connect();
  try {
    const productRes = await client.query(
      `SELECT id, available FROM products WHERE tenant_id = $1 AND sku = $2 FOR UPDATE`,
      [tenantId, sku]
    );

    if (productRes.rowCount === 0) {
      throw new Error(`Producto con SKU '${sku}' no encontrado`);
    }

    const product = productRes.rows[0];
    const oldStock = product.available;
    const newStock = oldStock + quantity;

    await client.query('BEGIN');

    // Actualizar producto
    await client.query(
      `UPDATE products SET available = $1, on_hand = $1, updated_at = NOW() WHERE id = $2`,
      [newStock, product.id]
    );

    // Registrar en Kardex
    await client.query(
      `INSERT INTO inventory_transactions 
         (tenant_id, branch_id, product_id, type, quantity, previous_stock, new_stock, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tenantId, branchId, product.id, type, quantity, oldStock, newStock, reason, userId]
    );

    await client.query('COMMIT');
    return { success: true, sku, new_stock: newStock };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Crea un nuevo producto y genera su embedding automáticamente.
 * @param {string} tenantId - ID del tenant
 * @param {string|null} branchId - ID de la sucursal (NULL para matriz)
 * @param {object} data - Datos del producto (title, sku, price, etc.)
 */
async function createProduct(tenantId, branchId, data) {
  if (!data.title) throw new Error('El título es obligatorio');

  const query = `
    INSERT INTO products
      (tenant_id, branch_id, title, sku, description, location, price, 
       incoming, unavailable, committed, available, on_hand,
       option1_name, option1_value, option2_name, option2_value, option3_name, option3_value,
       cost, price_retail, price_mid, price_wholesale)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    RETURNING *
  `;

  const values = [
    tenantId,
    branchId,
    data.title,
    data.sku || null,
    data.description || null,
    data.location || null,
    safeDecimal(data.price),
    safeInt(data.incoming),
    safeInt(data.unavailable),
    safeInt(data.committed),
    safeInt(data.available),
    safeInt(data.on_hand),
    data.option1_name || null,
    data.option1_value || null,
    data.option2_name || null,
    data.option2_value || null,
    data.option3_name || null,
    data.option3_value || null,
    safeDecimal(data.cost),
    safeDecimal(data.price_retail || data.price),
    safeDecimal(data.price_mid),
    safeDecimal(data.price_wholesale)
  ];

  const result = await pool.query(query, values);
  const product = result.rows[0];

  // Generar embedding en segundo plano (o await si preferimos consistencia inmediata)
  try {
    await generateEmbedding(product);
  } catch (err) {
    console.error(`Error generando embedding para nuevo producto ${product.id}:`, err);
    // No fallamos la creación si falla el embedding, pero logueamos
  }

  return product;
}

module.exports = { processCSV, getProducts, generateEmbedding, createProduct, adjustStock };
