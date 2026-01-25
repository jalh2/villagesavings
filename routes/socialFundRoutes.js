const express = require('express');
const {
  createSocialFund,
  getSocialFunds,
  getSocialFundById,
} = require('../controllers/socialFundController');

const router = express.Router();

router.route('/')
  .get(getSocialFunds)
  .post(createSocialFund);

router.get('/:id', getSocialFundById);

module.exports = router;
