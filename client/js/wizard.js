/**
 * wizard.js — Wizard multi-paso para importación de archivos CSV
 * Paso 1: Selección de archivo
 * Paso 2: Vista previa de las primeras filas
 * Paso 3: Confirmación y subida a la API
 */

/* global enqueueSync */

(function () {
  'use strict';

  const API_BASE = '';

  let selectedFile = null;

  // ── Referencias DOM ─────────────────────────────────────────────────────────
  const dropzone     = document.getElementById('dropzone');
  const fileInput    = document.getElementById('csv-file');
  const step1Panel   = document.getElementById('wizard-step-1');
  const step2Panel   = document.getElementById('wizard-step-2');
  const step3Panel   = document.getElementById('wizard-step-3');
  const nextBtn1     = document.getElementById('wizard-next-1');
  const backBtn2     = document.getElementById('wizard-back-2');
  const nextBtn2     = document.getElementById('wizard-next-2');
  const restartBtn   = document.getElementById('wizard-restart');
  const previewWrap  = document.getElementById('preview-table-wrapper');
  const progressBlock = document.getElementById('upload-progress');
  const resultBlock  = document.getElementById('upload-result');

  if (!dropzone) return; // La vista de wizard puede no estar presente

  // ── Utilidades ──────────────────────────────────────────────────────────────

  function setStep(stepNum) {
    document.querySelectorAll('.step').forEach((el) => {
      const n = parseInt(el.dataset.step, 10);
      el.classList.remove('active', 'done');
      if (n < stepNum)  el.classList.add('done');
      if (n === stepNum) el.classList.add('active');
    });
    step1Panel.classList.toggle('hidden', stepNum !== 1);
    step2Panel.classList.toggle('hidden', stepNum !== 2);
    step3Panel.classList.toggle('hidden', stepNum !== 3);
  }

  /**
   * Lee las primeras N líneas de un archivo CSV y genera una tabla HTML de vista previa.
   * @param {File} file
   * @param {number} [maxRows=5]
   * @returns {Promise<string>} HTML de la tabla
   */
  function previewCSV(file, maxRows = 5) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text  = e.target.result;
        const lines = text.split('\n').filter((l) => l.trim());
        const rows  = lines.slice(0, maxRows + 1).map((l) =>
          // Separación simple por coma; respeta celdas con comillas básicas
          l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) =>
            c.replace(/^"|"$/g, '').trim()
          )
        );

        if (rows.length === 0) return resolve('<p>Archivo vacío</p>');

        const headers = rows[0];
        const data    = rows.slice(1);

        const ths = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
        const trs = data.map((row) =>
          `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
        ).join('');

        resolve(`
          <table class="products-table">
            <thead><tr>${ths}</tr></thead>
            <tbody>${trs}</tbody>
          </table>
        `);
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsText(file);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function authHeaders() {
    const token = localStorage.getItem('agentica_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // ── Manejadores de eventos ───────────────────────────────────────────────────

  async function handleSelectedFile(file) {
    if (!file) return;

    let processedFile = file;

    // Si es Excel, convertirlo en vuelo a CSV usando SheetJS
    if (file.name.match(/\.(xlsx|xls)$/i)) {
      try {
        dropzone.querySelector('p').textContent = `Convirtiendo Excel...`;
        const data = await file.arrayBuffer();
        // Verificar si existe la librería XLSX globalmente (cargada por index.html)
        if (typeof XLSX === 'undefined') {
          throw new Error('La librería SheetJS no está cargada');
        }
        const workbook = XLSX.read(data);
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        
        // Crear un nuevo File disfrazado de CSV
        processedFile = new File([csvText], file.name.replace(/\.(xlsx|xls)$/i, '.csv'), {
          type: 'text/csv'
        });
      } catch (err) {
        alert('Error procesando el archivo Excel: ' + err.message);
        return;
      }
    }

    if (!processedFile.name.match(/\.csv$/i)) {
      alert('Formato no soportado. Sube un archivo CSV o Excel (.xls, .xlsx)');
      return;
    }

    selectedFile = processedFile;
    nextBtn1.disabled = false;
    dropzone.querySelector('p').textContent = `Archivo seleccionado: ${file.name}`;
  }

  // Selección de archivo por input
  fileInput.addEventListener('change', () => {
    handleSelectedFile(fileInput.files[0]);
  });

  // Drag & drop en la zona de soltar
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    handleSelectedFile(e.dataTransfer.files[0]);
  });

  // Clic en dropzone abre el input de archivo
  dropzone.addEventListener('click', () => fileInput.click());

  // Paso 1 → 2: Mostrar vista previa
  nextBtn1.addEventListener('click', async () => {
    if (!selectedFile) return;
    try {
      const tableHtml = await previewCSV(selectedFile);
      previewWrap.innerHTML = tableHtml;
      setStep(2);
    } catch (err) {
      alert('Error al previsualizar el archivo: ' + err.message);
    }
  });

  // Paso 2 → 1: Volver
  backBtn2.addEventListener('click', () => setStep(1));

  // Paso 2 → 3: Subir el archivo
  nextBtn2.addEventListener('click', async () => {
    setStep(3);
    progressBlock.classList.remove('hidden');
    resultBlock.classList.add('hidden');
    restartBtn.classList.add('hidden');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      if (!navigator.onLine) {
        // Encolar como base64 para poder serializar en IndexedDB
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = btoa(e.target.result);
          await enqueueSync('upload', { fileBase64: base64, fileName: selectedFile.name });
          showResult({
            message: 'Sin conexión. La subida se procesará automáticamente cuando haya internet.',
            stats:   { inserted: 0, updated: 0, errors: [] },
          }, false);
        };
        reader.readAsBinaryString(selectedFile);
        return;
      }

      const res = await fetch(`${API_BASE}/api/inventory/upload`, {
        method:  'POST',
        headers: authHeaders(),
        body:    formData,
      });

      const body = await res.json();

      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      showResult(body, true);
    } catch (err) {
      showResult({ message: err.message, stats: { inserted: 0, updated: 0, errors: [err.message] } }, false);
    }
  });

  // Reiniciar wizard
  restartBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    nextBtn1.disabled = true;
    dropzone.querySelector('p').innerHTML = 'Arrastra tu archivo aquí o <label for="csv-file" class="link-btn">elige un archivo</label>';
    setStep(1);
  });

  /**
   * Muestra el resultado de la importación en el paso 3.
   */
  function showResult(body, success) {
    progressBlock.classList.add('hidden');
    resultBlock.classList.remove('hidden');
    resultBlock.className = `result-block ${success ? 'success' : 'error'}`;

    const stats = body.stats || {};
    const errors = Array.isArray(stats.errors) ? stats.errors : [];

    resultBlock.innerHTML = `
      <div class="result-stat">
        <span class="result-stat-key">Mensaje</span>
        <span class="result-stat-value">${escapeHtml(body.message || '')}</span>
      </div>
      <div class="result-stat">
        <span class="result-stat-key">Insertados</span>
        <span class="result-stat-value">${stats.inserted ?? 0}</span>
      </div>
      <div class="result-stat">
        <span class="result-stat-key">Actualizados</span>
        <span class="result-stat-value">${stats.updated ?? 0}</span>
      </div>
      <div class="result-stat">
        <span class="result-stat-key">Errores</span>
        <span class="result-stat-value">${errors.length}</span>
      </div>
      ${errors.length > 0 ? `<ul style="margin-top:0.75rem;padding-left:1rem;font-size:0.8rem;color:var(--danger)">
        ${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}
      </ul>` : ''}

      <div style="margin-top: 1.5rem; text-align: center;">
        <button id="wizard-finish-btn" class="btn-primary" style="width: 100%;">Ver en Inventario</button>
      </div>
    `;

    // Botón para finalizar y ver el inventario
    const finishBtn = document.getElementById('wizard-finish-btn');
    if (finishBtn) {
      finishBtn.addEventListener('click', () => {
        // Redirigir al dashboard
        document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
        document.querySelector('.nav-btn[data-view="dashboard"]').classList.add('active');
        
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        document.getElementById('view-dashboard').classList.add('active');
        
        // Recargar productos (si existe la función global)
        if (typeof window.loadProducts === 'function') {
          window.loadProducts();
        } else {
          // Fallback simple: recargar página
          location.reload();
        }
      });
    }

    restartBtn.classList.remove('hidden');
  }

  // Inicializar en paso 1
  setStep(1);
})();
