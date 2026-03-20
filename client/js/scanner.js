(function() {
  'use strict';

  // ── Configuración ──────────────────────────────────────────────────────────
  const API_BASE = (typeof window.API_BASE !== 'undefined' ? window.API_BASE : '') || '';
  
  // Elementos DOM
  const scannerInput  = document.getElementById('scanner-input');
  const scannerQty    = document.getElementById('scanner-qty');
  const feedbackEl    = document.getElementById('scanner-feedback');
  const historyList   = document.getElementById('scanner-log');
  const toggleBtns    = document.querySelectorAll('.toggle-btn');
  const cameraBtn     = document.getElementById('camera-scan-btn');
  const viewScanner   = document.getElementById('view-scanner');

  let currentAction   = 'add'; // 'add' | 'subtract'

  // ── Inicialización ─────────────────────────────────────────────────────────

  function init() {
    // Detectar cuando la vista se activa para hacer focus
    document.querySelectorAll('.nav-btn[data-view="scanner"]').forEach(btn => {
      btn.addEventListener('click', () => {
        setTimeout(() => {
          scannerInput.focus();
        }, 300);
      });
    });

    // Escuchar "Enter" en el input (scanners USB envían Enter al final)
    scannerInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const sku = scannerInput.value.trim();
        if (sku) {
          await processScan(sku);
          scannerInput.value = ''; // Limpiar para el siguiente scan
        }
      }
    });

    // Toggle Entrada/Salida
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toggleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentAction = btn.dataset.action === 'subtract' ? 'subtract' : 'add';
        scannerInput.focus();
      });
    });

    // Botón de cámara (placeholder por ahora)
    if (cameraBtn) {
      cameraBtn.addEventListener('click', () => {
        alert('Funcionalidad de cámara en desarrollo (usa un escáner USB o teclea el SKU)');
        scannerInput.focus();
      });
    }
  }

  // ── Lógica de escaneo ──────────────────────────────────────────────────────

  /**
   * Procesa el código escaneado enviándolo al backend.
   * @param {string} sku - Código de barras
   */
  async function processScan(sku) {
    showLoading();
    
    const qtyInput = parseInt(scannerQty.value, 10) || 1;
    // Si es salida, convertimos a negativo
    const quantity = currentAction === 'subtract' ? -qtyInput : qtyInput;
    
    // Razón automática
    const reason = currentAction === 'subtract' ? 'quick_scan_out' : 'quick_scan_in';

    try {
      const res = await fetch(`${API_BASE}/api/inventory/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({
          sku,
          quantity,
          type: 'adjustment',
          reason
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar escaneo');
      }

      showSuccess(data.data, quantity);
      addToHistory(sku, quantity, data.data.new_stock);

    } catch (err) {
      showError(err.message, sku);
      playErrorSound();
    }
  }

  // ── UI Feedback ────────────────────────────────────────────────────────────

  function showLoading() {
    feedbackEl.className = 'scanner-feedback loading';
    feedbackEl.textContent = 'Procesando...';
    feedbackEl.classList.remove('hidden');
  }

  function showSuccess(data, qty) {
    feedbackEl.className = 'scanner-feedback success';
    const actionText = qty > 0 ? 'Entrada' : 'Salida';
    feedbackEl.innerHTML = `
      <strong>¡Éxito!</strong><br>
      SKU: ${data.sku}<br>
      ${actionText}: ${Math.abs(qty)}<br>
      Nuevo Stock: <strong>${data.new_stock}</strong>
    `;
    playSuccessSound();
  }

  function showError(msg, sku) {
    feedbackEl.className = 'scanner-feedback error';
    feedbackEl.innerHTML = `
      <strong>Error</strong><br>
      SKU: ${sku || '?'}<br>
      ${msg}
    `;
  }

  function addToHistory(sku, qty, newStock) {
    const li = document.createElement('li');
    li.className = 'history-item';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const sign = qty > 0 ? '+' : '';
    
    li.innerHTML = `
      <span class="hist-time">${time}</span>
      <span class="hist-sku">${sku}</span>
      <span class="hist-qty ${qty > 0 ? 'positive' : 'negative'}">${sign}${qty}</span>
      <span class="hist-stock">Stock: ${newStock}</span>
    `;
    
    // Insertar al principio
    historyList.insertBefore(li, historyList.firstChild);
    
    // Limitar historial a 10 items
    if (historyList.children.length > 10) {
      historyList.removeChild(historyList.lastChild);
    }
  }

  // ── Sonidos (Feedback auditivo para operación "blind") ──────────────────────
  
  function playSuccessSound() {
    // Beep agudo corto
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
    osc.stop(ctx.currentTime + 0.1);
  }

  function playErrorSound() {
    // Beep grave largo
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function authHeaders() {
    const token = localStorage.getItem('agentica_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // Inicializar al cargar
  window.addEventListener('DOMContentLoaded', init);

})();
