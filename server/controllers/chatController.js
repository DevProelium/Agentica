'use strict';

const aiService        = require('../services/aiService');
const inventoryService = require('../services/inventoryService');

/**
 * POST /api/chat/chat
 * Envía mensajes al LLM con contexto opcional de inventario.
 * Body: { messages: [{role, content}], productContext?: string }
 */
async function chat(req, res, next) {
  try {
    const { messages, productContext } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Se requiere el array "messages"' });
    }

    // Sanitizar mensajes: solo role y content permitidos
    const sanitized = messages.map(({ role, content }) => ({
      role:    ['system', 'user', 'assistant'].includes(role) ? role : 'user',
      content: String(content).slice(0, 4096),
    }));

    const reply = await aiService.chat(sanitized, productContext || '');
    res.json({ reply });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/chat/search?q=...
 * Búsqueda semántica de productos usando embeddings.
 */
async function search(req, res, next) {
  try {
    const { q, limit, offset } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Parámetro "q" requerido' });
    }

    const result = await inventoryService.getProducts(q, limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { chat, search };
