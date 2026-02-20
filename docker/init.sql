-- Inicialización de la base de datos Agentica Inventory
-- Habilitar extensión pgvector para búsqueda semántica
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla principal de productos/inventario
CREATE TABLE IF NOT EXISTS products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle          TEXT,
    title           TEXT NOT NULL,
    sku             TEXT UNIQUE,
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
    -- Vector de embeddings para búsqueda semántica (text-embedding-3-small: 1536 dims)
    embedding       VECTOR(1536),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice HNSW para búsqueda por similitud coseno (pgvector)
CREATE INDEX IF NOT EXISTS products_embedding_idx
    ON products USING hnsw (embedding vector_cosine_ops);

-- Índices para búsqueda y filtrado rápido
CREATE INDEX IF NOT EXISTS products_handle_idx ON products(handle);
CREATE INDEX IF NOT EXISTS products_sku_idx ON products(sku);

-- Tabla de usuarios para autenticación
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT DEFAULT 'admin',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de webhooks registrados
CREATE TABLE IF NOT EXISTS webhooks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url        TEXT NOT NULL,
    events     TEXT[] NOT NULL,
    active     BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
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
