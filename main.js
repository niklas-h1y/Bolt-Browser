const { app, BrowserWindow, WebContentsView, Menu, ipcMain, dialog, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let win;
let tabs = new Map();
let activeTabId = null;
let overlayOpen = false;
let nextTabId = 1;
const partition = 'persist:bolt';
const browserSession = () => session.fromPartition(partition);
// Electron 35+ exposes extension methods on ses.extensions; older versions expose them on ses.
const browserExtensions = () => {
  const ses = browserSession();
  const extApi = ses.extensions || ses;
  return extApi;
};
const extensionStorePath = () => path.join(app.getPath('userData'), 'extensions.json');
let extensionPaths = [];

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function displayUrl(rawUrl) {
  const value = String(rawUrl || '');
  if (!value || value === 'about:blank') return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'file:') {
      const page = path.basename(decodeURIComponent(parsed.pathname)).toLowerCase();
      if (page === 'newtab.html') return '';
      if (page === 'extensions.html') return 'bolt://extensions';
    }
  } catch (_) {}
  return value;
}
function snapshot() {
  return [...tabs.entries()].map(([id, item]) => ({
    id, url: displayUrl(item.view.webContents.getURL()), title: item.view.webContents.getTitle() || 'New tab',
    loading: item.view.webContents.isLoading(), active: id === activeTabId
  }));
}
function publishTabs() { send('tabs-updated', snapshot()); }
function layoutViews() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  for (const [id, item] of tabs) {
    item.view.setBounds({ x: 0, y: 116, width, height: Math.max(100, height - 140) });
    item.view.setVisible(id === activeTabId && !overlayOpen);
  }
}
function activate(id) {
  if (!tabs.has(id)) return;
  activeTabId = id;
  layoutViews();
  const wc = tabs.get(id).view.webContents;
  send('page-state', { id, url: displayUrl(wc.getURL()), title: wc.getTitle() || 'New tab', canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() });
  publishTabs();
}
function isExtensionsUrl(value) {
  return /^\s*(?:chrome|bolt):\/\/extensions\/?(?:[?#].*)?\s*$/i.test(String(value || ''));
}
function openExtensionsPage(webContents) {
  if (!webContents || webContents.isDestroyed()) return;
  webContents.loadFile(path.join(__dirname, 'extensions.html'));
}
function navigateTo(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  if (isExtensionsUrl(value)) return 'bolt://extensions';
  if (/^(https?:|file:|about:)/i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value) || /^localhost(:\d+)?/.test(value)) return 'https://' + value;
  return 'https://www.google.com/search?q=' + encodeURIComponent(value);
}
function createTab(url = 'bolt://newtab') {
  const id = nextTabId++;
  const view = new WebContentsView({
    webPreferences: {
      session: browserSession(),
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  win.contentView.addChildView(view);
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
    if (id === activeTabId) send('page-state', { id, url: displayUrl(wc.getURL()), title: wc.getTitle() || 'New tab', canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() });
  });
  wc.on('did-navigate', (_event, navigatedUrl) => {
    if (id === activeTabId) send('page-state', { id, url: displayUrl(navigatedUrl), title: wc.getTitle() || 'New tab', canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() });
    publishTabs();
  });
  wc.on('will-navigate', (event, navigatedUrl) => {
    if (isExtensionsUrl(navigatedUrl)) {
      event.preventDefault();
      openExtensionsPage(wc);
      return;
    }
    send('navigation-started', { id, url: navigatedUrl });
  });
  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && id === activeTabId) send('browser-error', { id, message: `Could not load ${validatedURL}: ${errorDescription} (${errorCode})` });
  });
  wc.on('render-process-gone', (_event, details) => send('browser-error', { id, message: 'A page process stopped: ' + details.reason }));
  activate(id);
  if (url === 'bolt://newtab') wc.loadFile(path.join(__dirname, 'newtab.html'));
  else if (isExtensionsUrl(url)) openExtensionsPage(wc);
  else wc.loadURL(navigateTo(url));
  return id;
}
function closeTab(id) {
  const item = tabs.get(id);
  if (!item) return;
  tabs.delete(id);
  win?.contentView.removeChildView(item.view);
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
  win.loadFile(path.join(__dirname, 'index.html')).catch(error => console.error('Could not load browser UI:', error));
  win.on('resize', layoutViews);
  win.on('closed', () => { win = null; tabs.clear(); });
  win.webContents.on('did-finish-load', () => createTab());
}

function saveExtensionPaths() {
  fs.mkdirSync(path.dirname(extensionStorePath()), { recursive: true });
  fs.writeFileSync(extensionStorePath(), JSON.stringify(extensionPaths, null, 2), 'utf8');
}
async function restoreExtensions() {
  try {
    const saved = JSON.parse(fs.readFileSync(extensionStorePath(), 'utf8'));
    extensionPaths = Array.isArray(saved) ? saved.filter(p => typeof p === 'string') : [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read saved extension paths:', error);
    extensionPaths = [];
  }
  const validPaths = [];
  for (const extensionPath of extensionPaths) {
    try {
      if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) continue;
      await browserExtensions().loadExtension(extensionPath, { allowFileAccess: false });
      validPaths.push(extensionPath);
    } catch (error) {
      console.error('Could not restore extension:', extensionPath, error);
    }
  }
  extensionPaths = validPaths;
  saveExtensionPaths();
}
function extensionSummary(extension) {
  return { id: extension.id, name: extension.name, version: extension.version, description: extension.manifest?.description || '' };
}
function isExtensionsManagerSender(event) {
  try {
    const senderUrl = new URL(event.senderFrame.url);
    return senderUrl.protocol === 'file:' && ['index.html', 'extensions.html'].includes(path.basename(senderUrl.pathname));
  } catch (_) { return false; }
}

ipcMain.handle('tab:overlay', (_e, isOpen) => {
  overlayOpen = Boolean(isOpen);
  layoutViews();
});
ipcMain.handle('tab:new', (_e, url) => createTab(url || 'bolt://newtab'));
ipcMain.handle('tab:activate', (_e, id) => activate(Number(id)));
ipcMain.handle('tab:close', (_e, id) => closeTab(Number(id)));
ipcMain.handle('tab:navigate', (_e, input) => {
  const item = tabs.get(activeTabId);
  if (!item) return;
  if (isExtensionsUrl(input)) openExtensionsPage(item.view.webContents);
  else item.view.webContents.loadURL(navigateTo(input));
});
ipcMain.handle('tab:back', () => { const wc = tabs.get(activeTabId)?.view.webContents; if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); });
ipcMain.handle('tab:forward', () => { const wc = tabs.get(activeTabId)?.view.webContents; if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); });
ipcMain.handle('tab:reload', () => tabs.get(activeTabId)?.view.webContents.reload());
ipcMain.handle('tab:home', () => { const wc = tabs.get(activeTabId)?.view.webContents; if (wc) wc.loadFile(path.join(__dirname, 'newtab.html')); });
ipcMain.handle('download:open-folder', () => shell.openPath(app.getPath('downloads')));
ipcMain.handle('extensions:list', (event) => {
  if (!isExtensionsManagerSender(event)) throw new Error('Extension manager access denied.');
  return browserExtensions().getAllExtensions().filter(extension => extension.manifest?.manifest_version === 3).map(extensionSummary);
});
ipcMain.handle('extensions:install', async (event) => {
  if (!isExtensionsManagerSender(event)) throw new Error('Extension manager access denied.');
  const result = await dialog.showOpenDialog(win, { title: 'Select an unpacked Chromium extension folder', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const extensionPath = path.resolve(result.filePaths[0]);
  const manifestPath = path.join(extensionPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('That folder does not contain manifest.json.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.manifest_version !== 3) throw new Error('Only Manifest V3 extensions are supported.');
  const extension = await browserExtensions().loadExtension(extensionPath, { allowFileAccess: false });
  if (!extensionPaths.includes(extensionPath)) extensionPaths.push(extensionPath);
  saveExtensionPaths();
  return extensionSummary(extension);
});
ipcMain.handle('extensions:remove', async (event, id) => {
  if (!isExtensionsManagerSender(event)) throw new Error('Extension manager access denied.');
  const extension = browserExtensions().getAllExtensions().find(item => item.id === id && item.manifest?.manifest_version === 3);
  if (!extension) throw new Error('Extension not found.');
  await browserExtensions().removeExtension(id);
  if (extension.path) {
    const removedPath = path.resolve(extension.path);
    extensionPaths = extensionPaths.filter(extensionPath => path.resolve(extensionPath) !== removedPath);
    saveExtensionPaths();
  }
  return true;
});

app.whenReady().then(async () => {
  app.setAppUserModelId('com.bolt.browser');
  Menu.setApplicationMenu(null);

  // Session access is only valid after Electron has emitted app 'ready'.
  const ses = browserSession();
  ses.on('will-download', (_event, item) => {
    const filename = item.getFilename();
    send('download-started', { filename, totalBytes: item.getTotalBytes() });
    item.on('updated', (_e, state) => send('download-progress', { filename, receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes(), state }));
    item.once('done', (_e, state) => send('download-finished', { filename, state, path: item.getSavePath() }));
  });

  await restoreExtensions();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
