const pool = require('./database');

const saveMessage = async (sender, recipient, message, imageUrl) => {
  try {
    const timestamp = new Date();
    await pool.query(
      'INSERT INTO messages (sender, recipient, message, image_url, timestamp) VALUES (?, ?, ?, ?, ?)',
      [sender, recipient, message, imageUrl, timestamp]
    );
  } catch (err) {
    console.error('Error saving message:', err);
  }
};

const getMessages = async (user1, user2) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, sender, recipient, message, image_url, timestamp, readd 
       FROM messages 
       WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?) 
       ORDER BY timestamp ASC`,
      [user1, user2, user2, user1]
    );
    return rows;
  } catch (err) {
    console.error('Error retrieving messages:', err);
    return [];
  }
};

module.exports = { saveMessage, getMessages };
