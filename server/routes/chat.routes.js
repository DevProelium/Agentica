'use strict';

const express    = require('express');
const controller = require('../controllers/chatController');
const auth       = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/chat/chat — Conversación con el asistente IA
router.post('/chat',   auth, controller.chat);

// GET /api/chat/search — Búsqueda semántica de productos
router.get('/search',  auth, controller.search);

module.exports = router;
