const { app, BrowserWindow, WebContentsView, Menu, ipcMain, dialog, session, shell, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { configurePermissions, DEFAULTS: DEFAULT_PERMISSION_SETTINGS } = require('./permissions');

protocol.registerSchemesAsPrivileged([{ scheme: 'bolt', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
// Set BOLT_GOOGLE_API_KEY in the build environment; never commit a private API key.
if (process.env.BOLT_GOOGLE_API_KEY && !process.env.GOOGLE_API_KEY) process.env.GOOGLE_API_KEY = process.env.BOLT_GOOGLE_API_KEY;

let win;
let tabs = new Map();
let activeTabId = null;
let overlayOpen = false;
let extensionPopupWindows = new Map();
let nextTabId = 1;
let chromeHidden = false;
let permissionManager;
let permissionSettings = { ...DEFAULT_PERMISSION_SETTINGS };
let pendingProtocolUrl = process.argv.find(arg => /^bolt:\/\//i.test(arg)) || null;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() { try { const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); permissionSettings = { ...DEFAULT_PERMISSION_SETTINGS, ...(saved.permissions || {}) }; } catch (_) {} }
function saveSettings() { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify({ permissions: permissionSettings }, null, 2), 'utf8'); }
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
function handleExternalProtocol(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'bolt:' || !['newtab', 'extensions'].includes(parsed.hostname)) return false;
    if (win && !win.isDestroyed()) createTab(rawUrl); else pendingProtocolUrl = rawUrl;
    return true;
  } catch (_) { return false; }
}
app.on('open-url', (event, url) => { event.preventDefault(); handleExternalProtocol(url); });

function attachDevToolsShortcut(webContents) {
  if (!webContents || webContents.isDestroyed()) return;
  webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      if (!webContents.isDestroyed()) webContents.toggleDevTools();
    }
  });
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
    const top = chromeHidden ? 0 : 116;
    item.view.setBounds({ x: 0, y: top, width, height: Math.max(100, height - top - (chromeHidden ? 0 : 24)) });
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
  attachDevToolsShortcut(wc);
  if (permissionManager) permissionManager.attachWebContents(wc);
  wc.on('did-create-window', childWindow => { if (childWindow?.webContents) { attachDevToolsShortcut(childWindow.webContents); if (permissionManager) permissionManager.attachWebContents(childWindow.webContents); } });
  wc.setWindowOpenHandler(({ url, features }) => {
    let target;
    try { target = new URL(url); } catch { return { action: 'deny' }; }
    if (!['http:', 'https:', 'about:'].includes(target.protocol)) {
      if (target.protocol !== 'about:') shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    }
    const popupFeatures = Object.fromEntries(String(features || '').split(',').map(part => part.trim().split('=').map(v => v.trim())).filter(pair => pair.length === 2));
    const width = Math.max(360, Math.min(1200, Number(popupFeatures.width) || 900));
    const height = Math.max(300, Math.min(1000, Number(popupFeatures.height) || 700));
    return { action: 'allow', overrideBrowserWindowOptions: { width, height, autoHideMenuBar: true, parent: win, backgroundColor: '#10131b', webPreferences: { session: browserSession(), contextIsolation: true, sandbox: true, nodeIntegration: false } } };
  });
  wc.on('enter-html-full-screen', () => { chromeHidden = true; layoutViews(); send('fullscreen-changed', true); });
  wc.on('leave-html-full-screen', () => { chromeHidden = Boolean(win?.isFullScreen()); layoutViews(); send('fullscreen-changed', chromeHidden); });
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
  attachDevToolsShortcut(win.webContents);
  win.on('resize', layoutViews);
  win.on('enter-full-screen', () => { chromeHidden = true; layoutViews(); send('fullscreen-changed', true); });
  win.on('leave-full-screen', () => { chromeHidden = false; layoutViews(); send('fullscreen-changed', false); });
  win.on('closed', () => { win = null; tabs.clear(); });
  win.webContents.on('did-finish-load', () => {
    createTab();
    if (pendingProtocolUrl) { const url = pendingProtocolUrl; pendingProtocolUrl = null; handleExternalProtocol(url); }
  });
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
  return { id: extension.id, name: extension.name, version: extension.version, description: extension.manifest?.description || '', hasPopup: Boolean(extension.manifest?.action?.default_popup || extension.manifest?.browser_action?.default_popup) };
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
ipcMain.handle('settings:get-permissions', (event) => {
  if (!isExtensionsManagerSender(event)) throw new Error('Settings access denied.');
  return { ...permissionSettings };
});
ipcMain.handle('settings:set-permissions', (event, next) => {
  if (!isExtensionsManagerSender(event)) throw new Error('Settings access denied.');
  if (!next || typeof next !== 'object') throw new Error('Invalid permission settings.');
  permissionSettings = permissionManager ? permissionManager.updateSettings({ ...permissionSettings, ...next }) : { ...DEFAULT_PERMISSION_SETTINGS, ...next };
  saveSettings();
  return { ...permissionSettings };
});
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
ipcMain.handle('extensions:open-popup', async (event, id) => {
  if (!isExtensionsManagerSender(event)) throw new Error('Extension manager access denied.');
  const extension = browserExtensions().getAllExtensions().find(item => item.id === id && item.manifest?.manifest_version === 3);
  if (!extension) throw new Error('Extension not found.');
  const popupPath = extension.manifest?.action?.default_popup || extension.manifest?.browser_action?.default_popup;
  if (!popupPath) throw new Error('This extension does not provide a toolbar popup. Electron does not implement Chrome action click events.');
  const popupUrl = new URL(popupPath, extension.url.endsWith('/') ? extension.url : extension.url + '/').toString();
  const existing = extensionPopupWindows.get(id);
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return true; }
  const popup = new BrowserWindow({
    width: 380, height: 560, minWidth: 280, minHeight: 240,
    parent: win, show: false, autoHideMenuBar: true, backgroundColor: '#191b18',
    webPreferences: { session: browserSession(), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  extensionPopupWindows.set(id, popup);
  popup.on('closed', () => { if (extensionPopupWindows.get(id) === popup) extensionPopupWindows.delete(id); });
  try { await popup.loadURL(popupUrl); if (!popup.isDestroyed()) popup.show(); }
  catch (error) { extensionPopupWindows.delete(id); if (!popup.isDestroyed()) popup.destroy(); throw new Error('Could not open extension popup: ' + error.message); }
  return true;
});
ipcMain.handle('extensions:remove', async (event, id) => {
  if (!isExtensionsManagerSender(event)) throw new Error('Extension manager access denied.');
  const extension = browserExtensions().getAllExtensions().find(item => item.id === id && item.manifest?.manifest_version === 3);
  if (!extension) throw new Error('Extension not found.');
  const popup = extensionPopupWindows.get(id);
  if (popup && !popup.isDestroyed()) popup.close();
  extensionPopupWindows.delete(id);
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
  if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient('bolt', process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient('bolt');
  Menu.setApplicationMenu(null);

  // Session access is only valid after Electron has emitted app 'ready'.
  loadSettings();
  const ses = browserSession();
  permissionManager = configurePermissions({ ses, getWindow: () => win, getSettings: () => permissionSettings });
  if (process.platform === 'darwin' && typeof app.configureWebAuthn === 'function' && process.env.BOLT_WEBAUTHN_KEYCHAIN_GROUP) {
    app.configureWebAuthn({
      touchID: { keychainAccessGroup: process.env.BOLT_WEBAUTHN_KEYCHAIN_GROUP, promptReason: 'verify your identity for $1' },
      platformPasskeys: process.env.BOLT_ENABLE_PLATFORM_PASSKEYS === '1'
    });
    ses.on('select-webauthn-account', async (_event, details, callback) => {
      try {
        const accounts = details.accounts || [];
        if (!accounts.length) return callback();
        const labels = accounts.map(account => account.name || account.displayName || account.credentialId);
        const result = await dialog.showMessageBox(win, {
          type: 'question', title: 'Choose a passkey', message: 'Choose an account for ' + details.relyingPartyId,
          buttons: [...labels, 'Cancel'], defaultId: 0, cancelId: labels.length, noLink: true
        });
        callback(result.response < accounts.length ? accounts[result.response].credentialId : undefined);
      } catch (error) { console.error('WebAuthn account selection failed:', error); callback(); }
    });
    ses.on('select-webauthn-authenticator', (event, callback) => {
      try { callback(event.authenticators.includes('platformPasskeys') ? 'platformPasskeys' : event.authenticators[0]); }
      catch (error) { console.error('WebAuthn authenticator selection failed:', error); callback(); }
    });
  }
  protocol.handle('bolt', request => {
    const host = new URL(request.url).hostname;
    const file = host === 'newtab' ? 'newtab.html' : host === 'extensions' ? 'extensions.html' : null;
    if (!file) return new Response('Unknown Bolt internal page', { status: 404 });
    return net.fetch(pathToFileURL(path.join(__dirname, file)).toString());
  });
  ses.on('will-download', (_event, item) => {
    const filename = item.getFilename();
    const downloadId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    send('download-started', { id: downloadId, filename, totalBytes: item.getTotalBytes() });
    item.on('updated', (_e, state) => send('download-progress', { id: downloadId, filename, receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes(), state }));
    item.once('done', (_e, state) => send('download-finished', { id: downloadId, filename, state, path: item.getSavePath() }));
  });

  await restoreExtensions();
  // Castlabs ECS exposes a components API for installing/updating the Widevine CDM.
  try { const components = require('electron').components; if (components?.whenReady) await components.whenReady(); }
  catch (error) { console.warn('Widevine component setup was unavailable:', error.message); }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
