const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Group = require('../models/Group');
const Member = require('../models/Member');

exports.createExpense = async (req, res) => {
  try {
    const {
      group,
      member,
      memberName,
      type,
      category,
      amount,
      currency,
      date,
      notes,
    } = req.body;

    if (!group || !currency) {
      return res.status(400).json({ message: 'group and currency are required' });
    }

    if (!mongoose.isValidObjectId(group)) {
      return res.status(400).json({ message: 'Invalid group id' });
    }

    if (member && !mongoose.isValidObjectId(member)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const groupDoc = await Group.findById(group).select('_id meetingFineAmount');
    if (!groupDoc) {
      return res.status(404).json({ message: 'Group not found' });
    }

    let memberDoc = null;
    if (member) {
      memberDoc = await Member.findById(member).select('group memberName');
      if (!memberDoc) {
        return res.status(404).json({ message: 'Member not found' });
      }
      if (String(memberDoc.group) !== String(group)) {
        return res.status(400).json({ message: 'Member does not belong to this group' });
      }
    }

    const resolvedType = type === 'fine' ? 'fine' : 'expense';
    const resolvedAmount = amount == null && resolvedType === 'fine'
      ? Number(groupDoc.meetingFineAmount || 0)
      : Number(amount);
    const amountNum = Number(resolvedAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ message: resolvedType === 'fine' ? 'amount must be a positive number, or configure meeting fine amount on the group' : 'amount must be a positive number' });
    }

    const expense = await Expense.create({
      group,
      member: member || undefined,
      memberName: memberName || memberDoc?.memberName,
      type: resolvedType,
      category,
      amount: amountNum,
      currency,
      date: date ? new Date(date) : new Date(),
      notes,
    });

    const groupInc = resolvedType === 'fine'
      ? { totalFines: amountNum }
      : { totalExpenses: amountNum };

    await Group.findByIdAndUpdate(group, { $inc: groupInc });

    return res.status(201).json(expense);
  } catch (error) {
    console.error('[EXPENSES] createExpense error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getExpenses = async (req, res) => {
  try {
    const { group, member, type } = req.query;
    const filter = {};
    if (group) filter.group = group;
    if (member) filter.member = member;
    if (type) filter.type = type;

    const expenses = await Expense.find(filter)
      .populate('member', 'memberName memberNumber')
      .populate('group', 'groupName groupCode branchName')
      .sort({ date: -1, createdAt: -1 });

    return res.json(expenses);
  } catch (error) {
    console.error('[EXPENSES] getExpenses error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid expense id' });
    }

    const expense = await Expense.findById(id)
      .populate('member', 'memberName memberNumber')
      .populate('group', 'groupName groupCode branchName');

    if (!expense) {
      return res.status(404).json({ message: 'Expense record not found' });
    }

    return res.json(expense);
  } catch (error) {
    console.error('[EXPENSES] getExpenseById error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
