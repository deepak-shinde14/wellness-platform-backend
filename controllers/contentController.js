// backend/controllers/contentController.js
const pool = require('../config/db');

// Get all content with filtering
exports.getContent = async (req, res) => {
    try {
        const { 
            type, 
            category, 
            featured, 
            search, 
            limit = 10, 
            page = 1,
            sort = 'created_at',
            order = 'desc'
        } = req.query;

        const offset = (page - 1) * limit;
        const validSortFields = ['created_at', 'updated_at', 'title', 'read_time', 'view_count'];
        const sortField = validSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        let query = 'SELECT * FROM Content WHERE is_published = TRUE';
        const params = [];

        // Apply filters
        if (type) {
            query += ' AND content_type = ?';
            params.push(type);
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (featured === 'true') {
            query += ' AND is_featured = TRUE';
        }

        if (search) {
            query += ' AND (title LIKE ? OR excerpt LIKE ? OR MATCH(title, excerpt, content) AGAINST(? IN BOOLEAN MODE))';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, search);
        }

        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await pool.query(countQuery, params);
        const total = countResult[0].total;

        // Add sorting and pagination
        query += ` ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);

        const [content] = await pool.query(query, params);

        // Format dates and parse JSON fields
        const formattedContent = content.map(item => ({
            ...item,
            tags: item.tags || [],
            created_at: item.created_at.toISOString(),
            updated_at: item.updated_at.toISOString()
        }));

        // Get categories for filtering
        const [categories] = await pool.query(
            'SELECT DISTINCT category FROM Content WHERE category IS NOT NULL AND is_published = TRUE ORDER BY category'
        );

        // Get content types
        const [types] = await pool.query(
            'SELECT DISTINCT content_type FROM Content WHERE is_published = TRUE ORDER BY content_type'
        );

        res.json({
            success: true,
            data: {
                content: formattedContent,
                filters: {
                    categories: categories.map(c => c.category),
                    types: types.map(t => t.content_type)
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
        console.error('Get content error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching content'
        });
    }
};

// Get single content item
exports.getContentById = async (req, res) => {
    try {
        const { id } = req.params;

        // Increment view count
        await pool.query(
            'UPDATE Content SET view_count = view_count + 1 WHERE id = ?',
            [id]
        );

        const [content] = await pool.query(
            `SELECT c.*, 
                    (SELECT COUNT(*) FROM Bookmarks WHERE content_id = c.id) as bookmark_count
             FROM Content c
             WHERE c.id = ? AND c.is_published = TRUE`,
            [id]
        );

        if (content.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Content not found'
            });
        }

        const item = content[0];

        // Parse JSON fields
        item.tags = item.tags || [];
        item.created_at = item.created_at.toISOString();
        item.updated_at = item.updated_at.toISOString();

        // Get related content (same category)
        const [related] = await pool.query(
            `SELECT id, title, excerpt, content_type, category, read_time, thumbnail_url
             FROM Content 
             WHERE category = ? 
                AND id != ? 
                AND is_published = TRUE
             ORDER BY created_at DESC 
             LIMIT 3`,
            [item.category, id]
        );

        // Check if user has bookmarked this content
        let isBookmarked = false;
        if (req.user) {
            const [bookmarks] = await pool.query(
                'SELECT id FROM Bookmarks WHERE user_id = ? AND content_id = ?',
                [req.user.id, id]
            );
            isBookmarked = bookmarks.length > 0;
        }

        res.json({
            success: true,
            data: {
                content: item,
                isBookmarked,
                related: related.map(r => ({
                    ...r,
                    created_at: r.created_at.toISOString()
                }))
            }
        });

    } catch (error) {
        console.error('Get content by id error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching content'
        });
    }
};

// Bookmark content
exports.bookmarkContent = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if content exists
        const [content] = await pool.query(
            'SELECT id FROM Content WHERE id = ? AND is_published = TRUE',
            [id]
        );

        if (content.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Content not found'
            });
        }

        // Check if already bookmarked
        const [existing] = await pool.query(
            'SELECT id FROM Bookmarks WHERE user_id = ? AND content_id = ?',
            [userId, id]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Content already bookmarked'
            });
        }

        // Add bookmark
        await pool.query(
            'INSERT INTO Bookmarks (user_id, content_id) VALUES (?, ?)',
            [userId, id]
        );

        res.status(201).json({
            success: true,
            message: 'Content bookmarked successfully'
        });

    } catch (error) {
        console.error('Bookmark content error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error bookmarking content'
        });
    }
};

// Remove bookmark
exports.removeBookmark = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const [result] = await pool.query(
            'DELETE FROM Bookmarks WHERE user_id = ? AND content_id = ?',
            [userId, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'Bookmark not found'
            });
        }

        res.json({
            success: true,
            message: 'Bookmark removed successfully'
        });

    } catch (error) {
        console.error('Remove bookmark error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error removing bookmark'
        });
    }
};

// Get user's bookmarks
exports.getBookmarks = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 20, page = 1 } = req.query;
        const offset = (page - 1) * limit;

        const [bookmarks] = await pool.query(
            `SELECT c.*, b.created_at as bookmarked_at
             FROM Bookmarks b
             JOIN Content c ON b.content_id = c.id
             WHERE b.user_id = ? AND c.is_published = TRUE
             ORDER BY b.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, parseInt(limit), offset]
        );

        // Get total count
        const [countResult] = await pool.query(
            'SELECT COUNT(*) as total FROM Bookmarks WHERE user_id = ?',
            [userId]
        );

        const formattedBookmarks = bookmarks.map(item => ({
            ...item,
            tags: item.tags || [],
            created_at: item.created_at.toISOString(),
            bookmarked_at: item.bookmarked_at.toISOString()
        }));

        res.json({
            success: true,
            data: {
                bookmarks: formattedBookmarks,
                pagination: {
                    total: countResult[0].total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(countResult[0].total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get bookmarks error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching bookmarks'
        });
    }
};

// Get featured content
exports.getFeaturedContent = async (req, res) => {
    try {
        const [featured] = await pool.query(
            `SELECT id, title, excerpt, content_type, category, read_time, thumbnail_url, created_at
             FROM Content 
             WHERE is_featured = TRUE AND is_published = TRUE
             ORDER BY created_at DESC 
             LIMIT 6`
        );

        // Get popular content (most viewed)
        const [popular] = await pool.query(
            `SELECT id, title, excerpt, content_type, category, read_time, thumbnail_url, view_count
             FROM Content 
             WHERE is_published = TRUE
             ORDER BY view_count DESC 
             LIMIT 6`
        );

        res.json({
            success: true,
            data: {
                featured: featured.map(item => ({
                    ...item,
                    created_at: item.created_at.toISOString()
                })),
                popular: popular.map(item => ({
                    ...item
                }))
            }
        });

    } catch (error) {
        console.error('Get featured content error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching featured content'
        });
    }
};

// Search content
exports.searchContent = async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query must be at least 2 characters'
            });
        }

        const [results] = await pool.query(
            `SELECT id, title, excerpt, content_type, category, read_time, thumbnail_url,
                    MATCH(title, excerpt, content) AGAINST(? IN BOOLEAN MODE) as relevance
             FROM Content 
             WHERE is_published = TRUE 
                AND MATCH(title, excerpt, content) AGAINST(? IN BOOLEAN MODE)
             ORDER BY relevance DESC
             LIMIT ?`,
            [q, q, parseInt(limit)]
        );

        res.json({
            success: true,
            data: {
                results: results.map(item => ({
                    ...item,
                    created_at: item.created_at ? item.created_at.toISOString() : null
                })),
                query: q
            }
        });

    } catch (error) {
        console.error('Search content error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error searching content'
        });
    }
};