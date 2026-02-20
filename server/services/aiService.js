'use strict';

const OpenAI = require('openai');

// Cliente OpenAI inicializado con la API key del entorno
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Genera un embedding vectorial para el texto proporcionado.
 * Usa el modelo text-embedding-3-small (1536 dimensiones).
 * @param {string} text - Texto a vectorizar
 * @returns {Promise<number[]>} Array de floats representando el vector
 */
async function createEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.replace(/\n/g, ' ').trim(),
  });
  return response.data[0].embedding;
}

/**
 * Envía una conversación al modelo de chat con contexto de inventario.
 * @param {Array<{role: string, content: string}>} messages - Historial de mensajes
 * @param {string} [context=''] - Contexto adicional de inventario inyectado como system
 * @returns {Promise<string>} Texto de respuesta del asistente
 */
async function chat(messages, context = '') {
  const systemPrompt = [
    'Eres un asistente experto en gestión de inventarios industriales.',
    'Responde de forma concisa y técnica.',
    context ? `\n\nContexto de inventario actual:\n${context}` : '',
  ].join('');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
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
