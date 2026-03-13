const express = require('express');
const {
  createSocialFund,
  createBulkSocialFunds,
  getSocialFunds,
  getSocialFundById,
} = require('../controllers/socialFundController');

const router = express.Router();

router.post('/bulk', createBulkSocialFunds);

router.route('/')
  .get(getSocialFunds)
  .post(createSocialFund);

router.get('/:id', getSocialFundById);

module.exports = router;
