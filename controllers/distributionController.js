const mongoose = require('mongoose');
const Distribution = require('../models/Distribution');
const Loan = require('../models/Loan');
const Group = require('../models/Group');
const Member = require('../models/Member');

exports.createDistribution = async (req, res) => {
  try {
    const { loan, group, member, memberName, amount, currency, date, notes } = req.body;

    if (!loan || !group || !amount || !currency) {
      return res.status(400).json({ message: 'loan, group, amount, and currency are required' });
    }

    if (!mongoose.isValidObjectId(loan) || !mongoose.isValidObjectId(group)) {
      return res.status(400).json({ message: 'Invalid loan or group id' });
    }

    const loanDoc = await Loan.findById(loan).select('group currency');
    if (!loanDoc) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (String(loanDoc.group) !== String(group)) {
      return res.status(400).json({ message: 'Loan does not belong to this group' });
    }

    if (currency !== loanDoc.currency) {
      return res.status(400).json({ message: 'Distribution currency must match loan currency' });
    }

    if (member) {
      if (!mongoose.isValidObjectId(member)) {
        return res.status(400).json({ message: 'Invalid member id' });
      }
      const memberDoc = await Member.findById(member).select('group');
      if (!memberDoc) {
        return res.status(404).json({ message: 'Member not found' });
      }
      if (String(memberDoc.group) !== String(group)) {
        return res.status(400).json({ message: 'Member does not belong to this group' });
      }
    }

    const groupDoc = await Group.findById(group).select('_id');
    if (!groupDoc) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const distribution = await Distribution.create({
      loan,
      group,
      member: member || undefined,
      memberName,
      amount,
      currency,
      date: date ? new Date(date) : new Date(),
      notes,
    });

    return res.status(201).json(distribution);
  } catch (error) {
    console.error('[DISTRIBUTIONS] createDistribution error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getDistributions = async (req, res) => {
  try {
    const { loan, group, member } = req.query;
    const filter = {};
    if (loan) filter.loan = loan;
    if (group) filter.group = group;
    if (member) filter.member = member;

    const distributions = await Distribution.find(filter)
      .populate('member', 'memberName memberNumber')
      .populate('group', 'groupName groupCode branchName')
      .populate('loan', 'loanAmount currency status')
      .sort({ date: -1, createdAt: -1 });

    return res.json(distributions);
  } catch (error) {
    console.error('[DISTRIBUTIONS] getDistributions error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getDistributionById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid distribution id' });
    }

    const distribution = await Distribution.findById(id)
      .populate('member', 'memberName memberNumber')
      .populate('group', 'groupName groupCode branchName')
      .populate('loan', 'loanAmount currency status');
    if (!distribution) {
      return res.status(404).json({ message: 'Distribution not found' });
    }

    return res.json(distribution);
  } catch (error) {
    console.error('[DISTRIBUTIONS] getDistributionById error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
