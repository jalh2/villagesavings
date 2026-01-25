const express = require('express');
const {
  createDistribution,
  getDistributions,
  getDistributionById,
} = require('../controllers/distributionController');

const router = express.Router();

router.route('/')
  .get(getDistributions)
  .post(createDistribution);

router.get('/:id', getDistributionById);

module.exports = router;
