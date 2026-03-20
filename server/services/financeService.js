'use strict';

const pool = require('../models/db');

async function getDashboardStats(tenantId, branchId, startDate, endDate) {
    let dateFilter = '';
    const params = [tenantId];
    
    // We will build a simple dashboard showing income (sales) vs outcomes (purchases amounts + expenses)
    // Here we skip strict dates for now if not provided, just doing all time to keep it simple, or default to current month.
    
    let branchFilter = '';
    if (branchId) {
        branchFilter = ` AND branch_id = $2`;
        params.push(branchId);
    }

    // Ingresos de Ventas
    const salesQuery = `
        SELECT COALESCE(SUM(total_amount), 0) as total_income 
        FROM sales 
        WHERE tenant_id = $1 ${branchFilter}
    `;
    
    const salesRes = await pool.query(salesQuery, params);
    
    // Costo de Compras Reales
    const purchasesQuery = `
        SELECT COALESCE(SUM(total_amount), 0) as total_purchases
        FROM purchases 
        WHERE tenant_id = $1 AND status = 'received' ${branchFilter}
    `;
    const purchasesRes = await pool.query(purchasesQuery, params);
    
    // Gastos Operativos (expenses)
    const expensesQuery = `
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM expenses 
        WHERE tenant_id = $1 ${branchFilter}
        GROUP BY category
    `;
    const expensesRes = await pool.query(expensesQuery, params);
    
    const totalIncome = parseFloat(salesRes.rows[0].total_income);
    const totalPurchases = parseFloat(purchasesRes.rows[0].total_purchases);
    
    let totalExpenses = 0;
    const expensesByCategory = {};
    expensesRes.rows.forEach(row => {
        const amt = parseFloat(row.total);
        totalExpenses += amt;
        expensesByCategory[row.category] = amt;
    });
    
    const cashflow = totalIncome - totalPurchases - totalExpenses;
    
    return {
        income: {
            sales: totalIncome
        },
        outcomes: {
            purchases: totalPurchases,
            expenses: totalExpenses,
            expenses_details: expensesByCategory
        },
        cashflow: cashflow,
        status: cashflow >= 0 ? 'positive' : 'negative'
    };
}

async function listExpenses(tenantId, branchId) {
    let query = `
        SELECT e.*, u.name as created_by_name 
        FROM expenses e
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.tenant_id = $1
    `;
    const params = [tenantId];
    
    if (branchId) {
        query += ` AND (e.branch_id = $2 OR e.branch_id IS NULL)`;
        params.push(branchId);
    }
    
    query += ` ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 100`;
    
    const res = await pool.query(query, params);
    return res.rows;
}

async function addExpense(tenantId, branchId, data, userId) {
    const { category, amount, description, expense_date } = data;
    
    if (!category || !amount) {
        throw new Error('Categoría y monto son obligatorios');
    }
    
    const query = `
        INSERT INTO expenses (tenant_id, branch_id, category, amount, description, expense_date, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `;
    
    const values = [
        tenantId,
        branchId,
        category,
        amount,
        description || null,
        expense_date || new Date().toISOString().split('T')[0],
        userId
    ];
    
    const res = await pool.query(query, values);
    return res.rows[0];
}

module.exports = {
    getDashboardStats,
    listExpenses,
    addExpense
};

