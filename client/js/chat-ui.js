/**
 * chat-ui.js — Interfaz de chat con el asistente IA de inventario
 * Maneja el envío de mensajes y renderizado de respuestas.
 */

(function () {
  'use strict';

  const API_BASE = 'http://localhost:3000';

  // Historial de mensajes para mantener contexto de la conversación
  const messageHistory = [];

  // ── Referencias DOM ─────────────────────────────────────────────────────────
  const chatMessages = document.getElementById('chat-messages');
  const chatForm     = document.getElementById('chat-form');
  const chatInput    = document.getElementById('chat-input');

  if (!chatForm) return; // Vista no activa

  // ── Utilidades ──────────────────────────────────────────────────────────────

  function authHeaders() {
    const token = localStorage.getItem('agentica_token');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  /**
   * Añade un mensaje al área de chat y hace scroll hasta él.
   * @param {'user'|'assistant'} role
   * @param {string} content
   * @param {boolean} [loading=false] - Muestra indicador de carga si es true
   * @returns {HTMLElement} Elemento del burbuja creado
   */
  function appendMessage(role, content, loading = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg ${role}`;

    const avatar = document.createElement('span');
    avatar.className = 'msg-avatar';
    avatar.textContent = role === 'assistant' ? '⬡' : '👤';

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble${loading ? ' loading' : ''}`;
    bubble.innerHTML = loading ? '…' : escapeHtml(content);

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return bubble;
  }

  // ── Envío de mensajes ────────────────────────────────────────────────────────

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value    = '';
    chatInput.disabled = true;

    // Mostrar mensaje del usuario
    appendMessage('user', text);
    messageHistory.push({ role: 'user', content: text });

    // Placeholder de "escribiendo…"
    const loadingBubble = appendMessage('assistant', '', true);

    try {
      const res = await fetch(`${API_BASE}/api/chat/chat`, {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({ messages: messageHistory }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const { reply } = await res.json();

      // Reemplazar placeholder con la respuesta real
      loadingBubble.classList.remove('loading');
      loadingBubble.innerHTML = escapeHtml(reply);
      chatMessages.scrollTop  = chatMessages.scrollHeight;

      // Agregar al historial para mantener contexto
      messageHistory.push({ role: 'assistant', content: reply });

      // Limitar historial a las últimas 20 interacciones para no exceder tokens
      if (messageHistory.length > 40) messageHistory.splice(0, 2);
    } catch (err) {
      loadingBubble.classList.remove('loading');
      loadingBubble.style.color = 'var(--danger)';
      loadingBubble.textContent = `Error: ${err.message}`;
      console.error('[Chat] Error:', err);
    } finally {
      chatInput.disabled = false;
      chatInput.focus();
    }
  });

  // Atajo de teclado: Enter envía, Shift+Enter hace salto de línea
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });
})();
