const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.header('x-auth-token')) {
    token = req.header('x-auth-token');
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token invalid' });
  }
};

const authorizeRoles = (...roles) => (req, res, next) => {
  const allowed = roles.map((role) => role.toLowerCase());
  const userRole = req.user && req.user.role ? String(req.user.role).toLowerCase() : '';

  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  if (!allowed.includes(userRole)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  return next();
};

module.exports = { protect, authorizeRoles };
