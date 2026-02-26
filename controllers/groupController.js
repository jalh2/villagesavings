const Group = require('../models/Group');
const { resolveSingleGroup, SINGLE_GROUP_MODE_MESSAGE } = require('../utils/singleGroup');

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

const toNumber = (value) => {
  if (value === '' || value == null) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

exports.createGroup = async (req, res) => {
  try {
    const {
      groupName,
      groupCode,
      branchName,
      organizationName,
      meetingDay,
      meetingTime,
      loanOfficer,
      community,
      totalGroupCount,
      chairpersonName,
      chairpersonNumber,
      recordKeeperName,
      recordKeeperNumber,
      boxKeeperName,
      boxKeeperNumber,
      moneyCounterOneName,
      moneyCounterOneNumber,
      moneyCounterTwoName,
      moneyCounterTwoNumber,
      keyholderOneName,
      keyholderOneNumber,
      keyholderTwoName,
      keyholderTwoNumber,
      keyholderThreeName,
      keyholderThreeNumber,
      policeOneName,
      policeOneNumber,
      policeTwoName,
      policeTwoNumber,
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
      totalShares,
      savingsDurationMonths,
      totalExpenses,
      totalFines,
      savingsamount,
      meetingFineAmount,
    } = req.body;

    const existingGroup = await Group.findOne().select('_id groupName');
    if (existingGroup) {
      return res.status(400).json({
        message: `${SINGLE_GROUP_MODE_MESSAGE} Update the existing group instead of creating another one.`,
        groupId: existingGroup._id,
        groupName: existingGroup.groupName,
      });
    }

    if (!groupName || !branchName) {
      return res.status(400).json({ message: 'groupName and branchName are required' });
    }

    const resolvedCode = groupCode || await generateGroupCode(groupName);
    const existing = await Group.findOne({ groupCode: resolvedCode }).select('_id');
    if (existing) {
      return res.status(400).json({ message: 'Group with this code already exists' });
    }

    const leadership = {
      chairpersonName: chairpersonName || presidentName,
      chairpersonNumber: chairpersonNumber || presidentNumber,
      recordKeeperName: recordKeeperName || securityName,
      recordKeeperNumber: recordKeeperNumber || securityNumber,
      boxKeeperName: boxKeeperName || treasurerName,
      boxKeeperNumber: boxKeeperNumber || treasurerNumber,
      moneyCounterOneName,
      moneyCounterOneNumber,
      moneyCounterTwoName,
      moneyCounterTwoNumber,
      keyholderOneName,
      keyholderOneNumber,
      keyholderTwoName,
      keyholderTwoNumber,
      keyholderThreeName,
      keyholderThreeNumber,
      policeOneName: policeOneName || police1Name,
      policeOneNumber: policeOneNumber || police1Number,
      policeTwoName: policeTwoName || police2Name,
      policeTwoNumber: policeTwoNumber || police2Number,
    };

    const group = await Group.create({
      groupName,
      groupCode: resolvedCode,
      branchName,
      organizationName,
      meetingDay,
      meetingTime,
      loanOfficer,
      community,
      totalGroupCount: toNumber(totalGroupCount),
      ...leadership,

      // Backward-compatible aliases used by existing screens/data.
      presidentName: leadership.chairpersonName,
      presidentNumber: leadership.chairpersonNumber,
      securityName: leadership.recordKeeperName,
      securityNumber: leadership.recordKeeperNumber,
      treasurerName: leadership.boxKeeperName,
      treasurerNumber: leadership.boxKeeperNumber,
      police1Name: leadership.policeOneName,
      police1Number: leadership.policeOneNumber,
      police2Name: leadership.policeTwoName,
      police2Number: leadership.policeTwoNumber,
      status,
      socialfundamount: toNumber(socialfundamount),
      totalsocialfund: toNumber(totalsocialfund),
      groupsavings: toNumber(groupsavings),
      membersavingsshare: toNumber(membersavingsshare),
      totalShares: toNumber(totalShares),
      savingsDurationMonths: toNumber(savingsDurationMonths),
      totalExpenses: toNumber(totalExpenses),
      totalFines: toNumber(totalFines),
      savingsamount: toNumber(savingsamount),
      meetingFineAmount: toNumber(meetingFineAmount),
    });

    return res.status(201).json(group);
  } catch (error) {
    console.error('[GROUPS] createGroup error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllGroups = async (req, res) => {
  try {
    const group = await Group.findOne()
      .sort({ createdAt: 1 })
      .populate('members', 'memberName memberNumber')
      .populate('leader', 'memberName memberNumber')
      .populate('secretary', 'memberName memberNumber')
      .populate('treasurer', 'memberName memberNumber')
      .populate('loanOfficer', 'username');
    return res.json(group ? [group] : []);
  } catch (error) {
    console.error('[GROUPS] getAllGroups error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getGroupById = async (req, res) => {
  try {
    const { id } = req.params;

    const resolved = await resolveSingleGroup(id, '_id');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }

    const group = await Group.findById(resolved.group._id)
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

    const resolved = await resolveSingleGroup(id, '_id');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }

    const update = { ...req.body };
    delete update.groupCode;

    if (update.presidentName && !update.chairpersonName) update.chairpersonName = update.presidentName;
    if (update.presidentNumber && !update.chairpersonNumber) update.chairpersonNumber = update.presidentNumber;
    if (update.securityName && !update.recordKeeperName) update.recordKeeperName = update.securityName;
    if (update.securityNumber && !update.recordKeeperNumber) update.recordKeeperNumber = update.securityNumber;
    if (update.treasurerName && !update.boxKeeperName) update.boxKeeperName = update.treasurerName;
    if (update.treasurerNumber && !update.boxKeeperNumber) update.boxKeeperNumber = update.treasurerNumber;
    if (update.police1Name && !update.policeOneName) update.policeOneName = update.police1Name;
    if (update.police1Number && !update.policeOneNumber) update.policeOneNumber = update.police1Number;
    if (update.police2Name && !update.policeTwoName) update.policeTwoName = update.police2Name;
    if (update.police2Number && !update.policeTwoNumber) update.policeTwoNumber = update.police2Number;

    if (update.chairpersonName) update.presidentName = update.chairpersonName;
    if (update.chairpersonNumber) update.presidentNumber = update.chairpersonNumber;
    if (update.recordKeeperName) update.securityName = update.recordKeeperName;
    if (update.recordKeeperNumber) update.securityNumber = update.recordKeeperNumber;
    if (update.boxKeeperName) update.treasurerName = update.boxKeeperName;
    if (update.boxKeeperNumber) update.treasurerNumber = update.boxKeeperNumber;
    if (update.policeOneName) update.police1Name = update.policeOneName;
    if (update.policeOneNumber) update.police1Number = update.policeOneNumber;
    if (update.policeTwoName) update.police2Name = update.policeTwoName;
    if (update.policeTwoNumber) update.police2Number = update.policeTwoNumber;

    const group = await Group.findByIdAndUpdate(resolved.group._id, update, { new: true, runValidators: true });
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
    return res.status(400).json({
      message: `${SINGLE_GROUP_MODE_MESSAGE} Group deletion is disabled.`,
    });
  } catch (error) {
    console.error('[GROUPS] deleteGroup error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
