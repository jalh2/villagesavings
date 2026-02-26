const express = require('express');
const {
  getSummaryReport,
  getYearEndInterestReport,
} = require('../controllers/reportController');

const router = express.Router();

router.get('/summary', getSummaryReport);
router.get('/year-end-interest', getYearEndInterestReport);

module.exports = router;
