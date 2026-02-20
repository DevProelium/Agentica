'use strict';

const multer           = require('multer');
const inventoryService = require('../services/inventoryService');
const minioService     = require('../services/minioService');

// Multer configurado en memoria (sin disco) para procesar el buffer directamente
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 }, // 50 MB máximo
  fileFilter(_req, file, cb) {
    if (!file.originalname.match(/\.(csv)$/i)) {
      return cb(new Error('Solo se permiten archivos CSV'));
    }
    cb(null, true);
  },
});

/**
 * POST /api/inventory/upload
 * Sube un archivo CSV a MinIO y procesa su contenido en la base de datos.
 */
async function uploadCSV(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }

    // Guardar el CSV en MinIO para trazabilidad
    const storedFilename = await minioService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // Procesar el CSV y hacer UPSERT en la base de datos
    const stats = await inventoryService.processCSV(req.file.buffer);

    res.json({
      message:  'CSV procesado correctamente',
      filename: storedFilename,
      stats,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/inventory
 * Lista productos con soporte de búsqueda semántica y paginación.
 */
async function listProducts(req, res, next) {
  try {
    const { search, limit, offset } = req.query;
    const result = await inventoryService.getProducts(search, limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/inventory/:id
 * Devuelve un producto por su UUID.
 */
async function getProduct(req, res, next) {
  try {
    const pool = require('../models/db');
    const { id } = req.params;

    // Validar formato UUID básico para prevenir inyección
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/inventory/:id
 * Actualización parcial de un producto.
 */
async function updateProduct(req, res, next) {
  try {
    const pool = require('../models/db');
    const { id } = req.params;

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Campos permitidos para actualización
    const allowed = [
      'handle', 'title', 'sku', 'description', 'location',
      'option1_name', 'option1_value', 'option2_name', 'option2_value',
      'option3_name', 'option3_value',
      'incoming', 'unavailable', 'committed', 'available', 'on_hand', 'price',
    ];

    const updates = [];
    const values  = [];
    let   idx     = 1;

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${idx}`);
        values.push(req.body[field]);
        idx++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
    }

    values.push(id);
    const query = `UPDATE products SET ${updates.join(', ')}, updated_at = NOW()
                   WHERE id = $${idx} RETURNING *`;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Regenerar embedding si cambia el título o descripción
    if (req.body.title || req.body.description) {
      inventoryService.generateEmbedding(result.rows[0]).catch((err) => {
        console.error('[Embedding] Error al regenerar embedding:', err.message);
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/inventory/:id
 * Elimina un producto por su UUID.
 */
async function deleteProduct(req, res, next) {
  try {
    const pool = require('../models/db');
    const { id } = req.params;

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ message: 'Producto eliminado correctamente', id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
}

module.exports = { upload, uploadCSV, listProducts, getProduct, updateProduct, deleteProduct };
