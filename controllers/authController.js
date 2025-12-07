// backend/controllers/authController.js
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const validator = require('validator');
const { sendEmail } = require('../utils/emailService');

const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id,
            email: user.email,
            isAdmin: user.is_admin 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!/\d/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    return errors;
};

// --- SIGNUP ---
exports.signup = async (req, res) => {
    const { email, password, username } = req.body;

    try {
        // Validation
        if (!email || !password || !username) {
            return res.status(400).json({
                success: false,
                error: 'Please provide all required fields'
            });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid email address'
            });
        }

        if (username.length < 3 || username.length > 50) {
            return res.status(400).json({
                success: false,
                error: 'Username must be between 3 and 50 characters'
            });
        }

        const passwordErrors = validatePassword(password);
        if (passwordErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: passwordErrors.join(', ')
            });
        }

        // Check if user exists
        const [existingUsers] = await pool.query(
            'SELECT id FROM Users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'User with this email or username already exists'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const [result] = await pool.query(
            `INSERT INTO Users (username, email, password_hash) 
             VALUES (?, ?, ?)`,
            [username, email, hashedPassword]
        );

        const userId = result.insertId;

        // Get user data
        const [users] = await pool.query(
            'SELECT id, username, email, is_admin FROM Users WHERE id = ?',
            [userId]
        );

        const user = users[0];
        const token = generateToken(user);

        // Send welcome email (async)
        sendEmail({
            to: email,
            subject: 'Welcome to Wellness Platform!',
            template: 'welcome',
            context: { username }
        }).catch(console.error);

        // Set cookie for web clients
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(201).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    isAdmin: user.is_admin
                },
                token
            },
            message: 'Account created successfully!'
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during signup. Please try again.'
        });
    }
};

// --- LOGIN ---
exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Please provide email and password'
            });
        }

        // Get user with password hash
        const [users] = await pool.query(
            `SELECT id, username, email, password_hash, is_admin, email_verified 
             FROM Users WHERE email = ?`,
            [email]
        );

        const user = users[0];

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check if account is locked (password reset in progress)
        if (user.reset_password_token && user.reset_password_expires > new Date()) {
            return res.status(403).json({
                success: false,
                error: 'Account is locked. Please complete password reset process.'
            });
        }

        const token = generateToken(user);

        // Update last login (optional - add column to Users table if needed)
        await pool.query('UPDATE Users SET updated_at = NOW() WHERE id = ?', [user.id]);

        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    isAdmin: user.is_admin,
                    emailVerified: user.email_verified
                },
                token
            },
            message: 'Login successful'
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during login. Please try again.'
        });
    }
};

// --- LOGOUT ---
exports.logout = (req, res) => {
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0),
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });

    res.json({
        success: true,
        message: 'Logged out successfully'
    });
};

// --- FORGOT PASSWORD ---
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Please provide email address'
            });
        }

        const [users] = await pool.query(
            'SELECT id, username, email FROM Users WHERE email = ?',
            [email]
        );

        // Always return success even if email doesn't exist (security best practice)
        if (users.length === 0) {
            return res.json({
                success: true,
                message: 'If your email exists in our system, you will receive a password reset link.'
            });
        }

        const user = users[0];
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');
        
        const resetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        // Store in database
        await pool.query(
            `UPDATE Users 
             SET reset_password_token = ?, reset_password_expires = ? 
             WHERE id = ?`,
            [resetTokenHash, resetExpires, user.id]
        );

        // Store in PasswordResets table for audit trail
        await pool.query(
            `INSERT INTO PasswordResets (email, token, expires_at) 
             VALUES (?, ?, ?)`,
            [email, resetTokenHash, resetExpires]
        );

        // Send reset email
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
        
        await sendEmail({
            to: email,
            subject: 'Password Reset Request',
            template: 'password-reset',
            context: {
                username: user.username,
                resetUrl,
                expiresIn: '30 minutes'
            }
        });

        res.json({
            success: true,
            message: 'Password reset link sent to your email'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error. Please try again.'
        });
    }
};

// --- RESET PASSWORD ---
exports.resetPassword = async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'Please provide new password'
            });
        }

        const passwordErrors = validatePassword(password);
        if (passwordErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: passwordErrors.join(', ')
            });
        }

        // Hash the token to compare with database
        const resetTokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Find user with valid reset token
        const [users] = await pool.query(
            `SELECT id, username, email, reset_password_expires 
             FROM Users 
             WHERE reset_password_token = ? AND reset_password_expires > NOW()`,
            [resetTokenHash]
        );

        if (users.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired reset token'
            });
        }

        const user = users[0];

        // Hash new password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Update password and clear reset token
        await pool.query(
            `UPDATE Users 
             SET password_hash = ?, 
                 reset_password_token = NULL, 
                 reset_password_expires = NULL,
                 updated_at = NOW()
             WHERE id = ?`,
            [hashedPassword, user.id]
        );

        // Mark token as used in PasswordResets table
        await pool.query(
            `UPDATE PasswordResets 
             SET used = TRUE 
             WHERE token = ? AND email = ?`,
            [resetTokenHash, user.email]
        );

        // Send confirmation email
        await sendEmail({
            to: user.email,
            subject: 'Password Reset Successful',
            template: 'password-reset-confirm',
            context: { username: user.username }
        });

        res.json({
            success: true,
            message: 'Password reset successful. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error. Please try again.'
        });
    }
};

// --- GET CURRENT USER ---
exports.getMe = async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT id, username, email, is_admin, email_verified, 
                    created_at, updated_at 
             FROM Users WHERE id = ?`,
            [req.user.id]
        );

        const user = users[0];

        res.json({
            success: true,
            data: { user }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching user data'
        });
    }
};

// --- UPDATE USER PROFILE ---
exports.updateProfile = async (req, res) => {
    const { username } = req.body;

    try {
        if (!username || username.length < 3 || username.length > 50) {
            return res.status(400).json({
                success: false,
                error: 'Username must be between 3 and 50 characters'
            });
        }

        // Check if username is taken
        const [existing] = await pool.query(
            'SELECT id FROM Users WHERE username = ? AND id != ?',
            [username, req.user.id]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Username already taken'
            });
        }

        await pool.query(
            'UPDATE Users SET username = ?, updated_at = NOW() WHERE id = ?',
            [username, req.user.id]
        );

        // Get updated user
        const [users] = await pool.query(
            'SELECT id, username, email, is_admin FROM Users WHERE id = ?',
            [req.user.id]
        );

        res.json({
            success: true,
            data: { user: users[0] },
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error updating profile'
        });
    }
};

// --- CHANGE PASSWORD ---
exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    try {
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Please provide current and new password'
            });
        }

        // Get current password hash
        const [users] = await pool.query(
            'SELECT password_hash FROM Users WHERE id = ?',
            [req.user.id]
        );

        const user = users[0];

        // Verify current password
        const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
        
        if (!isCurrentValid) {
            return res.status(401).json({
                success: false,
                error: 'Current password is incorrect'
            });
        }

        // Validate new password
        const passwordErrors = validatePassword(newPassword);
        if (passwordErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: passwordErrors.join(', ')
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password
        await pool.query(
            'UPDATE Users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
            [hashedPassword, req.user.id]
        );

        // Send email notification
        const [userData] = await pool.query(
            'SELECT email, username FROM Users WHERE id = ?',
            [req.user.id]
        );

        await sendEmail({
            to: userData[0].email,
            subject: 'Password Changed Successfully',
            template: 'password-changed',
            context: { username: userData[0].username }
        });

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error changing password'
        });
    }
};