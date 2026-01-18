const authService = require('../services/authService');
const User = require('../models/User');
const activityLogService = require('../services/activityLogService');

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ where: { username } });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });

        const isMatch = await authService.comparePassword(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        // สร้างทั้ง 2 Token
        const tokens = authService.generateTokens(user);

        // ✅ Log Activity
        await activityLogService.createLog({
            user_id: user.id,
            user_name: user.name || user.username,
            service: 'USER',
            action: 'LOGIN',
            ip_address: req.ip,
            details: { role: user.role }
        });

        // 🔥 ความปลอดภัย: ส่ง Refresh Token ผ่าน HttpOnly Cookie
        // Browser จะเก็บให้อัตโนมัติ JS อ่านไม่ได้ (กันขโมย)
        res.cookie('jwt', tokens.refreshToken, {
            httpOnly: true,
            secure: true, // ต้องเป็น true ใน Production (HTTPS)
            sameSite: 'None', // หรือ 'Strict' ถ้าเป็น Domain เดียวกัน
            maxAge: 24 * 60 * 60 * 1000 // 1 วัน
        });

        // ส่งกลับแค่ Access Token ใน Body
        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role
            },
            accessToken: tokens.accessToken
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.refreshToken = async (req, res) => {
    try {
        // 🔥 รับ Refresh Token จาก Cookie แทน Body
        const refreshToken = req.cookies.jwt;

        if (!refreshToken) {
            return res.status(401).json({ message: 'Refresh Token required' });
        }

        let decoded;
        try {
            // เช็คว่าหมดอายุ 24 ชม. หรือยัง?
            decoded = authService.verifyRefreshToken(refreshToken);
        } catch (err) {
            // ❌ ถ้าหมดอายุแล้ว ให้ลบ Cookie และดีด User ออก
            res.clearCookie('jwt', { httpOnly: true, secure: true, sameSite: 'None' });
            return res.status(403).json({ message: 'Session expired. Please login again.' });
        }

        const user = await User.findByPk(decoded.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // ✅ แก้ไขจุดนี้: สร้าง *เฉพาะ* Access Token ใหม่
        // ❌ ห้ามเรียก generateTokens() หรือ generateRefreshToken() ใหม่เด็ดขาด!
        const newAccessToken = authService.generateAccessToken(user);

        // ส่ง Access Token ใบใหม่กลับไป
        res.json({
            accessToken: newAccessToken
        });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.logout = (req, res) => {
    // 🔥 สั่ง Browser ลบ Cookie ทิ้ง
    res.clearCookie('jwt', { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'None' 
    });
    res.json({ message: 'Logged out successfully' });
};