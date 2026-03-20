/**
 * finance.js - LÃ³gica simplificada de Flujo de Caja y Gastos
 */

(function() {
    'use strict';

    const API_BASE = window.API_BASE || '';

    // DOM Elements
    const dom = {
        income: document.getElementById('fin-income'),
        purchases: document.getElementById('fin-purchases'),
        expenses: document.getElementById('fin-expenses'),
        cashflow: document.getElementById('fin-cashflow'),
        refreshBtn: document.getElementById('fin-refresh'),
        form: document.getElementById('fin-expense-form'),
        cat: document.getElementById('fin-cat'),
        amount: document.getElementById('fin-amount'),
        desc: document.getElementById('fin-desc')
    };

    function fmt(num) {
        return '$' + parseFloat(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    async function loadDashboard() {
        const token = localStorage.getItem('agentica_token');
        if (!token) return;

        try {
            const res = await fetch(`${API_BASE}/api/finance/dashboard`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Error cargando finanzas');
            const data = await res.json();

            dom.income.textContent = fmt(data.income.sales);
            dom.purchases.textContent = fmt(data.outcomes.purchases);
            dom.expenses.textContent = fmt(data.outcomes.expenses);
            
            dom.cashflow.textContent = fmt(Math.abs(data.cashflow));
            if (data.status === 'negative') {
                dom.cashflow.style.color = 'var(--error-color)';
                dom.cashflow.textContent = '-' + dom.cashflow.textContent;
            } else {
                dom.cashflow.style.color = 'var(--success-color)';
                dom.cashflow.textContent = '+' + dom.cashflow.textContent;
            }
        } catch (err) {
            console.error(err);
        }
    }

    async function handleExpenseSubmit(e) {
        e.preventDefault();
        
        const data = {
            category: dom.cat.value,
            amount: parseFloat(dom.amount.value),
            description: dom.desc.value.trim()
        };

        const token = localStorage.getItem('agentica_token');
        if (!token) return;

        try {
            const res = await fetch(`${API_BASE}/api/finance/expenses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (!res.ok) throw new Error('Error al guardar el gasto');
            
            // Clean
            dom.form.reset();
            alert('Gasto registrado correctamente');
            
            // Reload
            loadDashboard();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    // Bind events
    if (dom.refreshBtn) {
        dom.refreshBtn.addEventListener('click', loadDashboard);
    }
    if (dom.form) {
        dom.form.addEventListener('submit', handleExpenseSubmit);
    }

    // Expose init
    window.financeInit = loadDashboard;

    // Call conditionally if on view
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.view === 'finance') {
                loadDashboard();
            }
        });
    });

})();
