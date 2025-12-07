// backend/controllers/userController.js
const pool = require('../config/db');

// Get user dashboard data
exports.getUserDashboard = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get recent goals
        const [recentGoals] = await pool.query(
            `SELECT id, title, category, progress, status, target_date
             FROM Goals 
             WHERE user_id = ?
             ORDER BY updated_at DESC 
             LIMIT 5`,
            [userId]
        );

        // Get upcoming consultations
        const [upcomingConsultations] = await pool.query(
            `SELECT id, consultation_type, preferred_date, preferred_time, status
             FROM Consultations 
             WHERE user_id = ? 
                AND preferred_date >= CURDATE()
                AND status IN ('pending', 'confirmed')
             ORDER BY preferred_date ASC
             LIMIT 3`,
            [userId]
        );

        // Get recent content
        const [recentContent] = await pool.query(
            `SELECT c.id, c.title, c.excerpt, c.content_type, c.category, c.read_time
             FROM Content c
             WHERE c.is_published = TRUE
             ORDER BY c.created_at DESC 
             LIMIT 4`
        );

        // Get statistics
        const [[stats]] = await pool.query(
            `SELECT 
                (SELECT COUNT(*) FROM Goals WHERE user_id = ?) as total_goals,
                (SELECT COUNT(*) FROM Goals WHERE user_id = ? AND status = 'completed') as completed_goals,
                (SELECT COUNT(*) FROM Consultations WHERE user_id = ? AND status = 'completed') as completed_consults,
                (SELECT AVG(progress) FROM Goals WHERE user_id = ?) as avg_progress`,
            [userId, userId, userId, userId]
        );

        // Format dates
        const formattedGoals = recentGoals.map(goal => ({
            ...goal,
            target_date: goal.target_date ? goal.target_date.toISOString().split('T')[0] : null
        }));

        const formattedConsults = upcomingConsultations.map(consult => ({
            ...consult,
            preferred_date: consult.preferred_date.toISOString().split('T')[0],
            preferred_time: consult.preferred_time ? consult.preferred_time.toString().substring(0, 5) : null
        }));

        res.json({
            success: true,
            data: {
                dashboard: {
                    goals: formattedGoals,
                    consultations: formattedConsults,
                    content: recentContent,
                    statistics: {
                        totalGoals: stats.total_goals || 0,
                        completedGoals: stats.completed_goals || 0,
                        completedConsults: stats.completed_consults || 0,
                        averageProgress: Math.round(stats.avg_progress || 0)
                    }
                }
            }
        });

    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching dashboard data'
        });
    }
};

// Get user activities
exports.getUserActivities = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 20, page = 1 } = req.query;
        const offset = (page - 1) * limit;

        const [activities] = await pool.query(
            `SELECT up.*, g.title as goal_title, c.title as content_title
             FROM UserProgress up
             LEFT JOIN Goals g ON up.goal_id = g.id
             LEFT JOIN Content c ON up.content_id = c.id
             WHERE up.user_id = ?
             ORDER BY up.recorded_at DESC
             LIMIT ? OFFSET ?`,
            [userId, parseInt(limit), offset]
        );

        // Get total count
        const [countResult] = await pool.query(
            'SELECT COUNT(*) as total FROM UserProgress WHERE user_id = ?',
            [userId]
        );

        const formattedActivities = activities.map(activity => ({
            ...activity,
            recorded_at: activity.recorded_at.toISOString(),
            goal_title: activity.goal_title || null,
            content_title: activity.content_title || null
        }));

        res.json({
            success: true,
            data: {
                activities: formattedActivities,
                pagination: {
                    total: countResult[0].total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(countResult[0].total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get activities error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching activities'
        });
    }
};

// Update user settings
exports.updateUserSettings = async (req, res) => {
    try {
        const userId = req.user.id;
        const { email_notifications, goal_reminders, consultation_reminders, theme } = req.body;

        // In a real app, you would have a UserSettings table
        // For now, we'll just acknowledge the request
        const updates = {
            email_notifications: email_notifications !== undefined ? email_notifications : true,
            goal_reminders: goal_reminders !== undefined ? goal_reminders : true,
            consultation_reminders: consultation_reminders !== undefined ? consultation_reminders : true,
            theme: theme || 'light'
        };

        // Log the update (in real app, save to database)
        console.log(`User ${userId} updated settings:`, updates);

        res.json({
            success: true,
            data: { settings: updates },
            message: 'Settings updated successfully'
        });

    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error updating settings'
        });
    }
};