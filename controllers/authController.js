const authService = require('../services/authService');
const User = require('../models/User');
const activityLogService = require('../services/activityLogService');

/**
 * [POST] เข้าสู่ระบบ (Login)
 */
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. ค้นหาผู้ใช้
        const user = await User.findOne({ where: { username } });
        if (!user) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

        // 2. ตรวจสอบรหัสผ่าน
        const isMatch = await authService.comparePassword(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

        // 3. สร้าง Access Token และ Refresh Token
        const tokens = authService.generateTokens(user);

        // 4. บันทึก Log การเข้าใช้งาน
        await activityLogService.createLog({
            user_id: user.id,
            user_name: user.name || user.username,
            service: 'USER',
            action: 'LOGIN',
            ip_address: req.ip,
            details: { role: user.role }
        });

        // 5. ส่ง Refresh Token ผ่าน HttpOnly Cookie (เพื่อความปลอดภัยสูงสุด)
        res.cookie('jwt', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'None', 
            maxAge: 24 * 60 * 60 * 1000 // 1 วัน
        });

        // 6. ส่งข้อมูลผู้ใช้และ Access Token กลับไป
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
 * [POST] ต่ออายุ Access Token (Refresh Token)
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
            // ถ้า Token หมดอายุ ให้ล้าง Cookie
            res.clearCookie('jwt', { httpOnly: true, secure: true, sameSite: 'None' });
            return res.status(403).json({ success: false, message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
        }

        const user = await User.findByPk(decoded.id);
        if (!user) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้' });

        // สร้าง Access Token ใบใหม่
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
 * [POST] ออกจากระบบ (Logout)
 */
exports.logout = (req, res) => {
    // ล้าง Cookie ทิ้ง
    res.clearCookie('jwt', { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'None' 
    });
    res.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
};
