const mongoose = require('mongoose');
const SocialFund = require('../models/SocialFund');
const Group = require('../models/Group');
const Member = require('../models/Member');

exports.createSocialFund = async (req, res) => {
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

    const socialFund = await SocialFund.create({
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
      Group.findByIdAndUpdate(group, { $inc: { totalsocialfund: increment } }),
      Member.findByIdAndUpdate(member, { $inc: { socialFundTotal: increment } }),
    ]);

    return res.status(201).json(socialFund);
  } catch (error) {
    console.error('[SOCIAL FUND] createSocialFund error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getSocialFunds = async (req, res) => {
  try {
    const { group, member } = req.query;
    const filter = {};
    if (group) filter.group = group;
    if (member) filter.member = member;

    const socialFunds = await SocialFund.find(filter)
      .populate('member', 'memberName memberNumber')
      .populate('group', 'groupName groupCode branchName')
      .sort({ date: -1, createdAt: -1 });

    return res.json(socialFunds);
  } catch (error) {
    console.error('[SOCIAL FUND] getSocialFunds error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getSocialFundById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid social fund id' });
    }

    const socialFund = await SocialFund.findById(id)
      .populate('member', 'memberName memberNumber')
      .populate('group', 'groupName groupCode branchName');

    if (!socialFund) {
      return res.status(404).json({ message: 'Social fund record not found' });
    }

    return res.json(socialFund);
  } catch (error) {
    console.error('[SOCIAL FUND] getSocialFundById error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
