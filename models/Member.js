const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  present: { type: Boolean, default: true },
}, { _id: false });

const memberSchema = new mongoose.Schema({
  memberName: { type: String, required: true, trim: true },
  memberImage: { type: String },
  memberAge: { type: Number, required: true },
  guardianName: { type: String, required: true, trim: true },
  phone: { type: String },
  memberNumber: { type: String, required: true, trim: true },
  admissionDate: { type: Date, required: true },
  nationalId: { type: String, required: true, trim: true },
  memberSignature: { type: String },
  attendance: [attendanceSchema],
  savingsTotal: { type: Number, default: 0 },
  totalShares: { type: Number, default: 0 },
  interestEarnedTotal: { type: Number, default: 0 },
  socialFundTotal: { type: Number, default: 0 },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Member', memberSchema);
