const { app, BrowserWindow, WebContentsView, ipcMain, dialog, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let win;
let tabs = new Map();
let activeTabId = null;
let nextTabId = 1;
const partition = 'persist:bolt';
const browserSession = () => session.fromPartition(partition);

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function snapshot() {
  return [...tabs.entries()].map(([id, item]) => ({
    id, url: item.view.webContents.getURL(), title: item.view.webContents.getTitle() || 'New tab',
    loading: item.view.webContents.isLoading(), active: id === activeTabId
  }));
}
function publishTabs() { send('tabs-updated', snapshot()); }
function layoutViews() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  for (const [id, item] of tabs) {
    item.view.setBounds({ x: 0, y: 116, width, height: Math.max(100, height - 140) });
    item.view.setVisible(id === activeTabId);
  }
}
function activate(id) {
  if (!tabs.has(id)) return;
  activeTabId = id;
  layoutViews();
  const wc = tabs.get(id).view.webContents;
  send('page-state', { id, url: wc.getURL(), title: wc.getTitle(), canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() });
  publishTabs();
}
function navigateTo(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  if (/^(https?:|file:|about:)/i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value) || /^localhost(:\d+)?/.test(value)) return 'https://' + value;
  return 'https://www.google.com/search?q=' + encodeURIComponent(value);
}
function createTab(url = 'bolt://newtab') {
  const id = nextTabId++;
  const view = new WebContentsView({
    webPreferences: {
      session: browserSession(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  tabs.set(id, { view });
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    createTab(url);
    return { action: 'deny' };
  });
  wc.on('page-title-updated', publishTabs);
  wc.on('did-start-loading', publishTabs);
  wc.on('did-stop-loading', () => {
    publishTabs();
    if (id === activeTabId) send('page-state', { id, url: wc.getURL(), title: wc.getTitle(), canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() });
  });
  wc.on('did-navigate', (_event, navigatedUrl) => {
    if (id === activeTabId) send('page-state', { id, url: navigatedUrl, title: wc.getTitle(), canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() });
    publishTabs();
  });
  wc.on('will-navigate', (_event, navigatedUrl) => send('navigation-started', { id, url: navigatedUrl }));
  wc.on('render-process-gone', (_event, details) => send('browser-error', { id, message: 'A page process stopped: ' + details.reason }));
  activate(id);
  if (url === 'bolt://newtab') wc.loadFile(path.join(__dirname, 'newtab.html'));
  else wc.loadURL(navigateTo(url));
  return id;
}
function closeTab(id) {
  const item = tabs.get(id);
  if (!item) return;
  tabs.delete(id);
  item.view.webContents.close();
  if (activeTabId === id) {
    const next = [...tabs.keys()].at(-1);
    if (next) activate(next); else createTab();
  } else publishTabs();
}
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 760, minHeight: 560,
    backgroundColor: '#10131b',
    title: 'Bolt Browser',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile('index.html');
  win.on('resize', layoutViews);
  win.on('closed', () => { win = null; tabs.clear(); });
  win.webContents.on('did-finish-load', () => createTab());
}

ipcMain.handle('tab:new', (_e, url) => createTab(url || 'bolt://newtab'));
ipcMain.handle('tab:activate', (_e, id) => activate(Number(id)));
ipcMain.handle('tab:close', (_e, id) => closeTab(Number(id)));
ipcMain.handle('tab:navigate', (_e, input) => { const item = tabs.get(activeTabId); if (item) item.view.webContents.loadURL(navigateTo(input)); });
ipcMain.handle('tab:back', () => { const wc = tabs.get(activeTabId)?.view.webContents; if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); });
ipcMain.handle('tab:forward', () => { const wc = tabs.get(activeTabId)?.view.webContents; if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); });
ipcMain.handle('tab:reload', () => tabs.get(activeTabId)?.view.webContents.reload());
ipcMain.handle('tab:home', () => { const wc = tabs.get(activeTabId)?.view.webContents; if (wc) wc.loadFile(path.join(__dirname, 'newtab.html')); });
ipcMain.handle('download:open-folder', () => shell.openPath(app.getPath('downloads')));
ipcMain.handle('extensions:list', () => browserSession().getAllExtensions().map(x => ({ id: x.id, name: x.name, version: x.version })));
ipcMain.handle('extensions:install', async () => {
  const result = await dialog.showOpenDialog(win, { title: 'Select an unpacked Chromium extension folder', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const manifestPath = path.join(result.filePaths[0], 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('That folder does not contain manifest.json.');
  const ext = await browserSession().loadExtension(result.filePaths[0], { allowFileAccess: false });
  return { id: ext.id, name: ext.name, version: ext.version };
});
ipcMain.handle('extensions:remove', async (_e, id) => { await browserSession().removeExtension(id); return true; });
browserSession().on('will-download', (_event, item) => {
  const filename = item.getFilename();
  send('download-started', { filename, totalBytes: item.getTotalBytes() });
  item.on('updated', (_e, state) => send('download-progress', { filename, receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes(), state }));
  item.once('done', (_e, state) => send('download-finished', { filename, state, path: item.getSavePath() }));
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.bolt.browser');
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
