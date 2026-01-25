require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@villagesavings.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Admin';
const ADMIN_ORG = process.env.ADMIN_ORG || 'Village Savings';
const ADMIN_BRANCH = process.env.ADMIN_BRANCH || 'Head Office';
const ADMIN_BRANCH_CODE = process.env.ADMIN_BRANCH_CODE || 'HO';

async function seedAdmin() {
  try {
    await connectDB();

    const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
    if (existing) {
      console.log(`[seedAdmin] User already exists for ${ADMIN_EMAIL}.`);
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(ADMIN_PASSWORD, salt);

    const user = await User.create({
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL.toLowerCase(),
      password: hashed,
      role: 'admin',
      organization: ADMIN_ORG,
      branch: ADMIN_BRANCH,
      branchCode: ADMIN_BRANCH_CODE,
    });

    console.log(`[seedAdmin] Admin created: ${user.email} (${user.branchCode})`);
  } catch (error) {
    console.error('[seedAdmin] Failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin();
