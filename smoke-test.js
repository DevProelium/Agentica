#!/usr/bin/env node
'use strict';

/**
 * smoke-test.js — Pruebas básicas de humo para Agentica Inventory API
 * Ejecutar con: node smoke-test.js
 * Requiere que el servidor esté corriendo en localhost:3000
 */

const BASE = 'http://localhost:3000';
let   token = '';
let   passed = 0;
let   failed = 0;

/**
 * Wrapper fetch con timeout de 5 segundos.
 */
async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ejecuta una prueba y registra el resultado.
 */
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ── Pruebas ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🔍 Agentica Inventory — Smoke Tests\n');

  // 1. Health check
  await test('GET /health → 200', async () => {
    const res = await request('/health');
    assert(res.status === 200, `Status esperado 200, obtenido ${res.status}`);
    const body = await res.json();
    assert(body.status === 'ok', `body.status debe ser "ok", obtenido "${body.status}"`);
  });

  // 2. Login con credenciales del entorno
  await test('POST /api/auth/login → 200 con token', async () => {
    const res = await request('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123',
      }),
    });
    assert(res.status === 200, `Status esperado 200, obtenido ${res.status}`);
    const body = await res.json();
    assert(body.token, 'Respuesta debe incluir campo "token"');
    token = body.token;
  });

  // 3. Login con credenciales incorrectas
  await test('POST /api/auth/login con credenciales incorrectas → 401', async () => {
    const res = await request('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: 'wrong', password: 'wrong' }),
    });
    assert(res.status === 401, `Status esperado 401, obtenido ${res.status}`);
  });

  // 4. Acceso a ruta protegida sin token
  await test('GET /api/inventory sin token → 401', async () => {
    const res = await request('/api/inventory');
    assert(res.status === 401, `Status esperado 401, obtenido ${res.status}`);
  });

  // 5. Listar productos con token
  await test('GET /api/inventory con token → 200', async () => {
    assert(token, 'Se requiere token del paso anterior');
    const res = await request('/api/inventory', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(res.status === 200, `Status esperado 200, obtenido ${res.status}`);
    const body = await res.json();
    assert(typeof body.total === 'number', 'Respuesta debe tener campo "total"');
    assert(Array.isArray(body.products), 'Respuesta debe tener campo "products" array');
  });

  // 6. Ruta inexistente
  await test('GET /api/no-existe → 404', async () => {
    const res = await request('/api/no-existe');
    assert(res.status === 404, `Status esperado 404, obtenido ${res.status}`);
  });

  // ── Resumen ─────────────────────────────────────────────────────────────────
  console.log(`\n📊 Resultado: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en smoke tests:', err.message);
  process.exit(1);
});
