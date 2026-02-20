'use strict';

const { Pool } = require('pg');

// Pool de conexiones a PostgreSQL configurado desde variables de entorno
const pool = new Pool({
  host:     process.env.POSTGRES_HOST     || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user:     process.env.POSTGRES_USER     || 'agentica',
  password: process.env.POSTGRES_PASSWORD || 'agentica_secret',
  database: process.env.POSTGRES_DB       || 'agentica_inventory',
  max:      10,                // máximo de conexiones en el pool
  idleTimeoutMillis: 30000,   // tiempo de espera en inactividad
  connectionTimeoutMillis: 2000,
});

// Verificar conexión al iniciar
pool.on('connect', () => {
  console.log('[DB] Nueva conexión establecida con PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en el pool de conexiones:', err.message);
});

module.exports = pool;
