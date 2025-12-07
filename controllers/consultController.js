// backend/controllers/consultController.js
const pool = require('../config/db');
const { sendEmail } = require('../utils/emailService');
const validator = require('validator');

// Validation schema for consultation
const validateConsultation = (data) => {
    const errors = [];

    if (!data.name || data.name.trim().length < 2) {
        errors.push('Name must be at least 2 characters');
    }

    if (!data.email || !validator.isEmail(data.email)) {
        errors.push('Valid email is required');
    }

    if (!data.preferred_date || !validator.isDate(data.preferred_date)) {
        errors.push('Valid date is required');
    }

    if (data.notes && data.notes.length > 2000) {
        errors.push('Notes cannot exceed 2000 characters');
    }

    if (data.phone && !validator.isMobilePhone(data.phone)) {
        errors.push('Invalid phone number format');
    }

    return errors;
};

// Create a consultation request
exports.createConsultation = async (req, res) => {
    const { 
        name, 
        email, 
        preferred_date, 
        preferred_time,
        phone,
        consultation_type,
        duration,
        notes 
    } = req.body;
    
    const userId = req.user ? req.user.id : null;

    try {
        // Validate input
        const validationErrors = validateConsultation(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: validationErrors.join(', ')
            });
        }

        // Check for existing consultations on same date
        if (userId) {
            const [existing] = await pool.query(
                `SELECT id FROM Consultations 
                 WHERE user_id = ? AND preferred_date = ? AND status != 'cancelled'`,
                [userId, preferred_date]
            );

            if (existing.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'You already have a consultation scheduled for this date'
                });
            }
        }

        const [result] = await pool.query(
            `INSERT INTO Consultations 
             (user_id, name, email, phone, consultation_type, preferred_date, preferred_time, duration, notes) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, name, email, phone || null, consultation_type || 'general', 
             preferred_date, preferred_time || '09:00:00', duration || 60, notes]
        );

        const consultationId = result.insertId;

        // Get the created consultation
        const [consultations] = await pool.query(
            'SELECT * FROM Consultations WHERE id = ?',
            [consultationId]
        );

        const consultation = consultations[0];

        // Send confirmation email (async)
        sendEmail({
            to: email,
            subject: 'Consultation Confirmation - Wellness Platform',
            template: 'consultation-confirmation',
            context: {
                name,
                date: preferred_date,
                time: preferred_time || '09:00 AM',
                type: consultation_type || 'general',
                duration: duration || 60
            }
        }).catch(console.error);

        // Send notification to admin (in real app, this would be to admin email)
        console.log(`New consultation request from ${email} for ${preferred_date}`);

        res.status(201).json({
            success: true,
            data: {
                consultation,
                message: 'Consultation requested successfully'
            }
        });

    } catch (error) {
        console.error('Create consultation error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error creating consultation'
        });
    }
};

// List consultations for authenticated user
exports.getConsultations = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, limit = 10, page = 1 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM Consultations WHERE user_id = ?';
        const params = [userId];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        query += ' ORDER BY preferred_date DESC, created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM Consultations WHERE user_id = ?';
        const countParams = [userId];

        if (status) {
            countQuery += ' AND status = ?';
            countParams.push(status);
        }

        const [[rows], [[count]]] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, countParams)
        ]);

        // Format dates for frontend
        const formattedConsultations = rows.map(consultation => ({
            ...consultation,
            preferred_date: consultation.preferred_date.toISOString().split('T')[0],
            preferred_time: consultation.preferred_time ? 
                consultation.preferred_time.toString().substring(0, 5) : null
        }));

        res.json({
            success: true,
            data: {
                consultations: formattedConsultations,
                pagination: {
                    total: count.total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(count.total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get consultations error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching consultations'
        });
    }
};

// Get single consultation
exports.getConsultation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const [consultations] = await pool.query(
            `SELECT c.*, u.username as user_name 
             FROM Consultations c
             LEFT JOIN Users u ON c.user_id = u.id
             WHERE c.id = ? AND (c.user_id = ? OR ? = (SELECT id FROM Users WHERE is_admin = TRUE LIMIT 1))`,
            [id, userId, userId]
        );

        if (consultations.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Consultation not found or access denied'
            });
        }

        const consultation = consultations[0];
        
        // Format dates
        consultation.preferred_date = consultation.preferred_date.toISOString().split('T')[0];
        if (consultation.preferred_time) {
            consultation.preferred_time = consultation.preferred_time.toString().substring(0, 5);
        }

        res.json({
            success: true,
            data: { consultation }
        });

    } catch (error) {
        console.error('Get consultation error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching consultation'
        });
    }
};

// Update consultation (user can update notes, admin can update status)
exports.updateConsultation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const updateData = req.body;

        // Check if consultation exists and user has access
        const [consultations] = await pool.query(
            'SELECT * FROM Consultations WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (consultations.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Consultation not found'
            });
        }

        // Users can only update notes
        const allowedFields = ['notes'];
        if (req.user.is_admin) {
            allowedFields.push('status', 'preferred_date', 'preferred_time', 'duration');
        }

        // Filter update data
        const filteredUpdate = {};
        Object.keys(updateData).forEach(key => {
            if (allowedFields.includes(key)) {
                filteredUpdate[key] = updateData[key];
            }
        });

        if (Object.keys(filteredUpdate).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields to update'
            });
        }

        // Build update query
        const setClause = Object.keys(filteredUpdate)
            .map(key => `${key} = ?`)
            .join(', ');
        
        const values = [...Object.values(filteredUpdate), id, userId];

        await pool.query(
            `UPDATE Consultations 
             SET ${setClause}, updated_at = NOW() 
             WHERE id = ? AND user_id = ?`,
            values
        );

        // Get updated consultation
        const [updated] = await pool.query(
            'SELECT * FROM Consultations WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            data: { consultation: updated[0] },
            message: 'Consultation updated successfully'
        });

    } catch (error) {
        console.error('Update consultation error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error updating consultation'
        });
    }
};

// Cancel consultation
exports.cancelConsultation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const [result] = await pool.query(
            `UPDATE Consultations 
             SET status = 'cancelled', updated_at = NOW() 
             WHERE id = ? AND user_id = ? AND status IN ('pending', 'confirmed')`,
            [id, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'Consultation not found or cannot be cancelled'
            });
        }

        res.json({
            success: true,
            message: 'Consultation cancelled successfully'
        });

    } catch (error) {
        console.error('Cancel consultation error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error cancelling consultation'
        });
    }
};

// Admin: Get all consultations
exports.getAllConsultations = async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const { status, date_from, date_to, limit = 20, page = 1 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT c.*, u.username, u.email as user_email 
            FROM Consultations c
            LEFT JOIN Users u ON c.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND c.status = ?';
            params.push(status);
        }

        if (date_from) {
            query += ' AND c.preferred_date >= ?';
            params.push(date_from);
        }

        if (date_to) {
            query += ' AND c.preferred_date <= ?';
            params.push(date_to);
        }

        // Get total count
        const countQuery = query.replace('SELECT c.*, u.username, u.email as user_email', 'SELECT COUNT(*) as total');
        const [countResult] = await pool.query(countQuery, params);
        const total = countResult[0].total;

        // Add sorting and pagination
        query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [consultations] = await pool.query(query, params);

        res.json({
            success: true,
            data: {
                consultations,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get all consultations error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching all consultations'
        });
    }
};