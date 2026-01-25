const express = require('express');
const {
  getMemberById,
  updateMember,
  deleteMember,
} = require('../controllers/memberController');

const router = express.Router();

router.route('/:id')
  .get(getMemberById)
  .put(updateMember)
  .delete(deleteMember);

module.exports = router;
