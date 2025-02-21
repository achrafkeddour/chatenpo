// database.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'mysql-achked.alwaysdata.net',       // adjust if necessary
  user: 'achked',            // your MySQL username
  password: 'kedata2003@@@', // your MySQL password
  database: 'achked_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully');
    connection.release();
  } catch (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
})();

module.exports = pool;
