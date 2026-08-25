const jwt = require('jsonwebtoken');
const prisma = require("../config/database");

exports.verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: false,
        message: 'Token missing or invalid'
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const user = await prisma.user.findUnique({
      where: { id: Number(decoded.id) },
      select: { id: true, name: true, email: true, role: true, permissions: true, isActive: true },
    });
    if (!user || !user.isActive) return res.status(401).json({ status: false, message: "This admin account is inactive" });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      status: false,
      message: 'Invalid or expired token'
    });
  }
};

exports.requirePermission = (permission) => (req, res, next) => {
  if (req.user?.role === "SUPER_ADMIN" || req.user?.permissions?.includes(permission)) return next();
  return res.status(403).json({ status: false, message: "You do not have access to this dashboard section" });
};

exports.requireSuperAdmin = (req, res, next) => {
  if (req.user?.role === "SUPER_ADMIN") return next();
  return res.status(403).json({ status: false, message: "Super admin access is required" });
};
