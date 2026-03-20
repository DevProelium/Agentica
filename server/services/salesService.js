'use strict';

const pool = require('../models/db');

/**
 * Procesa una venta usando la función almacenada process_sale.
 * @param {Array} items - Array de objetos {product_id, quantity, unit_price, discount, tax_rate}
 * @param {string} paymentMethod - Método de pago ('cash', 'card', 'transfer', 'mixed')
 * @param {string} tenantId - UUID del tenant
 * @param {string|null} branchId - UUID de la sucursal (NULL para matriz)
 * @param {string} clientId - UUID del cliente (opcional)
 * @param {string} cashSessionId - UUID de la sesión de caja (opcional)
 * @param {string} userId - UUID del usuario que realiza la venta
 * @param {string} notes - Notas adicionales (opcional)
 * @returns {Promise<object>} Objeto con sale_id y total_amount
 */
async function processSale(items, paymentMethod, tenantId, branchId, clientId, cashSessionId, userId, notes) {
    // Validar que al menos hay un item
    if (!items || items.length === 0) {
        throw new Error('El carrito de venta no puede estar vacío');
    }

    // Validar campos requeridos
    if (!paymentMethod || !userId || !tenantId) {
        throw new Error('paymentMethod, userId y tenantId son obligatorios');
    }

    // Convertir items a JSONB para la función almacenada
    const itemsJson = JSON.stringify(items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: parseFloat(item.unit_price),
        discount: parseFloat(item.discount || 0),
        tax_rate: parseFloat(item.tax_rate || 0.16)
    })));

    const result = await pool.query(
        `SELECT process_sale($1::jsonb, $2, $3, $4, $5, $6, $7, $8) AS sale_id`,
        [itemsJson, paymentMethod, tenantId, branchId, clientId || null, cashSessionId || null, userId, notes || null]
    );

    const saleId = result.rows[0].sale_id;

    // Obtener detalles de la venta recién creada
    const saleRes = await pool.query(
        `SELECT * FROM sales WHERE id = $1`,
        [saleId]
    );

    return saleRes.rows[0];
}

/**
 * Obtiene una venta por su ID con sus items, asegurando que pertenezca al tenant/sucursal.
 * @param {string} saleId - UUID de la venta
 * @param {string} tenantId - UUID del tenant
 * @param {string|null} branchId - UUID de la sucursal (NULL para admin de tenant)
 * @returns {Promise<object>} Venta con items
 */
async function getSale(saleId, tenantId, branchId) {
    let whereClause = 's.id = $1 AND s.tenant_id = $2';
    const params = [saleId, tenantId];

    if (branchId !== null && branchId !== undefined) {
        // Usuario de sucursal: solo ventas de su sucursal o matriz (branch_id IS NULL)
        whereClause += ' AND (s.branch_id = $3 OR s.branch_id IS NULL)';
        params.push(branchId);
    }
    // Si branchId es NULL (admin de tenant), no filtramos por branch

    const [saleRes, itemsRes] = await Promise.all([
        pool.query(`SELECT s.* FROM sales s WHERE ${whereClause}`, params),
        pool.query(
            `SELECT si.*, p.title, p.sku, p.handle 
             FROM sale_items si 
             JOIN products p ON si.product_id = p.id 
             WHERE si.sale_id = $1`,
            [saleId]
        )
    ]);

    if (saleRes.rows.length === 0) {
        throw new Error('Venta no encontrada');
    }

    return {
        ...saleRes.rows[0],
        items: itemsRes.rows
    };
}

/**
 * Lista ventas con paginación y filtros opcionales, filtradas por tenant/sucursal.
 * @param {string} tenantId - UUID del tenant
 * @param {string|null} branchId - UUID de la sucursal (NULL para admin de tenant)
 * @param {number} limit - Límite de resultados
 * @param {number} offset - Desplazamiento
 * @param {string} startDate - Fecha de inicio (YYYY-MM-DD)
 * @param {string} endDate - Fecha de fin (YYYY-MM-DD)
 * @param {string} paymentMethod - Método de pago
 * @returns {Promise<{sales: object[], total: number}>}
 */
async function listSales(tenantId, branchId, limit = 50, offset = 0, startDate = null, endDate = null, paymentMethod = null) {
    limit = Math.min(parseInt(limit, 10) || 50, 100);
    offset = Math.max(parseInt(offset, 10) || 0, 0);

    let whereClauses = ['tenant_id = $1'];
    const params = [tenantId];

    if (branchId !== null && branchId !== undefined) {
        // Usuario de sucursal: solo ventas de su sucursal o matriz
        whereClauses.push('(branch_id = $2 OR branch_id IS NULL)');
        params.push(branchId);
    }
    // Si branchId es NULL (admin de tenant), no agregamos filtro extra

    // Ajustar índices de parámetros para los filtros adicionales
    let paramIndex = params.length + 1;

    if (startDate) {
        params.push(startDate);
        whereClauses.push(`created_at >= $${paramIndex}`);
        paramIndex++;
    }
    if (endDate) {
        params.push(endDate);
        whereClauses.push(`created_at <= $${paramIndex}`);
        paramIndex++;
    }
    if (paymentMethod) {
        params.push(paymentMethod);
        whereClauses.push(`payment_method = $${paramIndex}`);
        paramIndex++;
    }

    const whereStr = whereClauses.join(' AND ');

    const [salesRes, countRes] = await Promise.all([
        pool.query(
            `SELECT * FROM sales 
             WHERE ${whereStr}
             ORDER BY created_at DESC 
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        ),
        pool.query(
            `SELECT COUNT(*) FROM sales WHERE ${whereStr}`,
            params
        )
    ]);

    return {
        sales: salesRes.rows,
        total: parseInt(countRes.rows[0].count, 10)
    };
}

/**
 * Crea una sesión de caja.
 * @param {string} userId - UUID del usuario
 * @param {string} tenantId - UUID del tenant
 * @param {string|null} branchId - UUID de la sucursal (NULL para matriz)
 * @param {number} startAmount - Monto inicial en caja
 * @returns {Promise<object>} Sesión creada
 */
async function openCashSession(userId, tenantId, branchId, startAmount = 0) {
    let finalBranchId = branchId;
    if (!finalBranchId) {
        // Find default branch for the tenant if branchId is null (e.g. for admin users)
        const branchRes = await pool.query('SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1', [tenantId]);
        if (branchRes.rows.length > 0) {
            finalBranchId = branchRes.rows[0].id;
        } else {
            throw new Error('No hay sucursales configuradas para este tenant.');
        }
    }

    const result = await pool.query(
        `INSERT INTO cash_sessions (user_id, tenant_id, branch_id, start_amount)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, tenantId, finalBranchId, startAmount]
    );
    return result.rows[0];
}

/**
 * Cierra una sesión de caja, asegurando que pertenezca al tenant/sucursal.
 * @param {string} sessionId - UUID de la sesión
 * @param {string} tenantId - UUID del tenant
 * @param {string|null} branchId - UUID de la sucursal (NULL para admin de tenant)
 * @param {number} endAmount - Monto final en caja
 * @returns {Promise<object>} Sesión cerrada
 */
async function closeCashSession(sessionId, tenantId, branchId, endAmount) {
    let whereClause = 'id = $1 AND tenant_id = $2 AND closed = FALSE';
    const params = [sessionId, tenantId];

    if (branchId !== null && branchId !== undefined) {
        whereClause += ' AND (branch_id = $3 OR branch_id IS NULL)';
        params.push(branchId);
    }

    params.push(endAmount);
    const paramIndex = params.length;

    const result = await pool.query(
        `UPDATE cash_sessions 
         SET end_amount = $${paramIndex}, end_time = NOW(), closed = TRUE 
         WHERE ${whereClause} 
         RETURNING *`,
        params
    );
    if (result.rows.length === 0) {
        throw new Error('Sesión no encontrada, ya cerrada o no pertenece a la sucursal');
    }
    return result.rows[0];
}

/**
 * Obtiene la sesión de caja activa de un usuario, filtrada por tenant/sucursal.
 * @param {string} userId - UUID del usuario
 * @param {string} tenantId - UUID del tenant
 * @param {string|null} branchId - UUID de la sucursal (NULL para admin de tenant)
 * @returns {Promise<object|null>} Sesión activa o null
 */
async function getActiveCashSession(userId, tenantId, branchId) {
    let whereClause = 'user_id = $1 AND tenant_id = $2 AND closed = FALSE';
    const params = [userId, tenantId];

    if (branchId !== null && branchId !== undefined) {
        whereClause += ' AND (branch_id = $3 OR branch_id IS NULL)';
        params.push(branchId);
    }

    const result = await pool.query(
        `SELECT * FROM cash_sessions 
         WHERE ${whereClause}
         ORDER BY start_time DESC 
         LIMIT 1`,
        params
    );
    return result.rows[0] || null;
}

/**
 * Guarda una venta offline en la base de datos para sincronización posterior.
 * @param {string} localId - ID generado en el frontend (Dexie)
 * @param {object} saleData - Datos completos de la venta (JSON)
 * @returns {Promise<object>} Registro de venta offline
 */
async function saveOfflineSale(localId, saleData) {
    const result = await pool.query(
        `INSERT INTO offline_sales (local_id, sale_data) 
         VALUES ($1, $2) 
         RETURNING *`,
        [localId, saleData]
    );
    return result.rows[0];
}

/**
 * Sincroniza ventas offline pendientes.
 * @param {string} userId - UUID del usuario
 * @param {string} tenantId - UUID del tenant
 * @param {string|null} branchId - UUID de la sucursal (NULL para matriz)
 * @returns {Promise<{synced: number, errors: string[]}>}
 */
async function syncOfflineSales(userId, tenantId, branchId) {
    const pendingRes = await pool.query(
        `SELECT * FROM offline_sales WHERE synced = FALSE ORDER BY created_at`
    );
    const pending = pendingRes.rows;
    const results = { synced: 0, errors: [] };

    for (const offlineSale of pending) {
        try {
            const saleData = offlineSale.sale_data;
            // Asumimos que sale_data tiene la misma estructura que processSale espera
            const { items, payment_method, client_id, cash_session_id, notes } = saleData;
            await processSale(items, payment_method, tenantId, branchId, client_id, cash_session_id, userId, notes);
            // Marcar como sincronizada
            await pool.query(
                `UPDATE offline_sales SET synced = TRUE, synced_at = NOW() WHERE id = $1`,
                [offlineSale.id]
            );
            results.synced++;
        } catch (err) {
            results.errors.push(`Venta ${offlineSale.local_id}: ${err.message}`);
        }
    }

    return results;
}

/**
 * Función especial para descontar stock desde un reporte de inspección (Agentica Reports).
 * @param {string} reportId - ID del reporte (puede ser UUID o folio)
 * @param {Array} items - Array de {product_id, quantity, reason}
 * @param {string} userId - UUID del usuario que ejecuta la acción
 * @param {string} tenantId - UUID del tenant
 * @param {string|null} branchId - UUID de la sucursal (NULL para matriz)
 * @returns {Promise<object>} Resultado de la operación
 */
async function consumeFromReport(reportId, items, userId, tenantId, branchId) {
    // Validar items
    if (!items || items.length === 0) {
        throw new Error('No hay items para consumir');
    }

    // Crear una venta especial con payment_method = 'maintenance' y notas con el reportId
    const saleItems = items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: 0, // Precio cero porque es salida por mantenimiento
        discount: 0,
        tax_rate: 0
    }));

    // Procesar como venta con método de pago 'maintenance' (podría ser un nuevo status)
    const sale = await processSale(
        saleItems,
        'maintenance',
        tenantId,
        branchId,
        null, // client_id
        null, // cash_session_id
        userId,
        `Consumo desde reporte: ${reportId}`
    );

    return {
        message: 'Stock descontado correctamente desde reporte',
        sale_id: sale.id,
        report_id: reportId,
        items_consumed: items.length
    };
}

module.exports = {
    processSale,
    getSale,
    listSales,
    openCashSession,
    closeCashSession,
    getActiveCashSession,
    saveOfflineSale,
    syncOfflineSales,
    consumeFromReport
};