const express = require('express');
const app = express();
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');

// Import the database pool from database.js
const pool = require('./database');

// Controllers
const { register, login, logout } = require('./authController');
const { saveMessage, getMessages } = require('./chatController');

// Setup session middleware
const sessionMiddleware = session({
  secret: 'your_secret_key', // Change to a secure key in production
  resave: false,
  saveUninitialized: false
});
app.use(sessionMiddleware);

// Share sessions with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Parse incoming requests
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static files from "public"
app.use(express.static(path.join(__dirname, 'public')));

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Auth routes
app.post('/register', register);
app.post('/login', login);
app.get('/logout', logout);

// Endpoint for image uploads
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  const imageUrl = '/uploads/' + req.file.filename;
  res.json({ imageUrl });
});

// Protect the chat page – only allow authenticated users
app.get('/chat.html', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/index.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Online users tracking
const onlineUsers = new Set();
const userStatuses = new Map();

io.on('connection', (socket) => {
  const session = socket.request.session;
  if (!session.user) {
    // Not authenticated: disconnect the socket
    socket.disconnect(true);
    return;
  }
  const username = session.user.username;
  
  // Add user to online users and join their room
  onlineUsers.add(username);
  socket.join(username);
  
  // Broadcast updated online users list
  io.emit('updateUserList', Array.from(onlineUsers));

  // Handle private messages
  socket.on('private message', async ({ recipient, message, imageUrl }) => {
    try {
      const [result] = await pool.query(
        'INSERT INTO messages (sender, recipient, message, image_url, timestamp) VALUES (?, ?, ?, ?, ?)',
        [username, recipient, message, imageUrl, new Date()]
      );
      const messageId = result.insertId;
      io.to(recipient).emit('private message', { sender: username, message, imageUrl, id: messageId });
      socket.emit('private message', { sender: username, message, imageUrl, id: messageId });
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });
  
  // Handle typing events
  socket.on('typing', ({ recipient }) => {
    io.to(recipient).emit('typing', { sender: username });
  });
  
  socket.on('stop typing', ({ recipient }) => {
    io.to(recipient).emit('stop typing', { sender: username });
  });
  
  // Handle call events
  socket.on('call user', ({ recipient, offer, video }) => {
    io.to(recipient).emit('call user', { caller: username, offer, video });
  });
  
  socket.on('answer call', ({ recipient, answer }) => {
    io.to(recipient).emit('answer call', { answer });
  });
  
  socket.on('webrtc signal', ({ recipient, signal }) => {
    io.to(recipient).emit('webrtc signal', { signal });
  });
  
  socket.on('end call', ({ recipient }) => {
    io.to(recipient).emit('call ended');
  });
  
  // Handle message history
  socket.on('get messages', async ({ withUser }) => {
    try {
      const messages = await getMessages(username, withUser);
      socket.emit('message history', messages);
    } catch (err) {
      console.error('Error retrieving messages:', err);
      socket.emit('message history', []);
    }
  });
  
  // Handle message deletion
  socket.on('delete message', async ({ messageId, recipient }) => {
    try {
      await pool.query('DELETE FROM messages WHERE id = ? AND sender = ?', [messageId, username]);
      io.to(recipient).emit('message deleted', { messageId });
      socket.emit('message deleted', { messageId });
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  });
  
  // Handle message read (Updated to use readd instead of read)
  socket.on('message read', async ({ messageId, recipient }) => {
    try {
      await pool.query('UPDATE messages SET readd = 1 WHERE id = ?', [messageId]);
      io.to(recipient).emit('message read', { messageId });
    } catch (err) {
      console.error('Error updating message read status:', err);
    }
  });
  
  // Simulate user status updates (optional, for demo)
  setInterval(() => {
    const statuses = ['Online', 'Offline', 'Away'];
    onlineUsers.forEach(user => {
      userStatuses.set(user, statuses[Math.floor(Math.random() * statuses.length)]);
    });
    io.emit('updateUserList', Array.from(onlineUsers));
  }, 30000); // Update every 30 seconds

  // Handle disconnection
  socket.on('disconnect', () => {
    onlineUsers.delete(username);
    io.emit('updateUserList', Array.from(onlineUsers));
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
