/**
 * purchases.js — Módulo de Compras, Recepciones y Traspasos — Agentica Inventory
 *
 * Flujo de Compra:
 *   1. Abrir orden (seleccionar proveedor, referencia/folio, fecha)
 *   2. Escanear productos línea por línea (SKU + cantidad + costo unitario)
 *      ↳ Si el producto no existe → modal de registro rápido
 *   3. Opcional: importar nota/factura como texto y que la IA extraiga los ítems
 *   4. Revisar resumen → Confirmar recepción
 *      ↳ Actualiza stock + precio de costo (promedio ponderado) + kardex
 *
 * Flujo de Traspaso:
 *   1. Crear traspaso (sucursal origen → destino)
 *   2. Escanear productos a traspasar
 *   3. "Confirmar envío" → descuenta stock en origen
 *   4. "Confirmar recepción" → suma stock en destino
 */
(function () {
  'use strict';

  const API_BASE = (typeof window.API_BASE !== 'undefined' ? window.API_BASE : '') || '';

  // ── Estado ──────────────────────────────────────────────────────────────────
  const state = {
    mode: 'purchase',       // 'purchase' | 'transfer' | 'history'
    histTab: 'purchases',

    // Compra activa
    purchaseId: null,
    purchaseItems: [],      // cache local [{id, product_id, sku, title, quantity, unit_cost, total_cost}]
    purchaseTotal: 0,

    // Traspaso activo
    transferId: null,
    transferItems: [],      // cache local [{id, product_id, sku, title, quantity, current_stock}]
    transferStatus: 'pending',

    // Catálogos cargados
    suppliers: [],
    branches: [],

    // Producto desconocido pendiente de registro
    pendingBarcode: null,
    pendingContext: null,   // 'purchase' | 'transfer'

    // IA: ítems parseados pendientes de confirmar
    parsedItems: [],

    // callback para modal de confirmación
    pendingConfirm: null,
  };

  const dom = {};

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    cacheDom();
    bindEvents();

    // Activar módulo cuando el usuario navega a la vista
    document.querySelectorAll('.nav-btn[data-view="purchases"]').forEach(btn => {
      btn.addEventListener('click', onViewActivated);
    });
  }

  function cacheDom() {
    // Tabs del módulo
    dom.moduleTabs   = document.querySelectorAll('.purch-module-tab');

    // ── Panel Compra ─────────────────────────────────────────────────────────
    dom.purchPanel        = document.getElementById('purch-panel-purchase');
    dom.purchSupplier     = document.getElementById('purch-supplier');
    dom.purchReference    = document.getElementById('purch-reference');
    dom.purchDate         = document.getElementById('purch-date');
    dom.purchNotes        = document.getElementById('purch-notes');
    dom.purchScanInput    = document.getElementById('purch-scan-input');
    dom.purchQty          = document.getElementById('purch-qty');
    dom.purchCost         = document.getElementById('purch-cost');
    dom.purchAddBtn       = document.getElementById('purch-add-btn');
    dom.purchImportBtn    = document.getElementById('purch-import-doc-btn');
    dom.purchItemsTbody   = document.getElementById('purch-items-tbody');
    dom.purchTotalAmount  = document.getElementById('purch-total-amount');
    dom.purchSaveDraftBtn = document.getElementById('purch-save-draft-btn');
    dom.purchConfirmBtn   = document.getElementById('purch-confirm-btn');
    dom.purchActiveBadge  = document.getElementById('purch-active-order');
    dom.purchOrderIdDisplay = document.getElementById('purch-order-id-display');
    dom.purchNewOrderBtn  = document.getElementById('purch-new-order-btn');
    dom.purchNewSupplierBtn = document.getElementById('purch-new-supplier-btn');

    // ── Panel Traspaso ───────────────────────────────────────────────────────
    dom.transPanel        = document.getElementById('purch-panel-transfer');
    dom.transFromBranch   = document.getElementById('trans-from-branch');
    dom.transToBranch     = document.getElementById('trans-to-branch');
    dom.transNotes        = document.getElementById('trans-notes');
    dom.transScanInput    = document.getElementById('trans-scan-input');
    dom.transQty          = document.getElementById('trans-qty');
    dom.transAddBtn       = document.getElementById('trans-add-btn');
    dom.transItemsTbody   = document.getElementById('trans-items-tbody');
    dom.transSaveBtn      = document.getElementById('trans-save-btn');
    dom.transShipBtn      = document.getElementById('trans-ship-btn');
    dom.transReceiveBtn   = document.getElementById('trans-receive-btn');
    dom.transActiveBadge  = document.getElementById('trans-active-badge');
    dom.transIdDisplay    = document.getElementById('trans-id-display');
    dom.transNewBtn       = document.getElementById('trans-new-btn');

    // ── Panel Historial ──────────────────────────────────────────────────────
    dom.histPanel         = document.getElementById('purch-panel-history');
    dom.histTabs          = document.querySelectorAll('.purch-hist-tab');
    dom.histPurchTbody    = document.getElementById('hist-purchases-tbody');
    dom.histTransTbody    = document.getElementById('hist-transfers-tbody');
    dom.histPurchList     = document.getElementById('hist-purchases-list');
    dom.histTransList     = document.getElementById('hist-transfers-list');
    dom.histRefreshBtn    = document.getElementById('hist-refresh-btn');

    // ── Modales ──────────────────────────────────────────────────────────────
    dom.supplierModal     = document.getElementById('purch-supplier-modal');
    dom.supplierForm      = document.getElementById('purch-supplier-form');
    dom.supplierCancel    = document.getElementById('purch-supplier-cancel');

    dom.regModal          = document.getElementById('purch-reg-modal');
    dom.regForm           = document.getElementById('purch-reg-form');
    dom.regSku            = document.getElementById('purch-reg-sku');
    dom.regTitle          = document.getElementById('purch-reg-title');
    dom.regDesc           = document.getElementById('purch-reg-desc');
    dom.regPrice          = document.getElementById('purch-reg-price');
    dom.regCancel         = document.getElementById('purch-reg-cancel');

    dom.importModal       = document.getElementById('purch-import-modal');
    dom.importFile        = document.getElementById('purch-import-file');
    dom.importText        = document.getElementById('purch-import-text');
    dom.importSubmitBtn   = document.getElementById('purch-import-text-submit');
    dom.importCancel      = document.getElementById('purch-import-cancel');
    dom.importSpinner     = document.getElementById('purch-import-spinner');
    dom.importResults     = document.getElementById('purch-import-results');
    dom.importResultsTbody = document.getElementById('purch-import-results-tbody');
    dom.importConfirmBtn  = document.getElementById('purch-import-confirm');

    dom.confirmModal      = document.getElementById('purch-confirm-modal');
    dom.confirmMessage    = document.getElementById('purch-confirm-message');
    dom.confirmOkBtn      = document.getElementById('purch-confirm-ok');
    dom.confirmCancelBtn  = document.getElementById('purch-confirm-cancel');
  }

  // ── Binding de eventos ──────────────────────────────────────────────────────

  function bindEvents() {
    // Tabs del módulo
    dom.moduleTabs.forEach(tab => {
      tab.addEventListener('click', () => switchMode(tab.dataset.tab));
    });

    // Tabs del historial
    dom.histTabs.forEach(tab => {
      tab.addEventListener('click', () => switchHistTab(tab.dataset.hist));
    });

    // Historial — refrescar
    if (dom.histRefreshBtn) {
      dom.histRefreshBtn.addEventListener('click', loadHistory);
    }

    // ── Compra: escáner ──────────────────────────────────────────────────────
    dom.purchScanInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const sku = dom.purchScanInput.value.trim();
        if (sku) { await handlePurchaseScan(sku); dom.purchScanInput.value = ''; }
      }
    });
    dom.purchAddBtn.addEventListener('click', async () => {
      const sku = dom.purchScanInput.value.trim();
      if (sku) { await handlePurchaseScan(sku); dom.purchScanInput.value = ''; }
    });

    dom.purchSaveDraftBtn.addEventListener('click', savePurchaseDraft);
    dom.purchConfirmBtn.addEventListener('click', confirmPurchaseReception);
    dom.purchNewOrderBtn.addEventListener('click', resetPurchase);
    dom.purchNewSupplierBtn.addEventListener('click', () => openSupplierModal());
    dom.purchImportBtn.addEventListener('click', () => openImportModal());

    // ── Traspaso: escáner ────────────────────────────────────────────────────
    dom.transScanInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const sku = dom.transScanInput.value.trim();
        if (sku) { await handleTransferScan(sku); dom.transScanInput.value = ''; }
      }
    });
    dom.transAddBtn.addEventListener('click', async () => {
      const sku = dom.transScanInput.value.trim();
      if (sku) { await handleTransferScan(sku); dom.transScanInput.value = ''; }
    });

    dom.transSaveBtn.addEventListener('click', saveTransfer);
    dom.transShipBtn.addEventListener('click', confirmShipTransfer);
    dom.transReceiveBtn.addEventListener('click', confirmReceiveTransfer);
    dom.transNewBtn.addEventListener('click', resetTransfer);

    // ── Modal: Nuevo proveedor ───────────────────────────────────────────────
    dom.supplierForm.addEventListener('submit', onSupplierFormSubmit);
    dom.supplierCancel.addEventListener('click', closeSupplierModal);

    // ── Modal: Registro rápido de producto ───────────────────────────────────
    dom.regForm.addEventListener('submit', onProductRegSubmit);
    dom.regCancel.addEventListener('click', closeRegModal);

    // ── Modal: Importar nota/PDF ─────────────────────────────────────────────
    dom.importFile.addEventListener('change', onImportFileChange);
    dom.importSubmitBtn.addEventListener('click', onImportTextSubmit);
    dom.importCancel.addEventListener('click', closeImportModal);
    dom.importConfirmBtn.addEventListener('click', onImportConfirm);

    // ── Modal: Confirmación genérico ─────────────────────────────────────────
    dom.confirmOkBtn.addEventListener('click', () => {
      if (state.pendingConfirm) { state.pendingConfirm(); state.pendingConfirm = null; }
      closeConfirmModal();
    });
    dom.confirmCancelBtn.addEventListener('click', closeConfirmModal);
  }

  // ── Activación de vista ─────────────────────────────────────────────────────

  async function onViewActivated() {
    await loadMetadata();
    if (state.mode === 'history') loadHistory();
    setTimeout(() => {
      if (state.mode === 'purchase') dom.purchScanInput.focus();
      else if (state.mode === 'transfer') dom.transScanInput.focus();
    }, 300);
  }

  async function loadMetadata() {
    try {
      const [suppliers, branches] = await Promise.all([
        apiFetch('/api/purchases/suppliers'),
        apiFetch('/api/purchases/branches'),
      ]);
      state.suppliers = suppliers;
      state.branches  = branches;
      renderSupplierSelect();
      renderBranchSelects();
    } catch (err) {
      console.error('[Purchases] Error cargando metadatos:', err.message);
    }
  }

  // ── Cambio de modo ──────────────────────────────────────────────────────────

  function switchMode(mode) {
    state.mode = mode;
    dom.moduleTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === mode));

    dom.purchPanel.classList.toggle('hidden', mode !== 'purchase');
    dom.transPanel.classList.toggle('hidden', mode !== 'transfer');
    dom.histPanel.classList.toggle('hidden',  mode !== 'history');

    if (mode === 'history') loadHistory();
    if (mode === 'purchase') setTimeout(() => dom.purchScanInput.focus(), 200);
    if (mode === 'transfer') setTimeout(() => dom.transScanInput.focus(), 200);
  }

  function switchHistTab(tab) {
    state.histTab = tab;
    dom.histTabs.forEach(t => t.classList.toggle('active', t.dataset.hist === tab));
    dom.histPurchList.classList.toggle('hidden', tab !== 'purchases');
    dom.histTransList.classList.toggle('hidden', tab !== 'transfers');
  }

  // ── Renders de selectores ────────────────────────────────────────────────────

  function renderSupplierSelect() {
    const sel = dom.purchSupplier;
    const cur = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    state.suppliers.forEach(s => {
      const opt = new Option(s.name, s.id);
      sel.add(opt);
    });
    sel.value = cur;
  }

  function renderBranchSelects() {
    [dom.transFromBranch, dom.transToBranch].forEach(sel => {
      const cur = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      state.branches.forEach(b => {
        const opt = new Option(`${b.name}${b.code ? ' (' + b.code + ')' : ''}`, b.id);
        sel.add(opt);
      });
      sel.value = cur;
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // COMPRAS
  // ────────────────────────────────────────────────────────────────────────────

  async function savePurchaseDraft() {
    if (state.purchaseId) {
      showToast('La orden ya está abierta', 'info');
      return;
    }
    try {
      const purchase = await apiFetch('/api/purchases', {
        method: 'POST',
        body: {
          supplier_id:   dom.purchSupplier.value   || null,
          reference:     dom.purchReference.value.trim() || null,
          expected_date: dom.purchDate.value        || null,
          notes:         dom.purchNotes.value.trim() || null,
        },
      });
      state.purchaseId    = purchase.id;
      state.purchaseItems = [];
      state.purchaseTotal = 0;
      dom.purchActiveBadge.classList.remove('hidden');
      dom.purchOrderIdDisplay.textContent = purchase.id.substring(0, 8) + '…';
      dom.purchSaveDraftBtn.disabled = true;
      showToast('Orden de compra creada ✔', 'success');
      dom.purchScanInput.focus();
    } catch (err) {
      showToast('Error al crear orden: ' + err.message, 'error');
    }
  }

  async function handlePurchaseScan(sku) {
    // Asegurarse de que hay una orden activa antes de agregar ítems
    if (!state.purchaseId) {
      await savePurchaseDraft();
      if (!state.purchaseId) return; // falló la creación
    }

    const qty  = parseInt(dom.purchQty.value, 10)   || 1;
    const cost = parseFloat(dom.purchCost.value)    || 0;

    showScanFeedback('loading', 'Buscando producto…');

    try {
      // Buscar el producto en el catálogo por SKU
      const result = await apiFetch(`/api/inventory?search=${encodeURIComponent(sku)}&limit=1`);
      // Try exact match
      let product = (result.products || []).find(p =>
        p.sku && p.sku.toLowerCase() === sku.toLowerCase()
      );

      if (!product) {
        // Producto desconocido → modal de registro rápido
        showScanFeedback('error', `SKU "${sku}" no encontrado. Se abrirá el registro.`);
        state.pendingBarcode = sku;
        state.pendingContext = 'purchase';
        openRegModal(sku);
        return;
      }

      // Agregar ítem a la orden
      const item = await apiFetch(`/api/purchases/${state.purchaseId}/items`, {
        method: 'POST',
        body: { product_id: product.id, quantity: qty, unit_cost: cost },
      });

      // Actualizar cache local
      const existing = state.purchaseItems.find(i => i.product_id === product.id);
      if (existing) {
        existing.quantity   = item.quantity;
        existing.unit_cost  = parseFloat(item.unit_cost);
        existing.total_cost = parseFloat(item.total_cost);
      } else {
        state.purchaseItems.push({
          id: item.id, product_id: product.id,
          sku: product.sku, title: product.title,
          quantity: item.quantity,
          unit_cost: parseFloat(item.unit_cost),
          total_cost: parseFloat(item.total_cost),
        });
      }

      renderPurchaseItems();
      showScanFeedback('success', `✔ ${product.title} | x${qty} | $${fmtMoney(cost)}`);
      playBeep('success');
      // Reset qty y costo para la siguiente lectura
      dom.purchQty.value  = 1;
      dom.purchCost.value = '0.00';
    } catch (err) {
      showScanFeedback('error', err.message);
      playBeep('error');
    }
  }

  function renderPurchaseItems() {
    let total = 0;
    if (state.purchaseItems.length === 0) {
      dom.purchItemsTbody.innerHTML =
        '<tr><td colspan="7" class="table-empty">Agrega productos escaneando sus códigos de barras</td></tr>';
      dom.purchTotalAmount.textContent = '$0.00';
      return;
    }
    dom.purchItemsTbody.innerHTML = state.purchaseItems.map((item, i) => {
      total += item.total_cost;
      return `<tr>
        <td class="td-center">${i + 1}</td>
        <td class="td-mono">${escHtml(item.sku || '—')}</td>
        <td>${escHtml(item.title)}</td>
        <td class="td-center">
          <input class="inline-num" data-id="${item.id}" data-field="qty"
                 type="number" value="${item.quantity}" min="1" />
        </td>
        <td class="td-center">
          <input class="inline-num" data-id="${item.id}" data-field="cost"
                 type="number" step="0.01" value="${item.unit_cost.toFixed(2)}" min="0" />
        </td>
        <td class="td-money">$${fmtMoney(item.total_cost)}</td>
        <td class="td-center">
          <button class="btn-icon-sm btn-danger-sm" data-remove-purch="${item.id}"
                  title="Eliminar línea">✕</button>
        </td>
      </tr>`;
    }).join('');

    dom.purchTotalAmount.textContent = '$' + fmtMoney(total);
    state.purchaseTotal = total;

    // Bind inline edits
    dom.purchItemsTbody.querySelectorAll('.inline-num').forEach(inp => {
      inp.addEventListener('change', onPurchaseItemInlineEdit);
    });
    dom.purchItemsTbody.querySelectorAll('[data-remove-purch]').forEach(btn => {
      btn.addEventListener('click', () => removePurchaseItem(btn.dataset.removePurch));
    });
  }

  async function onPurchaseItemInlineEdit(e) {
    const inp    = e.target;
    const id     = inp.dataset.id;
    const field  = inp.dataset.field;
    const item   = state.purchaseItems.find(i => i.id === id);
    if (!item) return;

    if (field === 'qty')  item.quantity  = parseInt(inp.value, 10) || 1;
    if (field === 'cost') item.unit_cost = parseFloat(inp.value)   || 0;
    item.total_cost = item.quantity * item.unit_cost;

    try {
      await apiFetch(`/api/purchases/${state.purchaseId}/items/${id}`, {
        method: 'PUT',
        body: { quantity: item.quantity, unit_cost: item.unit_cost },
      });
      renderPurchaseItems();
    } catch (err) {
      showToast('Error al actualizar línea: ' + err.message, 'error');
    }
  }

  async function removePurchaseItem(itemId) {
    const item = state.purchaseItems.find(i => i.id === itemId);
    if (!item) return;
    showConfirmModal(
      `¿Eliminar "${escHtml(item.title)}" de la orden?`,
      async () => {
        try {
          await apiFetch(`/api/purchases/${state.purchaseId}/items/${itemId}`, {
            method: 'DELETE',
          });
          state.purchaseItems = state.purchaseItems.filter(i => i.id !== itemId);
          renderPurchaseItems();
          showToast('Línea eliminada', 'info');
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      }
    );
  }

  async function confirmPurchaseReception() {
    if (!state.purchaseId) {
      showToast('No hay una orden de compra activa', 'error');
      return;
    }
    if (state.purchaseItems.length === 0) {
      showToast('La orden no tiene líneas de productos', 'error');
      return;
    }
    showConfirmModal(
      `¿Confirmar recepción de ${state.purchaseItems.length} producto(s) por $${fmtMoney(state.purchaseTotal)}?\n\nEsto actualizará el stock y el precio de costo de cada artículo.`,
      async () => {
        try {
          await apiFetch(`/api/purchases/${state.purchaseId}/receive`, { method: 'POST' });
          showToast(`✅ Compra confirmada. ${state.purchaseItems.length} productos ingresados al inventario.`, 'success');
          resetPurchase();
        } catch (err) {
          showToast('Error al confirmar: ' + err.message, 'error');
        }
      }
    );
  }

  function resetPurchase() {
    state.purchaseId    = null;
    state.purchaseItems = [];
    state.purchaseTotal = 0;
    dom.purchActiveBadge.classList.add('hidden');
    dom.purchOrderIdDisplay.textContent = '—';
    dom.purchSaveDraftBtn.disabled      = false;
    dom.purchSupplier.value             = '';
    dom.purchReference.value            = '';
    dom.purchDate.value                 = '';
    dom.purchNotes.value                = '';
    renderPurchaseItems();
    dom.purchScanInput.focus();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // TRASPASOS
  // ────────────────────────────────────────────────────────────────────────────

  async function saveTransfer() {
    if (state.transferId) {
      showToast('El traspaso ya está abierto', 'info');
      return;
    }
    const from = dom.transFromBranch.value;
    const to   = dom.transToBranch.value;
    if (!from || !to) {
      showToast('Selecciona sucursal de origen y destino', 'error');
      return;
    }
    if (from === to) {
      showToast('Origen y destino no pueden ser la misma sucursal', 'error');
      return;
    }
    try {
      const transfer = await apiFetch('/api/purchases/transfers', {
        method: 'POST',
        body: { from_branch_id: from, to_branch_id: to, notes: dom.transNotes.value.trim() || null },
      });
      state.transferId     = transfer.id;
      state.transferItems  = [];
      state.transferStatus = 'pending';
      dom.transActiveBadge.classList.remove('hidden');
      dom.transIdDisplay.textContent = transfer.id.substring(0, 8) + '…';
      dom.transSaveBtn.disabled = true;
      showToast('Traspaso creado ✔', 'success');
      dom.transScanInput.focus();
    } catch (err) {
      showToast('Error al crear traspaso: ' + err.message, 'error');
    }
  }

  async function handleTransferScan(sku) {
    if (!state.transferId) {
      await saveTransfer();
      if (!state.transferId) return;
    }
    const qty = parseInt(dom.transQty.value, 10) || 1;

    showTransFeedback('loading', 'Buscando producto…');

    try {
      const result = await apiFetch(`/api/inventory?search=${encodeURIComponent(sku)}&limit=1`);
      let product = (result.products || []).find(p =>
        p.sku && p.sku.toLowerCase() === sku.toLowerCase()
      );

      if (!product) {
        showTransFeedback('error', `SKU "${sku}" no encontrado. Regístralo primero.`);
        state.pendingBarcode = sku;
        state.pendingContext = 'transfer';
        openRegModal(sku);
        return;
      }

      if (product.available < qty) {
        showTransFeedback('error',
          `Stock insuficiente: disponible ${product.available}, solicitado ${qty}`);
        playBeep('error');
        return;
      }

      const item = await apiFetch(`/api/purchases/transfers/${state.transferId}/items`, {
        method: 'POST',
        body: { product_id: product.id, quantity: qty },
      });

      const existing = state.transferItems.find(i => i.product_id === product.id);
      if (existing) {
        existing.quantity = item.quantity;
      } else {
        state.transferItems.push({
          id: item.id, product_id: product.id,
          sku: product.sku, title: product.title,
          quantity: item.quantity,
          current_stock: product.available,
        });
      }

      renderTransferItems();
      showTransFeedback('success', `✔ ${product.title} | x${qty} | Stock: ${product.available}`);
      playBeep('success');
      dom.transQty.value = 1;
    } catch (err) {
      showTransFeedback('error', err.message);
      playBeep('error');
    }
  }

  function renderTransferItems() {
    if (state.transferItems.length === 0) {
      dom.transItemsTbody.innerHTML =
        '<tr><td colspan="6" class="table-empty">Agrega productos a traspasar</td></tr>';
      return;
    }
    dom.transItemsTbody.innerHTML = state.transferItems.map((item, i) => `
      <tr>
        <td class="td-center">${i + 1}</td>
        <td class="td-mono">${escHtml(item.sku || '—')}</td>
        <td>${escHtml(item.title)}</td>
        <td class="td-center">${item.quantity}</td>
        <td class="td-center">${item.current_stock}</td>
        <td class="td-center">
          <button class="btn-icon-sm btn-danger-sm" data-remove-trans="${item.id}">✕</button>
        </td>
      </tr>`).join('');

    dom.transItemsTbody.querySelectorAll('[data-remove-trans]').forEach(btn => {
      btn.addEventListener('click', () => removeTransferItem(btn.dataset.removeTrans));
    });
  }

  async function removeTransferItem(itemId) {
    const item = state.transferItems.find(i => i.id === itemId);
    if (!item) return;
    showConfirmModal(`¿Eliminar "${escHtml(item.title)}" del traspaso?`, async () => {
      try {
        await apiFetch(`/api/purchases/transfers/${state.transferId}/items/${itemId}`, {
          method: 'DELETE',
        });
        state.transferItems = state.transferItems.filter(i => i.id !== itemId);
        renderTransferItems();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  async function confirmShipTransfer() {
    if (!state.transferId) { showToast('No hay un traspaso activo', 'error'); return; }
    if (state.transferItems.length === 0) { showToast('El traspaso no tiene artículos', 'error'); return; }
    showConfirmModal(
      `¿Confirmar envío del traspaso?\n\n${state.transferItems.length} artículo(s) se descontarán del stock de la sucursal origen.`,
      async () => {
        try {
          await apiFetch(`/api/purchases/transfers/${state.transferId}/ship`, { method: 'POST' });
          state.transferStatus = 'shipped';
          dom.transShipBtn.classList.add('hidden');
          dom.transReceiveBtn.classList.remove('hidden');
          showToast('📤 Traspaso enviado. Confirma la recepción en destino.', 'success');
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      }
    );
  }

  async function confirmReceiveTransfer() {
    if (!state.transferId) return;
    showConfirmModal(
      `¿Confirmar recepción del traspaso?\n\n${state.transferItems.length} artículo(s) se agregarán al stock de la sucursal destino.`,
      async () => {
        try {
          await apiFetch(`/api/purchases/transfers/${state.transferId}/receive`, { method: 'POST' });
          showToast('📥 Traspaso recibido. Inventario actualizado.', 'success');
          resetTransfer();
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      }
    );
  }

  function resetTransfer() {
    state.transferId     = null;
    state.transferItems  = [];
    state.transferStatus = 'pending';
    dom.transActiveBadge.classList.add('hidden');
    dom.transIdDisplay.textContent = '—';
    dom.transSaveBtn.disabled      = false;
    dom.transFromBranch.value      = '';
    dom.transToBranch.value        = '';
    dom.transNotes.value           = '';
    dom.transShipBtn.classList.remove('hidden');
    dom.transReceiveBtn.classList.add('hidden');
    renderTransferItems();
    dom.transScanInput.focus();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HISTORIAL
  // ────────────────────────────────────────────────────────────────────────────

  async function loadHistory() {
    try {
      const [purchases, transfers] = await Promise.all([
        apiFetch('/api/purchases?limit=30'),
        apiFetch('/api/purchases/transfers'),
      ]);
      renderHistoryPurchases(purchases);
      renderHistoryTransfers(transfers);
    } catch (err) {
      console.error('[Purchases] Error cargando historial:', err.message);
    }
  }

  function renderHistoryPurchases(purchases) {
    if (!purchases.length) {
      dom.histPurchTbody.innerHTML =
        '<tr><td colspan="7" class="table-empty">No hay compras registradas</td></tr>';
      return;
    }
    dom.histPurchTbody.innerHTML = purchases.map(p => `
      <tr>
        <td>${fmtDate(p.created_at)}</td>
        <td>${escHtml(p.supplier_name || '—')}</td>
        <td class="td-mono">${escHtml(p.reference || '—')}</td>
        <td class="td-center">${p.item_count}</td>
        <td class="td-money">$${fmtMoney(p.total_amount)}</td>
        <td><span class="status-badge status-${p.status}">${statusLabel(p.status)}</span></td>
        <td class="td-center">
          <button class="btn-ghost btn-sm" data-load-purchase="${p.id}">Ver</button>
        </td>
      </tr>`).join('');

    dom.histPurchTbody.querySelectorAll('[data-load-purchase]').forEach(btn => {
      btn.addEventListener('click', () => loadPurchaseDetail(btn.dataset.loadPurchase));
    });
  }

  function renderHistoryTransfers(transfers) {
    if (!transfers.length) {
      dom.histTransTbody.innerHTML =
        '<tr><td colspan="6" class="table-empty">No hay traspasos registrados</td></tr>';
      return;
    }
    dom.histTransTbody.innerHTML = transfers.map(t => `
      <tr>
        <td>${fmtDate(t.created_at)}</td>
        <td>${escHtml(t.from_branch_name)}</td>
        <td>${escHtml(t.to_branch_name)}</td>
        <td class="td-center">${t.item_count}</td>
        <td><span class="status-badge status-${t.status}">${statusLabel(t.status)}</span></td>
        <td class="td-center">
          <button class="btn-ghost btn-sm" data-load-transfer="${t.id}">Ver</button>
          ${t.status === 'pending' ? `<button class="btn-ghost btn-sm" data-resume-transfer="${t.id}">Retomar</button>` : ''}
          ${t.status === 'shipped' ? `<button class="btn-primary btn-sm" data-recv-transfer="${t.id}">Recibir</button>` : ''}
        </td>
      </tr>`).join('');

    dom.histTransTbody.querySelectorAll('[data-resume-transfer]').forEach(btn => {
      btn.addEventListener('click', () => resumeTransfer(btn.dataset.resumeTransfer));
    });
    dom.histTransTbody.querySelectorAll('[data-recv-transfer]').forEach(btn => {
      btn.addEventListener('click', () => quickReceiveTransfer(btn.dataset.recvTransfer));
    });
  }

  async function loadPurchaseDetail(id) {
    try {
      const p = await apiFetch(`/api/purchases/${id}`);
      // Retomar orden abierta si aún es draft
      if (['draft', 'pending'].includes(p.status)) {
        state.purchaseId    = p.id;
        state.purchaseItems = p.items.map(i => ({
          id: i.id, product_id: i.product_id,
          sku: i.sku, title: i.title,
          quantity: i.quantity,
          unit_cost: parseFloat(i.unit_cost),
          total_cost: parseFloat(i.total_cost),
        }));
        state.purchaseTotal = p.items.reduce((s, i) => s + parseFloat(i.total_cost), 0);
        dom.purchActiveBadge.classList.remove('hidden');
        dom.purchOrderIdDisplay.textContent = p.id.substring(0, 8) + '…';
        dom.purchSaveDraftBtn.disabled      = true;
        dom.purchSupplier.value             = p.supplier_id || '';
        dom.purchReference.value            = p.reference   || '';
        renderPurchaseItems();
        switchMode('purchase');
        showToast('Orden cargada para edición', 'info');
      } else {
        // Solo mostrar detalle (modal o alert)
        const lines = p.items.map(i =>
          `• ${i.sku || '?'} ${i.title} x${i.quantity} @ $${fmtMoney(i.unit_cost)}`
        ).join('\n');
        alert(`Compra ${p.reference || p.id.substring(0,8)}\nProveedor: ${p.supplier_name || '—'}\nEstado: ${statusLabel(p.status)}\n\n${lines}\n\nTotal: $${fmtMoney(p.total_amount)}`);
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  async function resumeTransfer(id) {
    try {
      const t = await apiFetch(`/api/purchases/transfers/${id}`);
      state.transferId     = t.id;
      state.transferStatus = t.status;
      state.transferItems  = t.items.map(i => ({
        id: i.id, product_id: i.product_id,
        sku: i.sku, title: i.title,
        quantity: i.quantity, current_stock: i.current_stock,
      }));
      dom.transActiveBadge.classList.remove('hidden');
      dom.transIdDisplay.textContent = t.id.substring(0, 8) + '…';
      dom.transSaveBtn.disabled      = true;
      dom.transFromBranch.value      = t.from_branch_id;
      dom.transToBranch.value        = t.to_branch_id;
      renderTransferItems();
      switchMode('transfer');
      showToast('Traspaso cargado para continuar', 'info');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  async function quickReceiveTransfer(id) {
    showConfirmModal('¿Confirmar recepción del traspaso seleccionado?', async () => {
      try {
        await apiFetch(`/api/purchases/transfers/${id}/receive`, { method: 'POST' });
        showToast('📥 Traspaso recibido. Inventario actualizado.', 'success');
        loadHistory();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MODAL: Nuevo Proveedor
  // ────────────────────────────────────────────────────────────────────────────

  function openSupplierModal() {
    dom.supplierModal.classList.remove('hidden');
    document.getElementById('purch-sup-name').focus();
  }
  function closeSupplierModal() {
    dom.supplierModal.classList.add('hidden');
    dom.supplierForm.reset();
  }

  async function onSupplierFormSubmit(e) {
    e.preventDefault();
    const data = {
      name:         document.getElementById('purch-sup-name').value.trim(),
      contact_name: document.getElementById('purch-sup-contact').value.trim() || null,
      email:        document.getElementById('purch-sup-email').value.trim()   || null,
      phone:        document.getElementById('purch-sup-phone').value.trim()   || null,
      tax_id:       document.getElementById('purch-sup-taxid').value.trim()   || null,
    };
    try {
      const supplier = await apiFetch('/api/purchases/suppliers', {
        method: 'POST', body: data,
      });
      state.suppliers.push(supplier);
      renderSupplierSelect();
      dom.purchSupplier.value = supplier.id;
      closeSupplierModal();
      showToast(`Proveedor "${supplier.name}" creado ✔`, 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MODAL: Registro Rápido de Producto Desconocido
  // ────────────────────────────────────────────────────────────────────────────

  function openRegModal(barcode) {
    dom.regSku.value   = barcode || '';
    dom.regTitle.value = '';
    dom.regDesc.value  = '';
    dom.regPrice.value = '';
    dom.regModal.classList.remove('hidden');
    dom.regTitle.focus();
  }
  function closeRegModal() {
    dom.regModal.classList.add('hidden');
    state.pendingBarcode = null;
    state.pendingContext = null;
    dom.regForm.reset();
  }

  async function onProductRegSubmit(e) {
    e.preventDefault();
      const domPriceMid = document.getElementById('purch-reg-price-mid');
      const domPriceWholesale = document.getElementById('purch-reg-price-wholesale');

      const data = {
        sku:         dom.regSku.value.trim()   || null,
        title:       dom.regTitle.value.trim(),
        description: dom.regDesc.value.trim()  || null,
        price:       parseFloat(dom.regPrice.value) || null,
        price_retail: parseFloat(dom.regPrice.value) || null,
        price_mid: domPriceMid && domPriceMid.value ? parseFloat(domPriceMid.value) : null,
        price_wholesale: domPriceWholesale && domPriceWholesale.value ? parseFloat(domPriceWholesale.value) : null,
    if (!data.title) { showToast('El nombre es obligatorio', 'error'); return; }

    try {
      const product = await apiFetch('/api/inventory', { method: 'POST', body: data });
      showToast(`Producto "${product.title}" registrado ✔`, 'success');
      closeRegModal();

      // Agregar automáticamente al contexto activo
      if (state.pendingContext === 'purchase' && state.purchaseId) {
        const qty  = parseInt(dom.purchQty.value, 10)  || 1;
        const cost = parseFloat(dom.purchCost.value)   || 0;
        const item = await apiFetch(`/api/purchases/${state.purchaseId}/items`, {
          method: 'POST',
          body: { product_id: product.id, quantity: qty, unit_cost: cost },
        });
        state.purchaseItems.push({
          id: item.id, product_id: product.id,
          sku: product.sku, title: product.title,
          quantity: item.quantity,
          unit_cost: parseFloat(item.unit_cost),
          total_cost: parseFloat(item.total_cost),
        });
        renderPurchaseItems();
        showScanFeedback('success', `✔ ${product.title} registrado y agregado`);
      }

      if (state.pendingContext === 'transfer' && state.transferId) {
        const qty  = parseInt(dom.transQty.value, 10) || 1;
        const item = await apiFetch(`/api/purchases/transfers/${state.transferId}/items`, {
          method: 'POST', body: { product_id: product.id, quantity: qty },
        });
        state.transferItems.push({
          id: item.id, product_id: product.id,
          sku: product.sku, title: product.title,
          quantity: item.quantity, current_stock: 0,
        });
        renderTransferItems();
        showTransFeedback('success', `✔ ${product.title} registrado y agregado`);
      }
    } catch (err) {
      showToast('Error al registrar producto: ' + err.message, 'error');
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MODAL: Importar Nota / PDF (IA)
  // ────────────────────────────────────────────────────────────────────────────

  function openImportModal() {
    dom.importModal.classList.remove('hidden');
    dom.importSpinner.classList.add('hidden');
    dom.importResults.classList.add('hidden');
    dom.importConfirmBtn.classList.add('hidden');
    dom.importText.value = '';
    state.parsedItems    = [];
  }
  function closeImportModal() {
    dom.importModal.classList.add('hidden');
    dom.importText.value = '';
    state.parsedItems    = [];
  }

  function onImportFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Para archivos de texto / CSV / TXT leemos directamente
      dom.importText.value = ev.target.result.substring(0, 8000);
    };
    // Solo text/csv/txt; para PDF se necesita pdf.js pero usamos texto plano copiado
    if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      showToast('Para PDFs, copia y pega el texto de la nota en el cuadro de abajo', 'info');
    }
    e.target.value = ''; // reset file input
  }

  async function onImportTextSubmit() {
    const text = dom.importText.value.trim();
    if (!text || text.length < 5) {
      showToast('Pega el texto de la nota o factura primero', 'error');
      return;
    }

    dom.importSpinner.classList.remove('hidden');
    dom.importResults.classList.add('hidden');
    dom.importConfirmBtn.classList.add('hidden');
    dom.importSubmitBtn.disabled = true;

    try {
      const { items } = await apiFetch('/api/purchases/parse-document', {
        method: 'POST', body: { text },
      });

      state.parsedItems = items || [];

      if (state.parsedItems.length === 0) {
        showToast('La IA no pudo extraer productos del texto. Verifica el formato.', 'error');
        return;
      }

      renderImportResults(state.parsedItems);
      dom.importResults.classList.remove('hidden');
      dom.importConfirmBtn.classList.remove('hidden');
    } catch (err) {
      showToast('Error al procesar con IA: ' + err.message, 'error');
    } finally {
      dom.importSpinner.classList.add('hidden');
      dom.importSubmitBtn.disabled = false;
    }
  }

  function renderImportResults(items) {
    dom.importResultsTbody.innerHTML = items.map((item, i) => `
      <tr>
        <td class="td-center">${i + 1}</td>
        <td><input class="form-input form-input-sm" data-pi="${i}" data-f="sku"
              value="${escHtml(item.sku || '')}" placeholder="SKU" /></td>
        <td><input class="form-input form-input-sm" data-pi="${i}" data-f="description"
              value="${escHtml(item.description || '')}" /></td>
        <td><input class="form-input form-input-sm td-num" data-pi="${i}" data-f="quantity"
              type="number" min="1" value="${item.quantity || 1}" /></td>
        <td><input class="form-input form-input-sm td-num" data-pi="${i}" data-f="unit_cost"
              type="number" step="0.01" min="0"
              value="${item.unit_cost != null ? item.unit_cost : ''}" placeholder="0.00" /></td>
      </tr>`).join('');

    // Live edit parsed items
    dom.importResultsTbody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx = parseInt(inp.dataset.pi, 10);
        const field = inp.dataset.f;
        if (field === 'quantity')  state.parsedItems[idx].quantity  = parseInt(inp.value, 10) || 1;
        if (field === 'unit_cost') state.parsedItems[idx].unit_cost = parseFloat(inp.value)   || null;
        if (field === 'sku')       state.parsedItems[idx].sku        = inp.value.trim() || null;
        if (field === 'description') state.parsedItems[idx].description = inp.value.trim();
      });
    });
  }

  async function onImportConfirm() {
    if (!state.purchaseId) {
      await savePurchaseDraft();
      if (!state.purchaseId) return;
    }

    let added = 0;
    let notFound = [];

    for (const parsed of state.parsedItems) {
      const skuOrDesc = parsed.sku || parsed.description;
      if (!skuOrDesc) continue;

      try {
        const result = await apiFetch(
          `/api/inventory?search=${encodeURIComponent(skuOrDesc)}&limit=1`
        );
        const product = (result.products || [])[0];
        if (!product) { notFound.push(parsed.description || parsed.sku); continue; }

        await apiFetch(`/api/purchases/${state.purchaseId}/items`, {
          method: 'POST',
          body: {
            product_id: product.id,
            quantity:   parsed.quantity || 1,
            unit_cost:  parsed.unit_cost || 0,
          },
        });

        const existing = state.purchaseItems.find(i => i.product_id === product.id);
        if (existing) {
          existing.quantity   += (parsed.quantity || 1);
          existing.total_cost  = existing.quantity * existing.unit_cost;
        } else {
          state.purchaseItems.push({
            id: Date.now() + '_' + product.id, // temp id, refresh will fix
            product_id: product.id,
            sku: product.sku, title: product.title,
            quantity: parsed.quantity || 1,
            unit_cost: parsed.unit_cost || 0,
            total_cost: (parsed.quantity || 1) * (parsed.unit_cost || 0),
          });
        }
        added++;
      } catch (_) { /* skip silently */ }
    }

    // Refresh items from server for accurate IDs
    try {
      const fresh = await apiFetch(`/api/purchases/${state.purchaseId}`);
      state.purchaseItems = fresh.items.map(i => ({
        id: i.id, product_id: i.product_id,
        sku: i.sku, title: i.title,
        quantity: i.quantity,
        unit_cost: parseFloat(i.unit_cost),
        total_cost: parseFloat(i.total_cost),
      }));
    } catch (_) { /* use local cache */ }

    renderPurchaseItems();
    closeImportModal();

    let msg = `${added} producto(s) importados a la orden.`;
    if (notFound.length) msg += ` Sin coincidencia: ${notFound.join(', ')}`;
    showToast(msg, added > 0 ? 'success' : 'error');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MODAL: Confirmación genérico
  // ────────────────────────────────────────────────────────────────────────────

  function showConfirmModal(message, onOk) {
    dom.confirmMessage.textContent = message;
    state.pendingConfirm = onOk;
    dom.confirmModal.classList.remove('hidden');
  }
  function closeConfirmModal() {
    dom.confirmModal.classList.add('hidden');
    state.pendingConfirm = null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UI HELPERS
  // ────────────────────────────────────────────────────────────────────────────

  function showScanFeedback(type, msg) {
    const el = document.getElementById('purch-scan-feedback');
    if (!el) return;
    el.className = `scanner-feedback ${type}`;
    el.textContent = msg;
    el.classList.remove('hidden');
    if (type === 'success') {
      setTimeout(() => el.classList.add('hidden'), 3000);
    }
  }

  function showTransFeedback(type, msg) {
    const el = document.getElementById('trans-scan-feedback');
    if (!el) return;
    el.className = `scanner-feedback ${type}`;
    el.textContent = msg;
    el.classList.remove('hidden');
    if (type === 'success') {
      setTimeout(() => el.classList.add('hidden'), 3000);
    }
  }

  function showToast(message, type = 'info') {
    let toast = document.getElementById('purch-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'purch-toast';
      toast.className = 'purch-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className   = `purch-toast purch-toast-${type} visible`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('visible'), 4000);
  }

  function playBeep(type) {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type === 'success' ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(type === 'success' ? 880 : 150, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001,
        ctx.currentTime + (type === 'success' ? 0.1 : 0.3));
      osc.stop(ctx.currentTime + (type === 'success' ? 0.1 : 0.3));
    } catch (_) { /* Sin soporte de AudioContext */ }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UTILIDADES
  // ────────────────────────────────────────────────────────────────────────────

  async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('agentica_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method:  options.method || 'GET',
      headers,
      body:    options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function fmtMoney(n) {
    return parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function statusLabel(s) {
    const map = {
      draft:    'Borrador',
      pending:  'Pendiente',
      received: 'Recibido',
      shipped:  'Enviado',
      cancelled:'Cancelado',
    };
    return map[s] || s;
  }

  // ── Inicializar al cargar DOM ────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', init);

})();
