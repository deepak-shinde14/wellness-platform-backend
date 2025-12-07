// backend/routes/consultRoutes.js
const express = require('express');
const { 
    createConsultation, 
    getConsultations,
    getConsultation,
    updateConsultation,
    cancelConsultation,
    getAllConsultations
} = require('../controllers/consultController');
const { protect, admin, optionalAuth } = require('../middleware/authMiddleware');
const router = express.Router();

// Create consultation (optional auth for guests)
router.post('/', optionalAuth, createConsultation);

// User consultation routes
router.get('/', protect, getConsultations);
router.get('/:id', protect, getConsultation);
router.put('/:id', protect, updateConsultation);
router.delete('/:id/cancel', protect, cancelConsultation);

// Admin routes
router.get('/admin/all', protect, admin, getAllConsultations);

module.exports = router;