-- ============================================================
-- MIGRACIÓN: Módulo de Compras v2 — campos adicionales
-- Ejecutar una sola vez sobre la BD existente
-- ============================================================

-- Precio de costo (el que paga la empresa al proveedor)
-- Diferente al campo 'price' que es el precio de venta al cliente
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12,2) DEFAULT NULL;

-- Referencia/folio de la orden de compra (número de factura, nota, etc.)
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS reference TEXT DEFAULT NULL;

-- Índice para búsqueda rápida por referencia
CREATE INDEX IF NOT EXISTS purchases_reference_idx ON purchases(reference);

-- Añadir updated_at a stock_transfers si no existe
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Índice en inventory_transactions por tenant para reportes rápidos
CREATE INDEX IF NOT EXISTS inv_tx_tenant_idx
    ON inventory_transactions(tenant_id, created_at DESC);

-- Vista útil: kardex con nombre de producto y usuario
CREATE OR REPLACE VIEW v_kardex AS
SELECT
    it.id,
    it.tenant_id,
    it.branch_id,
    b.name          AS branch_name,
    it.product_id,
    p.sku,
    p.title         AS product_name,
    it.type,
    it.quantity,
    it.previous_stock,
    it.new_stock,
    it.reference_id,
    it.reason,
    it.created_by,
    u.username      AS created_by_name,
    it.created_at
FROM inventory_transactions it
LEFT JOIN products  p ON p.id = it.product_id
LEFT JOIN branches  b ON b.id = it.branch_id
LEFT JOIN users     u ON u.id = it.created_by;

-- Vista: resumen de órdenes de compra con proveedor y totales
CREATE OR REPLACE VIEW v_purchases_summary AS
SELECT
    p.id,
    p.tenant_id,
    p.branch_id,
    b.name          AS branch_name,
    p.supplier_id,
    s.name          AS supplier_name,
    p.reference,
    p.status,
    p.order_date,
    p.expected_date,
    p.received_date,
    p.total_amount,
    p.notes,
    p.created_by,
    u.username      AS created_by_name,
    p.created_at,
    (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS item_count
FROM purchases p
LEFT JOIN branches  b ON b.id = p.branch_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN users     u ON u.id = p.created_by;
