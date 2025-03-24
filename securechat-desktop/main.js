const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Keep a global reference of the window object
let mainWindow;
let serverAddress = 'localhost:3001'; // Default server address

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Uncomment for debugging
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function() {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function() {
  if (mainWindow === null) createWindow();
});

// Create logs directory
const logDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Simple logging function
function createLogger(username) {
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(logDir, `${username}_${date}.log`);
  
  return {
    log: (message) => {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n`;
      fs.appendFileSync(logFile, logEntry);
      console.log(`[${username}] ${message}`);
    }
  };
}

// Basic IPC Handlers
ipcMain.handle('get-server-address', () => {
  return serverAddress;
});

ipcMain.handle('set-server-address', (event, address) => {
  serverAddress = address;
  return serverAddress;
});

ipcMain.handle('write-log', (event, username, message) => {
  const logger = createLogger(username);
  logger.log(message);
  return true;
});

// HTTP request handler
ipcMain.handle('http-request', async (event, options) => {
  try {
    const { url, method, headers, body } = options;
    
    const response = await fetch(url, {
      method: method || 'GET',
      headers: headers || { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    
    const data = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      data: data
    };
  } catch (error) {
    console.error('HTTP request error:', error);
    return { error: error.message };
  }
});

// File selection dialog handler
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Get file content as buffer (for encryption)
ipcMain.handle('get-file-buffer', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { error: 'File not found' };
    }
    
    // Read file and convert to Base64 for safe transfer to renderer
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    
    return {
      data: base64Data,
      filename: path.basename(filePath),
      size: fileBuffer.length,
      path: filePath
    };
  } catch (error) {
    console.error('Error reading file:', error);
    return { error: error.message };
  }
});

// Basic file upload handler
ipcMain.handle('upload-file', async (event, filePath, host) => {
  try {
    if (!filePath) return { error: 'No file selected' };
    
    const filename = path.basename(filePath);
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), filename);
    
    const response = await fetch(`http://${host}/upload`, {
      method: 'POST',
      body: form
    });
    
    return await response.json();
  } catch (error) {
    console.error('Error uploading file:', error);
    return { error: error.message };
  }
});

// Encrypted file upload handler
ipcMain.handle('upload-encrypted-file', async (event, fileData, filename, host) => {
  try {
    if (!fileData) return { error: 'No file data provided' };
    
    const form = new FormData();
    
    // Create a buffer from the base64 encrypted data
    const buffer = Buffer.from(fileData, 'base64');
    
    // Create a unique filename with an .encrypted extension
    const encryptedFilename = `${filename}.encrypted`;
    
    // Create a temporary file for the encrypted data
    const tempPath = path.join(app.getPath('temp'), encryptedFilename);
    fs.writeFileSync(tempPath, buffer);
    
    // Add the encrypted file to the form
    form.append('file', fs.createReadStream(tempPath), encryptedFilename);
    
    // Upload the file
    const response = await fetch(`http://${host}/upload`, {
      method: 'POST',
      body: form
    });
    
    // Clean up the temporary file
    fs.unlinkSync(tempPath);
    
    // Return the server response
    return await response.json();
  } catch (error) {
    console.error('Error uploading encrypted file:', error);
    return { error: error.message };
  }
});

// File save dialog handler
ipcMain.handle('save-file', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'download',
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

// Save file content handler
ipcMain.handle('save-file-content', async (event, filePath, content) => {
  try {
    // If content is a Base64 string
    if (typeof content === 'string') {
      content = Buffer.from(content, 'base64');
    }
    
    fs.writeFileSync(filePath, content);
    return { success: true };
  } catch (error) {
    console.error('Error saving file:', error);
    return { error: error.message };
  }
});

// Open URL in external browser
ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
  return true;
});

// Binary file HTTP request handler (for encrypted file downloads)
ipcMain.handle('binary-http-request', async (event, url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { error: `HTTP error! status: ${response.status}` };
    }
    
    // Get the response as array buffer
    const buffer = await response.arrayBuffer();
    
    // Convert to Base64 for safe IPC transfer
    const base64Data = Buffer.from(buffer).toString('base64');
    
    return {
      ok: true,
      data: base64Data,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    };
  } catch (error) {
    console.error('Error downloading file:', error);
    return { error: error.message };
  }
});