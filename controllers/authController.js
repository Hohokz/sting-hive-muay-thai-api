const authService = require('../services/authService');
const User = require('../models/User');

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ where: { username } });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await authService.comparePassword(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const tokens = authService.generateTokens(user);

        // Optional: Save refresh token to DB or send as HttpOnly cookie
        // For now, sending both in response body as requested

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            },
            ...tokens
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ message: 'Refresh Token is required' });
        }

        let decoded;
        try {
            decoded = authService.verifyRefreshToken(refreshToken);
        } catch (err) {
            return res.status(403).json({ message: 'Invalid or expired Refresh Token' });
        }

        const user = await User.findByPk(decoded.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Generate new Access Token (and optionally new Refresh Token)
        const newTokens = authService.generateTokens(user);

        res.json({
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken // Rotation: sending new refresh token
        });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.logout = (req, res) => {
    // Client should delete tokens. Server side could blacklist token if implemented.
    res.json({ message: 'Logged out successfully' });
};
