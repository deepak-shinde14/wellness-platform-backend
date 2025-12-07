const express = require('express');
const { getContent } = require('../controllers/contentController');
const router = express.Router();

router.get('/', getContent);

module.exports = router;
