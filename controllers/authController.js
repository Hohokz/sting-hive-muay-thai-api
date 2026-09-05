const authService = require('../services/authService');
const User = require('../models/User');
const activityLogService = require('../services/activityLogService');

/**
 * [POST] Login
 */
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Look up the user
        const user = await User.findOne({ where: { username } });
        if (!user) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

        // 2. Verify the password
        const isMatch = await authService.comparePassword(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

        // 3. Generate the access and refresh tokens
        const tokens = authService.generateTokens(user);

        // 4. Log the login
        await activityLogService.createLog({
            user_id: user.id,
            user_name: user.name || user.username,
            service: 'USER',
            action: 'LOGIN',
            ip_address: req.ip,
            details: { role: user.role }
        });

        // 5. Send the refresh token via an HttpOnly cookie for security
        res.cookie('jwt', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'None',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });

        // 6. Return the user info and access token
        res.json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ',
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role
            },
            accessToken: tokens.accessToken
        });

    } catch (error) {
        console.error('[AuthController] Login Error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
};

/**
 * [POST] Refresh the access token
 */
exports.refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.jwt;
        if (!refreshToken) {
            return res.status(401).json({ success: false, message: 'ไม่พบเซสชันการใช้งาน กรุณาเข้าสู่ระบบใหม่' });
        }

        let decoded;
        try {
            decoded = authService.verifyRefreshToken(refreshToken);
        } catch (err) {
            // Clear the cookie if the token expired
            res.clearCookie('jwt', { httpOnly: true, secure: true, sameSite: 'None' });
            return res.status(403).json({ success: false, message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
        }

        const user = await User.findByPk(decoded.id);
        if (!user) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้' });

        // Issue a new access token
        const newAccessToken = authService.generateAccessToken(user);

        res.json({
            success: true,
            accessToken: newAccessToken
        });

    } catch (error) {
        console.error('[AuthController] Refresh Token Error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
};

/**
 * [POST] Logout
 */
exports.logout = (req, res) => {
    // Clear the refresh-token cookie
    res.clearCookie('jwt', {
        httpOnly: true, 
        secure: true, 
        sameSite: 'None' 
    });
    res.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
};
