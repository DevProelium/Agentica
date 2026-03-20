'use strict';

const express = require('express');
const controller = require('../controllers/financeController');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/dashboard', auth, controller.getDashboardStats);
router.get('/expenses', auth, controller.listExpenses);
router.post('/expenses', auth, controller.addExpense);

module.exports = router;

