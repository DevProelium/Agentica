-- Inicialización de la base de datos Agentica Inventory
-- Habilitar extensión pgvector para búsqueda semántica
CREATE EXTENSION IF NOT EXISTS vector;

-- ===========================================
-- MULTI‑TENANT / MULTI‑SUCURSAL (definiciones base)
-- ===========================================

-- Empresas/clientes (tenants)
CREATE TABLE IF NOT EXISTS tenants (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    business_type TEXT NOT NULL DEFAULT 'retail', -- 'retail' (papelería), 'service' (instalaciones)
    pos_enabled   BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Sucursales de cada tenant
CREATE TABLE IF NOT EXISTS branches (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    code          TEXT,                           -- código interno (ej: "SUC-01")
    address       TEXT,
    pos_enabled   BOOLEAN DEFAULT TRUE,           -- esta sucursal tiene POS habilitado
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- Tabla principal de productos/inventario (multi‑tenant/sucursal)
CREATE TABLE IF NOT EXISTS products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id),
    branch_id       UUID REFERENCES branches(id),   -- NULL para inventario de matriz
    handle          TEXT,
    title           TEXT NOT NULL,
    sku             TEXT,
    description     TEXT,
    location        TEXT,
    -- Opciones de variante (ej: talla, color, material)
    option1_name    TEXT,
    option1_value   TEXT,
    option2_name    TEXT,
    option2_value   TEXT,
    option3_name    TEXT,
    option3_value   TEXT,
    -- Campos de inventario
    incoming        INTEGER DEFAULT 0,
    unavailable     INTEGER DEFAULT 0,
    committed       INTEGER DEFAULT 0,
    available       INTEGER DEFAULT 0,
    on_hand         INTEGER DEFAULT 0,
    price           DECIMAL(12,2),
    -- Vector de embeddings para búsqueda semántica (Qwen text-embedding-v3: 1536 dims)
    embedding       VECTOR(1536),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice HNSW para búsqueda por similitud coseno (pgvector)
CREATE INDEX IF NOT EXISTS products_embedding_idx
    ON products USING hnsw (embedding vector_cosine_ops);

-- Índices para búsqueda y filtrado rápido
CREATE INDEX IF NOT EXISTS products_handle_idx ON products(handle);
-- Índice parcial único en SKU (solo cuando no es NULL) para soportar upsert con registros sin SKU
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_idx ON products(sku) WHERE sku IS NOT NULL;

-- (tabla users movida después de branches)

-- Tabla de webhooks registrados
CREATE TABLE IF NOT EXISTS webhooks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url        TEXT UNIQUE NOT NULL,
    events     TEXT[] NOT NULL,
    active     BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de usuarios para autenticación (multi‑tenant)
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    branch_id     UUID REFERENCES branches(id),   -- NULL para admin de tenant
    username      TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'cashier', -- 'superadmin', 'tenant_admin', 'branch_manager', 'cashier', 'warehouse'
    created_at    TIMESTAMptz DEFAULT NOW(),
    UNIQUE(tenant_id, username)
);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at en products
CREATE TRIGGER products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- MÓDULO DE VENTAS PROFESIONALES (POS)
-- ===========================================

-- Tabla de sesiones de caja (asociada a tenant y sucursal)
CREATE TABLE IF NOT EXISTS cash_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    branch_id     UUID NOT NULL REFERENCES branches(id),
    user_id       UUID NOT NULL REFERENCES users(id),
    start_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    end_amount    DECIMAL(12,2),
    start_time    TIMESTAMPTZ DEFAULT NOW(),
    end_time      TIMESTAMPTZ,
    closed        BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de clientes (opcional, para ventas con cliente registrado)
CREATE TABLE IF NOT EXISTS clients (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    email         TEXT,
    phone         TEXT,
    tax_id        TEXT, -- RFC o CURP
    address       TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de ventas (cabecera) (asociada a tenant y sucursal)
CREATE TABLE IF NOT EXISTS sales (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    branch_id     UUID NOT NULL REFERENCES branches(id),
    cash_session_id UUID REFERENCES cash_sessions(id),
    client_id     UUID REFERENCES clients(id),
    total_amount  DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
    subtotal      DECIMAL(12,2) NOT NULL,
    tax_amount    DECIMAL(12,2) DEFAULT 0.00,
    discount_amount DECIMAL(12,2) DEFAULT 0.00,
    payment_method TEXT NOT NULL, -- 'cash', 'card', 'transfer', 'mixed'
    status        TEXT DEFAULT 'completed', -- 'completed', 'canceled', 'refunded'
    notes         TEXT,
    created_by    UUID NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de items de venta (detalle)
CREATE TABLE IF NOT EXISTS sale_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id       UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES products(id),
    quantity      INTEGER NOT NULL CHECK (quantity > 0),
    unit_price    DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    subtotal      DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
    discount      DECIMAL(12,2) DEFAULT 0.00,
    tax_rate      DECIMAL(5,4) DEFAULT 0.16, -- IVA 16% por defecto
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de ventas offline (para sincronización)
CREATE TABLE IF NOT EXISTS offline_sales (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_id      TEXT NOT NULL, -- ID generado en el frontend (Dexie)
    sale_data     JSONB NOT NULL, -- Datos completos de la venta
    synced        BOOLEAN DEFAULT FALSE,
    sync_error    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    synced_at     TIMESTAMPTZ
);

-- ===========================================
-- TRANSFERENCIAS INTERNAS ENTRE SUCURSALES
-- ===========================================

-- Cabecera de transferencia
CREATE TABLE IF NOT EXISTS stock_transfers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    from_branch_id UUID NOT NULL REFERENCES branches(id),
    to_branch_id   UUID NOT NULL REFERENCES branches(id),
    status        TEXT DEFAULT 'pending', -- 'pending', 'shipped', 'received', 'cancelled'
    notes         TEXT,
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    received_at   TIMESTAMPTZ
);

-- Items de transferencia
CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id   UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES products(id),
    quantity      INTEGER NOT NULL CHECK (quantity > 0),
    received_quantity INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS sales_cash_session_idx ON sales(cash_session_id);
CREATE INDEX IF NOT EXISTS sales_client_idx ON sales(client_id);
CREATE INDEX IF NOT EXISTS sales_created_at_idx ON sales(created_at);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS offline_sales_synced_idx ON offline_sales(synced);

-- Índices multi‑tenant / multi‑sucursal
CREATE INDEX IF NOT EXISTS products_tenant_idx ON products(tenant_id);
CREATE INDEX IF NOT EXISTS products_branch_idx ON products(branch_id);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id);
CREATE INDEX IF NOT EXISTS users_branch_idx ON users(branch_id);
CREATE INDEX IF NOT EXISTS cash_sessions_tenant_idx ON cash_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS cash_sessions_branch_idx ON cash_sessions(branch_id);
CREATE INDEX IF NOT EXISTS sales_tenant_idx ON sales(tenant_id);
CREATE INDEX IF NOT EXISTS sales_branch_idx ON sales(branch_id);
CREATE INDEX IF NOT EXISTS stock_transfers_tenant_idx ON stock_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS stock_transfers_from_branch_idx ON stock_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS stock_transfers_to_branch_idx ON stock_transfers(to_branch_id);
CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx ON stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS stock_transfer_items_product_idx ON stock_transfer_items(product_id);

-- Función para procesar una venta y actualizar el stock automáticamente (multi‑tenant)
CREATE OR REPLACE FUNCTION process_sale(
    p_items JSONB, -- array de objetos: {product_id, quantity, unit_price, discount, tax_rate}
    p_payment_method TEXT,
    p_tenant_id UUID,
    p_branch_id UUID,
    p_client_id UUID DEFAULT NULL,
    p_cash_session_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_sale_id UUID;
    v_item RECORD;
    v_subtotal DECIMAL(12,2) := 0;
    v_tax DECIMAL(12,2) := 0;
    v_total DECIMAL(12,2) := 0;
    v_discount DECIMAL(12,2) := 0;
BEGIN
    -- Validar que exista sesión de caja abierta si se proporciona cash_session_id
    IF p_cash_session_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM cash_sessions 
            WHERE id = p_cash_session_id 
              AND tenant_id = p_tenant_id 
              AND branch_id = p_branch_id 
              AND closed = FALSE
        ) THEN
            RAISE EXCEPTION 'La sesión de caja no está abierta o no pertenece a esta sucursal';
        END IF;
    END IF;

    -- Crear registro de venta
    INSERT INTO sales (tenant_id, branch_id, cash_session_id, client_id, subtotal, tax_amount, discount_amount, total_amount, payment_method, notes, created_by)
    VALUES (p_tenant_id, p_branch_id, p_cash_session_id, p_client_id, 0, 0, 0, 0, p_payment_method, p_notes, p_user_id)
    RETURNING id INTO v_sale_id;

    -- Procesar cada item
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity INTEGER,
        unit_price DECIMAL(12,2),
        discount DECIMAL(12,2),
        tax_rate DECIMAL(5,4)
    )
    LOOP
        -- Verificar stock disponible (el producto debe pertenecer al mismo tenant y branch)
        IF NOT EXISTS (
            SELECT 1 FROM products 
            WHERE id = v_item.product_id 
              AND tenant_id = p_tenant_id 
              AND (branch_id = p_branch_id OR branch_id IS NULL) -- permite productos de matriz
              AND available >= v_item.quantity
        ) THEN
            RAISE EXCEPTION 'Stock insuficiente o producto no pertenece a esta sucursal/tenant';
        END IF;

        -- Calcular subtotal del item
        v_subtotal := v_item.quantity * v_item.unit_price;
        v_discount := v_discount + COALESCE(v_item.discount, 0);
        v_tax := v_tax + (v_subtotal - COALESCE(v_item.discount, 0)) * COALESCE(v_item.tax_rate, 0.16);

        -- Insertar item de venta
        INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal, discount, tax_rate)
        VALUES (v_sale_id, v_item.product_id, v_item.quantity, v_item.unit_price, v_subtotal, COALESCE(v_item.discount, 0), COALESCE(v_item.tax_rate, 0.16));

        -- Descontar del stock
        UPDATE products 
        SET available = available - v_item.quantity,
            updated_at = NOW()
        WHERE id = v_item.product_id;
    END LOOP;

    -- Actualizar totales de la venta
    UPDATE sales 
    SET subtotal = v_subtotal,
        discount_amount = v_discount,
        tax_amount = v_tax,
        total_amount = v_subtotal - v_discount + v_tax
    WHERE id = v_sale_id;

    RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- DATOS INICIALES (solo para desarrollo)
-- ===========================================

-- Tenant por defecto (Agentica System)
INSERT INTO tenants (id, name, business_type, pos_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'Agentica System', 'retail', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Sucursal matriz por defecto
INSERT INTO branches (id, tenant_id, name, code, pos_enabled)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Matriz', 'MATRIZ', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Usuario administrador (superadmin) – contraseña: admin123 (bcrypt hash)
INSERT INTO users (id, tenant_id, branch_id, username, password_hash, role)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'admin',
    '$2b$10$YourHashHere', -- TODO: reemplazar con hash real de admin123
    'superadmin'
) ON CONFLICT (tenant_id, username) DO NOTHING;

-- ===========================================
-- M�DULO DE COMPRAS Y PROVEEDORES (ERP)
-- ===========================================

-- 1. Proveedores
CREATE TABLE IF NOT EXISTS suppliers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    name          TEXT NOT NULL,
    contact_name  TEXT,
    email         TEXT,
    phone         TEXT,
    tax_id        TEXT,
    address       TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. �rdenes de Compra
CREATE TABLE IF NOT EXISTS purchases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    branch_id     UUID NOT NULL REFERENCES branches(id),
    supplier_id   UUID REFERENCES suppliers(id),
    status        TEXT DEFAULT 'draft',
    order_date    TIMESTAMPTZ DEFAULT NOW(),
    expected_date DATE,
    received_date TIMESTAMPTZ,
    total_amount  DECIMAL(12,2) DEFAULT 0.00,
    notes         TEXT,
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Items de Compra
CREATE TABLE IF NOT EXISTS purchase_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id   UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES products(id),
    quantity      INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_cost    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    received_qty  INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Modificar Productos (Stock M�nimo/M�ximo)
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_stock INTEGER DEFAULT 0;

-- 5. Kardex (Movimientos de Inventario)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    branch_id     UUID REFERENCES branches(id),
    product_id    UUID NOT NULL REFERENCES products(id),
    type          TEXT NOT NULL, 
    quantity      INTEGER NOT NULL, 
    previous_stock INTEGER NOT NULL,
    new_stock     INTEGER NOT NULL,
    reference_id  UUID, 
    reason        TEXT,
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- �ndices nuevos
CREATE INDEX IF NOT EXISTS suppliers_tenant_idx ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS purchases_tenant_idx ON purchases(tenant_id);
CREATE INDEX IF NOT EXISTS purchases_supplier_idx ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_product_idx ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_created_at_idx ON inventory_transactions(created_at);

