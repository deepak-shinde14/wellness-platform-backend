const express = require('express');
const { createConsultation, getConsultations } = require('../controllers/consultController');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

// Create a consultation (public but will attach user if token present)
router.post('/', protect, createConsultation);

// Get consultations for current user
router.get('/', protect, getConsultations);

module.exports = router;
