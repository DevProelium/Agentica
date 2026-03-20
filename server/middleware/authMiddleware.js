'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';

/**
 * Middleware de autenticación JWT.
 * Verifica el header Authorization: Bearer <token>.
 * Adjunta req.user con el payload decodificado si el token es válido.
 * Además adjunta req.tenantId y req.branchId para filtrado multi‑tenant.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  const token = authHeader.slice(7); // Eliminar "Bearer "

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.tenantId = decoded.tenant_id;
    req.branchId = decoded.branch_id;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = authMiddleware;
