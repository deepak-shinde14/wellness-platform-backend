// backend/routes/contentRoutes.js
const express = require('express');
const { 
    getContent,
    getContentById,
    bookmarkContent,
    removeBookmark,
    getBookmarks,
    getFeaturedContent,
    searchContent
} = require('../controllers/contentController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const router = express.Router();

// Public routes
router.get('/', optionalAuth, getContent);
router.get('/featured', getFeaturedContent);
router.get('/search', searchContent);
router.get('/:id', optionalAuth, getContentById);

// Protected routes (bookmarks)
router.post('/:id/bookmark', protect, bookmarkContent);
router.delete('/:id/bookmark', protect, removeBookmark);
router.get('/user/bookmarks', protect, getBookmarks);

module.exports = router;