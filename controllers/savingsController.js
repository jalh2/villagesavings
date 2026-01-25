const mongoose = require('mongoose');
const Savings = require('../models/Savings');
const Group = require('../models/Group');
const Member = require('../models/Member');

exports.createSavings = async (req, res) => {
  try {
    const { group, member, memberName, amount, currency, date, notes } = req.body;

    if (!group || !member || amount == null || !currency) {
      return res.status(400).json({ message: 'group, member, amount, and currency are required' });
    }

    if (!mongoose.isValidObjectId(group) || !mongoose.isValidObjectId(member)) {
      return res.status(400).json({ message: 'Invalid group or member id' });
    }

    const [groupDoc, memberDoc] = await Promise.all([
      Group.findById(group).select('_id'),
      Member.findById(member).select('group memberName'),
    ]);

    if (!groupDoc) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!memberDoc) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (String(memberDoc.group) !== String(group)) {
      return res.status(400).json({ message: 'Member does not belong to this group' });
    }

    const savings = await Savings.create({
      group,
      member,
      memberName: memberName || memberDoc.memberName,
      amount,
      currency,
      date: date ? new Date(date) : new Date(),
      notes,
    });

    const increment = Number(amount || 0);
    await Promise.all([
      Group.findByIdAndUpdate(group, { $inc: { groupsavings: increment } }),
      Member.findByIdAndUpdate(member, { $inc: { savingsTotal: increment } }),
    ]);

    return res.status(201).json(savings);
  } catch (error) {
    console.error('[SAVINGS] createSavings error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getSavings = async (req, res) => {
  try {
    const { group, member } = req.query;
    const filter = {};
    if (group) filter.group = group;
    if (member) filter.member = member;

    const savings = await Savings.find(filter)
      .populate('member', 'memberName memberNumber')
      .populate('group', 'groupName groupCode branchName')
      .sort({ date: -1, createdAt: -1 });

    return res.json(savings);
  } catch (error) {
    console.error('[SAVINGS] getSavings error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getSavingsById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid savings id' });
    }

    const savings = await Savings.findById(id)
      .populate('member', 'memberName memberNumber')
      .populate('group', 'groupName groupCode branchName');

    if (!savings) {
      return res.status(404).json({ message: 'Savings record not found' });
    }

    return res.json(savings);
  } catch (error) {
    console.error('[SAVINGS] getSavingsById error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
