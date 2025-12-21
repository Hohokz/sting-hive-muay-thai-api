const userService = require('../services/userService');

/**
 * GET /api/v1/users
 * Get all users
 */
exports.getUsers = async (req, res) => {
    try {
        const users = await userService.getAllUsers();
        res.json({
            success: true,
            data: users
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * GET /api/v1/users/:id
 * Get user by ID
 */
exports.getUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await userService.getUserById(id);
        
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Get user error:', error);
        
        if (error.message === 'User not found') {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * POST /api/v1/users
 * Create new user
 */
exports.createUser = async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        const createdBy = req.user.username; // From auth middleware
        const newUser = await userService.createUser(req.body, createdBy);

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: newUser
        });
    } catch (error) {
        console.error('Create user error:', error);
        
        if (error.message === 'Username already exists' || error.message === 'Email already exists') {
            return res.status(409).json({
                success: false,
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * PUT /api/v1/users/:id
 * Update user
 */
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedBy = req.user.username; // From auth middleware
        
        const updatedUser = await userService.updateUser(id, req.body, updatedBy);

        res.json({
            success: true,
            message: 'User updated successfully',
            data: updatedUser
        });
    } catch (error) {
        console.error('Update user error:', error);
        
        if (error.message === 'User not found') {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }
        
        if (error.message === 'Username already exists' || error.message === 'Email already exists') {
            return res.status(409).json({
                success: false,
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * DELETE /api/v1/users/:id
 * Delete user (soft delete)
 */
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedBy = req.user.username; // From auth middleware
        
        const result = await userService.deleteUser(id, deletedBy);

        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('Delete user error:', error);
        
        if (error.message === 'User not found') {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
