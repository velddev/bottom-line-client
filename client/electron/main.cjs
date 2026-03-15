'use strict';

const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Prevent Ctrl+Scroll / pinch-to-zoom from scaling the page
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.on('zoom-changed', (_, dir) => {
    void dir; // ignore zoom events
  });
}

// Set PROTO_PATH before loading the IPC bundle so grpc-client.js can find the proto file
process.env.PROTO_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'trademmo.proto')
  : path.join(__dirname, '..', '..', 'trademmo.proto');

const { registerIpcHandlers } = require('./ipc-bundle.cjs');
registerIpcHandlers();

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
