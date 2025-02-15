// Import required modules
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
// Import formidable with the new destructuring syntax for the latest version
const { formidable } = require('formidable');
const fs = require('fs');
const path = require('path');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize WebSocket server on the same HTTP server
const wss = new WebSocket.Server({ server });

// Use CORS middleware to allow cross-origin requests
app.use(cors());
// Parse JSON bodies for HTTP endpoints
app.use(express.json());

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Serve uploaded files statically so clients can download them
app.use('/uploads', express.static(uploadDir));

// In-memory storage for users (for demo purposes)
const users = new Map();

// --- File Upload Endpoint ---
// This endpoint processes file uploads using formidable.
app.post('/upload', async (req, res) => {
    // Configure formidable for file upload processing
    const form = formidable({
        uploadDir: uploadDir,         // Temporary folder for uploads
        keepExtensions: true,         // Keep original file extension
        maxFileSize: 10 * 1024 * 1024  // Limit file size to 10MB
    });

    try {
        // Parse the incoming form data
        const [fields, files] = await form.parse(req);
        // Get the first file from the parsed files object
        const fileKey = Object.keys(files)[0];
        const file = files[fileKey]?.[0];

        // If no file was uploaded, return an error
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Use the original filename if available
        const filename = file.originalFilename || 'uploaded-file';
        const newPath = path.join(uploadDir, filename);

        // Rename/move the file from temporary location to our uploads folder
        fs.renameSync(file.filepath, newPath);

        // Respond with file details so the client can construct a download link
        res.json({
            url: '/uploads/' + filename,
            filename: filename,
            type: file.mimetype
        });
    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

// --- User Registration Endpoint ---
// Registers a new user by storing their username and password in memory.
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users.has(username)) {
        return res.status(400).json({ error: 'Username already taken' });
    }
    users.set(username, { password });
    res.json({ message: 'Registered successfully' });
});

// --- User Login Endpoint ---
// Validates user credentials.
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.get(username);
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ message: 'Logged in successfully' });
});

// --- WebSocket Connection Handler ---
// Manages real-time chat communication.
wss.on('connection', (ws) => {
    let username = null;

    // Handle incoming WebSocket messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Authentication message: validate and store username for this connection
            if (data.type === 'auth') {
                const user = users.get(data.username);
                if (user && user.password === data.password) {
                    username = data.username;
                    // Send welcome message to the newly authenticated client
                    ws.send(JSON.stringify({ 
                        type: 'system', 
                        message: `Welcome ${username}!` 
                    }));
                    // Broadcast that a new user has joined (excluding the sender)
                    broadcast({ 
                        type: 'system', 
                        message: `${username} joined the chat` 
                    }, ws);
                }
                return;
            }

            // If the client is not authenticated, ignore messages
            if (!username) return;

            // Handle a text message
            if (data.type === 'message') {
                broadcast({
                    type: 'message',
                    username: username,
                    content: data.content,
                    time: new Date().toLocaleTimeString()
                });
            }
            // Handle a file message (after successful upload on the client)
            else if (data.type === 'file') {
                broadcast({
                    type: 'file',
                    username: username,
                    fileUrl: data.fileUrl,
                    filename: data.filename,
                    fileType: data.fileType,
                    time: new Date().toLocaleTimeString()
                });
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        if (username) {
            // Broadcast leave message when a user disconnects
            broadcast({ 
                type: 'system', 
                message: `${username} left the chat` 
            });
        }
    });
});

// Broadcast function to send a message to all connected WebSocket clients,
// optionally excluding one client (e.g., the sender)
function broadcast(message, exclude = null) {
    wss.clients.forEach(client => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Start the server on port 3001
const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
