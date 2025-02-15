const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Store users and their messages
const users = new Map();
const messages = [];

// Register endpoint
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users.has(username)) {
        return res.status(400).json({ error: 'Username already taken' });
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

wss.on('connection', (ws) => {
    let username = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'auth') {
                const user = users.get(data.username);
                if (user && user.password === data.password) {
                    username = data.username;
                    ws.send(JSON.stringify({ 
                        type: 'system', 
                        message: `Welcome ${username}!` 
                    }));
                    broadcast({ 
                        type: 'system', 
                        message: `${username} joined the chat` 
                    }, ws);
                }
                return;
            }

            if (!username) return;

            if (data.type === 'message') {
                broadcast({
                    type: 'message',
                    username: username,
                    content: data.content,
                    time: new Date().toLocaleTimeString()
                });
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        if (username) {
            broadcast({ 
                type: 'system', 
                message: `${username} left the chat` 
            });
        }
    });
});

function broadcast(message, exclude = null) {
    wss.clients.forEach(client => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});