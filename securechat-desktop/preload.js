const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Server configuration
  getServerAddress: () => ipcRenderer.invoke('get-server-address'),
  setServerAddress: (address) => ipcRenderer.invoke('set-server-address', address),
  
  // Logging
  writeLog: (username, message) => ipcRenderer.invoke('write-log', username, message),
  
  // HTTP requests and basic file handling
  httpRequest: (options) => ipcRenderer.invoke('http-request', options),
  selectFile: () => ipcRenderer.invoke('select-file'),
  uploadFile: (filePath, host) => ipcRenderer.invoke('upload-file', filePath, host),
  
  // New methods for encrypted file handling
  getFileBuffer: (filePath) => ipcRenderer.invoke('get-file-buffer', filePath),
  uploadEncryptedFile: (fileData, filename, host) => 
    ipcRenderer.invoke('upload-encrypted-file', fileData, filename, host),
  
  // File saving and opening
  saveFile: (defaultName) => ipcRenderer.invoke('save-file', defaultName),
  saveFileContent: (filePath, content) => 
    ipcRenderer.invoke('save-file-content', filePath, content),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});