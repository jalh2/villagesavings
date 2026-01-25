const mongoose = require('mongoose');
const Group = require('../models/Group');
const Member = require('../models/Member');

const generateGroupCode = async (groupName) => {
  const base = String(groupName || 'GRP')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 3) || 'GRP';

  for (let i = 0; i < 5; i += 1) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const code = `${base}-${suffix}`;
    const existing = await Group.findOne({ groupCode: code }).select('_id');
    if (!existing) return code;
  }

  return `${base}-${Date.now().toString().slice(-6)}`;
};

exports.createGroup = async (req, res) => {
  try {
    const {
      groupName,
      groupCode,
      branchName,
      meetingDay,
      meetingTime,
      loanOfficer,
      community,
      totalGroupCount,
      presidentName,
      presidentNumber,
      securityName,
      securityNumber,
      treasurerName,
      treasurerNumber,
      police1Name,
      police1Number,
      police2Name,
      police2Number,
      status,
      socialfundamount,
      totalsocialfund,
      groupsavings,
      membersavingsshare,
    } = req.body;

    if (!groupName || !branchName) {
      return res.status(400).json({ message: 'groupName and branchName are required' });
    }

    const resolvedCode = groupCode || await generateGroupCode(groupName);
    const existing = await Group.findOne({ groupCode: resolvedCode }).select('_id');
    if (existing) {
      return res.status(400).json({ message: 'Group with this code already exists' });
    }

    const group = await Group.create({
      groupName,
      groupCode: resolvedCode,
      branchName,
      meetingDay,
      meetingTime,
      loanOfficer,
      community,
      totalGroupCount,
      presidentName,
      presidentNumber,
      securityName,
      securityNumber,
      treasurerName,
      treasurerNumber,
      police1Name,
      police1Number,
      police2Name,
      police2Number,
      status,
      socialfundamount,
      totalsocialfund,
      groupsavings,
      membersavingsshare,
    });

    return res.status(201).json(group);
  } catch (error) {
    console.error('[GROUPS] createGroup error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllGroups = async (req, res) => {
  try {
    const groups = await Group.find()
      .populate('members', 'memberName memberNumber')
      .populate('leader', 'memberName memberNumber')
      .populate('secretary', 'memberName memberNumber')
      .populate('treasurer', 'memberName memberNumber')
      .populate('loanOfficer', 'username');
    return res.json(groups);
  } catch (error) {
    console.error('[GROUPS] getAllGroups error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid group id' });
    }

    const group = await Group.findById(id)
      .populate('members')
      .populate('leader', 'memberName memberNumber')
      .populate('secretary', 'memberName memberNumber')
      .populate('treasurer', 'memberName memberNumber')
      .populate('loanOfficer', 'username');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    return res.json(group);
  } catch (error) {
    console.error('[GROUPS] getGroupById error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid group id' });
    }

    const update = { ...req.body };
    delete update.groupCode;

    const group = await Group.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    return res.json(group);
  } catch (error) {
    console.error('[GROUPS] updateGroup error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid group id' });
    }

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    await Member.deleteMany({ group: id });
    await Group.findByIdAndDelete(id);

    return res.json({ message: 'Group removed' });
  } catch (error) {
    console.error('[GROUPS] deleteGroup error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
