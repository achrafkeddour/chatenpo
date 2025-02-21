const pool = require('./database');
// const bcrypt = require('bcrypt'); i dont want to use it 

const register = async (req, res) => {
  try {
    const { name, username, password, dob, sexe } = req.body;
    if (!name || !username || !password || !dob || !sexe) {
      return res.status(400).send('All fields are required.');
    }
    // Check if the username already exists
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length > 0) {
      return res.status(400).send('Username already exists.');
    }
    //pour le cryptage dans la base de donnée mais mandirhach
    //const hashedPassword = await bcrypt.hash(password, 10); 

    await pool.query(
      'INSERT INTO users (name, username, password, dob, sexe) VALUES (?, ?, ?, ?, ?)',
      [name, username, password, dob, sexe]
    );
    // Redirect to login after successful registration
    res.redirect('/index.html');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).send('Username and password required.');
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(400).send('Invalid username or password.');
    }
    const user = rows[0];
    if (password !== user.password) {
      return res.status(400).send('Invalid username or password.');
    }
    // Save user info to session
    req.session.user = { id: user.id, username: user.username, name: user.name };
    res.redirect('/chat.html');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
};

const logout = (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send('Could not log out.');
    res.redirect('/index.html');
  });
};

module.exports = { register, login, logout };
