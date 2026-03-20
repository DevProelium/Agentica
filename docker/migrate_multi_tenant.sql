-- Migración incremental para multi‑tenant / multi‑sucursal
-- Ejecutar con: psql -U agentica -d agentica_inventory -h localhost -p 5435 -f migrate_multi_tenant.sql
-- O desde dentro del contenedor: docker exec -i agentica_db psql -U agentica -d agentica_inventory -f /docker-entrypoint-initdb.d/migrate_multi_tenant.sql

-- ===========================================
-- 1. TABLAS BASE (si no existen)
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

-- ===========================================
-- 2. AGREGAR COLUMNAS tenant_id, branch_id A TABLAS EXISTENTES
-- ===========================================

-- products: tenant_id NULLABLE, branch_id NULLABLE
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='tenant_id') THEN
        ALTER TABLE products ADD COLUMN tenant_id UUID REFERENCES tenants(id);
        ALTER TABLE products ADD COLUMN branch_id UUID REFERENCES branches(id);
    END IF;
END $$;

-- users: tenant_id NOT NULL, branch_id NULLABLE
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='tenant_id') THEN
        -- Primero eliminar la restricción UNIQUE anterior si existe
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_unique;
        -- Agregar columnas
        ALTER TABLE users ADD COLUMN tenant_id UUID REFERENCES tenants(id);
        ALTER TABLE users ADD COLUMN branch_id UUID REFERENCES branches(id);
        -- Cambiar a NOT NULL después de poblar datos (por ahora nullable)
        -- Actualizar UNIQUE constraint
        ALTER TABLE users ADD CONSTRAINT users_tenant_username_unique UNIQUE (tenant_id, username);
        -- Si hay usuarios existentes, asignarlos al tenant por defecto (paso 4)
    END IF;
END $$;

-- cash_sessions: tenant_id, branch_id NOT NULL (agregar nullable primero)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_sessions' AND column_name='tenant_id') THEN
        ALTER TABLE cash_sessions ADD COLUMN tenant_id UUID REFERENCES tenants(id);
        ALTER TABLE cash_sessions ADD COLUMN branch_id UUID REFERENCES branches(id);
    END IF;
END $$;

-- sales: tenant_id, branch_id NOT NULL (agregar nullable primero)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='tenant_id') THEN
        ALTER TABLE sales ADD COLUMN tenant_id UUID REFERENCES tenants(id);
        ALTER TABLE sales ADD COLUMN branch_id UUID REFERENCES branches(id);
    END IF;
END $$;

-- ===========================================
-- 3. TABLAS DE TRANSFERENCIAS INTERNAS
-- ===========================================

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

CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id   UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES products(id),
    quantity      INTEGER NOT NULL CHECK (quantity > 0),
    received_quantity INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 4. DATOS INICIALES
-- ===========================================

-- Tenant por defecto (Agentica System)
INSERT INTO tenants (id, name, business_type, pos_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'Agentica System', 'retail', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Sucursal matriz por defecto
INSERT INTO branches (id, tenant_id, name, code, pos_enabled)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Matriz', 'MATRIZ', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Asignar tenant y branch a usuarios existentes (si no tienen tenant_id)
UPDATE users 
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Para usuarios con rol 'admin', asignar branch_id NULL (admin de tenant)
-- Para otros, asignar branch_id = matriz (00000000-0000-0000-0000-000000000002) como placeholder
UPDATE users 
SET branch_id = NULL 
WHERE role = 'admin' AND branch_id IS NULL;

UPDATE users 
SET branch_id = '00000000-0000-0000-0000-000000000002' 
WHERE branch_id IS NULL AND role != 'admin';

-- Actualizar hash del usuario admin (contraseña: admin123)
-- EJECUTAR SOLO SI EL USUARIO ADMIN EXISTE Y QUIERES CAMBIAR LA CONTRASEÑA
-- NOTA: Este hash es un placeholder. Reemplazar con hash real generado con:
--   bcrypt.hash('admin123', 12)
-- O usar el hash existente si no quieres cambiar la contraseña.
UPDATE users 
SET password_hash = '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW' -- 'admin123'
WHERE username = 'admin' AND tenant_id = '00000000-0000-0000-0000-000000000001';

-- ===========================================
-- 5. ÍNDICES
-- ===========================================

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

-- ===========================================
-- 6. ACTUALIZAR FUNCIÓN process_sale (multi‑tenant)
-- ===========================================

CREATE OR REPLACE FUNCTION process_sale(
    p_items JSONB, -- array de objetos: {product_id, quantity, unit_price, discount, tax_rate}
    p_payment_method TEXT,
    p_tenant_id UUID,
    p_branch_id UUID,
    p_client_id UUID DEFAULT NULL,
    p_cash_session_id UUID DEFAULT NULL,
    p_user_id UUID,
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
        discount DECIMAL(12,2) DEFAULT 0,
        tax_rate DECIMAL(5,4) DEFAULT 0.16
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
        v_discount := v_discount + v_item.discount;
        v_tax := v_tax + (v_subtotal - v_item.discount) * v_item.tax_rate;

        -- Insertar item de venta
        INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal, discount, tax_rate)
        VALUES (v_sale_id, v_item.product_id, v_item.quantity, v_item.unit_price, v_subtotal, v_item.discount, v_item.tax_rate);

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