// Lógica del CRM B2B - Agentica
document.addEventListener('DOMContentLoaded', () => {
    
    // UI Elements
    const navBtns = document.querySelectorAll('.nav-btn[data-view]');
    const views = document.querySelectorAll('.view');
    const userDisplay = document.getElementById('user-display');
    const logoutBtn = document.getElementById('logout-btn');
    
    // State
    let clients = [];
    const API_URL = '/api/crm';
    
    // --- init ---
    checkAuthAndInit();

    function checkAuthAndInit() {
        const userStr = localStorage.getItem('agentica_user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                userDisplay.textContent = user.username + ' (CRM)';
                
                // Cargar datos
                loadClients();
                loadQuotesForDashboard();
            } catch (e) {
                console.error("Error parseando usuario:", e);
                window.location.href = '/index.html';
            }
        }
    }

    // --- Navigation ---
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = btn.dataset.view;
            if(!target) return; // ignore links

            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            views.forEach(v => {
                v.classList.remove('active');
                if (v.id === `view-${target}`) {
                    v.classList.add('active');
                }
            });

            if (target === 'quotes') {
                renderClientSelect();
            }
        });
    });

    // --- Logout ---
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('agentica_token');
        localStorage.removeItem('agentica_user');
        window.location.href = '/index.html';
    });


    // ==========================================
    // MODULE: CLIENTS
    // ==========================================
    const clientsTbody = document.getElementById('clients-tbody');
    const btnNewClient = document.getElementById('btn-new-client');
    const modalClient = document.getElementById('modal-client');
    const btnCloseClientModal = document.getElementById('btn-close-client-modal');
    const formClient = document.getElementById('form-client');

    async function loadClients() {
        try {
            const token = localStorage.getItem('agentica_token');
            const res = await fetch(`${API_URL}/clients`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Error fetching clients");
            
            clients = await res.json();
            renderClients(clients);

            // Update KPI
            document.getElementById('kpi-clients').textContent = clients.length;
        } catch (error) {
            console.error(error);
            clientsTbody.innerHTML = `<tr><td colspan="6" class="text-danger">Error cargando directorio: ${error.message}</td></tr>`;
        }
    }

    function renderClients(data) {
        if (!data || data.length === 0) {
            clientsTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">No hay clientes registrados aún.</td></tr>`;
            return;
        }

        clientsTbody.innerHTML = data.map(c => `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.trade_name || '-'}</td>
                <td><span class="badge ${c.client_type}">${c.client_type}</span></td>
                <td>${c.contact_email || c.contact_phone || '-'}</td>
                <td>${c.tax_id || '-'}</td>
                <td><span style="color:var(--success)">Activo</span></td>
            </tr>
        `).join('');
    }

    btnNewClient.addEventListener('click', () => {
        modalClient.classList.remove('hidden');
    });

    btnCloseClientModal.addEventListener('click', () => {
        modalClient.classList.add('hidden');
    });

    // Save Client
    formClient.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('cli-name').value,
            trade_name: document.getElementById('cli-trade').value,
            tax_id: document.getElementById('cli-tax').value,
            client_type: document.getElementById('cli-type').value,
            contact_email: document.getElementById('cli-email').value,
            contact_phone: document.getElementById('cli-phone').value,
            credit_days: parseInt(document.getElementById('cli-credit').value) || 0
        };

        try {
            const token = localStorage.getItem('agentica_token');
            const res = await fetch(`${API_URL}/clients`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error al crear cliente');
            }

            // Success
            modalClient.classList.add('hidden');
            formClient.reset();
            alert("Cliente Creado!");
            loadClients();

        } catch (error) {
            alert(error.message);
        }
    });

    // ==========================================
    // MODULE: QUOTES (MATA-EXCEL)
    // ==========================================
    const btnAddRow = document.getElementById('btn-add-row');
    const quoteItemsTbody = document.getElementById('quote-items-tbody');
    const sSubtotal = document.getElementById('q-subtotal');
    const sTax = document.getElementById('q-tax');
    const sTotal = document.getElementById('q-total');
    const btnSaveQuote = document.getElementById('btn-save-quote');

    function renderClientSelect() {
        const select = document.getElementById('quote-client-select');
        select.innerHTML = '<option value="">-- Selecciona un cliente --</option>' +
            clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    function createRowHTML() {
        const tr = document.createElement('tr');
        tr.className = 'quote-row';
        tr.innerHTML = `
            <td><input type="text" class="form-input q-concept" placeholder="Concepto o descripción..." /></td>
            <td><input type="number" class="form-input q-qty" value="1" min="0.01" step="0.01" /></td>
            <td><input type="number" class="form-input q-price" value="0.00" min="0" step="0.01"/></td>
            <td><input type="number" class="form-input q-desc" value="0" min="0" max="100" /></td>
            <td class="q-row-total text-right font-medium" style="padding-top:0.8rem;">$0.00</td>
            <td style="text-align:center"><button class="btn-ghost text-danger btn-remove-row" style="padding:0.4rem">✖</button></td>
        `;

        // Atar eventos para recalcular
        const inputs = tr.querySelectorAll('input');
        inputs.forEach(inp => inp.addEventListener('input', calculateTotals));

        tr.querySelector('.btn-remove-row').addEventListener('click', () => {
            tr.remove();
            calculateTotals();
        });

        return tr;
    }

    btnAddRow.addEventListener('click', () => {
        quoteItemsTbody.appendChild(createRowHTML());
    });

    function calculateTotals() {
        let subtotal = 0;
        const rows = document.querySelectorAll('.quote-row');
        
        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('.q-qty').value) || 0;
            const price = parseFloat(row.querySelector('.q-price').value) || 0;
            const desc = parseFloat(row.querySelector('.q-desc').value) || 0;

            let rowTotal = qty * price;
            if (desc > 0) {
                rowTotal -= rowTotal * (desc / 100);
            }

            row.querySelector('.q-row-total').textContent = '$' + rowTotal.toFixed(2);
            subtotal += rowTotal;
        });

        const tax = subtotal * 0.16;
        const total = subtotal + tax;

        sSubtotal.textContent = '$' + subtotal.toFixed(2);
        sTax.textContent = '$' + tax.toFixed(2);
        sTotal.textContent = '$' + total.toFixed(2);
    }

    // Inicializar listeners en fila defecto
    document.querySelectorAll('.quote-row input').forEach(inp => {
        inp.addEventListener('input', calculateTotals);
    });
    document.querySelector('.btn-remove-row').addEventListener('click', function() {
        this.closest('.quote-row').remove();
        calculateTotals();
    });

    btnSaveQuote.addEventListener('click', async () => {
        const clientId = document.getElementById('quote-client-select').value;
        if (!clientId) return alert("Selecciona un cliente para la cotización.");

        const validUntilDays = parseInt(document.getElementById('quote-validity').value) || 15;
        const notes = document.getElementById('quote-notes').value;

        // Recolectar items
        const items = [];
        const rows = document.querySelectorAll('.quote-row');
        rows.forEach(row => {
            const desc = row.querySelector('.q-concept').value.trim();
            if(!desc) return; // skip empty
            
            items.push({
                product_id: null, // "Friccion zero", no atado a producto real por ahora
                description: desc,
                quantity: parseFloat(row.querySelector('.q-qty').value) || 1,
                unit_price: parseFloat(row.querySelector('.q-price').value) || 0,
                discount_percent: parseFloat(row.querySelector('.q-desc').value) || 0
            });
        });

        if (items.length === 0) return alert("La cotización no tiene conceptos.");

        const payload = {
            client_id: clientId,
            valid_until_days: validUntilDays,
            notes: notes,
            items: items
        };

        try {
            const token = localStorage.getItem('agentica_token');
            const res = await fetch(`${API_URL}/quotes`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Error guardando cotización");
            
            const saved = await res.json();
            alert(`Cotización Q-${saved.quote.id} generada y guardada con éxito.`);
            
            // Limpiar "Excel"
            quoteItemsTbody.innerHTML = '';
            quoteItemsTbody.appendChild(createRowHTML());
            document.getElementById('quote-notes').value = '';
            calculateTotals();
            loadQuotesForDashboard();

            // Saltar al dashboard
            navBtns[0].click(); // asume que dashboard es el [0]

        } catch (error) {
            alert(error.message);
        }
    });

    // ==========================================
    // DASHBOARD DATA
    // ==========================================
    async function loadQuotesForDashboard() {
        try {
            const token = localStorage.getItem('agentica_token');
            const res = await fetch(`${API_URL}/quotes`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if(res.ok) {
                const quotes = await res.json();
                document.getElementById('kpi-quotes').textContent = quotes.length;
                
                const totalMonto = quotes.reduce((acc, q) => acc + parseFloat(q.total_amount), 0);
                document.getElementById('kpi-total-quotes').textContent = '$' + totalMonto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            }
        } catch(e) {
            console.error(e);
        }
    }

});
