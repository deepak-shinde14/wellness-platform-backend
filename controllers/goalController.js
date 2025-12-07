// backend/controllers/goalController.js
const pool = require('../config/db');
const { sendEmail } = require('../utils/emailService');

// Validate goal data
const validateGoal = (data) => {
    const errors = [];

    if (!data.title || data.title.trim().length < 3) {
        errors.push('Title must be at least 3 characters');
    }

    if (!data.category || !['weight', 'nutrition', 'exercise', 'mindfulness', 'hydration', 'sleep', 'other'].includes(data.category)) {
        errors.push('Valid category is required');
    }

    if (data.target_value && (isNaN(data.target_value) || data.target_value <= 0)) {
        errors.push('Target value must be a positive number');
    }

    if (data.target_date && new Date(data.target_date) < new Date()) {
        errors.push('Target date must be in the future');
    }

    if (data.description && data.description.length > 2000) {
        errors.push('Description cannot exceed 2000 characters');
    }

    return errors;
};

// Create a new goal
exports.createGoal = async (req, res) => {
    try {
        const { title, description, category, target_value, target_date, unit, is_public } = req.body;
        const userId = req.user.id;

        // Validate input
        const validationErrors = validateGoal(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: validationErrors.join(', ')
            });
        }

        // Check for duplicate active goals
        const [existingGoals] = await pool.query(
            `SELECT id FROM Goals 
             WHERE user_id = ? AND title = ? AND status = 'active'`,
            [userId, title.trim()]
        );

        if (existingGoals.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'You already have an active goal with this title'
            });
        }

        const [result] = await pool.query(
            `INSERT INTO Goals 
             (user_id, title, description, category, target_value, target_date, unit, is_public) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, title.trim(), description || null, category, 
             target_value || null, target_date || null, unit || null, is_public || false]
        );

        const goalId = result.insertId;

        // Get the created goal
        const [goals] = await pool.query('SELECT * FROM Goals WHERE id = ?', [goalId]);
        const goal = goals[0];

        // Calculate initial progress if target_value exists
        if (goal.target_value && goal.current_value) {
            const progress = Math.min(100, Math.floor((goal.current_value / goal.target_value) * 100));
            await pool.query('UPDATE Goals SET progress = ? WHERE id = ?', [progress, goalId]);
            goal.progress = progress;
        }

        // Log goal creation activity
        await pool.query(
            `INSERT INTO UserProgress (user_id, goal_id, activity_type, notes) 
             VALUES (?, ?, 'goal_created', ?)`,
            [userId, goalId, `Created goal: ${title}`]
        );

        res.status(201).json({
            success: true,
            data: { goal },
            message: 'Goal created successfully!'
        });

    } catch (error) {
        console.error('Create goal error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error creating goal'
        });
    }
};

// Get user's goals
exports.getUserGoals = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, category, limit = 20, page = 1, sort = 'created_at', order = 'desc' } = req.query;
        
        const offset = (page - 1) * limit;
        const validSortFields = ['created_at', 'updated_at', 'title', 'target_date', 'progress'];
        const sortField = validSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        let query = 'SELECT * FROM Goals WHERE user_id = ?';
        const params = [userId];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await pool.query(countQuery, params);
        const total = countResult[0].total;

        // Add sorting and pagination
        query += ` ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);

        const [goals] = await pool.query(query, params);

        // Calculate progress for each goal
        const goalsWithProgress = goals.map(goal => {
            let progress = goal.progress;
            
            // Recalculate progress if needed
            if (goal.target_value && goal.current_value) {
                progress = Math.min(100, Math.floor((goal.current_value / goal.target_value) * 100));
            }
            
            return {
                ...goal,
                progress,
                target_date: goal.target_date ? goal.target_date.toISOString().split('T')[0] : null,
                created_at: goal.created_at.toISOString(),
                updated_at: goal.updated_at.toISOString()
            };
        });

        // Calculate statistics
        const activeGoals = goals.filter(g => g.status === 'active').length;
        const completedGoals = goals.filter(g => g.status === 'completed').length;
        const avgProgress = goalsWithProgress.length > 0 
            ? Math.round(goalsWithProgress.reduce((sum, g) => sum + g.progress, 0) / goalsWithProgress.length)
            : 0;

        res.json({
            success: true,
            data: {
                goals: goalsWithProgress,
                statistics: {
                    total: goals.length,
                    active: activeGoals,
                    completed: completedGoals,
                    averageProgress: avgProgress
                },
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get goals error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching goals'
        });
    }
};

// Get single goal
exports.getGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const [goals] = await pool.query(
            `SELECT g.*, 
                    (SELECT COUNT(*) FROM UserProgress WHERE goal_id = g.id) as activity_count
             FROM Goals g
             WHERE g.id = ? AND g.user_id = ?`,
            [id, userId]
        );

        if (goals.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Goal not found'
            });
        }

        const goal = goals[0];

        // Get goal activities
        const [activities] = await pool.query(
            `SELECT * FROM UserProgress 
             WHERE goal_id = ? 
             ORDER BY recorded_at DESC 
             LIMIT 50`,
            [id]
        );

        // Format dates
        goal.target_date = goal.target_date ? goal.target_date.toISOString().split('T')[0] : null;
        goal.created_at = goal.created_at.toISOString();
        goal.updated_at = goal.updated_at.toISOString();

        res.json({
            success: true,
            data: {
                goal,
                activities: activities.map(activity => ({
                    ...activity,
                    recorded_at: activity.recorded_at.toISOString()
                }))
            }
        });

    } catch (error) {
        console.error('Get goal error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching goal'
        });
    }
};

// Update goal progress
exports.updateGoalProgress = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { current_value, notes, mood } = req.body;

        // Validate input
        if (current_value !== undefined && (isNaN(current_value) || current_value < 0)) {
            return res.status(400).json({
                success: false,
                error: 'Current value must be a non-negative number'
            });
        }

        // Get current goal
        const [goals] = await pool.query(
            'SELECT * FROM Goals WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (goals.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Goal not found'
            });
        }

        const goal = goals[0];

        // Update current value
        const newCurrentValue = current_value !== undefined ? current_value : goal.current_value;
        
        await pool.query(
            `UPDATE Goals 
             SET current_value = ?, updated_at = NOW() 
             WHERE id = ?`,
            [newCurrentValue, id]
        );

        // Calculate and update progress
        let progress = 0;
        if (goal.target_value && newCurrentValue > 0) {
            progress = Math.min(100, Math.floor((newCurrentValue / goal.target_value) * 100));
            
            // Update progress
            await pool.query('UPDATE Goals SET progress = ? WHERE id = ?', [progress, id]);
            
            // Check if goal is completed
            if (progress >= 100 && goal.status !== 'completed') {
                await pool.query(
                    `UPDATE Goals SET status = 'completed', updated_at = NOW() WHERE id = ?`,
                    [id]
                );
            }
        }

        // Log progress update
        await pool.query(
            `INSERT INTO UserProgress 
             (user_id, goal_id, activity_type, value, notes, mood) 
             VALUES (?, ?, 'progress_update', ?, ?, ?)`,
            [userId, id, newCurrentValue, notes || null, mood || null]
        );

        // Get updated goal
        const [updatedGoals] = await pool.query('SELECT * FROM Goals WHERE id = ?', [id]);
        const updatedGoal = updatedGoals[0];
        updatedGoal.progress = progress;

        // Format dates
        updatedGoal.target_date = updatedGoal.target_date ? updatedGoal.target_date.toISOString().split('T')[0] : null;
        updatedGoal.created_at = updatedGoal.created_at.toISOString();
        updatedGoal.updated_at = updatedGoal.updated_at.toISOString();

        // Send congratulations email if goal completed
        if (progress >= 100 && goal.progress < 100) {
            const [userData] = await pool.query(
                'SELECT email, username FROM Users WHERE id = ?',
                [userId]
            );

            sendEmail({
                to: userData[0].email,
                subject: 'Congratulations! Goal Achieved!',
                template: 'goal-achieved',
                context: {
                    username: userData[0].username,
                    goalTitle: goal.title,
                    progress: progress
                }
            }).catch(console.error);
        }

        res.json({
            success: true,
            data: { goal: updatedGoal },
            message: 'Progress updated successfully'
        });

    } catch (error) {
        console.error('Update progress error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error updating progress'
        });
    }
};

// Update goal details
exports.updateGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const updateData = req.body;

        // Get current goal
        const [goals] = await pool.query(
            'SELECT * FROM Goals WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (goals.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Goal not found'
            });
        }

        const goal = goals[0];

        // Validate update data
        const validationErrors = validateGoal(updateData);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: validationErrors.join(', ')
            });
        }

        // Build update query
        const allowedFields = ['title', 'description', 'category', 'target_value', 'target_date', 'unit', 'is_public', 'status'];
        const updates = {};
        
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                updates[field] = updateData[field];
            }
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields to update'
            });
        }

        // Add updated_at
        updates.updated_at = new Date();

        // Build SQL
        const setClause = Object.keys(updates)
            .map(key => `${key} = ?`)
            .join(', ');
        
        const values = [...Object.values(updates), id, userId];

        await pool.query(
            `UPDATE Goals SET ${setClause} WHERE id = ? AND user_id = ?`,
            values
        );

        // Recalculate progress if target_value or current_value changed
        if (updates.target_value !== undefined || updates.current_value !== undefined) {
            const [updatedGoal] = await pool.query('SELECT * FROM Goals WHERE id = ?', [id]);
            
            if (updatedGoal[0].target_value && updatedGoal[0].current_value) {
                const progress = Math.min(100, Math.floor((updatedGoal[0].current_value / updatedGoal[0].target_value) * 100));
                await pool.query('UPDATE Goals SET progress = ? WHERE id = ?', [progress, id]);
                updates.progress = progress;
            }
        }

        // Log update activity
        await pool.query(
            `INSERT INTO UserProgress (user_id, goal_id, activity_type, notes) 
             VALUES (?, ?, 'goal_updated', ?)`,
            [userId, id, 'Goal details updated']
        );

        // Get final updated goal
        const [finalGoal] = await pool.query('SELECT * FROM Goals WHERE id = ?', [id]);

        res.json({
            success: true,
            data: { goal: finalGoal[0] },
            message: 'Goal updated successfully'
        });

    } catch (error) {
        console.error('Update goal error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error updating goal'
        });
    }
};

// Delete goal
exports.deleteGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const [result] = await pool.query(
            'DELETE FROM Goals WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'Goal not found'
            });
        }

        // Also delete related activities
        await pool.query('DELETE FROM UserProgress WHERE goal_id = ?', [id]);

        res.json({
            success: true,
            message: 'Goal deleted successfully'
        });

    } catch (error) {
        console.error('Delete goal error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error deleting goal'
        });
    }
};

// Get goal statistics
exports.getGoalStatistics = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get all goals for user
        const [goals] = await pool.query(
            `SELECT 
                category,
                status,
                COUNT(*) as count,
                AVG(progress) as avg_progress,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
             FROM Goals 
             WHERE user_id = ?
             GROUP BY category, status
             ORDER BY category, status`,
            [userId]
        );

        // Get recent activities
        const [recentActivities] = await pool.query(
            `SELECT up.*, g.title as goal_title 
             FROM UserProgress up
             LEFT JOIN Goals g ON up.goal_id = g.id
             WHERE up.user_id = ?
             ORDER BY up.recorded_at DESC
             LIMIT 10`,
            [userId]
        );

        // Calculate overall statistics
        const [overallStats] = await pool.query(
            `SELECT 
                COUNT(*) as total_goals,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_goals,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_goals,
                AVG(progress) as overall_progress
             FROM Goals 
             WHERE user_id = ?`,
            [userId]
        );

        // Get goal completion trend (last 30 days)
        const [completionTrend] = await pool.query(
            `SELECT 
                DATE(updated_at) as date,
                COUNT(*) as completions
             FROM Goals 
             WHERE user_id = ? 
                AND status = 'completed' 
                AND updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY DATE(updated_at)
             ORDER BY date`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                statistics: overallStats[0],
                byCategory: goals,
                recentActivities: recentActivities.map(activity => ({
                    ...activity,
                    recorded_at: activity.recorded_at.toISOString()
                })),
                completionTrend
            }
        });

    } catch (error) {
        console.error('Get statistics error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching statistics'
        });
    }
};