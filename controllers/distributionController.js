const mongoose = require('mongoose');
const Distribution = require('../models/Distribution');
const Loan = require('../models/Loan');
const Member = require('../models/Member');
const { resolveSingleGroup } = require('../utils/singleGroup');

exports.createDistribution = async (req, res) => {
  try {
    const { loan, group, member, memberName, amount, currency, date, notes } = req.body;

    if (!loan || !amount || !currency) {
      return res.status(400).json({ message: 'loan, amount, and currency are required' });
    }

    if (!mongoose.isValidObjectId(loan)) {
      return res.status(400).json({ message: 'Invalid loan id' });
    }

    const resolved = await resolveSingleGroup(group, '_id');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }
    const groupDoc = resolved.group;

    const loanDoc = await Loan.findById(loan).select('group currency');
    if (!loanDoc) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (String(loanDoc.group) !== String(groupDoc._id)) {
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
      if (String(memberDoc.group) !== String(groupDoc._id)) {
        return res.status(400).json({ message: 'Member does not belong to this group' });
      }
    }

    const distribution = await Distribution.create({
      loan,
      group: groupDoc._id,
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

    const resolved = await resolveSingleGroup(group, '_id');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }

    const filter = {};
    filter.group = resolved.group._id;
    if (loan) filter.loan = loan;
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

    const resolved = await resolveSingleGroup(String(distribution.group?._id || ''), '_id');
    if (resolved.error) {
      return res.status(404).json({ message: 'Distribution not found' });
    }

    return res.json(distribution);
  } catch (error) {
    console.error('[DISTRIBUTIONS] getDistributionById error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
