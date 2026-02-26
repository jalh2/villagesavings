const express = require('express');
const {
  createExpense,
  getExpenses,
  getExpenseById,
} = require('../controllers/expenseController');

const router = express.Router();

router.route('/')
  .get(getExpenses)
  .post(createExpense);

router.get('/:id', getExpenseById);

module.exports = router;
