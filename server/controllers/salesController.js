'use strict';

const salesService = require('../services/salesService');

/**
 * POST /api/sales/checkout
 * Procesa una venta (checkout) con los items del carrito.
 */
async function checkout(req, res, next) {
    try {
        const { items, payment_method, client_id, cash_session_id, notes } = req.body;
        const userId = req.user.id; // Extraído del token JWT

        // Validación básica
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'El carrito de venta no puede estar vacío' });
        }
        if (!payment_method) {
            return res.status(400).json({ error: 'payment_method es obligatorio' });
        }

        // Procesar la venta con tenant/branch del usuario
        const sale = await salesService.processSale(
            items,
            payment_method,
            req.tenantId,
            req.branchId,
            client_id || null,
            cash_session_id || null,
            userId,
            notes || null
        );

        res.status(201).json({
            message: 'Venta procesada correctamente',
            sale
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/sales/offline
 * Guarda una venta realizada offline para sincronización posterior.
 */
async function saveOfflineSale(req, res, next) {
    try {
        const { local_id, sale_data } = req.body;
        if (!local_id || !sale_data) {
            return res.status(400).json({ error: 'local_id y sale_data son obligatorios' });
        }

        const offlineSale = await salesService.saveOfflineSale(local_id, sale_data);
        res.status(201).json({
            message: 'Venta offline guardada para sincronización',
            offline_sale: offlineSale
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/sales/sync
 * Sincroniza ventas offline pendientes.
 */
async function syncOfflineSales(req, res, next) {
    try {
        const userId = req.user.id;
        const result = await salesService.syncOfflineSales(userId, req.tenantId, req.branchId);
        res.json({
            message: `Sincronización completada: ${result.synced} ventas sincronizadas`,
            ...result
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/sales/:id
 * Obtiene una venta por su ID con sus items, asegurando que pertenezca al tenant/sucursal.
 */
async function getSale(req, res, next) {
    try {
        const { id } = req.params;
        const sale = await salesService.getSale(id, req.tenantId, req.branchId);
        res.json(sale);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/sales
 * Lista ventas con paginación y filtros, filtradas por tenant/sucursal.
 * Query params: limit, offset, start_date, end_date, payment_method.
 */
async function listSales(req, res, next) {
    try {
        const { limit, offset, start_date, end_date, payment_method } = req.query;
        const result = await salesService.listSales(
            req.tenantId,
            req.branchId,
            limit,
            offset,
            start_date,
            end_date,
            payment_method
        );
        res.json(result);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/sales/sessions/open
 * Abre una nueva sesión de caja.
 */
async function openCashSession(req, res, next) {
    try {
        const userId = req.user.id;
        const { start_amount } = req.body;
        const session = await salesService.openCashSession(
            userId,
            req.tenantId,
            req.branchId,
            start_amount || 0
        );
        res.status(201).json({
            message: 'Sesión de caja abierta',
            session
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/sales/sessions/close
 * Cierra la sesión de caja activa del usuario.
 */
async function closeCashSession(req, res, next) {
    try {
        const userId = req.user.id;
        const { end_amount } = req.body;
        if (end_amount === undefined) {
            return res.status(400).json({ error: 'end_amount es obligatorio' });
        }
        // Obtener sesión activa del usuario filtrada por tenant/branch
        const activeSession = await salesService.getActiveCashSession(userId, req.tenantId, req.branchId);
        if (!activeSession) {
            return res.status(400).json({ error: 'No hay sesión de caja activa' });
        }
        const session = await salesService.closeCashSession(activeSession.id, req.tenantId, req.branchId, end_amount);
        res.json({
            message: 'Sesión de caja cerrada',
            session
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/sales/sessions/active
 * Obtiene la sesión de caja activa del usuario, filtrada por tenant/sucursal.
 */
async function getActiveCashSession(req, res, next) {
    try {
        const userId = req.user.id;
        const session = await salesService.getActiveCashSession(userId, req.tenantId, req.branchId);
        if (!session) {
            return res.status(404).json({ error: 'No hay sesión de caja activa' });
        }
        res.json(session);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/sales/consume-from-report
 * Descuenta stock directamente desde un folio de inspección (Agentica Reports).
 */
async function consumeFromReport(req, res, next) {
    try {
        const { report_id, items } = req.body;
        const userId = req.user.id;

        if (!report_id) {
            return res.status(400).json({ error: 'report_id es obligatorio' });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items es un array obligatorio' });
        }

        const result = await salesService.consumeFromReport(report_id, items, userId, req.tenantId, req.branchId);
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    checkout,
    saveOfflineSale,
    syncOfflineSales,
    getSale,
    listSales,
    openCashSession,
    closeCashSession,
    getActiveCashSession,
    consumeFromReport
};