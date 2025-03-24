// Global variables
let ws;
let currentUser;
let currentChannel = 'all';
let typingTimeout;
let encryptionManager;
let publicKeys = {};
let userProfiles = {};
let messageReadStatus = {};
let isTyping = false;
let selectedFormat = null;
let serverAddress = 'localhost:3001'; // Default server address

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async function() {
  try {
    // Get server address from Electron
    serverAddress = await window.electronAPI.getServerAddress();
    console.log('Server address:', serverAddress);
    
    // Focus username field on load
    document.getElementById('username').focus();
    
    // Initialize encryptionManager
    if (window.encryptionManager) {
      encryptionManager = window.encryptionManager;
    }
    
    // Setup event listeners
    setupEventListeners();
  } catch (error) {
    console.error('Initialization error:', error);
  }
});

// Setup event listeners
function setupEventListeners() {
  // Setup login button
  document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    login();
  });
  
  // Setup register button
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', function(e) {
      e.preventDefault();
      register();
    });
  }
  
  // Setup message input
  const messageInput = document.getElementById('messageInput');
  if (messageInput) {
    messageInput.addEventListener('input', handleTyping);
    messageInput.addEventListener('keypress', function(e) {
      // Send on Enter, but allow Shift+Enter for new line
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
  
  // Initialize emoji picker and formatting toolbar if we're logged in
  if (document.getElementById('mainInterface').style.display !== 'none') {
    initEmojiPicker();
    setupFormattingToolbar();
  }
}

// Register a new user
async function register() {
  const username = document.getElementById('regUsername').value;
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;
  const displayName = document.getElementById('regDisplayName').value || username;
  
  if (!username || !password) {
    alert('Please fill in all required fields');
    return;
  }
  
  if (password !== confirmPassword) {
    alert('Passwords do not match');
    return;
  }
  
  if (password.length < 8) {
    alert('Password must be at least 8 characters long');
    return;
  }
  
  try {
    // Generate encryption keys
    const publicKey = await encryptionManager.generateKeyPair();
    
    // Register user with server
    const response = await window.electronAPI.httpRequest({
      url: `http://${serverAddress}/register`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { 
        username, 
        password,
        publicKey,
        profile: {
          displayName,
          status: 'online'
        }
      }
    });
    
    if (response.ok) {
      alert('Registered successfully! Please login.');
      clearInputs('registerForm');
    } else {
      alert(response.data.error || 'Registration failed');
    }
  } catch (error) {
    console.error('Registration error:', error);
    alert('Registration failed: ' + error.message);
  }
}

// Login user
async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  if (!username || !password) {
    alert('Please enter both username and password');
    return;
  }
  
  try {
    let publicKey = "dummy-public-key-for-testing";
    
    // Try to generate encryption keys if supported
    if (encryptionManager && encryptionManager.cryptoSupported) {
      try {
        if (!encryptionManager.keyPair) {
          publicKey = await encryptionManager.generateKeyPair();
        } else {
          publicKey = await encryptionManager.exportPublicKey();
        }
      } catch (cryptoError) {
        console.warn("Crypto operations failed, using dummy key:", cryptoError);
      }
    }
    
    // Login to server
    const response = await window.electronAPI.httpRequest({
      url: `http://${serverAddress}/login`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { 
        username, 
        password,
        publicKey
      }
    });
    
    if (response.ok) {
      currentUser = username;
      document.getElementById('authBox').style.display = 'none';
      document.getElementById('mainInterface').style.display = 'flex';
      
      // Log the login
      await window.electronAPI.writeLog(username, 'User logged in');
      
      // Connect WebSocket
      connectWebSocket(username, password);
      
      // Fetch public keys and user profiles
      fetchPublicKeys();
      fetchUserProfiles();
      
      // Load message history
      loadMessageHistory();
      
      // Initialize emoji picker and formatting toolbar
      initEmojiPicker();
      setupFormattingToolbar();
    } else {
      alert(response.data.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('Login failed: ' + error.message);
  }
}

// Connect to WebSocket server
function connectWebSocket(username, password) {
  ws = new WebSocket(`ws://${serverAddress}`);
  
  ws.onopen = async () => {
    // Send authentication message
    const publicKey = await encryptionManager.exportPublicKey();
    ws.send(JSON.stringify({
      type: 'auth',
      username,
      password,
      publicKey
    }));
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleIncomingMessage(data);
  };
  
  ws.onclose = () => {
    alert('Connection lost. Please refresh the application.');
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Handle incoming messages
async function handleIncomingMessage(data) {
  // Implement the rest of your WebSocket message handling logic here
  // This would be similar to your existing web app code
}

// File handling using Electron's native dialogs
async function openFileSelector() {
  const filePath = await window.electronAPI.selectFile();
  if (filePath) {
    handleFileUpload(filePath);
  }
}

// Handle file upload
async function handleFileUpload(filePath) {
  if (!filePath) return;
  
  try {
    const response = await window.electronAPI.uploadFile(filePath, serverAddress);
    
    if (!response.error) {
      // Send file message via WebSocket
      ws.send(JSON.stringify({
        type: 'file',
        fileUrl: response.url,
        filename: response.filename,
        fileType: response.type,
        recipient: currentChannel === 'all' ? 'all' : currentChannel,
        encrypted: document.getElementById('encryptionToggle').checked && currentChannel !== 'all'
      }));
      
      // Log the file upload
      await window.electronAPI.writeLog(currentUser, `File sent to ${currentChannel}: ${response.filename}`);
    } else {
      alert('File upload failed: ' + response.error);
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    alert('File upload failed: ' + error.message);
  }
}

// Fetch public keys from server
async function fetchPublicKeys() {
  try {
    const response = await window.electronAPI.httpRequest({
      url: `http://${serverAddress}/public-keys`
    });
    
    if (response.ok) {
      publicKeys = response.data;
      
      // Register each public key with the encryption manager
      for (const [username, key] of Object.entries(publicKeys)) {
        if (username !== currentUser) {
          await encryptionManager.registerPublicKey(username, key);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching public keys:', error);
  }
}

// Fetch user profiles
async function fetchUserProfiles() {
  try {
    const response = await window.electronAPI.httpRequest({
      url: `http://${serverAddress}/user-profiles`
    });
    
    if (response.ok) {
      userProfiles = response.data;
      updateUserListUI();
    }
  } catch (error) {
    console.error('Error fetching user profiles:', error);
  }
}

// Load message history from server
async function loadMessageHistory() {
  try {
    const response = await window.electronAPI.httpRequest({
      url: `http://${serverAddress}/message-history`
    });
    
    if (response.ok) {
      const history = response.data;
      
      // Clear messages container
      const messagesContainer = document.getElementById('messages');
      messagesContainer.innerHTML = '';
      
      // Display each message
      for (const message of history) {
        if (message.type === 'message') {
          displayMessage(message);
        } else if (message.type === 'system') {
          displaySystemMessage(message.message);
        } else if (message.type === 'file') {
          displayFileMessage(message);
        }
      }
      
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  } catch (error) {
    console.error('Error loading message history:', error);
  }
}

// Helper function to clear input fields
function clearInputs(formId) {
  const form = document.getElementById(formId);
  const inputs = form.getElementsByTagName('input');
  for (let input of inputs) {
    input.value = '';
  }
}

// Add the rest of your functions from the web app
// For demonstration purposes, I've included a few placeholder functions

function initEmojiPicker() {
  // Implement your emoji picker initialization
  console.log('Emoji picker initialized');
}

function setupFormattingToolbar() {
  // Implement your formatting toolbar setup
  console.log('Formatting toolbar initialized');
}

function displayMessage(data) {
  // Implement message display logic
  console.log('Displaying message:', data);
}

function displaySystemMessage(message) {
  // Implement system message display
  console.log('System message:', message);
}

function displayFileMessage(data) {
  // Implement file message display
  console.log('File message:', data);
}

function handleTyping() {
  // Implement typing indicator logic
  console.log('Handling typing event');
}

function sendMessage() {
  // Implement message sending logic
  console.log('Sending message');
}

function updateUserListUI() {
  // Implement user list update
  console.log('Updating user list UI');
}
// Handle file upload with encryption support
async function handleFileUpload(filePath) {
    if (!filePath) return;
    
    try {
      const isEncrypted = document.getElementById('encryptionToggle').checked;
      const recipient = currentChannel === 'all' ? null : currentChannel;
      
      // If encryption is enabled and we're sending to a specific user
      if (isEncrypted && recipient && recipient !== 'all') {
        // Get the file buffer
        const fileResult = await window.electronAPI.getFileBuffer(filePath);
        
        if (fileResult.error) {
          throw new Error(fileResult.error);
        }
        
        // Log the encryption process
        await window.electronAPI.writeLog(
          currentUser, 
          `Encrypting file ${fileResult.filename} for ${recipient}`
        );
        
        // Encrypt the file data
        const encryptedData = await encryptionManager.encryptMessage(
          fileResult.data, 
          recipient
        );
        
        // Upload the encrypted file
        const response = await window.electronAPI.uploadEncryptedFile(
          encryptedData,
          fileResult.filename,
          serverAddress
        );
        
        if (response.error) {
          throw new Error(response.error);
        }
        
        // Send file message via WebSocket with encrypted flag
        ws.send(JSON.stringify({
          type: 'file',
          fileUrl: response.url,
          filename: fileResult.filename,
          fileType: 'application/octet-stream', // Generic type for encrypted files
          recipient: recipient,
          encrypted: true,
          originalSize: fileResult.size
        }));
        
        // Log the encrypted file upload
        await window.electronAPI.writeLog(
          currentUser, 
          `Encrypted file sent to ${recipient}: ${fileResult.filename}`
        );
      } else {
        // Regular unencrypted upload
        const response = await window.electronAPI.uploadFile(filePath, serverAddress);
        
        if (response.error) {
          throw new Error(response.error);
        }
        
        // Send file message via WebSocket
        ws.send(JSON.stringify({
          type: 'file',
          fileUrl: response.url,
          filename: response.filename,
          fileType: response.type,
          recipient: currentChannel === 'all' ? 'all' : currentChannel,
          encrypted: false
        }));
        
        // Log the file upload
        await window.electronAPI.writeLog(
          currentUser, 
          `File sent to ${currentChannel}: ${response.filename}`
        );
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('File upload failed: ' + error.message);
    }
  }
  
  // Handle file download with decryption support
  async function handleFileDownload(fileData) {
    try {
      // If this is an encrypted file sent to current user
      if (fileData.encrypted && fileData.recipient === currentUser) {
        // Download the encrypted file
        const binaryResponse = await window.electronAPI.binaryHttpRequest(
          `http://${serverAddress}${fileData.fileUrl}`
        );
        
        if (binaryResponse.error) {
          throw new Error(binaryResponse.error);
        }
        
        // Log decryption process
        await window.electronAPI.writeLog(
          currentUser, 
          `Decrypting file from ${fileData.username}: ${fileData.filename}`
        );
        
        // Decrypt the file data
        const decryptedData = await encryptionManager.decryptMessage(binaryResponse.data);
        
        // Ask user where to save the file
        const savePath = await window.electronAPI.saveFile(fileData.filename);
        
        if (savePath) {
          // Save the decrypted file
          await window.electronAPI.saveFileContent(savePath, decryptedData);
          
          // Log successful decryption
          await window.electronAPI.writeLog(
            currentUser, 
            `File successfully decrypted and saved: ${fileData.filename}`
          );
          
          alert(`File "${fileData.filename}" was successfully decrypted and saved.`);
        }
      } else {
        // For unencrypted files, just open in browser
        window.electronAPI.openExternal(`http://${serverAddress}${fileData.fileUrl}`);
      }
    } catch (error) {
      console.error('Error downloading/decrypting file:', error);
      alert(`Failed to download or decrypt the file: ${error.message}`);
    }
  }
  
  // Update displayFileMessage function to add download functionality
  function displayFileMessage(data) {
    // Your existing code for displaying file messages...
    
    // Add click event to the file link to handle encrypted downloads
    const fileLink = messageDiv.querySelector('.file-name');
    if (fileLink) {
      fileLink.addEventListener('click', (e) => {
        if (data.encrypted) {
          e.preventDefault(); // Prevent default link behavior
          handleFileDownload(data);
        }
      });
    }
  }