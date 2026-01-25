const mongoose = require('mongoose');
const { roles } = require('../config/roles');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: roles, default: 'staff' },
  organization: { type: String, required: true, trim: true },
  branch: { type: String, required: true, trim: true },
  branchCode: { type: String, required: true, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
