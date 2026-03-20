-- Migración para cambiar índice único de SKU a (tenant_id, sku)
-- Ejecutar con: psql -U agentica -d agentica_inventory -h localhost -p 5435 -f migrate_sku_tenant_unique.sql
-- O desde dentro del contenedor: docker exec -i agentica_db psql -U agentica -d agentica_inventory -f /docker-entrypoint-initdb.d/migrate_sku_tenant_unique.sql

-- ===========================================
-- 1. ASIGNAR TENANT Y BRANCH A PRODUCTOS EXISTENTES (si están NULL)
-- ===========================================

-- Tenant por defecto (Agentica System)
UPDATE products 
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Branch NULL (matriz) para productos existentes (inventario de matriz)
UPDATE products 
SET branch_id = NULL
WHERE branch_id IS NULL;

-- ===========================================
-- 2. ELIMINAR ÍNDICE ÚNICO ANTIGUO (sku)
-- ===========================================

DROP INDEX IF EXISTS products_sku_unique_idx;

-- ===========================================
-- 3. CREAR NUEVO ÍNDICE ÚNICO (tenant_id, sku) donde sku NO es NULL
-- ===========================================

CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_sku_unique_idx 
ON products(tenant_id, sku) WHERE sku IS NOT NULL;

-- ===========================================
-- 4. ACTUALIZAR COLUMNAS tenant_id y branch_id a NOT NULL (opcional, pero recomendado)
--    Primero verificamos que no haya NULLs, luego alteramos.
-- ===========================================

-- Asegurar que tenant_id no sea NULL en productos con SKU (ya lo aseguramos arriba)
-- Podemos hacer que tenant_id sea NOT NULL en todos los productos, pero algunos podrían no tener SKU.
-- Por ahora mantenemos nullable, pero podemos agregar restricción NOT NULL si queremos.
-- ALTER TABLE products ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE products ALTER COLUMN branch_id SET NOT NULL;

-- ===========================================
-- 5. ÍNDICES ADICIONALES PARA BÚSQUEDA
-- ===========================================

-- (Opcional) Índice para búsqueda por tenant + branch
CREATE INDEX IF NOT EXISTS products_tenant_branch_idx ON products(tenant_id, branch_id);

-- ===========================================
-- 6. VERIFICACIÓN
-- ===========================================

SELECT 
    COUNT(*) AS total_products,
    COUNT(DISTINCT tenant_id) AS distinct_tenants,
    COUNT(*) FILTER (WHERE sku IS NOT NULL) AS with_sku,
    COUNT(*) FILTER (WHERE sku IS NULL) AS without_sku
FROM products;