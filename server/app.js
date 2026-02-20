'use strict';

// Cargar variables de entorno antes que cualquier otro módulo
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const path    = require('path');
const YAML    = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const rateLimit = require('express-rate-limit');

// Rutas
const inventoryRoutes = require('./routes/inventory.routes');
const chatRoutes      = require('./routes/chat.routes');
const authRoutes      = require('./routes/auth.routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares de seguridad y parsing ───────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting global ─────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,                  // máximo de peticiones por ventana por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en 15 minutos.' },
});

// Rate limiting más estricto para autenticación (prevenir fuerza bruta)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación. Intenta de nuevo en 15 minutos.' },
});

app.use(globalLimiter);

// ── Health check (sin autenticación) ────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Swagger UI ───────────────────────────────────────────────────────────────
try {
  const swaggerDoc = YAML.load(path.join(__dirname, '../swagger.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
} catch (err) {
  console.warn('[Swagger] No se pudo cargar swagger.yaml:', err.message);
}

// ── Rutas de la API ──────────────────────────────────────────────────────────
app.use('/api/auth',      authLimiter, authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/chat',      chatRoutes);

// ── Manejo de rutas no encontradas ──────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ── Middleware de errores global ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
});

// ── Arranque del servidor ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Agentica API] Servidor escuchando en http://localhost:${PORT}`);
  console.log(`[Agentica API] Docs disponibles en http://localhost:${PORT}/api-docs`);
});

module.exports = app;
