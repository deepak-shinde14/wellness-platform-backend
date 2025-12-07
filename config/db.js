// backend/config/db.js
const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

const poolConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    port: process.env.DB_PORT,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: '+00:00',
};

// Conditionally add SSL configuration if ca.pem exists
const caPath = __dirname + '/ca.pem';
if (fs.existsSync(caPath)) {
    poolConfig.ssl = {
        ca: fs.readFileSync(caPath, 'utf8')
    };
    console.log('SSL configuration loaded.');
} else {
    console.log('SSL certificate (ca.pem) not found, proceeding without SSL. This may fail if the database requires it.');
}

const pool = mysql.createPool(poolConfig);

console.log('MySQL Pool Initialized...');

// Test DB Connection
pool.getConnection()
    .then(conn => {
        console.log('✅ Database connected successfully');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    });

// Graceful Shutdown
process.on('SIGINT', async () => {
    console.log('Closing database connections...');
    await pool.end();
    console.log('Database connections closed');
    process.exit(0);
});

module.exports = pool;
