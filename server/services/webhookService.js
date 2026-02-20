'use strict';

const pool = require('../models/db');

/**
 * Registra un webhook en la base de datos.
 * @param {string} url - URL de destino del webhook
 * @param {string[]} events - Lista de eventos a suscribir
 * @returns {Promise<object>} Webhook registrado
 */
async function registerWebhook(url, events) {
  if (!url || !Array.isArray(events) || events.length === 0) {
    throw new Error('URL y al menos un evento son requeridos');
  }

  const result = await pool.query(
    `INSERT INTO webhooks (url, events)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [url, events]
  );

  return result.rows[0];
}

/**
 * Envía una notificación HTTP POST a todos los webhooks registrados para el evento.
 * @param {string} event - Nombre del evento disparado
 * @param {object} data  - Payload del evento
 */
async function notifyWebhook(event, data) {
  let rows = [];
  try {
    const result = await pool.query(
      "SELECT url FROM webhooks WHERE active = TRUE AND $1 = ANY(events)",
      [event]
    );
    rows = result.rows;
  } catch (err) {
    console.error('[Webhook] Error al consultar webhooks:', err.message);
    return;
  }

  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

  for (const { url } of rows) {
    try {
      // Usar fetch nativo de Node 18+ o caer en http
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      await globalThis.fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    payload,
        signal:  controller.signal,
      });

      clearTimeout(timeout);
      console.log(`[Webhook] Notificación enviada a ${url} para evento '${event}'`);
    } catch (err) {
      console.error(`[Webhook] Error al notificar ${url}:`, err.message);
    }
  }
}

module.exports = { registerWebhook, notifyWebhook };
