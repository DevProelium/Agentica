'use strict';

const express = require('express');
const controller = require('../controllers/salesController');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/sales/checkout — Procesa una venta
router.post('/checkout', auth, controller.checkout);

// POST /api/sales/offline — Guarda una venta offline
router.post('/offline', auth, controller.saveOfflineSale);

// POST /api/sales/sync — Sincroniza ventas offline pendientes
router.post('/sync', auth, controller.syncOfflineSales);

// GET /api/sales/:id — Obtiene una venta por ID
router.get('/:id', auth, controller.getSale);

// GET /api/sales — Lista ventas con filtros
router.get('/', auth, controller.listSales);

// Sesiones de caja
router.post('/sessions/open', auth, controller.openCashSession);
router.post('/sessions/close', auth, controller.closeCashSession);
router.get('/sessions/active', auth, controller.getActiveCashSession);

// Consumo desde reporte (integración con Agentica Reports)
router.post('/consume-from-report', auth, controller.consumeFromReport);

module.exports = router;