// backend/routes/adminRoutes.js
const express = require('express');
const { protect, admin } = require('../middleware/authMiddleware');
const { 
    getAdminStats,
    getAllUsers,
    updateUserStatus,
    createContent,
    updateContent,
    deleteContent 
} = require('../controllers/adminController');
const router = express.Router();

// Admin routes
router.get('/stats', protect, admin, getAdminStats);
router.get('/users', protect, admin, getAllUsers);
router.put('/users/:id', protect, admin, updateUserStatus);
router.post('/content', protect, admin, createContent);
router.put('/content/:id', protect, admin, updateContent);
router.delete('/content/:id', protect, admin, deleteContent);

module.exports = router;