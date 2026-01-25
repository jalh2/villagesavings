const express = require('express');
const {
  createSavings,
  getSavings,
  getSavingsById,
} = require('../controllers/savingsController');

const router = express.Router();

router.route('/')
  .get(getSavings)
  .post(createSavings);

router.get('/:id', getSavingsById);

module.exports = router;
