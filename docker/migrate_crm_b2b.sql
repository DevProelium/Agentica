-- Migración para el Módulo CRM y Ventas B2B (Cotizaciones y Pedidos)

-- 1. Creación de la tabla de clientes (Si no existe, como parece ser el caso en la DB actual)
CREATE TABLE IF NOT EXISTS clients (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    name          TEXT NOT NULL,
    trade_name    TEXT, -- Nombre comercial o Razón Social
    email         TEXT,
    phone         TEXT,
    tax_id        TEXT, -- RFC o CURP
    address       TEXT,
    business_type TEXT DEFAULT 'retail', -- retail, industrial, etc.
    credit_days   INTEGER DEFAULT 0, -- Días de crédito
    credit_limit  DECIMAL(12,2) DEFAULT 0.00,
    status        TEXT DEFAULT 'active', -- active, inactive, lead
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Si la tabla ya existía de antes, agregamos las columnas nuevas con un bloque DO
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'trade_name') THEN
        ALTER TABLE clients ADD COLUMN trade_name TEXT; 
        ALTER TABLE clients ADD COLUMN business_type TEXT DEFAULT 'retail'; 
        ALTER TABLE clients ADD COLUMN credit_days INTEGER DEFAULT 0; 
        ALTER TABLE clients ADD COLUMN credit_limit DECIMAL(12,2) DEFAULT 0.00;
        ALTER TABLE clients ADD COLUMN status TEXT DEFAULT 'active'; 
    END IF;
END $$;

-- 2. Tabla de Cotizaciones (Quotes)
CREATE TABLE IF NOT EXISTS quotes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    branch_id       UUID REFERENCES branches(id), -- Opcional, por si la cotización es de una sucursal específica
    client_id       UUID NOT NULL REFERENCES clients(id),
    quote_number    SERIAL, -- Autoincremental simple (para visualización)
    status          TEXT DEFAULT 'draft', -- draft, sent, approved, rejected, expired
    subtotal        DECIMAL(12,2) DEFAULT 0.00,
    tax             DECIMAL(12,2) DEFAULT 0.00,
    total           DECIMAL(12,2) DEFAULT 0.00,
    notes           TEXT, -- "Excel" feel: caja de notas libres
    valid_until     TIMESTAMPTZ, -- Fecha de expiración (generalmente +15 o +30 días)
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Partidas de la Cotización (Quote Items)
-- No usa llaves foráneas estrictas de producto para permitir "Artículos libres" (Fricción cero)
CREATE TABLE IF NOT EXISTS quote_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id        UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES products(id), -- Opcional: Si el producto existe en el catálogo
    concept         TEXT NOT NULL, -- "Tubo 35mm" o "Mano de obra". Obligatorio, esté o no en BD.
    quantity        DECIMAL(12,2) NOT NULL DEFAULT 1.00,
    unit_price      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    discount        DECIMAL(12,2) DEFAULT 0.00,
    subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0.00
);

-- 4. Órdenes de Trabajo / Pedidos B2B (Sales Orders)
-- Cuando la cotización se aprueba, se convierte en Order y afecta inventario (committed)
CREATE TABLE IF NOT EXISTS b2b_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    branch_id       UUID REFERENCES branches(id),
    client_id       UUID NOT NULL REFERENCES clients(id),
    quote_id        UUID REFERENCES quotes(id), -- Trazabilidad: De qué cotización vino
    order_number    SERIAL,
    status          TEXT DEFAULT 'pending', -- pending, processing, shipped, invoiced, cancelled
    total           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    delivery_date   TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS b2b_order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    b2b_order_id    UUID NOT NULL REFERENCES b2b_orders(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES products(id),
    concept         TEXT NOT NULL,
    quantity        DECIMAL(12,2) NOT NULL DEFAULT 1,
    unit_price      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0.00
);
