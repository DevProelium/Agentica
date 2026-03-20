'use strict';

const express = require('express');
const ctrl    = require('../controllers/purchasesController');
const auth    = require('../middleware/authMiddleware');

const router = express.Router();

// ─── Branches (para el selector de traspasos) ─────────────────────────────────
router.get('/branches',                        auth, ctrl.listBranches);

// ─── Proveedores ──────────────────────────────────────────────────────────────
router.get('/suppliers',                       auth, ctrl.listSuppliers);
router.post('/suppliers',                      auth, ctrl.createSupplier);
router.put('/suppliers/:id',                   auth, ctrl.updateSupplier);

// ─── AI Document Parsing ──────────────────────────────────────────────────────
router.post('/parse-document',                 auth, ctrl.parseDocument);

// ─── Traspasos ────────────────────────────────────────────────────────────────
// Must be defined before /:id to avoid ambiguity
router.get('/transfers',                       auth, ctrl.listTransfers);
router.post('/transfers',                      auth, ctrl.createTransfer);
router.get('/transfers/:id',                   auth, ctrl.getTransfer);
router.post('/transfers/:id/items',            auth, ctrl.addTransferItem);
router.delete('/transfers/:id/items/:itemId',  auth, ctrl.removeTransferItem);
router.post('/transfers/:id/ship',             auth, ctrl.shipTransfer);
router.post('/transfers/:id/receive',          auth, ctrl.receiveTransfer);

// ─── Órdenes de compra ────────────────────────────────────────────────────────
router.get('/',                                auth, ctrl.listPurchases);
router.post('/',                               auth, ctrl.createPurchase);
router.get('/:id',                             auth, ctrl.getPurchase);
router.post('/:id/items',                      auth, ctrl.addPurchaseItem);
router.put('/:id/items/:itemId',               auth, ctrl.updatePurchaseItem);
router.delete('/:id/items/:itemId',            auth, ctrl.removePurchaseItem);
router.post('/:id/receive',                    auth, ctrl.receivePurchase);

module.exports = router;
