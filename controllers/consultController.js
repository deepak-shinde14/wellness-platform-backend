const pool = require('../config/db');

// Create a consultation request
exports.createConsultation = async (req, res) => {
    const { name, email, preferred_date, notes } = req.body;
    const userId = req.user ? req.user.id : null; // optional link to logged-in user

    try {
        const [result] = await pool.query(
            'INSERT INTO Consultations (user_id, name, email, preferred_date, notes) VALUES (?, ?, ?, ?, ?)',
            [userId, name, email, preferred_date, notes]
        );

        res.status(201).json({ id: result.insertId, message: 'Consultation requested' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error creating consultation' });
    }
};

// List consultations for authenticated user (admin access not implemented)
exports.getConsultations = async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query('SELECT * FROM Consultations WHERE user_id = ?', [userId]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching consultations' });
    }
};
