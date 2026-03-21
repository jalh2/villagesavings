const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const Distribution = require('../models/Distribution');
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

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const LOAN_MULTIPLIER = 3;
const OVERDUE_INTEREST_RATE = 5;

const toDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addDuration = (date, amount, unit) => {
  const baseDate = toDate(date);
  const durationAmount = Number(amount || 0);
  if (!baseDate || !durationAmount) return null;

  const nextDate = new Date(baseDate);
  switch (String(unit || '').toLowerCase()) {
    case 'days':
      nextDate.setDate(nextDate.getDate() + durationAmount);
      break;
    case 'weeks':
      nextDate.setDate(nextDate.getDate() + (durationAmount * 7));
      break;
    case 'months':
      nextDate.setMonth(nextDate.getMonth() + durationAmount);
      break;
    case 'years':
      nextDate.setFullYear(nextDate.getFullYear() + durationAmount);
      break;
    default:
      return null;
  }

  return nextDate;
};

const computeBaseTotalRepayable = (loanAmount, interestRate) => {
  const principal = Number(loanAmount || 0);
  const rate = Number(interestRate || 0);
  return round2(principal * (1 + (rate / 100)));
};

const getSortedCollections = (loan) => {
  const collections = Array.isArray(loan?.collections) ? [...loan.collections] : [];
  return collections.sort((a, b) => new Date(a?.collectionDate || 0) - new Date(b?.collectionDate || 0));
};

const getLoanDueDate = (loan) => {
  const startDate = toDate(loan?.disbursementDate || loan?.createdAt);
  if (!startDate) return null;
  return addDuration(startDate, loan?.loanDurationNumber, loan?.loanDurationUnit);
};

const wasLoanPaidByDueDate = (collections, dueDate, baseTotalRepayable) => {
  if (!dueDate || !baseTotalRepayable) return false;

  let realizedByDueDate = 0;
  for (const entry of collections) {
    const collectionDate = toDate(entry?.collectionDate);
    if (!collectionDate || collectionDate > dueDate) {
      continue;
    }

    realizedByDueDate += Number(entry?.fieldCollection || 0);
    if (round2(realizedByDueDate) >= baseTotalRepayable) {
      return true;
    }
  }

  return false;
};

const computeLoanFinancials = (loan, options = {}) => {
  const principalAmount = Number(loan?.loanAmount || 0);
  const baseInterestRate = Number(loan?.interestRate || 0);
  const baseInterestAmount = round2(principalAmount * (baseInterestRate / 100));
  const baseTotalRepayable = computeBaseTotalRepayable(principalAmount, baseInterestRate);
  const dueDate = getLoanDueDate(loan);
  const collections = getSortedCollections(loan);
  const totalRealization = round2(collections.reduce((sum, item) => sum + Number(item?.fieldCollection || 0), 0));
  const referenceDate = toDate(options.referenceDate) || new Date();
  const penaltyApplies = Boolean(
    dueDate
    && referenceDate > dueDate
    && !wasLoanPaidByDueDate(collections, dueDate, baseTotalRepayable)
  );
  const overdueInterestAmount = penaltyApplies
    ? round2(principalAmount * (OVERDUE_INTEREST_RATE / 100))
    : 0;
  const totalRepayable = round2(baseTotalRepayable + overdueInterestAmount);
  const remainingBalance = Math.max(0, round2(totalRepayable - totalRealization));

  return {
    principalAmount: round2(principalAmount),
    baseInterestRate: round2(baseInterestRate),
    baseInterestAmount,
    overdueInterestRate: penaltyApplies ? OVERDUE_INTEREST_RATE : 0,
    overdueInterestAmount,
    appliedInterestRate: round2(baseInterestRate + (penaltyApplies ? OVERDUE_INTEREST_RATE : 0)),
    baseTotalRepayable,
    totalRepayable,
    totalRealization,
    remainingBalance,
    dueDate,
    penaltyApplied: penaltyApplies,
    isOverdue: Boolean(dueDate && referenceDate > dueDate && remainingBalance > 0),
  };
};

const serializeLoan = (loan, options = {}) => {
  if (!loan) return loan;

  const plainLoan = typeof loan.toObject === 'function'
    ? loan.toObject()
    : { ...loan };
  const financials = computeLoanFinancials(plainLoan, options);

  return {
    ...plainLoan,
    totalRealization: financials.totalRealization,
    financials,
  };
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

    const eligibility = computeLoanEligibility({
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

const deriveAutomaticLoanStatus = (loan, options = {}) => {
  const financials = computeLoanFinancials(loan, options);

  if (financials.totalRepayable > 0 && financials.remainingBalance <= 0) {
    return 'paid';
  }

  if (loan?.status === 'denied') {
    return 'denied';
  }

  if (loan?.status === 'defaulted') {
    return 'defaulted';
  }

  return 'active';
};

const computeLoanEligibility = ({ memberDoc, groupDoc, requestedAmount, interestRate }) => {
  const savingsTotal = Number(memberDoc?.savingsTotal || 0);
  const totalShares = Number(memberDoc?.totalShares || 0);
  const savingsAmountPerShare = Number(groupDoc?.savingsamount || 0);
  const contributedSavings = Math.max(0, savingsTotal);
  const eligibleSavingsBase = contributedSavings;
  const loanLimit = eligibleSavingsBase * LOAN_MULTIPLIER;

  const requested = Number(requestedAmount || 0);
  const resolvedRate = Number(interestRate || 10);
  const interestAmount = requested > 0 && resolvedRate > 0
    ? requested * (resolvedRate / 100)
    : 0;

  return {
    savingsTotal: round2(savingsTotal),
    totalShares: round2(totalShares),
    savingsAmountPerShare: round2(savingsAmountPerShare),
    contributedSavings: round2(contributedSavings),
    eligibleSavingsBase: round2(eligibleSavingsBase),
    loanMultiplier: LOAN_MULTIPLIER,
    loanLimit: round2(loanLimit),
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
      disbursementDate,
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

    const eligibility = computeLoanEligibility({
      memberDoc,
      groupDoc,
      requestedAmount: principalAmount,
      interestRate: resolvedInterestRate,
    });

    if (eligibility.loanLimit <= 0) {
      return res.status(400).json({ message: 'Member has no available loan amount based on current savings and shares' });
    }

    if (principalAmount > eligibility.loanLimit) {
      return res.status(400).json({
        message: `Requested loan exceeds member limit (${eligibility.loanLimit})`,
        eligibility,
      });
    }

    const computedWeekly = weeklyInstallment || computeWeeklyInstallment(principalAmount, resolvedInterestRate, loanDurationNumber, loanDurationUnit);
    const effectiveStatus = status || 'active';
    const effectiveDisbursementDate = disbursementDate ? new Date(disbursementDate) : new Date();

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
      status: effectiveStatus,
      disbursementDate: effectiveDisbursementDate,
      guarantorInfo,
      treasuryInfo,
      secretaryInfo,
      groupHeadInfo,
      branchManagerInfo,
    });

    await Distribution.create({
      loan: loan._id,
      group: groupDoc._id,
      member: memberDoc._id,
      memberName: memberDoc.memberName,
      amount: principalAmount,
      currency,
      date: effectiveDisbursementDate,
      notes: 'Auto-recorded on loan creation',
    });

    const populated = await Loan.findById(loan._id)
      .populate('group', 'groupName groupCode')
      .populate('client', 'memberName memberNumber');

    return res.status(201).json(serializeLoan(populated));
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

    return res.json(loans.map((loan) => serializeLoan(loan)));
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

    return res.json(serializeLoan(loan));
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

    return res.json(serializeLoan(loan));
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

    return res.json(serializeLoan(populated));
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
      currency,
      collectionDate,
      principalPortion,
      interestPortion,
      feesPortion,
      securityDepositContribution,
    } = req.body;

    if (!memberName || !loanAmount || !weeklyAmount || fieldCollection == null || !currency) {
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

    const entryDate = collectionDate ? new Date(collectionDate) : new Date();
    const entry = {
      memberName,
      loanAmount,
      weeklyAmount,
      fieldCollection,
      advancePayment: advancePayment || 0,
      currency,
      collectionDate: entryDate,
      principalPortion,
      interestPortion,
      feesPortion,
      securityDepositContribution,
    };

    const nextCollections = [...(loan.collections || []), entry];
    const financials = computeLoanFinancials({
      ...loan.toObject(),
      collections: nextCollections,
    }, {
      referenceDate: entryDate,
    });

    entry.fieldBalance = financials.remainingBalance;

    loan.collections.push(entry);
    loan.totalRealization = financials.totalRealization;
    loan.status = deriveAutomaticLoanStatus({
      ...loan.toObject(),
      collections: loan.collections,
      totalRealization: loan.totalRealization,
    }, {
      referenceDate: entryDate,
    });

    if (loan.status === 'active' && !loan.disbursementDate) {
      loan.disbursementDate = new Date();
    }

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
