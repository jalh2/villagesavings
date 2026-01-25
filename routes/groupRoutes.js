const express = require('express');
const {
  createGroup,
  getAllGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
} = require('../controllers/groupController');
const {
  createMember,
  getMembersByGroup,
} = require('../controllers/memberController');

const router = express.Router();

router.route('/')
  .get(getAllGroups)
  .post(createGroup);

router.route('/:id')
  .get(getGroupById)
  .put(updateGroup)
  .delete(deleteGroup);

router.route('/:groupId/members')
  .get(getMembersByGroup)
  .post(createMember);

module.exports = router;
