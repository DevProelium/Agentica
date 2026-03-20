'use strict';

const svc = require('../services/purchasesService');

// ─── Branches ────────────────────────────────────────────────────────────────

async function listBranches(req, res, next) {
  try {
    res.json(await svc.getBranches(req.tenantId));
  } catch (err) { next(err); }
}

// ─── Proveedores ─────────────────────────────────────────────────────────────

async function listSuppliers(req, res, next) {
  try {
    res.json(await svc.getSuppliers(req.tenantId));
  } catch (err) { next(err); }
}

async function createSupplier(req, res, next) {
  try {
    res.status(201).json(await svc.createSupplier(req.tenantId, req.body));
  } catch (err) { next(err); }
}

async function updateSupplier(req, res, next) {
  try {
    res.json(await svc.updateSupplier(req.tenantId, req.params.id, req.body));
  } catch (err) { next(err); }
}

// ─── Órdenes de compra ───────────────────────────────────────────────────────

async function listPurchases(req, res, next) {
  try {
    res.json(await svc.getPurchases(req.tenantId, req.branchId, req.query));
  } catch (err) { next(err); }
}

async function createPurchase(req, res, next) {
  try {
    res.status(201).json(
      await svc.createPurchase(req.tenantId, req.branchId, req.body, req.user.id)
    );
  } catch (err) { next(err); }
}

async function getPurchase(req, res, next) {
  try {
    res.json(await svc.getPurchase(req.params.id, req.tenantId));
  } catch (err) { next(err); }
}

async function addPurchaseItem(req, res, next) {
  try {
    const { product_id, quantity, unit_cost } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id es requerido' });
    const item = await svc.addPurchaseItem(
      req.params.id, req.tenantId, product_id, quantity, unit_cost
    );
    res.status(201).json(item);
  } catch (err) { next(err); }
}

async function updatePurchaseItem(req, res, next) {
  try {
    const { quantity, unit_cost } = req.body;
    res.json(await svc.updatePurchaseItem(
      req.params.itemId, req.params.id, req.tenantId, quantity, unit_cost
    ));
  } catch (err) { next(err); }
}

async function removePurchaseItem(req, res, next) {
  try {
    await svc.removePurchaseItem(req.params.itemId, req.params.id, req.tenantId);
    res.json({ message: 'Línea eliminada' });
  } catch (err) { next(err); }
}

async function receivePurchase(req, res, next) {
  try {
    res.json(await svc.receivePurchase(req.params.id, req.tenantId, req.user.id));
  } catch (err) { next(err); }
}

// ─── Traspasos ────────────────────────────────────────────────────────────────

async function listTransfers(req, res, next) {
  try {
    res.json(await svc.getTransfers(req.tenantId, req.branchId));
  } catch (err) { next(err); }
}

async function createTransfer(req, res, next) {
  try {
    const { from_branch_id, to_branch_id, notes } = req.body;
    if (!from_branch_id || !to_branch_id) {
      return res.status(400).json({ error: 'from_branch_id y to_branch_id son requeridos' });
    }
    res.status(201).json(
      await svc.createTransfer(req.tenantId, from_branch_id, to_branch_id, notes, req.user.id)
    );
  } catch (err) { next(err); }
}

async function getTransfer(req, res, next) {
  try {
    res.json(await svc.getTransfer(req.params.id, req.tenantId));
  } catch (err) { next(err); }
}

async function addTransferItem(req, res, next) {
  try {
    const { product_id, quantity } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id es requerido' });
    res.status(201).json(
      await svc.addTransferItem(req.params.id, req.tenantId, product_id, quantity)
    );
  } catch (err) { next(err); }
}

async function removeTransferItem(req, res, next) {
  try {
    await svc.removeTransferItem(req.params.itemId, req.params.id, req.tenantId);
    res.json({ message: 'Línea eliminada' });
  } catch (err) { next(err); }
}

async function shipTransfer(req, res, next) {
  try {
    res.json(await svc.shipTransfer(req.params.id, req.tenantId, req.user.id));
  } catch (err) { next(err); }
}

async function receiveTransfer(req, res, next) {
  try {
    res.json(await svc.receiveTransfer(req.params.id, req.tenantId, req.user.id));
  } catch (err) { next(err); }
}

// ─── Parsing de documentos con IA ────────────────────────────────────────────

async function parseDocument(req, res, next) {
  try {
    const { text } = req.body;
    if (!text || text.trim().length < 5) {
      return res.status(400).json({ error: 'El texto del documento está vacío o es muy corto' });
    }
    const items = await svc.parseDocumentWithAI(text);
    res.json({ items });
  } catch (err) { next(err); }
}

module.exports = {
  listBranches,
  listSuppliers, createSupplier, updateSupplier,
  listPurchases, createPurchase, getPurchase,
  addPurchaseItem, updatePurchaseItem, removePurchaseItem, receivePurchase,
  listTransfers, createTransfer, getTransfer,
  addTransferItem, removeTransferItem, shipTransfer, receiveTransfer,
  parseDocument,
};
