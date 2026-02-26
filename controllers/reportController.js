const mongoose = require('mongoose');
const Savings = require('../models/Savings');
const SocialFund = require('../models/SocialFund');
const Loan = require('../models/Loan');
const Expense = require('../models/Expense');
const Member = require('../models/Member');

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const buildDateRange = (yearRaw) => {
  const year = Number(yearRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 3000) {
    return null;
  }
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  return { year, start, end };
};

const computeSummary = async ({ group, year }) => {
  const dateRange = buildDateRange(year);

  const savingsFilter = {};
  const socialFilter = {};
  const expenseFilter = {};
  const loanFilter = {};

  if (group) {
    savingsFilter.group = group;
    socialFilter.group = group;
    expenseFilter.group = group;
    loanFilter.group = group;
  }

  if (dateRange) {
    savingsFilter.date = { $gte: dateRange.start, $lte: dateRange.end };
    socialFilter.date = { $gte: dateRange.start, $lte: dateRange.end };
    expenseFilter.date = { $gte: dateRange.start, $lte: dateRange.end };
  }

  const [savingsEntries, socialEntries, expenses, loans] = await Promise.all([
    Savings.find(savingsFilter).select('amount shares transactionType member'),
    SocialFund.find(socialFilter).select('amount'),
    Expense.find(expenseFilter).select('type amount'),
    Loan.find(loanFilter).select('collections'),
  ]);

  const totalSavings = savingsEntries.reduce((sum, entry) => {
    const direction = entry.transactionType === 'debit' ? -1 : 1;
    return sum + (direction * Number(entry.amount || 0));
  }, 0);

  const totalSocialFunds = socialEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const totalExpenses = expenses
    .filter((entry) => entry.type !== 'fine')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const totalFines = expenses
    .filter((entry) => entry.type === 'fine')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  let totalInterest = 0;
  loans.forEach((loan) => {
    (loan.collections || []).forEach((collection) => {
      if (dateRange) {
        const collectedAt = collection.collectionDate ? new Date(collection.collectionDate) : null;
        if (!collectedAt || collectedAt < dateRange.start || collectedAt > dateRange.end) {
          return;
        }
      }
      totalInterest += Number(collection.interestPortion || 0);
    });
  });

  let yearEndInterestDistribution = [];
  let totalSharesAtYearEnd = 0;

  if (group) {
    const members = await Member.find({ group }).select('_id memberName memberNumber');

    const shareFilter = { group };
    if (dateRange) {
      shareFilter.date = { $lte: dateRange.end };
    }

    const shareEntries = await Savings.find(shareFilter).select('member shares transactionType');
    const memberSharesMap = new Map();

    shareEntries.forEach((entry) => {
      const memberId = String(entry.member);
      const current = memberSharesMap.get(memberId) || 0;
      const direction = entry.transactionType === 'debit' ? -1 : 1;
      const nextValue = current + (direction * Number(entry.shares || 0));
      memberSharesMap.set(memberId, Math.max(0, nextValue));
    });

    totalSharesAtYearEnd = Array.from(memberSharesMap.values()).reduce((sum, value) => sum + Number(value || 0), 0);

    yearEndInterestDistribution = members.map((member) => {
      const memberShares = memberSharesMap.get(String(member._id)) || 0;
      const percentage = totalSharesAtYearEnd > 0 ? (memberShares / totalSharesAtYearEnd) * 100 : 0;
      const distributedInterest = totalSharesAtYearEnd > 0 ? (totalInterest * memberShares) / totalSharesAtYearEnd : 0;
      return {
        memberId: member._id,
        memberName: member.memberName,
        memberNumber: member.memberNumber,
        shares: round2(memberShares),
        percentage: round2(percentage),
        interestAmount: round2(distributedInterest),
      };
    });
  }

  return {
    year: dateRange?.year || null,
    totals: {
      totalSavings: round2(totalSavings),
      totalInterest: round2(totalInterest),
      totalSocialFunds: round2(totalSocialFunds),
      totalFines: round2(totalFines),
      totalExpenses: round2(totalExpenses),
      totalSharesAtYearEnd: round2(totalSharesAtYearEnd),
    },
    yearEndInterestDistribution,
  };
};

exports.getSummaryReport = async (req, res) => {
  try {
    const { group, year } = req.query;

    if (group && !mongoose.isValidObjectId(group)) {
      return res.status(400).json({ message: 'Invalid group id' });
    }

    const summary = await computeSummary({ group, year });

    return res.json({
      group: group || null,
      ...summary,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('[REPORTS] getSummaryReport error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getYearEndInterestReport = async (req, res) => {
  try {
    const { group, year } = req.query;

    if (!group) {
      return res.status(400).json({ message: 'group is required for year-end interest report' });
    }

    if (!mongoose.isValidObjectId(group)) {
      return res.status(400).json({ message: 'Invalid group id' });
    }

    const summary = await computeSummary({ group, year });

    return res.json({
      group,
      year: summary.year,
      totalInterest: summary.totals.totalInterest,
      totalSharesAtYearEnd: summary.totals.totalSharesAtYearEnd,
      distribution: summary.yearEndInterestDistribution,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('[REPORTS] getYearEndInterestReport error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
