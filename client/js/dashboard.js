/**
 * dashboard.js — Lógica del dashboard de inventario
 * Carga productos desde la API (o IndexedDB si está offline)
 * y renderiza la tabla con paginación y acciones.
 */

/* global getLocalProducts, saveProducts, syncProducts */

(function () {
  'use strict';

  const API_BASE    = 'http://localhost:3000';
  const PAGE_SIZE   = 20;

  let currentPage   = 1;
  let currentSearch = '';
  let totalProducts = 0;

  // ── Referencias DOM ─────────────────────────────────────────────────────────
  const tbody      = document.getElementById('products-tbody');
  const searchInput = document.getElementById('search-input');
  const searchBtn  = document.getElementById('search-btn');
  const prevBtn    = document.getElementById('prev-page');
  const nextBtn    = document.getElementById('next-page');
  const pageInfo   = document.getElementById('page-info');

  const metricTotal     = document.getElementById('metric-total');
  const metricAvailable = document.getElementById('metric-available');
  const metricCommitted = document.getElementById('metric-committed');
  const metricOnHand    = document.getElementById('metric-on-hand');

  if (!tbody) return; // Vista no activa

  // ── Utilidades ──────────────────────────────────────────────────────────────

  function authHeaders() {
    const token = localStorage.getItem('agentica_token');
    return token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function stockClass(n) {
    if (n > 10) return 'ok';
    if (n > 0)  return 'warning';
    return 'danger';
  }

  // ── Carga de datos ───────────────────────────────────────────────────────────

  /**
   * Carga productos desde la API o desde IndexedDB si no hay conexión.
   */
  async function loadProducts() {
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Cargando…</td></tr>';

    const offset = (currentPage - 1) * PAGE_SIZE;
    let products = [];

    if (navigator.onLine) {
      try {
        const params = new URLSearchParams({ limit: PAGE_SIZE, offset });
        if (currentSearch) params.set('search', currentSearch);

        const res = await fetch(`${API_BASE}/api/inventory?${params}`, {
          headers: authHeaders(),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        products      = data.products || [];
        totalProducts = data.total    || 0;

        // Actualizar caché local
        if (products.length > 0) await saveProducts(products);
      } catch (err) {
        console.warn('[Dashboard] Error de red, usando caché:', err.message);
        products = await getLocalProducts(currentSearch, PAGE_SIZE);
        totalProducts = products.length;
      }
    } else {
      // Modo offline: usar IndexedDB
      products = await getLocalProducts(currentSearch, PAGE_SIZE);
      totalProducts = products.length;
    }

    renderTable(products);
    updateMetrics(products);
    updatePagination();
  }

  // ── Renderizado ──────────────────────────────────────────────────────────────

  function renderTable(products) {
    if (!products || products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No se encontraron productos</td></tr>';
      return;
    }

    tbody.innerHTML = products.map((p) => `
      <tr data-id="${escapeHtml(p.id)}">
        <td><span class="sku-badge">${escapeHtml(p.sku || '—')}</span></td>
        <td>${escapeHtml(p.title)}</td>
        <td>${escapeHtml(p.location || '—')}</td>
        <td><span class="stock-badge ${stockClass(p.available)}">${p.available ?? 0}</span></td>
        <td><span class="stock-badge ${stockClass(p.on_hand)}">${p.on_hand ?? 0}</span></td>
        <td>${p.price != null ? `$${parseFloat(p.price).toFixed(2)}` : '—'}</td>
        <td>
          <div class="action-btns">
            <button class="btn-sm edit-btn" data-id="${escapeHtml(p.id)}">Editar</button>
            <button class="btn-sm danger delete-btn" data-id="${escapeHtml(p.id)}">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');

    // Delegar eventos de acción
    tbody.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });

    tbody.querySelectorAll('.edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => editProduct(btn.dataset.id, products));
    });
  }

  function updateMetrics(products) {
    if (!metricTotal) return;
    metricTotal.textContent     = totalProducts;
    metricAvailable.textContent = products.reduce((s, p) => s + (p.available || 0), 0);
    metricCommitted.textContent = products.reduce((s, p) => s + (p.committed || 0), 0);
    metricOnHand.textContent    = products.reduce((s, p) => s + (p.on_hand   || 0), 0);
  }

  function updatePagination() {
    const totalPages = Math.ceil(totalProducts / PAGE_SIZE) || 1;
    if (pageInfo) pageInfo.textContent = `Página ${currentPage} / ${totalPages}`;
    if (prevBtn)  prevBtn.disabled = currentPage <= 1;
    if (nextBtn)  nextBtn.disabled = currentPage >= totalPages;
  }

  // ── Acciones ─────────────────────────────────────────────────────────────────

  async function deleteProduct(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/inventory/${id}`, {
        method:  'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loadProducts();
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  }

  function editProduct(id, products) {
    const product = products.find((p) => p.id === id);
    if (!product) return;

    const newTitle = prompt('Nuevo título:', product.title);
    if (newTitle === null) return; // Cancelado

    fetch(`${API_BASE}/api/inventory/${id}`, {
      method:  'PUT',
      headers: authHeaders(),
      body:    JSON.stringify({ title: newTitle }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(() => loadProducts())
      .catch((err) => alert('Error al actualizar: ' + err.message));
  }

  // ── Eventos de UI ─────────────────────────────────────────────────────────────

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      currentSearch = searchInput ? searchInput.value.trim() : '';
      currentPage   = 1;
      loadProducts();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchBtn.click();
    });
  }

  if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadProducts(); } });
  if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; loadProducts(); });

  // Cargar productos cuando la vista del dashboard se activa
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === 'dashboard') loadProducts();
    });
  });

  // Carga inicial
  loadProducts();
})();
