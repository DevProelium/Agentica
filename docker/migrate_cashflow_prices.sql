-- Migración para el Módulo de Flujo de Efectivo Simple y Multitarifas

-- 1. Ampliar tabla de productos para soportar 3 niveles de precios y costo
ALTER TABLE products ADD COLUMN cost DECIMAL(12,2) DEFAULT 0.00;
ALTER TABLE products ADD COLUMN price_retail DECIMAL(12,2) DEFAULT 0.00; -- Menudeo (precio base actual)
ALTER TABLE products ADD COLUMN price_mid DECIMAL(12,2) DEFAULT 0.00;    -- Medio mayoreo
ALTER TABLE products ADD COLUMN price_wholesale DECIMAL(12,2) DEFAULT 0.00; -- Mayoreo

-- 2. Asegurarse de que el precio de menudeo se iguale al "price" antiguo si "price_retail" es 0
UPDATE products SET price_retail = price WHERE price_retail = 0 AND price > 0;

-- 3. Tabla de Gastos (Expenses - Renta, Luz, Salarios)
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    branch_id UUID REFERENCES branches(id),
    category TEXT NOT NULL, -- 'salary', 'rent', 'utilities', 'other', 'internet'
    amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    description TEXT,
    expense_date DATE DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expenses_tenant_idx ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(expense_date);
