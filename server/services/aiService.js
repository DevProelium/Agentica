'use strict';

const OpenAI = require('openai');

console.log('[AI Debug] Key loaded:', process.env.OPENAI_API_KEY ? (process.env.OPENAI_API_KEY.substring(0, 5) + '...') : 'FAILED');
console.log('[AI Debug] Base URL:', process.env.OPENAI_BASE_URL);

// Cliente OpenAI (Para DeepSeek / Chat)
const openaiChat = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
  baseURL: process.env.OPENAI_BASE_URL,
});

// Cliente de embeddings en la nube (DashScope / Qwen via MuleRouter)
// Para SaaS POS+Inventory, embeddings deben ser 100% cloud (1536 dimensiones)
const openaiEmbeddings = new OpenAI({
  apiKey: process.env.EMBEDDING_API_KEY,
  baseURL: process.env.EMBEDDING_BASE_URL,
});

// Modelos configurables (cloud‑only para SaaS POS+Inventory)
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v3'; // DashScope / Qwen
const CHAT_MODEL      = process.env.AI_MODEL_CHAT   || 'deepseek-chat';     // DeepSeek

/**
 * Genera un embedding vectorial para el texto proporcionado.
 * Usa Qwen text-embedding-v3 (DashScope) via MuleRouter – 1536 dimensiones.
 * Requiere conexión a internet (cloud‑only) – parte de la suite SaaS POS+Inventory.
 * @param {string} text - Texto a vectorizar
 * @returns {Promise<number[]>} Array de 1536 floats
 */
async function createEmbedding(text) {
  const response = await openaiEmbeddings.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.replace(/\n/g, ' ').trim(),
    encoding_format: 'float',
  });
  return response.data[0].embedding;
}

/**
 * Envía una conversación al modelo de chat con contexto de inventario.
 * Usa DeepSeek (u otro proveedor configurado) para razonamiento avanzado.
 * @param {Array<{role: string, content: string}>} messages - Historial de mensajes
 * @param {string} [context=''] - Contexto adicional de inventario inyectado como system
 * @returns {Promise<string>} Texto de respuesta del asistente
 */
async function chat(messages, context = '') {
  const systemPrompt = [
    'Eres un asistente experto en gestión de inventarios industriales.',
    'Responde de forma concisa y técnica.',
    context ? `\n\nContexto de inventario actual (RAG):\n${context}` : '',
  ].join('');

  const completion = await openaiChat.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.3,
    max_tokens: 1024,
  });

  return completion.choices[0].message.content;
}

module.exports = { createEmbedding, chat };
