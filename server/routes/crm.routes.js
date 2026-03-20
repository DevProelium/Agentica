'use strict';

const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const auth = require('../middleware/authMiddleware');

// === Rutas de Clientes ===
router.get('/clients', auth, crmController.getClients);
router.post('/clients', auth, crmController.createClient);
// router.get('/clients/:id', auth, crmController.getClientById); // Para futura implementación
// router.put('/clients/:id', auth, crmController.updateClient);

// === Rutas de Cotizaciones ===
router.get('/quotes', auth, crmController.getQuotes);
router.post('/quotes', auth, crmController.createQuote);

module.exports = router;
