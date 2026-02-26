const mongoose = require('mongoose');
const Savings = require('../models/Savings');
const Group = require('../models/Group');
const Member = require('../models/Member');

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

exports.createSavings = async (req, res) => {
  try {
    const {
      group,
      member,
      memberName,
      amount,
      shares,
      transactionType,
      currency,
      date,
      notes,
    } = req.body;

    if (!group || !member || !currency) {
      return res.status(400).json({ message: 'group, member, and currency are required' });
    }

    if (!mongoose.isValidObjectId(group) || !mongoose.isValidObjectId(member)) {
      return res.status(400).json({ message: 'Invalid group or member id' });
    }

    const [groupDoc, memberDoc] = await Promise.all([
      Group.findById(group).select('_id savingsamount'),
      Member.findById(member).select('group memberName savingsTotal totalShares'),
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

    const savingsUnitAmount = toNumber(groupDoc.savingsamount, 0);
    const rawShares = toNumber(shares, 0);
    if (!Number.isFinite(rawShares) || rawShares < 0) {
      return res.status(400).json({ message: 'shares must be a non-negative number' });
    }
    if (!Number.isInteger(rawShares)) {
      return res.status(400).json({ message: 'shares must be a whole number' });
    }

    let sharesNum = rawShares;
    let amountNum = toNumber(amount, NaN);
    const resolvedType = transactionType === 'debit' ? 'debit' : 'credit';

    if (resolvedType === 'credit') {
      if (sharesNum <= 0) {
        return res.status(400).json({ message: 'shares must be at least 1 for savings credit' });
      }
      if (!Number.isFinite(savingsUnitAmount) || savingsUnitAmount <= 0) {
        return res.status(400).json({ message: 'Group savings amount per share is not configured' });
      }
      amountNum = sharesNum * savingsUnitAmount;
    } else {
      if (sharesNum > 0 && Number.isFinite(savingsUnitAmount) && savingsUnitAmount > 0) {
        amountNum = sharesNum * savingsUnitAmount;
      }

      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ message: 'amount must be a positive number' });
      }

      if (sharesNum === 0 && Number.isFinite(savingsUnitAmount) && savingsUnitAmount > 0) {
        const inferredShares = amountNum / savingsUnitAmount;
        if (Number.isInteger(inferredShares) && inferredShares > 0) {
          sharesNum = inferredShares;
        }
      }
    }

    if (resolvedType === 'debit') {
      if (toNumber(memberDoc.savingsTotal) < amountNum) {
        return res.status(400).json({ message: 'Insufficient member savings balance' });
      }
      if (sharesNum > 0 && toNumber(memberDoc.totalShares) < sharesNum) {
        return res.status(400).json({ message: 'Insufficient member shares balance' });
      }
    }

    const savings = await Savings.create({
      group,
      member,
      memberName: memberName || memberDoc.memberName,
      amount: amountNum,
      shares: sharesNum,
      transactionType: resolvedType,
      currency,
      date: date ? new Date(date) : new Date(),
      notes,
    });

    const direction = resolvedType === 'debit' ? -1 : 1;
    const amountDelta = direction * amountNum;
    const sharesDelta = direction * sharesNum;
    await Promise.all([
      Group.findByIdAndUpdate(group, {
        $inc: {
          groupsavings: amountDelta,
          totalShares: sharesDelta,
          membersavingsshare: sharesDelta,
        },
      }),
      Member.findByIdAndUpdate(member, {
        $inc: {
          savingsTotal: amountDelta,
          totalShares: sharesDelta,
        },
      }),
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
