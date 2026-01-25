const express = require('express');
const {
  createLoan,
  getAllLoans,
  getLoanById,
  updateLoan,
  setLoanStatus,
  addCollection,
  listCollections,
} = require('../controllers/loanController');

const router = express.Router();

router.route('/')
  .get(getAllLoans)
  .post(createLoan);

router.route('/:id')
  .get(getLoanById)
  .put(updateLoan);

router.patch('/:id/status', setLoanStatus);

router.route('/:id/collections')
  .get(listCollections)
  .post(addCollection);

module.exports = router;
