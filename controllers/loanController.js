const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const Member = require('../models/Member');
const { resolveSingleGroup } = require('../utils/singleGroup');

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

exports.getLoanEligibility = async (req, res) => {
  try {
    const { group, client, loanAmount, interestRate } = req.query;

    if (!client) {
      return res.status(400).json({ message: 'client is required' });
    }

    if (!mongoose.isValidObjectId(client)) {
      return res.status(400).json({ message: 'Invalid client id' });
    }

    const resolved = await resolveSingleGroup(group, '_id savingsamount');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }

    const groupDoc = resolved.group;

    const memberDoc = await Member.findById(client).select('_id group memberName memberNumber savingsTotal totalShares');

    if (!memberDoc) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (String(memberDoc.group) !== String(groupDoc._id)) {
      return res.status(400).json({ message: 'Member does not belong to this group' });
    }

    const eligibility = computeCreditEligibility({
      memberDoc,
      groupDoc,
      requestedAmount: Number(loanAmount || 0),
      interestRate: interestRate == null || interestRate === '' ? 10 : Number(interestRate),
    });

    return res.json({
      group: groupDoc._id,
      client: {
        _id: memberDoc._id,
        memberName: memberDoc.memberName,
        memberNumber: memberDoc.memberNumber,
      },
      eligibility,
      defaults: {
        interestRate: 10,
      },
    });
  } catch (error) {
    console.error('[LOANS] getLoanEligibility error', error);
    return res.status(500).json({ message: 'Server error' });
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

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const computeCreditEligibility = ({ memberDoc, groupDoc, requestedAmount, interestRate }) => {
  const savingsTotal = Number(memberDoc?.savingsTotal || 0);
  const totalShares = Number(memberDoc?.totalShares || 0);
  const savingsAmountPerShare = Number(groupDoc?.savingsamount || 0);
  const creditByShares = totalShares > 0 && savingsAmountPerShare > 0
    ? totalShares * savingsAmountPerShare
    : 0;
  const creditLimit = Math.max(0, savingsTotal, creditByShares);

  const requested = Number(requestedAmount || 0);
  const resolvedRate = Number(interestRate || 10);
  const interestAmount = requested > 0 && resolvedRate > 0
    ? requested * (resolvedRate / 100)
    : 0;

  return {
    savingsTotal: round2(savingsTotal),
    totalShares: round2(totalShares),
    savingsAmountPerShare: round2(savingsAmountPerShare),
    creditByShares: round2(creditByShares),
    creditLimit: round2(creditLimit),
    requestedAmount: round2(requested),
    interestRate: round2(resolvedRate),
    interestAmount: round2(interestAmount),
  };
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
      organizationName,
      guarantorInfo,
      treasuryInfo,
      secretaryInfo,
      groupHeadInfo,
      branchManagerInfo,
    } = req.body;

    if (!client || !branchName || !branchCode || !guarantorName || !guarantorRelationship || !loanAmountInWords || loanDurationNumber == null || !loanDurationUnit || loanAmount == null) {
      return res.status(400).json({ message: 'Missing required loan fields' });
    }

    if (!mongoose.isValidObjectId(client)) {
      return res.status(400).json({ message: 'Invalid client id' });
    }

    const resolved = await resolveSingleGroup(group, '_id organizationName savingsamount');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }
    const groupDoc = resolved.group;

    const memberDoc = await Member.findById(client);
    if (!memberDoc) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (String(memberDoc.group) !== String(groupDoc._id)) {
      return res.status(400).json({ message: 'Member does not belong to this group' });
    }

    const principalAmount = Number(loanAmount);
    const resolvedInterestRate = interestRate == null || interestRate === ''
      ? 10
      : Number(interestRate);

    if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
      return res.status(400).json({ message: 'loanAmount must be a positive number' });
    }

    if (!Number.isFinite(resolvedInterestRate) || resolvedInterestRate <= 0) {
      return res.status(400).json({ message: 'interestRate must be a positive number' });
    }

    const eligibility = computeCreditEligibility({
      memberDoc,
      groupDoc,
      requestedAmount: principalAmount,
      interestRate: resolvedInterestRate,
    });

    if (eligibility.creditLimit <= 0) {
      return res.status(400).json({ message: 'Member has no eligible credit based on current savings and shares' });
    }

    if (principalAmount > eligibility.creditLimit) {
      return res.status(400).json({
        message: `Requested credit exceeds member limit (${eligibility.creditLimit})`,
        eligibility,
      });
    }

    const computedWeekly = weeklyInstallment || computeWeeklyInstallment(principalAmount, resolvedInterestRate, loanDurationNumber, loanDurationUnit);

    const loan = await Loan.create({
      group: groupDoc._id,
      client: memberDoc._id,
      organizationName: organizationName || groupDoc.organizationName,
      processedByOrganization: true,
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
      loanAmount: principalAmount,
      interestRate: resolvedInterestRate,
      currency,
      status,
      guarantorInfo,
      treasuryInfo,
      secretaryInfo,
      groupHeadInfo,
      branchManagerInfo,
    });

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

    const resolved = await resolveSingleGroup(group, '_id');
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }

    const filter = {};
    filter.group = resolved.group._id;
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

    const resolved = await resolveSingleGroup(String(loan.group?._id || loan.group), '_id');
    if (resolved.error) {
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

    const existingLoan = await Loan.findById(id).select('_id group');
    if (!existingLoan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const resolved = await resolveSingleGroup(String(existingLoan.group), '_id');
    if (resolved.error) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const update = { ...req.body };
    delete update.group;
    delete update.client;
    delete update.loanOfficerName;
    delete update.loanOfficerInfo;
    update.processedByOrganization = true;

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

    const resolved = await resolveSingleGroup(String(loan.group), '_id');
    if (resolved.error) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    loan.status = status;

    if (status === 'active' && !loan.disbursementDate) {
      loan.disbursementDate = new Date();
    }

    if (status === 'active') {
      loan.weeklyInstallment = loan.weeklyInstallment || computeWeeklyInstallment(loan.loanAmount, loan.interestRate, loan.loanDurationNumber, loan.loanDurationUnit);
    }

    await loan.save();

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

    const resolved = await resolveSingleGroup(String(loan.group), '_id');
    if (resolved.error) {
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

    const loan = await Loan.findById(id).select('collections group');
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const resolved = await resolveSingleGroup(String(loan.group), '_id');
    if (resolved.error) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    return res.json(loan.collections || []);
  } catch (error) {
    console.error('[LOANS] listCollections error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
