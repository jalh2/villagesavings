const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const sanitizeUser = (user) => {
  const safe = user.toObject();
  delete safe.password;
  return safe;
};

exports.register = async (req, res) => {
  const { username, email, password, role, organization, branch, branchCode } = req.body;

  if (!username || !email || !password || !organization || !branch || !branchCode) {
    return res.status(400).json({ message: 'username, email, password, organization, branch, and branchCode are required' });
  }

  try {
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = await User.create({
      username,
      email: String(email).toLowerCase(),
      password: hashed,
      role: role || 'staff',
      organization,
      branch,
      branchCode,
    });

    return res.status(201).json(sanitizeUser(user));
  } catch (error) {
    console.error('[AUTH REGISTER] error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  try {
    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dev_secret', {
      expiresIn: '30d',
    });

    return res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('[AUTH LOGIN] error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
