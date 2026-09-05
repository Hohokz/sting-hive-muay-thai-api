const authService = require('../services/authService');

exports.authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: 'Access Token Required' });
    }

    try {
        const user = authService.verifyAccessToken(token);
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ message: 'Invalid or Expired Token' });
    }
};

exports.authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access Denied: Insufficient Permissions' });
        }
        next();
    };
};

// Optional auth: attaches req.user when a valid token is present, but never
// blocks the request — used on public endpoints that behave slightly
// differently for a logged-in caller (e.g. an admin bypassing a date check).
// A missing OR invalid/expired token both just fall through as anonymous.
exports.extractUserIfPresent = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return next();
    }
    try {
        const user = authService.verifyAccessToken(token);
        req.user = user;
    } catch (err) {
        // Invalid/expired token: proceed as an anonymous request instead of blocking it.
    }
    next();
};
