const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Simple in-memory storage for users
const users = new Map();
const messageRateLimit = new Map();

// Register endpoint
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    
    if (users.has(username)) {
        return res.status(400).json({ error: 'Username taken' });
    }
    
    users.set(username, { password });
    res.json({ message: 'Registered successfully' });
});

// Login endpoint
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.get(username);
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({ message: 'Logged in successfully' });
});

// WebSocket connection handler
wss.on('connection', (ws) => {
    let username = null;

    // Handle incoming messages
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        // Handle authentication
        if (data.type === 'auth') {
            const user = users.get(data.username);
            if (user && user.password === data.password) {
                username = data.username;
                ws.send(JSON.stringify({ type: 'auth', success: true }));
                broadcast({ type: 'system', message: `${username} joined` });
            } else {
                ws.send(JSON.stringify({ type: 'auth', success: false }));
            }
            return;
        }

        // Handle chat messages with rate limiting
        if (username) {
            const now = Date.now();
            const userMessages = messageRateLimit.get(username) || [];
            const recentMessages = userMessages.filter(time => now - time < 10000); // 10 seconds window
            
            if (recentMessages.length >= 5) { // Max 5 messages per 10 seconds
                ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: 'Rate limit exceeded. Please wait a few seconds.' 
                }));
                return;
            }
            
            messageRateLimit.set(username, [...recentMessages, now]);

            // Broadcast message to all clients
            broadcast({
                type: 'message',
                username: username,
                message: data.message,
                time: new Date().toLocaleTimeString()
            });
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        if (username) {
            broadcast({ type: 'system', message: `${username} left` });
        }
    });
});

// Broadcast message to all connected clients
function broadcast(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});