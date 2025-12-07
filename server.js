// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./config/db'); 

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import Routes
const authRoutes = require('./routes/authRoutes');
const goalRoutes = require('./routes/goalRoutes');
const consultRoutes = require('./routes/consultRoutes');
const contentRoutes = require('./routes/contentRoutes');

// Define Routes
app.use('/api/auth', authRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/consults', consultRoutes);
app.use('/api/content', contentRoutes);

app.get('/', (req, res) => {
    res.send('Wellness Platform API Running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));