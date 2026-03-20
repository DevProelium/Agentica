'use strict';

const pool      = require('../models/db');
const aiService = require('./aiService');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function safeInt(v)     { const n = parseInt(v, 10);    return Number.isFinite(n) ? n : 0; }
function safeDec(v)     { const n = parseFloat(v);      return Number.isFinite(n) ? n : 0; }
function safeDecN(v)    { const n = parseFloat(v);      return Number.isFinite(n) ? n : null; }

// ─────────────────────────────────────────────────────────────────────────────
// SUCURSALES (para el selector de traspasos)
// ─────────────────────────────────────────────────────────────────────────────

async function getBranches(tenantId) {
  const res = await pool.query(
    `SELECT id, name, code FROM branches WHERE tenant_id = $1 ORDER BY name`,
    [tenantId]
  );
  return res.rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVEEDORES
// ─────────────────────────────────────────────────────────────────────────────

async function getSuppliers(tenantId) {
  const res = await pool.query(
    `SELECT * FROM suppliers WHERE tenant_id = $1 ORDER BY name`,
    [tenantId]
  );
  return res.rows;
}

async function createSupplier(tenantId, data) {
  const { name, contact_name, email, phone, tax_id, address } = data;
  if (!name || !name.trim()) throw new Error('El nombre del proveedor es obligatorio');

  const res = await pool.query(
    `INSERT INTO suppliers (tenant_id, name, contact_name, email, phone, tax_id, address)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [tenantId, name.trim(), contact_name || null, email || null,
     phone || null, tax_id || null, address || null]
  );
  return res.rows[0];
}

async function updateSupplier(tenantId, supplierId, data) {
  const allowed = ['name', 'contact_name', 'email', 'phone', 'tax_id', 'address'];
  const updates = [];
  const values  = [];
  let idx = 1;

  for (const field of allowed) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      values.push(data[field]);
    }
  }
  if (updates.length === 0) throw new Error('No se proporcionaron campos para actualizar');

  values.push(supplierId, tenantId);
  const res = await pool.query(
    `UPDATE suppliers
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
    values
  );
  if (res.rowCount === 0) throw new Error('Proveedor no encontrado');
  return res.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// ÓRDENES DE COMPRA
// ─────────────────────────────────────────────────────────────────────────────

async function createPurchase(tenantId, branchId, data, userId) {
  const { supplier_id, expected_date, notes, reference } = data;

  const res = await pool.query(
    `INSERT INTO purchases
       (tenant_id, branch_id, supplier_id, status, expected_date, notes, reference, created_by)
     VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, branchId, supplier_id || null,
     expected_date || null, notes || null, reference || null, userId]
  );
  return res.rows[0];
}

async function getPurchases(tenantId, branchId, { status, limit = 30, offset = 0 } = {}) {
  let where = 'WHERE p.tenant_id = $1';
  const params = [tenantId];
  let idx = 2;

  if (branchId) {
    where += ` AND p.branch_id = $${idx++}`;
    params.push(branchId);
  }
  if (status) {
    where += ` AND p.status = $${idx++}`;
    params.push(status);
  }
  params.push(parseInt(limit, 10) || 30, parseInt(offset, 10) || 0);

  const res = await pool.query(
    `SELECT p.*, s.name AS supplier_name, b.name AS branch_name,
            (SELECT COUNT(*) FROM purchase_items pi
             WHERE pi.purchase_id = p.id)::int AS item_count
     FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN branches  b ON b.id = p.branch_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );
  return res.rows;
}

async function getPurchase(purchaseId, tenantId) {
  const [pRes, iRes] = await Promise.all([
    pool.query(
      `SELECT p.*, s.name AS supplier_name, b.name AS branch_name
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN branches  b ON b.id = p.branch_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [purchaseId, tenantId]
    ),
    pool.query(
      `SELECT pi.*, pr.title, pr.sku,
              pr.available  AS current_stock,
              pr.unit_cost  AS current_unit_cost
       FROM purchase_items pi
       JOIN products pr ON pr.id = pi.product_id
       WHERE pi.purchase_id = $1
       ORDER BY pi.created_at`,
      [purchaseId]
    ),
  ]);

  if (pRes.rowCount === 0) throw new Error('Orden de compra no encontrada');
  const purchase = pRes.rows[0];
  purchase.items = iRes.rows;
  return purchase;
}

async function addPurchaseItem(purchaseId, tenantId, productId, quantity, unitCost) {
  const pRes = await pool.query(
    `SELECT status FROM purchases WHERE id = $1 AND tenant_id = $2`,
    [purchaseId, tenantId]
  );
  if (pRes.rowCount === 0) throw new Error('Orden de compra no encontrada');
  if (!['draft', 'pending'].includes(pRes.rows[0].status)) {
    throw new Error('La orden ya fue procesada y no puede modificarse');
  }

  const qty  = safeInt(quantity);
  const cost = safeDec(unitCost);
  if (qty <= 0) throw new Error('La cantidad debe ser mayor a 0');

  // Check if product already present → increment
  const existing = await pool.query(
    `SELECT id, quantity FROM purchase_items WHERE purchase_id = $1 AND product_id = $2`,
    [purchaseId, productId]
  );

  let result;
  if (existing.rowCount > 0) {
    const newQty = existing.rows[0].quantity + qty;
    result = await pool.query(
      `UPDATE purchase_items
       SET quantity = $1, unit_cost = $2, total_cost = $1 * $2
       WHERE id = $3 RETURNING *`,
      [newQty, cost, existing.rows[0].id]
    );
  } else {
    result = await pool.query(
      `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, total_cost)
       VALUES ($1, $2, $3, $4, $3 * $4) RETURNING *`,
      [purchaseId, productId, qty, cost]
    );
  }

  await _recalcPurchaseTotal(purchaseId);
  return result.rows[0];
}

async function updatePurchaseItem(itemId, purchaseId, tenantId, quantity, unitCost) {
  const pRes = await pool.query(
    `SELECT status FROM purchases WHERE id = $1 AND tenant_id = $2`,
    [purchaseId, tenantId]
  );
  if (pRes.rowCount === 0) throw new Error('Orden de compra no encontrada');
  if (!['draft', 'pending'].includes(pRes.rows[0].status)) {
    throw new Error('La orden ya fue procesada');
  }

  const qty  = safeInt(quantity);
  const cost = safeDec(unitCost);
  if (qty <= 0) throw new Error('La cantidad debe ser mayor a 0');

  const res = await pool.query(
    `UPDATE purchase_items
     SET quantity = $1, unit_cost = $2, total_cost = $1 * $2
     WHERE id = $3 AND purchase_id = $4 RETURNING *`,
    [qty, cost, itemId, purchaseId]
  );
  if (res.rowCount === 0) throw new Error('Línea no encontrada');

  await _recalcPurchaseTotal(purchaseId);
  return res.rows[0];
}

async function removePurchaseItem(itemId, purchaseId, tenantId) {
  const pRes = await pool.query(
    `SELECT status FROM purchases WHERE id = $1 AND tenant_id = $2`,
    [purchaseId, tenantId]
  );
  if (pRes.rowCount === 0) throw new Error('Orden de compra no encontrada');
  if (!['draft', 'pending'].includes(pRes.rows[0].status)) {
    throw new Error('La orden ya fue procesada');
  }

  await pool.query(
    `DELETE FROM purchase_items WHERE id = $1 AND purchase_id = $2`,
    [itemId, purchaseId]
  );
  await _recalcPurchaseTotal(purchaseId);
}

async function _recalcPurchaseTotal(purchaseId) {
  await pool.query(
    `UPDATE purchases
     SET total_amount = COALESCE(
           (SELECT SUM(total_cost) FROM purchase_items WHERE purchase_id = $1), 0
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [purchaseId]
  );
}

/**
 * Confirma la recepción de mercancía:
 *  - Suma stock (available + on_hand)
 *  - Actualiza precio de costo con promedio ponderado
 *  - Registra cada línea en el kardex (inventory_transactions)
 *  - Marca la orden como 'received'
 */
async function receivePurchase(purchaseId, tenantId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the purchase row
    const pRes = await client.query(
      `SELECT * FROM purchases WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [purchaseId, tenantId]
    );
    if (pRes.rowCount === 0) throw new Error('Orden de compra no encontrada');

    const purchase = pRes.rows[0];
    if (!['draft', 'pending'].includes(purchase.status)) {
      throw new Error('La orden ya fue recibida o cancelada');
    }

    // Get items
    const iRes = await client.query(
      `SELECT pi.*, pr.available, pr.on_hand, pr.unit_cost AS current_unit_cost
       FROM purchase_items pi
       JOIN products pr ON pr.id = pi.product_id
       WHERE pi.purchase_id = $1`,
      [purchaseId]
    );
    if (iRes.rowCount === 0) {
      throw new Error('La orden no tiene líneas registradas');
    }

    for (const item of iRes.rows) {
      const prevAvail = safeInt(item.available);
      const prevHand  = safeInt(item.on_hand);
      const newAvail  = prevAvail + item.quantity;
      const newHand   = prevHand  + item.quantity;

      // Weighted-average cost (costo promedio ponderado)
      const currentCost = safeDec(item.current_unit_cost);
      const newCost = prevAvail > 0
        ? (prevAvail * currentCost + item.quantity * safeDec(item.unit_cost))
          / (prevAvail + item.quantity)
        : safeDec(item.unit_cost);

      // Update product stock + cost
      await client.query(
        `UPDATE products
         SET available = $1, on_hand = $2, unit_cost = $3, updated_at = NOW()
         WHERE id = $4`,
        [newAvail, newHand, newCost, item.product_id]
      );

      // Mark received qty
      await client.query(
        `UPDATE purchase_items SET received_qty = $1 WHERE id = $2`,
        [item.quantity, item.id]
      );

      // Kardex entry
      await client.query(
        `INSERT INTO inventory_transactions
           (tenant_id, branch_id, product_id, type, quantity,
            previous_stock, new_stock, reference_id, reason, created_by)
         VALUES ($1, $2, $3, 'purchase', $4, $5, $6, $7, 'purchase_reception', $8)`,
        [tenantId, purchase.branch_id, item.product_id,
         item.quantity, prevAvail, newAvail, purchaseId, userId]
      );
    }

    // Close purchase
    await client.query(
      `UPDATE purchases
       SET status = 'received', received_date = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [purchaseId]
    );

    await client.query('COMMIT');
    return { success: true, purchase_id: purchaseId, items_received: iRes.rowCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRASPASOS ENTRE SUCURSALES
// ─────────────────────────────────────────────────────────────────────────────

async function createTransfer(tenantId, fromBranchId, toBranchId, notes, userId) {
  if (fromBranchId === toBranchId) {
    throw new Error('La sucursal de origen y destino no pueden ser la misma');
  }
  const res = await pool.query(
    `INSERT INTO stock_transfers
       (tenant_id, from_branch_id, to_branch_id, status, notes, created_by)
     VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING *`,
    [tenantId, fromBranchId, toBranchId, notes || null, userId]
  );
  return res.rows[0];
}

async function getTransfers(tenantId, branchId) {
  let where = 'WHERE t.tenant_id = $1';
  const params = [tenantId];
  if (branchId) {
    where += ` AND (t.from_branch_id = $2 OR t.to_branch_id = $2)`;
    params.push(branchId);
  }
  const res = await pool.query(
    `SELECT t.*,
            bf.name AS from_branch_name,
            bt.name AS to_branch_name,
            (SELECT COUNT(*) FROM stock_transfer_items sti
             WHERE sti.transfer_id = t.id)::int AS item_count
     FROM stock_transfers t
     JOIN branches bf ON bf.id = t.from_branch_id
     JOIN branches bt ON bt.id = t.to_branch_id
     ${where}
     ORDER BY t.created_at DESC`,
    params
  );
  return res.rows;
}

async function getTransfer(transferId, tenantId) {
  const [tRes, iRes] = await Promise.all([
    pool.query(
      `SELECT t.*,
              bf.name AS from_branch_name,
              bt.name AS to_branch_name
       FROM stock_transfers t
       JOIN branches bf ON bf.id = t.from_branch_id
       JOIN branches bt ON bt.id = t.to_branch_id
       WHERE t.id = $1 AND t.tenant_id = $2`,
      [transferId, tenantId]
    ),
    pool.query(
      `SELECT sti.*, p.title, p.sku, p.available AS current_stock
       FROM stock_transfer_items sti
       JOIN products p ON p.id = sti.product_id
       WHERE sti.transfer_id = $1
       ORDER BY sti.created_at`,
      [transferId]
    ),
  ]);
  if (tRes.rowCount === 0) throw new Error('Traspaso no encontrado');
  const transfer = tRes.rows[0];
  transfer.items = iRes.rows;
  return transfer;
}

async function addTransferItem(transferId, tenantId, productId, quantity) {
  const tRes = await pool.query(
    `SELECT status FROM stock_transfers WHERE id = $1 AND tenant_id = $2`,
    [transferId, tenantId]
  );
  if (tRes.rowCount === 0) throw new Error('Traspaso no encontrado');
  if (tRes.rows[0].status !== 'pending') {
    throw new Error('El traspaso ya fue procesado y no puede modificarse');
  }

  const qty = safeInt(quantity);
  if (qty <= 0) throw new Error('La cantidad debe ser mayor a 0');

  const existing = await pool.query(
    `SELECT id, quantity FROM stock_transfer_items
     WHERE transfer_id = $1 AND product_id = $2`,
    [transferId, productId]
  );

  let result;
  if (existing.rowCount > 0) {
    result = await pool.query(
      `UPDATE stock_transfer_items
       SET quantity = quantity + $1
       WHERE id = $2 RETURNING *`,
      [qty, existing.rows[0].id]
    );
  } else {
    result = await pool.query(
      `INSERT INTO stock_transfer_items (transfer_id, product_id, quantity)
       VALUES ($1, $2, $3) RETURNING *`,
      [transferId, productId, qty]
    );
  }
  return result.rows[0];
}

async function removeTransferItem(itemId, transferId, tenantId) {
  const tRes = await pool.query(
    `SELECT status FROM stock_transfers WHERE id = $1 AND tenant_id = $2`,
    [transferId, tenantId]
  );
  if (tRes.rowCount === 0) throw new Error('Traspaso no encontrado');
  if (tRes.rows[0].status !== 'pending') {
    throw new Error('El traspaso ya fue procesado');
  }
  await pool.query(
    `DELETE FROM stock_transfer_items WHERE id = $1 AND transfer_id = $2`,
    [itemId, transferId]
  );
}

/**
 * Marca el traspaso como enviado: descuenta stock de la sucursal origen.
 */
async function shipTransfer(transferId, tenantId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tRes = await client.query(
      `SELECT * FROM stock_transfers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [transferId, tenantId]
    );
    if (tRes.rowCount === 0) throw new Error('Traspaso no encontrado');
    const transfer = tRes.rows[0];
    if (transfer.status !== 'pending') throw new Error('El traspaso ya fue procesado');

    const iRes = await client.query(
      `SELECT sti.*, p.available, p.on_hand
       FROM stock_transfer_items sti
       JOIN products p ON p.id = sti.product_id
       WHERE sti.transfer_id = $1`,
      [transferId]
    );
    if (iRes.rowCount === 0) throw new Error('El traspaso no tiene líneas registradas');

    for (const item of iRes.rows) {
      if (safeInt(item.available) < item.quantity) {
        throw new Error(
          `Stock insuficiente: disponible ${item.available}, requerido ${item.quantity}`
        );
      }
      const newAvail = safeInt(item.available) - item.quantity;
      const newHand  = safeInt(item.on_hand)   - item.quantity;

      await client.query(
        `UPDATE products SET available = $1, on_hand = $2, updated_at = NOW() WHERE id = $3`,
        [newAvail, newHand, item.product_id]
      );

      await client.query(
        `INSERT INTO inventory_transactions
           (tenant_id, branch_id, product_id, type, quantity,
            previous_stock, new_stock, reference_id, reason, created_by)
         VALUES ($1, $2, $3, 'transfer_out', $4, $5, $6, $7, 'inter_branch_transfer', $8)`,
        [tenantId, transfer.from_branch_id, item.product_id,
         -item.quantity, item.available, newAvail, transferId, userId]
      );
    }

    await client.query(
      `UPDATE stock_transfers SET status = 'shipped' WHERE id = $1`,
      [transferId]
    );

    await client.query('COMMIT');
    return { success: true, transfer_id: transferId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Confirma la recepción del traspaso en destino: suma stock y registra en kardex.
 */
async function receiveTransfer(transferId, tenantId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tRes = await client.query(
      `SELECT * FROM stock_transfers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [transferId, tenantId]
    );
    if (tRes.rowCount === 0) throw new Error('Traspaso no encontrado');
    const transfer = tRes.rows[0];
    if (transfer.status !== 'shipped') {
      throw new Error('El traspaso debe estar en estado "shipped" para recibirlo');
    }

    const iRes = await client.query(
      `SELECT sti.*, p.available, p.on_hand
       FROM stock_transfer_items sti
       JOIN products p ON p.id = sti.product_id
       WHERE sti.transfer_id = $1`,
      [transferId]
    );

    for (const item of iRes.rows) {
      const newAvail = safeInt(item.available) + item.quantity;
      const newHand  = safeInt(item.on_hand)   + item.quantity;

      await client.query(
        `UPDATE products SET available = $1, on_hand = $2, updated_at = NOW() WHERE id = $3`,
        [newAvail, newHand, item.product_id]
      );

      await client.query(
        `UPDATE stock_transfer_items SET received_quantity = $1 WHERE id = $2`,
        [item.quantity, item.id]
      );

      await client.query(
        `INSERT INTO inventory_transactions
           (tenant_id, branch_id, product_id, type, quantity,
            previous_stock, new_stock, reference_id, reason, created_by)
         VALUES ($1, $2, $3, 'transfer_in', $4, $5, $6, $7, 'inter_branch_transfer', $8)`,
        [tenantId, transfer.to_branch_id, item.product_id,
         item.quantity, item.available, newAvail, transferId, userId]
      );
    }

    await client.query(
      `UPDATE stock_transfers
       SET status = 'received', received_at = NOW()
       WHERE id = $1`,
      [transferId]
    );

    await client.query('COMMIT');
    return { success: true, transfer_id: transferId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSING DE DOCUMENTOS CON IA (notas, facturas, PDF extraído a texto)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envía el texto de una nota de compra al modelo de chat para extraer
 * líneas estructuradas. Devuelve un array de posibles ítems.
 * @param {string} documentText  — Texto plano extraído del PDF / foto / nota
 * @returns {Promise<Array<{sku,description,quantity,unit_cost}>>}
 */
async function parseDocumentWithAI(documentText) {
  const trimmed = documentText.trim().substring(0, 4000); // Token limit guard

  const prompt =
    `Eres un asistente experto en captura de notas de compra y facturas.
Analiza el siguiente texto y extrae todos los productos/artículos listados.

Devuelve ÚNICAMENTE un objeto JSON con este esquema exacto (sin texto extra):
{"items":[{"sku":"codigo_o_null","description":"nombre del producto","quantity":1,"unit_cost":0.00}]}

Reglas:
- sku: código de barras o clave de producto si aparece, de lo contrario null.
- description: nombre/descripción del artículo tal como aparece.
- quantity: cantidad numérica entera positiva. Si no está clara, usa 1.
- unit_cost: precio unitario decimal (sin símbolo de moneda). Si no está claro, usa null.
- No incluyas totales, encabezados ni filas que no sean productos.
- Si el texto no parece una nota de compra, devuelve {"items":[]}.

TEXTO DEL DOCUMENTO:
${trimmed}`;

  let rawResponse;
  try {
    rawResponse = await aiService.chat([{ role: 'user', content: prompt }]);
  } catch (err) {
    throw new Error('Error al consultar el modelo de IA: ' + err.message);
  }

  // Extraer JSON de la respuesta
  const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('El modelo no devolvió un JSON válido');

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (err) {
    throw new Error('Error al parsear la respuesta del modelo: ' + err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Branches
  getBranches,
  // Suppliers
  getSuppliers,
  createSupplier,
  updateSupplier,
  // Purchases
  createPurchase,
  getPurchases,
  getPurchase,
  addPurchaseItem,
  updatePurchaseItem,
  removePurchaseItem,
  receivePurchase,
  // Transfers
  createTransfer,
  getTransfers,
  getTransfer,
  addTransferItem,
  removeTransferItem,
  shipTransfer,
  receiveTransfer,
  // AI
  parseDocumentWithAI,
};
