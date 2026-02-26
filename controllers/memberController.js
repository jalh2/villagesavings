const mongoose = require('mongoose');
const Member = require('../models/Member');
const Group = require('../models/Group');
const { resolveSingleGroup } = require('../utils/singleGroup');

exports.createMember = async (req, res) => {
  try {
    const requestedGroupId = req.params.groupId || req.body.group;
    const resolved = await resolveSingleGroup(requestedGroupId, '_id members');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }
    const group = resolved.group;

    const {
      memberName,
      memberImage,
      memberAge,
      guardianName,
      phone,
      memberNumber,
      admissionDate,
      nationalId,
      memberSignature,
      attendance,
    } = req.body;

    const member = await Member.create({
      memberName,
      memberImage,
      memberAge,
      guardianName,
      phone,
      memberNumber,
      admissionDate,
      nationalId,
      memberSignature,
      attendance,
      group: group._id,
    });

    if (!Array.isArray(group.members)) {
      group.members = [];
    }
    group.members.push(member._id);
    await group.save();

    return res.status(201).json(member);
  } catch (error) {
    console.error('[MEMBERS] createMember error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMembersByGroup = async (req, res) => {
  try {
    const { groupId: requestedGroupId } = req.params;
    const resolved = await resolveSingleGroup(requestedGroupId, '_id');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }

    const members = await Member.find({ group: resolved.group._id });
    return res.json(members);
  } catch (error) {
    console.error('[MEMBERS] getMembersByGroup error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMemberById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const member = await Member.findById(id).populate('group', 'groupName groupCode');
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    const resolved = await resolveSingleGroup(String(member.group?._id || ''), '_id');
    if (resolved.error) {
      return res.status(404).json({ message: 'Member not found' });
    }

    return res.json(member);
  } catch (error) {
    console.error('[MEMBERS] getMemberById error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateMember = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const memberDoc = await Member.findById(id).select('_id group');
    if (!memberDoc) {
      return res.status(404).json({ message: 'Member not found' });
    }

    const resolved = await resolveSingleGroup(String(memberDoc.group), '_id');
    if (resolved.error) {
      return res.status(404).json({ message: 'Member not found' });
    }

    const update = { ...req.body };
    delete update.group;

    const member = await Member.findByIdAndUpdate(id, update, { new: true, runValidators: true });

    return res.json(member);
  } catch (error) {
    console.error('[MEMBERS] updateMember error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteMember = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const member = await Member.findById(id);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    const resolved = await resolveSingleGroup(String(member.group), '_id');
    if (resolved.error) {
      return res.status(404).json({ message: 'Member not found' });
    }

    await Group.findByIdAndUpdate(member.group, { $pull: { members: member._id } });
    await Member.findByIdAndDelete(id);

    return res.json({ message: 'Member removed' });
  } catch (error) {
    console.error('[MEMBERS] deleteMember error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
