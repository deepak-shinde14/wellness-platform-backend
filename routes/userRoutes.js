// backend/routes/userRoutes.js
const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { 
    getUserDashboard,
    getUserActivities,
    updateUserSettings 
} = require('../controllers/userController');
const router = express.Router();

// User dashboard and profile routes
router.get('/dashboard', protect, getUserDashboard);
router.get('/activities', protect, getUserActivities);
router.put('/settings', protect, updateUserSettings);

module.exports = router;