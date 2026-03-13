const mongoose = require('mongoose');
const SocialFund = require('../models/SocialFund');
const Group = require('../models/Group');
const Member = require('../models/Member');
const { resolveSingleGroup } = require('../utils/singleGroup');

 const validateAndPrepareEntry = async ({ groupId, entry }) => {
   const { member, memberName, amount, currency, date, notes } = entry;

   if (!member || amount == null || !currency) {
     return { error: { status: 400, message: 'member, amount, and currency are required' } };
   }

   if (!mongoose.isValidObjectId(member)) {
     return { error: { status: 400, message: 'Invalid member id' } };
   }

   const memberDoc = await Member.findById(member).select('group memberName');

   if (!memberDoc) {
     return { error: { status: 404, message: 'Member not found' } };
   }

   if (String(memberDoc.group) !== String(groupId)) {
     return { error: { status: 400, message: 'Member does not belong to this group' } };
   }

   const numericAmount = Number(amount || 0);
   if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
     return { error: { status: 400, message: 'amount must be a positive number' } };
   }

   return {
     payload: {
       group: groupId,
       member,
       memberName: memberName || memberDoc.memberName,
       amount: numericAmount,
       currency,
       date: date ? new Date(date) : new Date(),
       notes,
     },
     increment: numericAmount,
     memberId: member,
   };
 };

 const createEntries = async ({ groupDoc, entries }) => {
   const preparedEntries = [];

   for (const entry of entries) {
     const prepared = await validateAndPrepareEntry({ groupId: groupDoc._id, entry });
     if (prepared.error) return prepared;
     preparedEntries.push(prepared);
   }

   const docs = await SocialFund.insertMany(preparedEntries.map((item) => item.payload));
   const totalIncrement = preparedEntries.reduce((sum, item) => sum + item.increment, 0);

   const memberUpdates = preparedEntries.map((item) => (
     Member.findByIdAndUpdate(item.memberId, { $inc: { socialFundTotal: item.increment } })
   ));

   await Promise.all([
     Group.findByIdAndUpdate(groupDoc._id, { $inc: { totalsocialfund: totalIncrement } }),
     ...memberUpdates,
   ]);

   return { docs };
 };

exports.createSocialFund = async (req, res) => {
  try {
    const { group, member, memberName, amount, currency, date, notes } = req.body;

    const resolved = await resolveSingleGroup(group, '_id');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }
    const groupDoc = resolved.group;

    const created = await createEntries({
      groupDoc,
      entries: [{ member, memberName, amount, currency, date, notes }],
    });

    if (created.error) {
      return res.status(created.error.status).json({ message: created.error.message });
    }

    return res.status(201).json(created.docs[0]);
  } catch (error) {
    console.error('[SOCIAL FUND] createSocialFund error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

 exports.createBulkSocialFunds = async (req, res) => {
   try {
     const { group, currency, date, notes, entries } = req.body;

     if (!Array.isArray(entries) || entries.length === 0) {
       return res.status(400).json({ message: 'entries must be a non-empty array' });
     }

     const resolved = await resolveSingleGroup(group, '_id');
     if (resolved.error) {
       return res.status(resolved.error.status).json({ message: resolved.error.message });
     }

     const normalizedEntries = entries
       .filter((entry) => Number(entry?.amount || 0) > 0)
       .map((entry) => ({
         member: entry.member,
         memberName: entry.memberName,
         amount: entry.amount,
         currency: entry.currency || currency,
         date: entry.date || date,
         notes: entry.notes || notes,
       }));

     if (normalizedEntries.length === 0) {
       return res.status(400).json({ message: 'Provide at least one member amount greater than zero' });
     }

     const created = await createEntries({
       groupDoc: resolved.group,
       entries: normalizedEntries,
     });

     if (created.error) {
       return res.status(created.error.status).json({ message: created.error.message });
     }

     return res.status(201).json({
       count: created.docs.length,
       socialFunds: created.docs,
     });
   } catch (error) {
     console.error('[SOCIAL FUND] createBulkSocialFunds error', error);
     return res.status(500).json({ message: 'Server error' });
   }
 };

exports.getSocialFunds = async (req, res) => {
  try {
    const { group, member } = req.query;

    const resolved = await resolveSingleGroup(group, '_id');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }

    const filter = {};
    filter.group = resolved.group._id;
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

    const resolved = await resolveSingleGroup(String(socialFund.group?._id || ''), '_id');
    if (resolved.error) {
      return res.status(404).json({ message: 'Social fund record not found' });
    }

    return res.json(socialFund);
  } catch (error) {
    console.error('[SOCIAL FUND] getSocialFundById error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
