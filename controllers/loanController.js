const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const Group = require('../models/Group');
const Member = require('../models/Member');

const toWeeks = (n, unit) => {
  const num = Number(n || 0);
  switch (String(unit || '').toLowerCase()) {
    case 'days':
      return Math.ceil(num / 7);
    case 'weeks':
      return num;
    case 'months':
      return num * 4;
    case 'years':
      return num * 52;
    default:
      return num;
  }
};

const computeWeeklyInstallment = (loanAmount, interestRate, durationNumber, durationUnit) => {
  const weeks = toWeeks(durationNumber, durationUnit);
  const principal = Number(loanAmount || 0);
  const rate = Number(interestRate || 0);
  if (!weeks || !principal) return undefined;
  const total = principal * (1 + rate / 100);
  return Math.round((total / weeks) * 100) / 100;
};

exports.createLoan = async (req, res) => {
  try {
    const {
      group,
      client,
      branchName,
      branchCode,
      meetingTime,
      meetingDay,
      memberCode,
      memberAddress,
      guarantorName,
      guarantorRelationship,
      guarantorImage,
      loanAmountInWords,
      loanDurationNumber,
      loanDurationUnit,
      purposeOfLoan,
      businessType,
      disbursementDate,
      endingDate,
      collectionStartDate,
      previousLoanInfo,
      memberOccupation,
      weeklyInstallment,
      securityDeposit,
      memberAdmissionFee,
      rentingOrOwner,
      educationBackground,
      district,
      maritalStatus,
      dependents,
      previousLoanSource,
      loanAmount,
      interestRate,
      currency,
      status,
      loanOfficerName,
      guarantorInfo,
      treasuryInfo,
      secretaryInfo,
      groupHeadInfo,
      loanOfficerInfo,
      branchManagerInfo,
    } = req.body;

    if (!group || !client || !branchName || !branchCode || !guarantorName || !guarantorRelationship || !loanAmountInWords || !loanDurationNumber || !loanDurationUnit || !loanAmount || !interestRate || !loanOfficerName) {
      return res.status(400).json({ message: 'Missing required loan fields' });
    }

    if (!mongoose.isValidObjectId(group) || !mongoose.isValidObjectId(client)) {
      return res.status(400).json({ message: 'Invalid group or client id' });
    }

    const groupDoc = await Group.findById(group);
    if (!groupDoc) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const memberDoc = await Member.findById(client);
    if (!memberDoc) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (String(memberDoc.group) !== String(groupDoc._id)) {
      return res.status(400).json({ message: 'Member does not belong to this group' });
    }

    const computedWeekly = weeklyInstallment || computeWeeklyInstallment(loanAmount, interestRate, loanDurationNumber, loanDurationUnit);

    const loan = await Loan.create({
      group: groupDoc._id,
      client: memberDoc._id,
      branchName,
      branchCode,
      meetingTime,
      meetingDay,
      memberCode,
      memberAddress,
      guarantorName,
      guarantorRelationship,
      guarantorImage,
      loanAmountInWords,
      loanDurationNumber,
      loanDurationUnit,
      purposeOfLoan,
      businessType,
      disbursementDate,
      endingDate,
      collectionStartDate,
      previousLoanInfo,
      memberOccupation,
      weeklyInstallment: computedWeekly,
      securityDeposit,
      memberAdmissionFee,
      rentingOrOwner,
      educationBackground,
      district,
      maritalStatus,
      dependents,
      previousLoanSource,
      loanAmount,
      interestRate,
      currency,
      status,
      loanOfficerName,
      guarantorInfo,
      treasuryInfo,
      secretaryInfo,
      groupHeadInfo,
      loanOfficerInfo,
      branchManagerInfo,
    });

    await Group.findByIdAndUpdate(groupDoc._id, { $inc: { totalLoans: 1, ...(status === 'active' ? { groupTotalLoanAmount: Number(loanAmount || 0) } : {}) } });

    const populated = await Loan.findById(loan._id)
      .populate('group', 'groupName groupCode')
      .populate('client', 'memberName memberNumber');

    return res.status(201).json(populated);
  } catch (error) {
    console.error('[LOANS] createLoan error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllLoans = async (req, res) => {
  try {
    const { group, client, branchName, branchCode, status, currency } = req.query;
    const filter = {};
    if (group) filter.group = group;
    if (client) filter.client = client;
    if (branchName) filter.branchName = branchName;
    if (branchCode) filter.branchCode = branchCode;
    if (status) filter.status = status;
    if (currency) filter.currency = currency;

    const loans = await Loan.find(filter)
      .populate('group', 'groupName groupCode')
      .populate('client', 'memberName memberNumber');

    return res.json(loans);
  } catch (error) {
    console.error('[LOANS] getAllLoans error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getLoanById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid loan id' });
    }

    const loan = await Loan.findById(id)
      .populate('group', 'groupName groupCode')
      .populate('client', 'memberName memberNumber');

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    return res.json(loan);
  } catch (error) {
    console.error('[LOANS] getLoanById error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateLoan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid loan id' });
    }

    const update = { ...req.body };
    delete update.group;
    delete update.client;

    if (update.loanDurationNumber || update.loanDurationUnit || update.loanAmount || update.interestRate) {
      const loanDoc = await Loan.findById(id).select('loanAmount interestRate loanDurationNumber loanDurationUnit weeklyInstallment');
      const merged = {
        loanAmount: update.loanAmount ?? loanDoc?.loanAmount,
        interestRate: update.interestRate ?? loanDoc?.interestRate,
        loanDurationNumber: update.loanDurationNumber ?? loanDoc?.loanDurationNumber,
        loanDurationUnit: update.loanDurationUnit ?? loanDoc?.loanDurationUnit,
      };
      update.weeklyInstallment = computeWeeklyInstallment(merged.loanAmount, merged.interestRate, merged.loanDurationNumber, merged.loanDurationUnit);
    }

    const loan = await Loan.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .populate('group', 'groupName groupCode')
      .populate('client', 'memberName memberNumber');

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    return res.json(loan);
  } catch (error) {
    console.error('[LOANS] updateLoan error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.setLoanStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid loan id' });
    }

    const allowed = ['pending', 'denied', 'active', 'paid', 'defaulted'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const loan = await Loan.findById(id);
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const wasActive = loan.status === 'active';
    loan.status = status;

    if (status === 'active' && !loan.disbursementDate) {
      loan.disbursementDate = new Date();
    }

    if (status === 'active') {
      loan.weeklyInstallment = loan.weeklyInstallment || computeWeeklyInstallment(loan.loanAmount, loan.interestRate, loan.loanDurationNumber, loan.loanDurationUnit);
    }

    await loan.save();

    if (!wasActive && status === 'active') {
      await Group.findByIdAndUpdate(loan.group, { $inc: { groupTotalLoanAmount: Number(loan.loanAmount || 0) } });
    }

    const populated = await Loan.findById(id)
      .populate('group', 'groupName groupCode')
      .populate('client', 'memberName memberNumber');

    return res.json(populated);
  } catch (error) {
    console.error('[LOANS] setLoanStatus error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.addCollection = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid loan id' });
    }

    const {
      memberName,
      loanAmount,
      weeklyAmount,
      fieldCollection,
      advancePayment,
      fieldBalance,
      currency,
      collectionDate,
      principalPortion,
      interestPortion,
      feesPortion,
      securityDepositContribution,
    } = req.body;

    if (!memberName || !loanAmount || !weeklyAmount || fieldCollection == null || fieldBalance == null || !currency) {
      return res.status(400).json({ message: 'Missing required collection fields' });
    }

    const loan = await Loan.findById(id);
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const entry = {
      memberName,
      loanAmount,
      weeklyAmount,
      fieldCollection,
      advancePayment: advancePayment || 0,
      fieldBalance,
      currency,
      collectionDate: collectionDate ? new Date(collectionDate) : new Date(),
      principalPortion,
      interestPortion,
      feesPortion,
      securityDepositContribution,
    };

    loan.collections.push(entry);
    loan.totalRealization = loan.collections.reduce((sum, item) => sum + Number(item.fieldCollection || 0), 0);

    await loan.save();

    return res.status(201).json(loan.collections);
  } catch (error) {
    console.error('[LOANS] addCollection error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listCollections = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid loan id' });
    }

    const loan = await Loan.findById(id).select('collections');
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    return res.json(loan.collections || []);
  } catch (error) {
    console.error('[LOANS] listCollections error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
