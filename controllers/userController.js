const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/User');

const sanitizeUser = (user) => {
  const safe = user.toObject();
  delete safe.password;
  return safe;
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    return res.json(users);
  } catch (error) {
    console.error('[USERS] getAllUsers error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json(user);
  } catch (error) {
    console.error('[USERS] getUserById error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.createUser = async (req, res) => {
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
    console.error('[USERS] createUser error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const update = { ...req.body };
    delete update.password;

    if (update.email) {
      update.email = String(update.email).toLowerCase();
    }

    const user = await User.findByIdAndUpdate(id, update, { new: true, runValidators: true }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json(user);
  } catch (error) {
    console.error('[USERS] updateUser error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    if (!newPassword) {
      return res.status(400).json({ message: 'newPassword is required' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.json({ message: 'Password updated' });
  } catch (error) {
    console.error('[USERS] changePassword error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    await User.findByIdAndDelete(id);
    return res.json({ message: 'User removed' });
  } catch (error) {
    console.error('[USERS] deleteUser error', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
