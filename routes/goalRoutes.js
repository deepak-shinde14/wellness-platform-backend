// backend/routes/goalRoutes.js
const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

// Simple route to test authentication
router.get('/goals', protect, async (req, res) => {
    // req.user is available here due to the protect middleware
    res.json({
        message: `Welcome to your goals dashboard, ${req.user.username}!`,
        userId: req.user.id,
        goals: [{ id: 1, name: "Lose 5kg", progress: "50%" }] 
    });
});

module.exports = router;