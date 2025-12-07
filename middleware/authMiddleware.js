// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const protect = async (req, res, next) => {
    try {
        let token;

        // Check Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        // Check cookies
        else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Please log in.'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Fetch user from database
        const [users] = await pool.query(
            `SELECT id, username, email, is_admin, email_verified, 
                    created_at, updated_at 
             FROM Users 
             WHERE id = ? AND (reset_password_token IS NULL OR reset_password_expires < NOW())`,
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'User not found or account is locked.'
            });
        }

        // Attach user to request object
        req.user = users[0];
        
        // Log request with user info (optional)
        console.log(`Request from user ${req.user.id} (${req.user.username}) to ${req.method} ${req.path}`);
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error.message);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token. Please log in again.'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired. Please log in again.'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Authentication error. Please try again.'
        });
    }
};

const admin = (req, res, next) => {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({
            success: false,
            error: 'Admin access required.'
        });
    }
    next();
};

const optionalAuth = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const [users] = await pool.query(
                'SELECT id, username, email, is_admin FROM Users WHERE id = ?',
                [decoded.id]
            );

            if (users.length > 0) {
                req.user = users[0];
            }
        }
    } catch (error) {
        // Token is optional, so we ignore errors
        console.log('Optional auth failed, continuing without user:', error.message);
    }
    next();
};

module.exports = { protect, admin, optionalAuth };