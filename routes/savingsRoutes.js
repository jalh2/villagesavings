const express = require('express');
const {
  createSavings,
  createBulkSavings,
  getSavings,
  getSavingsById,
} = require('../controllers/savingsController');

const router = express.Router();

router.post('/bulk', createBulkSavings);

router.route('/')
  .get(getSavings)
  .post(createSavings);

router.get('/:id', getSavingsById);

module.exports = router;
