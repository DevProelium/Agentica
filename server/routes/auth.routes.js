'use strict';

const express  = require('express');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const pool     = require('../models/db');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';

/**
 * POST /api/auth/login
 * Autentica al usuario y devuelve un JWT válido por 8 horas.
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    // Buscar usuario en la base de datos (incluyendo tenant y branch)
    const result = await pool.query(
      `SELECT u.id, u.username, u.password_hash, u.role, 
              u.tenant_id, u.branch_id,
              t.name AS tenant_name,
              b.name AS branch_name
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.username = $1`,
      [username]
    );

    console.log('[Auth] Login attempt for username:', username);
    console.log('[Auth] Query returned rows:', result.rows.length);
    if (result.rows.length > 0) {
      console.log('[Auth] User found:', result.rows[0].username, 'tenant_id:', result.rows[0].tenant_id);
      console.log('[Auth] Password hash prefix:', result.rows[0].password_hash.substring(0, 30));
    }

    let user = result.rows[0];

    // Fallback: usuario admin desde variables de entorno (solo en desarrollo)
    if (!user) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      
      // Si decide usarse lógica de environment variables, iría aquí, 
      // pero por ahora mantenemos limpio el auth contra DB.
    }

    if (!user) {
      console.log('[Auth] No user found');
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verificar contraseña con bcrypt
    console.log('[Auth] Comparing password with bcrypt...');
    const valid = await bcrypt.compare(password, user.password_hash);
    console.log('[Auth] Bcrypt compare result:', valid);
    if (!valid) {
      console.log('[Auth] Password mismatch');
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        tenant_id: user.tenant_id,
        branch_id: user.branch_id
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    console.log('[Auth] Login successful, token generated');
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        tenant_id: user.tenant_id,
        branch_id: user.branch_id,
        tenant_name: user.tenant_name,
        branch_name: user.branch_name
      } 
    });
  } catch (err) {
    console.error('[Auth] Error during login:', err);
    next(err);
  }
});

/**
 * POST /api/auth/register
 * Registra un nuevo usuario (opcional; puede deshabilitarse en producción).
 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || password.length < 8) {
      return res.status(400).json({
        error: 'Usuario requerido y contraseña de al menos 8 caracteres',
      });
    }

    // Hashear contraseña con bcrypt (coste 12)
    const hash = await bcrypt.hash(password, 12);

    // Tenant por defecto (Agentica System)
    const defaultTenantId = '00000000-0000-0000-0000-000000000001';
    // Branch NULL (admin de tenant) por defecto
    const defaultBranchId = null;

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, tenant_id, branch_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, role, tenant_id, branch_id`,
      [username, hash, defaultTenantId, defaultBranchId]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      // Violación de UNIQUE en username
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }
    next(err);
  }
});

module.exports = router;
