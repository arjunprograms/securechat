// Enhanced server.js with additional security features
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { formidable } = require('formidable');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt'); // New dependency for password hashing

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

// Ensure the message history directory exists
const messagesDir = path.join(__dirname, 'messages');
if (!fs.existsSync(messagesDir)) {
    fs.mkdirSync(messagesDir);
}

// Ensure the logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Serve uploaded files statically so clients can download them
app.use('/uploads', express.static(uploadDir));

// In-memory storage for users (Replace with a database in production)
const users = new Map();

// Store user connections and their public keys
const connections = new Map();

// Track typing status
const typingUsers = new Set();

// Track failed login attempts
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

// Setup logging
function createLogger(username) {
    const date = new Date().toISOString().replace(/:/g, '-');
    const logFile = path.join(logsDir, `${username}_${date}.txt`);
    
    return {
        log: (message) => {
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] ${message}\n`;
            fs.appendFileSync(logFile, logEntry);
        }
    };
}

// --- File Upload Endpoint ---
app.post('/upload', async (req, res) => {
    // Configure formidable for file upload processing
    const form = formidable({
        uploadDir: uploadDir,
        keepExtensions: true,
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
app.post('/register', async (req, res) => {
    const { username, password, publicKey, profile } = req.body;
    
    // Basic validation
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (users.has(username)) {
        return res.status(400).json({ error: 'Username already taken' });
    }
    
    try {
        // Hash the password with bcrypt (10 rounds of salt)
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Create user object with hashed password
        users.set(username, { 
            password: hashedPassword, 
            publicKey,
            profile: {
                displayName: profile?.displayName || username,
                status: 'offline',
                avatar: null
            },
            createdAt: new Date().toISOString()
        });
        
        const logger = createLogger('system');
        logger.log(`User registered: ${username}`);
        
        res.json({ message: 'Registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
});

// --- User Login Endpoint ---
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Check if account is locked due to too many failed attempts
    if (loginAttempts.has(username)) {
        const attempts = loginAttempts.get(username);
        
        if (attempts.count >= MAX_LOGIN_ATTEMPTS && (Date.now() - attempts.lastAttempt) < LOCKOUT_TIME) {
            // Account is locked
            const remainingLockTime = Math.ceil((LOCKOUT_TIME - (Date.now() - attempts.lastAttempt)) / 60000);
            return res.status(429).json({ 
                error: `Account is temporarily locked. Try again in ${remainingLockTime} minutes.` 
            });
        }
        
        // Reset counter if lockout period has passed
        if ((Date.now() - attempts.lastAttempt) >= LOCKOUT_TIME) {
            loginAttempts.delete(username);
        }
    }
    
    // Get user from "database"
    const user = users.get(username);
    
    // If user doesn't exist
    if (!user) {
        // Record failed attempt
        recordFailedLoginAttempt(username);
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    try {
        // Compare passwords using bcrypt
        const match = await bcrypt.compare(password, user.password);
        
        if (!match) {
            // Record failed attempt
            recordFailedLoginAttempt(username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Reset failed login attempts on successful login
        loginAttempts.delete(username);
        
        // Update user status
        user.profile.status = 'online';
        
        // Create a session log
        const logger = createLogger(username);
        logger.log(`User logged in: ${username}`);
        
        res.json({ 
            message: 'Logged in successfully',
            publicKey: user.publicKey
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed: ' + error.message });
    }
});

// Record failed login attempt
function recordFailedLoginAttempt(username) {
    if (!loginAttempts.has(username)) {
        loginAttempts.set(username, { count: 1, lastAttempt: Date.now() });
    } else {
        const attempts = loginAttempts.get(username);
        attempts.count += 1;
        attempts.lastAttempt = Date.now();
    }
    
    const logger = createLogger('security');
    logger.log(`Failed login attempt for user: ${username} (Attempt ${loginAttempts.get(username).count})`);
    
    // If max attempts reached, log it
    if (loginAttempts.get(username).count >= MAX_LOGIN_ATTEMPTS) {
        logger.log(`Account locked: ${username} - Too many failed login attempts`);
    }
}

// --- Get Public Keys Endpoint ---
app.get('/public-keys', (req, res) => {
    const publicKeys = {};
    users.forEach((user, username) => {
        if (user.publicKey) {
            publicKeys[username] = user.publicKey;
        }
    });
    res.json(publicKeys);
});

// --- Get User Profiles ---
app.get('/user-profiles', (req, res) => {
    const profiles = {};
    users.forEach((user, username) => {
        profiles[username] = user.profile;
    });
    res.json(profiles);
});

// --- Update User Profile ---
app.post('/update-profile', (req, res) => {
    const { username, profile } = req.body;
    const user = users.get(username);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Update the profile fields
    user.profile = { ...user.profile, ...profile };
    
    // Broadcast profile update to all connected clients
    broadcast({
        type: 'profile_update',
        username,
        profile: user.profile
    });
    
    // Log the profile update
    const logger = createLogger(username);
    logger.log(`Profile updated for user: ${username}`);
    
    res.json({ message: 'Profile updated successfully' });
});

// --- Get Message History ---
app.get('/message-history', (req, res) => {
    try {
        const historyFile = path.join(messagesDir, 'chat_history.json');
        
        if (!fs.existsSync(historyFile)) {
            return res.json([]);
        }
        
        const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        res.json(history);
    } catch (error) {
        console.error('Error retrieving message history:', error);
        res.status(500).json({ error: 'Failed to retrieve message history' });
    }
});

// --- WebSocket Connection Handler ---
wss.on('connection', (ws) => {
    let username = null;
    let logger = null;

    // Handle incoming WebSocket messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Authentication message: validate and store username for this connection
            if (data.type === 'auth') {
                const user = users.get(data.username);
                
                // Verify user and password
                if (user) {
                    bcrypt.compare(data.password, user.password)
                        .then(match => {
                            if (match) {
                                username = data.username;
                                logger = createLogger(username);
                                
                                // Store the connection with the username
                                connections.set(username, ws);
                                
                                // Update user's public key if provided
                                if (data.publicKey) {
                                    user.publicKey = data.publicKey;
                                }
                                
                                // Update user status
                                user.profile.status = 'online';
                                
                                // Send welcome message to the newly authenticated client
                                ws.send(JSON.stringify({ 
                                    type: 'system', 
                                    message: `Welcome ${username}!` 
                                }));
                                
                                // Send the list of online users
                                const onlineUsers = Array.from(connections.keys());
                                ws.send(JSON.stringify({
                                    type: 'online_users',
                                    users: onlineUsers
                                }));
                                
                                // Broadcast that a new user has joined (excluding the sender)
                                broadcast({ 
                                    type: 'system', 
                                    message: `${username} joined the chat` 
                                }, ws);
                                
                                // Broadcast updated online users list to all clients
                                broadcast({
                                    type: 'online_users',
                                    users: onlineUsers
                                });
                                
                                logger.log(`User authenticated and connected via WebSocket`);
                            }
                        })
                        .catch(err => {
                            console.error('Authentication error:', err);
                        });
                }
                return;
            }

            // If the client is not authenticated, ignore messages
            if (!username) return;

            // Handle a text message
            if (data.type === 'message') {
                const messageData = {
                    type: 'message',
                    id: data.messageId || generateUniqueId(),
                    username: username,
                    content: data.content,
                    encrypted: data.encrypted || false,
                    formatted: data.formatted || false,
                    recipient: data.recipient, // For direct messages
                    time: new Date().toISOString()
                };
                
                // Store message in history
                storeMessage(messageData);
                
                // Log the message
                logger.log(`Message sent to ${data.recipient || 'all'}: ${data.encrypted ? '[ENCRYPTED]' : data.content.substring(0, 50) + (data.content.length > 50 ? '...' : '')}`);
                
                // If it's a direct message, send only to the recipient
                if (data.recipient && data.recipient !== 'all') {
                    const recipientWs = connections.get(data.recipient);
                    if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
                        recipientWs.send(JSON.stringify(messageData));
                    }
                    // Also send to the sender for their own record
                    ws.send(JSON.stringify(messageData));
                } else {
                    // Broadcast to all
                    broadcast(messageData);
                }
                
                // Send read receipt
                ws.send(JSON.stringify({
                    type: 'read_receipt',
                    messageId: messageData.id,
                    status: 'delivered'
                }));
            }
            // Handle typing indicator
            else if (data.type === 'typing') {
                if (data.isTyping) {
                    typingUsers.add(username);
                } else {
                    typingUsers.delete(username);
                }
                
                // Broadcast typing status to all except the sender
                broadcast({
                    type: 'typing_indicator',
                    username: username,
                    isTyping: data.isTyping,
                    recipient: data.recipient || 'all'
                }, ws);
            }
            // Handle a file message (after successful upload on the client)
            else if (data.type === 'file') {
                const fileData = {
                    type: 'file',
                    id: generateUniqueId(),
                    username: username,
                    fileUrl: data.fileUrl,
                    filename: data.filename,
                    fileType: data.fileType,
                    encrypted: data.encrypted || false,
                    recipient: data.recipient, // For direct file sharing
                    time: new Date().toISOString()
                };
                
                // Store file message in history
                storeMessage(fileData);
                
                // Log the file share
                logger.log(`File shared with ${data.recipient || 'all'}: ${data.filename}`);
                
                // If it's a direct file share, send only to the recipient
                if (data.recipient && data.recipient !== 'all') {
                    const recipientWs = connections.get(data.recipient);
                    if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
                        recipientWs.send(JSON.stringify(fileData));
                    }
                    // Also send to the sender for their own record
                    ws.send(JSON.stringify(fileData));
                } else {
                    // Broadcast to all
                    broadcast(fileData);
                }
            }
            // Handle read receipt acknowledgment
            else if (data.type === 'read_receipt_ack') {
                const senderWs = connections.get(data.sender);
                if (senderWs && senderWs.readyState === WebSocket.OPEN) {
                    senderWs.send(JSON.stringify({
                        type: 'read_receipt',
                        messageId: data.messageId,
                        reader: username,
                        status: 'read',
                        time: new Date().toISOString()
                    }));
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        if (username) {
            // Remove user from connections
            connections.delete(username);
            
            // Remove from typing users if they were typing
            typingUsers.delete(username);
            
            // Update user's profile status
            const user = users.get(username);
            if (user) {
                user.profile.status = 'offline';
            }
            
            // Log the disconnection
            if (logger) {
                logger.log(`User disconnected from WebSocket`);
            }
            
            // Broadcast leave message when a user disconnects
            broadcast({ 
                type: 'system', 
                message: `${username} left the chat` 
            });
            
            // Broadcast updated online users list
            broadcast({
                type: 'online_users',
                users: Array.from(connections.keys())
            });
        }
    });
});

// Store message in history
function storeMessage(message) {
    try {
        const historyFile = path.join(messagesDir, 'chat_history.json');
        let history = [];
        
        if (fs.existsSync(historyFile)) {
            history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        }
        
        // Add message ID and timestamp if not already present
        if (!message.id) {
            message.id = generateUniqueId();
        }
        if (!message.timestamp) {
            message.timestamp = new Date().toISOString();
        }
        
        history.push(message);
        
        // Limit history size to prevent file growth
        if (history.length > 1000) {
            history = history.slice(history.length - 1000);
        }
        
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Error storing message:', error);
    }
}

// Generate unique ID for messages
function generateUniqueId() {
    return Date.now() + '-' + crypto.randomBytes(8).toString('hex');
}

// Broadcast function to send a message to all connected WebSocket clients,
// optionally excluding one client (e.g., the sender)
function broadcast(message, exclude = null) {
    // Don't broadcast direct messages to everyone
    if (message.recipient && message.recipient !== 'all') {
        return;
    }
    
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