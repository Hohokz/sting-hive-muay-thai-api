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
        console.log('--- Auth Debug ---');
        console.log('Required Roles:', roles);
        console.log('User from Token:', req.user);
        console.log('Check Result:', roles.includes(req.user?.role));
        console.log('------------------');

        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access Denied: Insufficient Permissions' });
        }
        next();
    };
};
