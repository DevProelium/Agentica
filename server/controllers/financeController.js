'use strict';

const financeService = require('../services/financeService');

async function getDashboardStats(req, res, next) {
    try {
        const { start_date, end_date } = req.query;
        const stats = await financeService.getDashboardStats(
            req.tenantId,
            req.branchId,
            start_date,
            end_date
        );
        res.json(stats);
    } catch (err) {
        next(err);
    }
}

async function listExpenses(req, res, next) {
    try {
        const expenses = await financeService.listExpenses(req.tenantId, req.branchId);
        res.json(expenses);
    } catch (err) {
        next(err);
    }
}

async function addExpense(req, res, next) {
    try {
        const expense = await financeService.addExpense(req.tenantId, req.branchId, req.body, req.user.id);
        res.status(201).json(expense);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getDashboardStats,
    listExpenses,
    addExpense
};

