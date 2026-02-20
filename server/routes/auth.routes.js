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

    // Buscar usuario en la base de datos
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    // Fallback: usuario admin desde variables de entorno (solo en desarrollo)
    let user = result.rows[0];
    if (!user) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const envUser = process.env.ADMIN_USERNAME;
      const envPass = process.env.ADMIN_PASSWORD;

      if (envUser && envPass && username === envUser) {
        const validEnv = await bcrypt.compare(password, await bcrypt.hash(envPass, 12));
        if (validEnv) {
          user = { id: 'env-admin', username: envUser, role: 'admin' };
        }
      }

      if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
    } else {
      // Verificar contraseña con bcrypt
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
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

    const result = await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, role`,
      [username, hash]
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
