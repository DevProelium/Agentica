'use strict';

const pool = require('../models/db');

// ============================================================================
// CLIENTES (CRM)
// ============================================================================

async function getClients(req, res, next) {
  try {
    const { limit = 50, offset = 0, search = '' } = req.query;
    
    let query = `
      SELECT id, name, trade_name, email, phone, tax_id, address, business_type, credit_days, credit_limit, status, created_at
      FROM clients
      WHERE tenant_id = $1
    `;
    const params = [req.tenantId];

    if (search) {
      query += ` AND (name ILIKE $2 OR trade_name ILIKE $2 OR tax_id ILIKE $2)`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Contar total
    const countQuery = `SELECT COUNT(*) FROM clients WHERE tenant_id = $1 ${search ? `AND (name ILIKE $2 OR trade_name ILIKE $2 OR tax_id ILIKE $2)` : ''}`;
    const countParams = search ? [req.tenantId, `%${search}%`] : [req.tenantId];
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count, 10)
    });
  } catch (err) {
    next(err);
  }
}

async function createClient(req, res, next) {
  try {
    const { name, trade_name, email, phone, tax_id, address, business_type, credit_days, credit_limit } = req.body;
    
    if (!name) return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });

    const result = await pool.query(
      `INSERT INTO clients (
        tenant_id, name, trade_name, email, phone, tax_id, address, business_type, credit_days, credit_limit
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.tenantId, name, trade_name, email, phone, tax_id, address, business_type || 'retail', credit_days || 0, credit_limit || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// COTIZACIONES (QUOTES)
// ============================================================================

async function getQuotes(req, res, next) {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT q.*, c.name as client_name, c.trade_name
       FROM quotes q
       JOIN clients c ON q.client_id = c.id
       WHERE q.tenant_id = $1
       ORDER BY q.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.tenantId, limit, offset]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function createQuote(req, res, next) {
  const client = await pool.connect();
  try {
    const { client_id, items, valid_until, notes } = req.body;
    
    if (!client_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Faltan datos obligatorios o partidas.' });
    }

    await client.query('BEGIN');

    // 1. Calcular totales
    let subtotal = 0;
    for (let item of items) {
      const lineTotal = (parseFloat(item.quantity) * parseFloat(item.unit_price)) - (parseFloat(item.discount) || 0);
      subtotal += lineTotal;
    }
    const tax = subtotal * 0.16; // Asumiendo IVA 16% por defecto (luego se pasa a capa de impuestos)
    const total = subtotal + tax;

    // 2. Insertar Cabecera quote
    const quoteRes = await client.query(
      `INSERT INTO quotes (tenant_id, branch_id, client_id, subtotal, tax, total, valid_until, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.tenantId, req.branchId, client_id, subtotal, tax, total, valid_until, notes, req.user.id]
    );
    const quote = quoteRes.rows[0];

    // 3. Insertar partidas
    for (let item of items) {
      const lineSubtotal = (parseFloat(item.quantity) * parseFloat(item.unit_price)) - (parseFloat(item.discount) || 0);
      await client.query(
        `INSERT INTO quote_items (quote_id, product_id, concept, quantity, unit_price, discount, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [quote.id, item.product_id || null, item.concept, item.quantity, item.unit_price, item.discount || 0, lineSubtotal]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(quote);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = {
  getClients,
  createClient,
  getQuotes,
  createQuote
};
