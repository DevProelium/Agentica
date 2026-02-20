'use strict';

const express    = require('express');
const controller = require('../controllers/inventoryController');
const auth       = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/inventory/upload — Sube y procesa un archivo CSV de inventario
router.post(
  '/upload',
  auth,
  controller.upload.single('file'),
  controller.uploadCSV
);

// GET /api/inventory — Lista productos (con búsqueda semántica opcional)
router.get('/',     auth, controller.listProducts);

// GET /api/inventory/:id — Obtiene un producto por ID
router.get('/:id',  auth, controller.getProduct);

// PUT /api/inventory/:id — Actualiza parcialmente un producto
router.put('/:id',  auth, controller.updateProduct);

// DELETE /api/inventory/:id — Elimina un producto
router.delete('/:id', auth, controller.deleteProduct);

module.exports = router;
