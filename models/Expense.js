const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
  memberName: { type: String, trim: true },
  type: { type: String, enum: ['expense', 'fine'], default: 'expense' },
  category: { type: String, trim: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['USD', 'LRD'], required: true },
  date: { type: Date, default: Date.now },
  notes: { type: String, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
