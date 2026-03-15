'use strict';

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const url = require('url');

const isDev = !app.isPackaged;

// Register trademmo:// as a protocol handler for Discord OAuth deep links.
// On Windows/Linux this must be called before app.whenReady().
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('trademmo', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('trademmo');
}

function getMainWindow() {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null;
}

function handleDeepLink(deepUrl) {
  try {
    const parsed = new url.URL(deepUrl);
    if (parsed.hostname === 'auth') {
      const code = parsed.searchParams.get('code');
      if (code) {
        const win = getMainWindow();
        win?.webContents.send('auth:discord-code', { code });
      }
    }
  } catch {
    // ignore malformed URLs
  }
}

// macOS: open-url fires in the same process
app.on('open-url', (event, deepUrl) => {
  event.preventDefault();
  handleDeepLink(deepUrl);
});

// Windows / Linux: a second instance is spawned with the URL as a CLI arg.
// We prevent the second instance and forward the URL to the running instance.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_, argv) => {
    const deepUrl = argv.find((arg) => arg.startsWith('trademmo://'));
    if (deepUrl) handleDeepLink(deepUrl);

    // Bring the existing window to focus
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

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
