// backend/routes/goalRoutes.js
const express = require('express');
const { 
    createGoal,
    getUserGoals,
    getGoal,
    updateGoalProgress,
    updateGoal,
    deleteGoal,
    getGoalStatistics
} = require('../controllers/goalController');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

// Goal management routes
router.post('/', protect, createGoal);
router.get('/', protect, getUserGoals);
router.get('/statistics', protect, getGoalStatistics);
router.get('/:id', protect, getGoal);
router.put('/:id/progress', protect, updateGoalProgress);
router.put('/:id', protect, updateGoal);
router.delete('/:id', protect, deleteGoal);

module.exports = router;