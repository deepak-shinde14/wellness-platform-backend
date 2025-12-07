// backend/controllers/adminController.js
const pool = require('../config/db');

// Get admin statistics
exports.getAdminStats = async (req, res) => {
    try {
        // Get total users
        const [[userStats]] = await pool.query(
            `SELECT 
                COUNT(*) as total_users,
                SUM(CASE WHEN is_admin = TRUE THEN 1 ELSE 0 END) as admin_users,
                SUM(CASE WHEN email_verified = TRUE THEN 1 ELSE 0 END) as verified_users,
                COUNT(DISTINCT DATE(created_at)) as new_users_today
             FROM Users 
             WHERE DATE(created_at) = CURDATE()`
        );

        // Get goal statistics
        const [[goalStats]] = await pool.query(
            `SELECT 
                COUNT(*) as total_goals,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_goals,
                AVG(progress) as avg_progress,
                COUNT(DISTINCT user_id) as active_users
             FROM Goals`
        );

        // Get consultation statistics
        const [[consultStats]] = await pool.query(
            `SELECT 
                COUNT(*) as total_consultations,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_consultations,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_consultations,
                COUNT(DISTINCT DATE(created_at)) as new_today
             FROM Consultations`
        );

        // Get content statistics
        const [[contentStats]] = await pool.query(
            `SELECT 
                COUNT(*) as total_content,
                SUM(CASE WHEN is_featured = TRUE THEN 1 ELSE 0 END) as featured_content,
                SUM(view_count) as total_views,
                AVG(read_time) as avg_read_time
             FROM Content 
             WHERE is_published = TRUE`
        );

        // Get recent signups
        const [recentSignups] = await pool.query(
            `SELECT username, email, created_at 
             FROM Users 
             ORDER BY created_at DESC 
             LIMIT 5`
        );

        res.json({
            success: true,
            data: {
                statistics: {
                    users: userStats,
                    goals: goalStats,
                    consultations: consultStats,
                    content: contentStats
                },
                recentSignups: recentSignups.map(user => ({
                    ...user,
                    created_at: user.created_at.toISOString()
                }))
            }
        });

    } catch (error) {
        console.error('Get admin stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching admin statistics'
        });
    }
};

// Get all users
exports.getAllUsers = async (req, res) => {
    try {
        const { limit = 20, page = 1, search } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT id, username, email, is_admin, email_verified, created_at, updated_at,
                   (SELECT COUNT(*) FROM Goals WHERE user_id = Users.id) as goal_count,
                   (SELECT COUNT(*) FROM Consultations WHERE user_id = Users.id) as consultation_count
            FROM Users
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ' AND (username LIKE ? OR email LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }

        // Get total count
        const countQuery = query.replace('SELECT id, username, email, is_admin, email_verified, created_at, updated_at, (SELECT COUNT(*) FROM Goals WHERE user_id = Users.id) as goal_count, (SELECT COUNT(*) FROM Consultations WHERE user_id = Users.id) as consultation_count', 'SELECT COUNT(*) as total');
        const [countResult] = await pool.query(countQuery, params);
        const total = countResult[0].total;

        // Add sorting and pagination
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [users] = await pool.query(query, params);

        res.json({
            success: true,
            data: {
                users: users.map(user => ({
                    ...user,
                    created_at: user.created_at.toISOString(),
                    updated_at: user.updated_at.toISOString()
                })),
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching users'
        });
    }
};

// Update user status (admin only)
exports.updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_admin, email_verified } = req.body;

        // Prevent modifying self
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({
                success: false,
                error: 'Cannot modify your own admin status'
            });
        }

        const updates = {};
        if (is_admin !== undefined) updates.is_admin = is_admin;
        if (email_verified !== undefined) updates.email_verified = email_verified;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields to update'
            });
        }

        const setClause = Object.keys(updates)
            .map(key => `${key} = ?`)
            .join(', ');
        
        const values = [...Object.values(updates), id];

        await pool.query(
            `UPDATE Users SET ${setClause}, updated_at = NOW() WHERE id = ?`,
            values
        );

        res.json({
            success: true,
            message: 'User updated successfully'
        });

    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error updating user'
        });
    }
};

// Create content (admin)
exports.createContent = async (req, res) => {
    try {
        const { 
            title, 
            excerpt, 
            content_type, 
            content, 
            category, 
            tags, 
            author, 
            read_time,
            is_featured,
            is_published,
            thumbnail_url
        } = req.body;

        // Validate required fields
        if (!title || !content_type || !content) {
            return res.status(400).json({
                success: false,
                error: 'Title, content type, and content are required'
            });
        }

        // Generate slug from title
        const slug = title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        // Check for duplicate slug
        const [existing] = await pool.query(
            'SELECT id FROM Content WHERE slug = ?',
            [slug]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Content with similar title already exists'
            });
        }

        const [result] = await pool.query(
            `INSERT INTO Content 
             (title, slug, excerpt, content_type, content, category, tags, author, read_time, is_featured, is_published, thumbnail_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                title.trim(),
                slug,
                excerpt || null,
                content_type,
                content,
                category || null,
                tags ? JSON.stringify(tags) : null,
                author || 'Admin',
                read_time || 5,
                is_featured || false,
                is_published !== undefined ? is_published : true,
                thumbnail_url || null
            ]
        );

        const contentId = result.insertId;

        // Get the created content
        const [contentItem] = await pool.query('SELECT * FROM Content WHERE id = ?', [contentId]);

        res.status(201).json({
            success: true,
            data: { content: contentItem[0] },
            message: 'Content created successfully'
        });

    } catch (error) {
        console.error('Create content error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error creating content'
        });
    }
};

// Update content (admin)
exports.updateContent = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Check if content exists
        const [existing] = await pool.query('SELECT id FROM Content WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Content not found'
            });
        }

        // Build update query
        const allowedFields = [
            'title', 'excerpt', 'content_type', 'content', 'category', 
            'tags', 'author', 'read_time', 'is_featured', 'is_published', 'thumbnail_url'
        ];

        const updates = {};
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                if (field === 'tags' && updateData[field]) {
                    updates[field] = JSON.stringify(updateData[field]);
                } else {
                    updates[field] = updateData[field];
                }
            }
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields to update'
            });
        }

        // If title changed, update slug
        if (updates.title) {
            const slug = updates.title.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            updates.slug = slug;
        }

        updates.updated_at = new Date();

        // Build SQL
        const setClause = Object.keys(updates)
            .map(key => `${key} = ?`)
            .join(', ');
        
        const values = [...Object.values(updates), id];

        await pool.query(
            `UPDATE Content SET ${setClause} WHERE id = ?`,
            values
        );

        // Get updated content
        const [updated] = await pool.query('SELECT * FROM Content WHERE id = ?', [id]);

        res.json({
            success: true,
            data: { content: updated[0] },
            message: 'Content updated successfully'
        });

    } catch (error) {
        console.error('Update content error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error updating content'
        });
    }
};

// Delete content (admin)
exports.deleteContent = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if content exists
        const [existing] = await pool.query('SELECT id FROM Content WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Content not found'
            });
        }

        // Delete bookmarks first
        await pool.query('DELETE FROM Bookmarks WHERE content_id = ?', [id]);

        // Delete content
        await pool.query('DELETE FROM Content WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Content deleted successfully'
        });

    } catch (error) {
        console.error('Delete content error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error deleting content'
        });
    }
};