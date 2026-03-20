/**
 * pos.js — Lógica del terminal de ventas (POS) para Agentica Inventory
 * Maneja carrito, búsqueda, cálculos, checkout y sincronización offline.
 */

/* global Dexie */

const POS = (function() {
    // Configuración
    const API_BASE = '';
    const TAX_RATE = 0.16; // IVA 16%

    // Estado de la aplicación
    const state = {
        cart: [],               // Array de items {id, product_id, quantity, unit_price, discount, tax_rate, product}
        selectedProduct: null,  // Producto seleccionado en búsqueda
        paymentMethod: 'cash',
        cashReceived: 0,
        mixedPayment: { cash: 0, card: 0, transfer: 0 },
        discount: { type: null, value: 0 }, // 'percent' o 'amount'
        cashSession: null,      // Sesión de caja activa
        offlineMode: false,
        pendingOfflineSales: [],
        heldSales: [],
        user: null
    };

    // Referencias a elementos DOM
    const dom = {};

    /**
     * Inicializa el POS después del login.
     */
    function init() {
        cacheDom();
        bindEvents();
        loadUserInfo();
        checkConnection();
        checkActiveCashSession();
        loadPendingOfflineSales();
        loadHeldSales();
        updateCartDisplay();
        // Precargar productos locales
        setTimeout(() => searchProducts(''), 500);
    }

    /**
     * Cachea referencias a elementos DOM.
     */
    function cacheDom() {
        // Búsqueda
        dom.productSearch = document.getElementById('product-search');
        dom.searchClear = document.getElementById('search-clear');
        dom.searchResults = document.getElementById('search-results');

        // Carrito
        dom.cartItems = document.getElementById('cart-items');
        dom.cartItemCount = document.getElementById('cart-item-count');
        dom.cartSubtotal = document.getElementById('cart-subtotal');
        dom.cartDiscount = document.getElementById('cart-discount');
        dom.cartTax = document.getElementById('cart-tax');
        dom.cartTotal = document.getElementById('cart-total');

        // Teclado
        dom.keypadButtons = document.querySelectorAll('.keypad-btn');
        dom.applyDiscountBtn = document.getElementById('apply-discount-btn');
        dom.setQuantityBtn = document.getElementById('set-quantity-btn');
        dom.setPriceBtn = document.getElementById('set-price-btn');

        // Pago
        dom.paymentMethods = document.querySelectorAll('.payment-method');
        dom.cashReceived = document.getElementById('cash-received');
        dom.changeDisplay = document.getElementById('change-display');
        dom.changeAmount = document.getElementById('change-amount');
        dom.mixedPaymentWrapper = document.getElementById('mixed-payment-wrapper');
        dom.mixedCashInput = document.getElementById('mixed-cash-amount');
        dom.mixedCardInput = document.getElementById('mixed-card-amount');
        dom.mixedTransferInput = document.getElementById('mixed-transfer-amount');

        // Acciones
        dom.checkoutBtn = document.getElementById('checkout-btn');
        dom.cancelSaleBtn = document.getElementById('cancel-sale-btn');
        dom.holdSaleBtn = document.getElementById('hold-sale-btn');
        dom.syncOfflineBtn = document.getElementById('sync-offline-btn');

        // Sesión de caja
        dom.openSessionBtn = document.getElementById('open-session-btn');
        dom.closeSessionBtn = document.getElementById('close-session-btn');
        dom.cashSessionStatus = document.getElementById('cash-session-status');
        dom.cashSessionText = document.getElementById('cash-session-text');
        dom.infoSessionId = document.getElementById('info-session-id');

        // Información
        dom.infoCartItems = document.getElementById('info-cart-items');
        dom.infoTotalItems = document.getElementById('info-total-items');
        dom.connectionStatus = document.getElementById('connection-status');

        // Modal descuento
        dom.discountModal = document.getElementById('discount-modal');
        dom.discountOptions = document.querySelectorAll('.discount-option');
        dom.discountInput = document.querySelector('.discount-input');
        dom.discountLabel = document.getElementById('discount-label');
        dom.discountValue = document.getElementById('discount-value');
        dom.applyDiscountConfirm = document.getElementById('apply-discount-confirm');
        dom.closeDiscountModal = document.getElementById('close-discount-modal');
    }

    /**
     * Vincula eventos a elementos DOM.
     */
    function bindEvents() {
        // Búsqueda de productos
        dom.productSearch.addEventListener('input', (e) => searchProducts(e.target.value));
        dom.searchClear.addEventListener('click', () => {
            dom.productSearch.value = '';
            searchProducts('');
        });

        // Teclado numérico
        dom.keypadButtons.forEach(btn => {
            btn.addEventListener('click', () => handleKeypad(btn.dataset.key));
        });

        // Métodos de pago
        dom.paymentMethods.forEach(btn => {
            btn.addEventListener('click', () => selectPaymentMethod(btn.dataset.method));
        });

        // Efectivo recibido
        dom.cashReceived.addEventListener('input', updateChange);

        // Botones de acción
        dom.checkoutBtn.addEventListener('click', checkout);
        dom.cancelSaleBtn.addEventListener('click', cancelSale);
        dom.holdSaleBtn.addEventListener('click', holdSale);
        const heldBtn = document.getElementById('view-held-btn');
        if (heldBtn) heldBtn.addEventListener('click', showHeldSales);
        dom.syncOfflineBtn.addEventListener('click', syncOfflineSales);

        dom.mixedCashInput.addEventListener('input', (e) => {
            state.mixedPayment.cash = parseFloat(e.target.value) || 0;
            updateMixedChange();
        });
        dom.mixedCardInput.addEventListener('input', (e) => {
            state.mixedPayment.card = parseFloat(e.target.value) || 0;
            updateMixedChange();
        });
        dom.mixedTransferInput.addEventListener('input', (e) => {
            state.mixedPayment.transfer = parseFloat(e.target.value) || 0;
            updateMixedChange();
        });

        // Sesión de caja
        dom.openSessionBtn.addEventListener('click', openCashSession);
        dom.closeSessionBtn.addEventListener('click', closeCashSession);

        // Descuento
        dom.applyDiscountBtn.addEventListener('click', () => showDiscountModal());
        dom.discountOptions.forEach(opt => {
            opt.addEventListener('click', () => selectDiscountType(opt.dataset.type));
        });
        dom.applyDiscountConfirm.addEventListener('click', applyDiscount);
        dom.closeDiscountModal.addEventListener('click', () => hideModal(dom.discountModal));

        // Cierre modal al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                hideModal(e.target);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'F1') {
                e.preventDefault();
                dom.productSearch.focus();
            } else if (e.key === 'F2') {
                e.preventDefault();
                holdSale();
            } else if (e.key === 'F3') {
                e.preventDefault();
                checkout();
            } else if (e.key === 'F4') {
                e.preventDefault();
                cancelSale();
            } else if (e.key === 'F5') {
                e.preventDefault();
                openCashSession();
            } else if (e.key === 'F6') {
                e.preventDefault();
                closeCashSession();
            }
        });
    }

    /**
     * Carga información del usuario desde el token.
     */
    function loadUserInfo() {
        const token = localStorage.getItem('agentica_token');
        if (!token) return;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            state.user = payload;
            document.getElementById('current-user').textContent = payload.username || 'Usuario';
        } catch (e) {
            console.error('Error decodificando token:', e);
        }
    }

    /**
     * Verifica conexión a internet.
     */
    function checkConnection() {
        state.offlineMode = !navigator.onLine;
        if (state.offlineMode) {
            dom.connectionStatus.textContent = '● Offline';
            dom.connectionStatus.classList.remove('online');
            dom.connectionStatus.classList.add('offline');
        } else {
            dom.connectionStatus.textContent = '● En línea';
            dom.connectionStatus.classList.remove('offline');
            dom.connectionStatus.classList.add('online');
        }
        window.addEventListener('online', () => {
            state.offlineMode = false;
            dom.connectionStatus.textContent = '● En línea';
            dom.connectionStatus.classList.remove('offline');
            dom.connectionStatus.classList.add('online');
        });
        window.addEventListener('offline', () => {
            state.offlineMode = true;
            dom.connectionStatus.textContent = '● Offline';
            dom.connectionStatus.classList.remove('online');
            dom.connectionStatus.classList.add('offline');
        });
    }

    /**
     * Busca productos locales (IndexedDB) y remotos (API).
     * @param {string} query
     */
    async function searchProducts(query) {
        const term = query.trim().toLowerCase();
        let results = [];

        // Búsqueda local
        const localResults = await searchLocalIndexedDB(term, 20);
        results = localResults.map(p => ({
            id: p.id,
            sku: p.sku,
            title: p.title,
            price: parseFloat(p.price || 0),
            available: parseInt(p.available || 0),
            description: p.description,
            location: p.location
        }));

        // Si hay conexión y la búsqueda local es insuficiente, buscar en API
        if (!state.offlineMode && term.length >= 2 && results.length < 5) {
            try {
                const apiResults = await searchProductsAPI(term);
                // Combinar evitando duplicados
                const existingIds = new Set(results.map(r => r.id));
                apiResults.forEach(p => {
                    if (!existingIds.has(p.id)) {
                        results.push(p);
                    }
                });
            } catch (err) {
                console.warn('Error en búsqueda API:', err);
            }
        }

        displaySearchResults(results);
    }

    /**
     * Obtiene productos desde IndexedDB.
     */
    async function searchLocalIndexedDB(searchTerm, limit) {
        // Usa la función existente en db.js si está expuesta en window
        if (typeof window.getLocalProducts === 'function') {
            return await window.getLocalProducts(searchTerm, limit);
            return await localDB.products.limit(limit).toArray();
        }
        
        const term = searchTerm.toLowerCase();
        return await localDB.products
            .filter(p =>
                (p.title && p.title.toLowerCase().includes(term)) ||
                (p.sku && p.sku.toLowerCase().includes(term))
            )
            .limit(limit)
            .toArray();
    }

    /**
     * Busca productos en la API.
     */
    async function searchProductsAPI(query) {
        const token = localStorage.getItem('agentica_token');
        const res = await fetch(`${API_BASE}/api/inventory?search=${encodeURIComponent(query)}&limit=10`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error en búsqueda API');
        const data = await res.json();
        return data.products || [];
    }

    /**
     * Muestra resultados de búsqueda en el DOM.
     */
    function displaySearchResults(products) {
        dom.searchResults.innerHTML = '';
        if (products.length === 0) {
            dom.searchResults.innerHTML = `<div class="empty-results">No se encontraron productos</div>`;
            return;
        }
        products.forEach(p => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.dataset.id = p.id;
            item.innerHTML = `
                <div>
                    <div class="result-sku">${p.sku || 'Sin SKU'}</div>
                    <div class="result-title">${p.title}</div>
                    <div class="result-stock ${p.available <= 5 ? 'low-stock' : ''}">Disponible: ${p.available} | ${p.location || 'Sin ubicación'}</div>
                </div>
                <div class="result-price">$${p.price.toFixed(2)}</div>
            `;
            item.addEventListener('click', () => addToCart(p));
            dom.searchResults.appendChild(item);
        });
    }

    /**
     * Agrega un producto al carrito.
     */
    function addToCart(product) {
        // Verificar si ya está en el carrito
        const existing = state.cart.find(item => item.product_id === product.id);
        if (existing) {
            updateQuantity(existing.id, existing.quantity + 1);
        } else {
            state.cart.push({
                id: generateLocalId(),
                product_id: product.id,
                quantity: 1,
                unit_price: product.price_retail || product.price,
                discount: 0,
                tax_rate: TAX_RATE,
                product: {
                    title: product.title,
                    sku: product.sku,
                    available: product.available,
                    cost: product.cost || 0,
                    price_retail: product.price_retail || product.price,
                    price_mid: product.price_mid || product.price,
                    price_wholesale: product.price_wholesale || product.price
                }
            });
        }
        updateCartDisplay();
        // Enfocar campo de cantidad para modificar si se desea
        focusQuantityInput();
    }

    /**
     * Actualiza la visualización del carrito.
     */
    function updateCartDisplay() {
        // Limpiar tabla
        dom.cartItems.innerHTML = '';
        if (state.cart.length === 0) {
            dom.cartItems.innerHTML = `<div class="empty-cart">No hay productos en el carrito</div>`;
        } else {
            // Cabecera
            const header = document.createElement('div');
            header.className = 'cart-item cart-item-header';
            header.innerHTML = `
                <div>Producto</div>
                <div>Cantidad</div>
                <div>Precio unit.</div>
                <div>Subtotal</div>
                <div></div>
            `;
            dom.cartItems.appendChild(header);

            // Items
            state.cart.forEach(item => renderCartItem(item));
        }

        // Actualizar contadores
        dom.cartItemCount.textContent = state.cart.length;
        dom.infoCartItems.textContent = state.cart.length;
        const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
        dom.infoTotalItems.textContent = totalItems;

        // Calcular totales
        calculateTotals();

        // Habilitar/deshabilitar botón de cobro
        dom.checkoutBtn.disabled = state.cart.length === 0 || !state.cashSession;
    }

    /**
     * Renderiza un item del carrito en el DOM.
     */
    function renderCartItem(item) {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.dataset.id = item.id;
        const subtotal = (item.quantity * item.unit_price) - item.discount;
        row.innerHTML = `
            <div>
                <div class="cart-item-name">${item.product.title}</div>
                <div class="cart-item-sku">${item.product.sku || 'Sin SKU'}</div>
            </div>
            <div class="cart-item-quantity">
                <button class="qty-btn" data-action="decrease">−</button>
                <input type="number" class="qty-input" value="${item.quantity}" min="1" max="${item.product.available}" />
                <button class="qty-btn" data-action="increase">+</button>
            </div>
            <div class="cart-item-price">$${item.unit_price.toFixed(2)}</div>
            <div class="cart-item-subtotal">$${subtotal.toFixed(2)}</div>
            <div class="cart-item-actions">
                <button class="btn-icon" title="Eliminar" data-action="remove">🗑</button>
            </div>
        `;
        // Eventos
        const qtyInput = row.querySelector('.qty-input');
        qtyInput.addEventListener('change', (e) => updateQuantity(item.id, parseInt(e.target.value)));
        row.querySelector('[data-action="decrease"]').addEventListener('click', () => updateQuantity(item.id, item.quantity - 1));
        row.querySelector('[data-action="increase"]').addEventListener('click', () => updateQuantity(item.id, item.quantity + 1));
        row.querySelector('[data-action="remove"]').addEventListener('click', () => removeFromCart(item.id));
        dom.cartItems.appendChild(row);
    }

    /**
     * Actualiza la cantidad de un item en el carrito, ajustando el precio según el volumen.
     */
    function updateQuantity(itemId, newQty) {
        const item = state.cart.find(i => i.id === itemId);
        if (!item) return;

        if (newQty < 1) newQty = 1;
        if (newQty > item.product.available && item.product.available > 0) { // Fix bug here that prevents sales of out-of-stock when allowed is not implemented, allowing temporary negative
            alert(`No hay suficiente stock. Disponible: ${item.product.available}`);
            newQty = item.product.available;
        }

        item.quantity = newQty;

        // Lógica de precios escalonados:
        // >= 12 -> Mayoreo (price_wholesale)
        // >= 6  -> Medio mayoreo (price_mid)
        // < 6   -> Menudeo (price_retail o price base)
        let newPrice = item.product.price_retail || item.unit_price; // Menudeo base

        if (newQty >= 12 && item.product.price_wholesale > 0) {
            newPrice = item.product.price_wholesale;
        } else if (newQty >= 6 && item.product.price_mid > 0) {
            newPrice = item.product.price_mid;
        }
        
        item.unit_price = newPrice;

        updateCartDisplay();
    }

    /**
     * Elimina un item del carrito.
     */
    function removeFromCart(itemId) {
        state.cart = state.cart.filter(i => i.id !== itemId);
        updateCartDisplay();
    }

    /**
     * Calcula subtotal, descuento, impuesto y total.
     */
    function calculateTotals() {
        let subtotal = 0;
        let totalDiscount = 0;
        let totalCost = 0;
        state.cart.forEach(item => {
            subtotal += item.quantity * item.unit_price;
            totalDiscount += item.discount;
            // Usar costo si existe; de lo contrario usar el precio venta interno
            const costPerUnit = item.product.cost || item.product.price_retail || item.unit_price;
            totalCost += item.quantity * costPerUnit;
        });
        // Aplicar descuento global si existe
        if (state.discount.type === 'percent') {
            totalDiscount += subtotal * (state.discount.value / 100);
        } else if (state.discount.type === 'amount') {
            totalDiscount += state.discount.value;
        }
        const tax = (subtotal - totalDiscount) * TAX_RATE;
        const total = subtotal - totalDiscount + tax;

        const profit = subtotal - totalDiscount - totalCost;
        const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;

        // Actualizar DOM
        dom.cartSubtotal.textContent = `$${subtotal.toFixed(2)}`;
        dom.cartDiscount.textContent = `$${totalDiscount.toFixed(2)}`;
        dom.cartTax.textContent = `$${tax.toFixed(2)}`;
        dom.cartTotal.textContent = `$${total.toFixed(2)}`;

        const profitSpan = document.getElementById('cart-profit');
        const marginSpan = document.getElementById('cart-margin');
        if (profitSpan) profitSpan.textContent = `$${profit.toFixed(2)}`;
        if (marginSpan) marginSpan.textContent = `${profitPercent.toFixed(1)}%`;

        // Sincronizar cambio para método mixto
        if (state.paymentMethod === 'mixed') {
            updateMixedChange();
        } else {
            updateChange();
        }
    }

    /**
     * Maneja pulsaciones del teclado numérico.
     */
    function handleKeypad(key) {
        // Por ahora, implementación básica: focus en cantidad o precio
        console.log('Tecla presionada:', key);
        // TODO: Implementar entrada numérica en campo activo
    }

    /**
     * Selecciona método de pago.
     */
    function selectPaymentMethod(method) {
        state.paymentMethod = method;
        dom.paymentMethods.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === method);
        });
        // Mostrar/ocultar campo de efectivo recibido
        if (method === 'cash') {
            dom.cashReceived.parentElement.classList.remove('hidden');
            dom.mixedPaymentWrapper.classList.add('hidden');
            updateChange();
        } else if (method === 'mixed') {
            dom.cashReceived.parentElement.classList.add('hidden');
            dom.mixedPaymentWrapper.classList.remove('hidden');
            dom.changeDisplay.classList.remove('hidden');
            updateMixedChange();
        } else {
            dom.cashReceived.parentElement.classList.add('hidden');
            dom.mixedPaymentWrapper.classList.add('hidden');
            dom.changeDisplay.classList.add('hidden');
        }
    }

    /**
     * Calcula y muestra el cambio.
     */
    function updateChange() {
        if (state.paymentMethod !== 'cash') return;
        const received = parseFloat(dom.cashReceived.value) || 0;
        state.cashReceived = received;
        const total = parseFloat(dom.cartTotal.textContent.replace('$', '')) || 0;
        const change = received - total;
        if (change >= 0) {
            dom.changeAmount.textContent = `$${change.toFixed(2)}`;
            dom.changeDisplay.classList.remove('hidden');
        } else {
            dom.changeDisplay.classList.add('hidden');
        }
    }

    function updateMixedChange() {
        const total = parseFloat(dom.cartTotal.textContent.replace('$', '')) || 0;
        const provided = (parseFloat(dom.mixedCashInput.value) || 0) + (parseFloat(dom.mixedCardInput.value) || 0) + (parseFloat(dom.mixedTransferInput.value) || 0);
        const change = provided - total;
        if (change >= 0) {
            dom.changeAmount.textContent = `$${change.toFixed(2)}`;
            dom.changeDisplay.classList.remove('hidden');
        } else {
            dom.changeAmount.textContent = `$0.00`;
            dom.changeDisplay.classList.add('hidden');
        }
    }

    /**
     * Abre una nueva sesión de caja.
     */
    async function openCashSession() {
        const startAmount = prompt('Monto inicial en caja:', '0.00');
        if (startAmount === null) return;
        const amount = parseFloat(startAmount);
        if (isNaN(amount) || amount < 0) {
            alert('Monto inválido');
            return;
        }
        try {
            const token = localStorage.getItem('agentica_token');
            const res = await fetch(`${API_BASE}/api/sales/sessions/open`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ start_amount: amount })
            });
            if (!res.ok) throw new Error(await res.text());
            const session = await res.json();
            state.cashSession = session.session;
            updateCashSessionDisplay();
            alert('Sesión de caja abierta');
        } catch (err) {
            console.error('Error abriendo sesión:', err);
            alert('Error al abrir sesión de caja: ' + err.message);
        }
    }

    /**
     * Cierra la sesión de caja activa.
     */
    async function closeCashSession() {
        const endAmount = prompt('Monto final en caja:', '0.00');
        if (endAmount === null) return;
        const amount = parseFloat(endAmount);
        if (isNaN(amount) || amount < 0) {
            alert('Monto inválido');
            return;
        }
        try {
            const token = localStorage.getItem('agentica_token');
            const res = await fetch(`${API_BASE}/api/sales/sessions/close`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ end_amount: amount })
            });
            if (!res.ok) throw new Error(await res.text());
            const session = await res.json();
            state.cashSession = null;
            updateCashSessionDisplay();
            alert('Sesión de caja cerrada');
        } catch (err) {
            console.error('Error cerrando sesión:', err);
            alert('Error al cerrar sesión de caja: ' + err.message);
        }
    }

    /**
     * Verifica si hay una sesión de caja activa.
     */
    async function checkActiveCashSession() {
        try {
            const token = localStorage.getItem('agentica_token');
            const res = await fetch(`${API_BASE}/api/sales/sessions/active`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const session = await res.json();
                state.cashSession = session;
                updateCashSessionDisplay();
            }
        } catch (err) {
            // No hay sesión activa
            console.log('No hay sesión activa:', err.message);
        }
    }

    /**
     * Actualiza la visualización de la sesión de caja.
     */
    function updateCashSessionDisplay() {
        if (state.cashSession) {
            dom.cashSessionStatus.classList.add('open');
            dom.cashSessionStatus.title = 'Caja abierta';
            dom.cashSessionText.textContent = `Caja #${state.cashSession.id.slice(-6)}`;
            dom.infoSessionId.textContent = `#${state.cashSession.id.slice(-6)}`;
            dom.openSessionBtn.disabled = true;
            dom.closeSessionBtn.disabled = false;
        } else {
            dom.cashSessionStatus.classList.remove('open');
            dom.cashSessionStatus.title = 'Caja cerrada';
            dom.cashSessionText.textContent = 'Caja no abierta';
            dom.infoSessionId.textContent = '—';
            dom.openSessionBtn.disabled = false;
            dom.closeSessionBtn.disabled = true;
        }
    }

    /**
     * Procesa el checkout (cobrar venta).
     */
    async function checkout() {
        if (!state.cashSession) {
            alert('Debe abrir una sesión de caja primero');
            return;
        }
        // Preparar items para la API
        const items = state.cart.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount: item.discount,
            tax_rate: item.tax_rate
        }));
        const total = parseFloat(dom.cartTotal.textContent.replace('$', '')) || 0;

        // Manejo de pago mixto
        if (state.paymentMethod === 'mixed') {
            const providedTotal = (state.mixedPayment.cash || 0) + (state.mixedPayment.card || 0) + (state.mixedPayment.transfer || 0);
            if (Math.abs(providedTotal - total) > 0.01) {
                alert('La suma de efectivo + tarjeta + transferencia debe ser igual al total de la venta.');
                return;
            }
        }

        const saleData = {
            items,
            payment_method: state.paymentMethod,
            cash_session_id: state.cashSession.id,
            notes: '',
            payment_breakdown: state.paymentMethod === 'mixed' ? {
                cash: state.mixedPayment.cash || 0,
                card: state.mixedPayment.card || 0
            } : undefined
        };
        try {
            let result;
            if (state.offlineMode) {
                // Guardar venta offline
                const localId = generateLocalId();
                await saveOfflineSale(localId, saleData);
                result = { offline: true, localId };
                alert('Venta guardada para sincronización offline');
            } else {
                // Enviar a API
                const token = localStorage.getItem('agentica_token');
                const res = await fetch(`${API_BASE}/api/sales/checkout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(saleData)
                });
                if (!res.ok) throw new Error(await res.text());
                result = await res.json();
                alert('Venta procesada correctamente');
            }
            // Limpiar carrito después de la venta
            state.cart = [];
            state.discount = { type: null, value: 0 };
            updateCartDisplay();
            console.log('Checkout result:', result);
        } catch (err) {
            console.error('Error en checkout:', err);
            alert('Error al procesar la venta: ' + err.message);
        }
    }

    /**
     * Cancela la venta actual.
     */
    function cancelSale() {
        if (confirm('¿Cancelar venta actual? Se perderán todos los items del carrito.')) {
            state.cart = [];
            state.discount = { type: null, value: 0 };
            updateCartDisplay();
        }
    }

    /**
     * Guarda las ventas en espera (holded sales) en localStorage.
     */
    function saveHeldSales() {
        localStorage.setItem('pos_held_sales', JSON.stringify(state.heldSales));
    }

    /**
     * Carga las ventas en espera desde localStorage.
     */
    function loadHeldSales() {
        const saved = localStorage.getItem('pos_held_sales');
        if (saved) {
            try {
                state.heldSales = JSON.parse(saved);
            } catch (err) {
                console.error('Error decodificando held sales:', err);
                state.heldSales = [];
            }
        } else {
            state.heldSales = [];
        }
    }

    /**
     * Pausa la venta actual (guardar para recuperar después).
     */
    function holdSale() {
        if (state.cart.length === 0) {
            alert('No hay items en el carrito para pausar.');
            return;
        }
        const name = prompt('Nombre cliente/identificador para la venta en espera:');
        if (!name) {
            alert('Debe ingresar un nombre para guardar la venta en espera.');
            return;
        }
        const total = parseFloat(dom.cartTotal.textContent.replace('$', '')) || 0;
        const hold = {
            id: generateLocalId(),
            name,
            items: state.cart.slice(),
            total,
            createdAt: new Date().toISOString()
        };
        state.heldSales.push(hold);
        saveHeldSales();
        state.cart = [];
        state.discount = { type: null, value: 0 };
        updateCartDisplay();
        alert(`Venta en espera guardada: ${name} (Total: $${total.toFixed(2)})`);
    }

    /**
     * Muestra y reanuda una venta en espera.
     */
    function showHeldSales() {
        loadHeldSales();
        if (!state.heldSales.length) {
            alert('No hay ventas en espera.');
            return;
        }

        let menu = 'Ventas en espera:\n';
        state.heldSales.forEach((h, idx) => {
            menu += `${idx + 1}. ${h.name} - $${h.total.toFixed(2)} (${h.items.length} items)\n`;
        });
        menu += '0. Cancelar';

        const opt = parseInt(prompt(menu), 10);
        if (isNaN(opt) || opt < 0 || opt > state.heldSales.length) return;
        if (opt === 0) return;

        const chosen = state.heldSales[opt - 1];
        if (!chosen) return;

        if (state.cart.length > 0 && !confirm('Actualmente hay una venta en proceso, al reanudar la venta en espera se perderá la venta actual. ¿Continuar?')) {
            return;
        }

        state.cart = chosen.items || [];
        state.discount = { type: null, value: 0 };
        state.heldSales = state.heldSales.filter(h => h.id !== chosen.id);
        saveHeldSales();
        updateCartDisplay();
        alert(`Venta en espera reanudada: ${chosen.name}`);
    }

    /**
     * Sincroniza ventas offline pendientes.
     */
    async function syncOfflineSales() {
        try {
            const token = localStorage.getItem('agentica_token');
            const res = await fetch(`${API_BASE}/api/sales/sync`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(await res.text());
            const result = await res.json();
            alert(`Sincronización completada: ${result.synced} ventas sincronizadas`);
            loadPendingOfflineSales();
        } catch (err) {
            alert('Error sincronizando ventas offline: ' + err.message);
        }
    }

    /**
     * Carga ventas offline pendientes desde IndexedDB.
     */
    async function loadPendingOfflineSales() {
        if (typeof getPendingOfflineSales === 'function') {
            state.pendingOfflineSales = await getPendingOfflineSales();
        }
        // Actualizar badge si existe
        const badge = document.getElementById('offline-sales-badge');
        if (badge) {
            badge.textContent = state.pendingOfflineSales.length;
            badge.style.display = state.pendingOfflineSales.length ? 'inline' : 'none';
        }
    }

    /**
     * Muestra modal para aplicar descuento.
     */
    function showDiscountModal() {
        showModal(dom.discountModal);
    }

    /**
     * Selecciona tipo de descuento en el modal.
     */
    function selectDiscountType(type) {
        dom.discountOptions.forEach(opt => opt.classList.toggle('active', opt.dataset.type === type));
        dom.discountInput.classList.remove('hidden');
        dom.discountLabel.textContent = type === 'percent' ? 'Porcentaje (%):' : 'Monto fijo ($):';
        state.discount.type = type;
    }

    /**
     * Aplica descuento según lo ingresado.
     */
    function applyDiscount() {
        const value = parseFloat(dom.discountValue.value);
        if (isNaN(value) || value < 0) {
            alert('Valor inválido');
            return;
        }
        if (state.discount.type === 'percent' && value > 100) {
            alert('El porcentaje no puede ser mayor a 100%');
            return;
        }
        state.discount.value = value;
        hideModal(dom.discountModal);
        updateCartDisplay();
    }

    /**
     * Enfoca el campo de cantidad del primer item del carrito.
     */
    function focusQuantityInput() {
        const firstInput = dom.cartItems.querySelector('.qty-input');
        if (firstInput) firstInput.focus();
    }

    /**
     * Genera un ID local único.
     */
    function generateLocalId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    /**
     * Muestra un modal.
     */
    function showModal(modal) {
        modal.classList.remove('hidden');
    }

    /**
     * Oculta un modal.
     */
    function hideModal(modal) {
        modal.classList.add('hidden');
    }

    // Exponer métodos públicos
    return {
        init,
        state
    };
})();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // POS.init() se llama después del login
});