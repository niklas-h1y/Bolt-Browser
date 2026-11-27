const { app, BrowserWindow, WebContentsView, Menu, ipcMain, dialog, session, shell, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL, fileURLToPath } = require('node:url');
const crypto = require('node:crypto');
const os = require('node:os');
const extractZip = require('extract-zip');
const { configurePermissions, DEFAULTS: DEFAULT_PERMISSION_SETTINGS } = require('./permissions');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');

protocol.registerSchemesAsPrivileged([{ scheme: 'bolt', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
// Use an English Chromium locale regardless of the host operating-system language.
app.commandLine.appendSwitch('lang', 'en-US');
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
let extensionManager;
let permissionSettings = { ...DEFAULT_PERMISSION_SETTINGS };
let shieldEnabled = true;
let blockedRequestCount = 0;
let shieldRequestListener = null;
let uiSettings = { theme: 'bolt-dark', accent: '#b8f36b', searchEngine: 'google', startup: 'newtab' };
let pendingProtocolUrl = process.argv.find(arg => /^bolt:\/\//i.test(arg)) || null;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() { try { const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); permissionSettings = { ...DEFAULT_PERMISSION_SETTINGS, ...(saved.permissions || {}) }; shieldEnabled = saved.shieldEnabled !== false; uiSettings = { ...uiSettings, ...(saved.uiSettings || {}) }; } catch (_) {} }
function saveSettings() { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify({ permissions: permissionSettings, shieldEnabled, uiSettings }, null, 2), 'utf8'); }
function isChromeWebStoreRequest(details) {
  try {
    const requestUrl = new URL(details.url);
    const initiator = details.initiator ? new URL(details.initiator) : null;
    // Do not interfere with the Web Store document or resources it loads.
    // The Store uses multiple Google-owned origins for its application bundle,
    // account state, images, and extension metadata.
    return requestUrl.hostname === 'chromewebstore.google.com'
      || requestUrl.hostname === 'chrome.google.com'
      || initiator?.hostname === 'chromewebstore.google.com'
      || initiator?.hostname === 'chrome.google.com';
  } catch (_) { return false; }
}
function isBlockedAdRequest(rawUrl) {
  try {
    const u = new URL(rawUrl); const host = u.hostname.toLowerCase(); const pathName = u.pathname.toLowerCase();
    const domains = ['doubleclick.net','googlesyndication.com','google-analytics.com','googletagmanager.com','googleadservices.com','adnxs.com','taboola.com','outbrain.com','scorecardresearch.com','adform.net','adroll.com','criteo.com','adsrvr.org','rubiconproject.com','pubmatic.com','openx.net','casalemedia.com','demdex.net','quantserve.com','hotjar.com','segment.io','segment.com','mixpanel.com','amplitude.com','branch.io','appsflyer.com','adjust.com','pixel.facebook.com','connect.facebook.net'];
    if (domains.some(domain => host === domain || host.endsWith('.' + domain))) return true;
    if (host === 'facebook.net' && pathName.startsWith('/tr')) return true;
    return false;
  } catch (_) { return false; }
}
function configureShield(ses) {
  if (shieldRequestListener) ses.webRequest.onBeforeRequest(null);
  shieldRequestListener = (details, callback) => {
    const blocked = shieldEnabled && !isChromeWebStoreRequest(details) && isBlockedAdRequest(details.url);
    if (blocked) { blockedRequestCount += 1; send('shield-count', blockedRequestCount); }
    callback({ cancel: blocked });
  };
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, shieldRequestListener);
  send('shield-state', { enabled: shieldEnabled, blocked: blockedRequestCount });
}
function setShieldEnabled(enabled) {
  shieldEnabled = Boolean(enabled); saveSettings();
  if (!shieldEnabled) blockedRequestCount = 0;
  send('shield-state', { enabled: shieldEnabled, blocked: blockedRequestCount });
  return { enabled: shieldEnabled, blocked: blockedRequestCount };
}
const partition = 'persist:bolt';
const browserSession = () => session.fromPartition(partition);
// Electron 35+ exposes extension methods on ses.extensions; older versions expose them on ses.
const browserExtensions = () => {
  const ses = browserSession();
  // Remove Electron/Bolt product tokens from requests made by the browser session.
  const cleanUserAgent = cleanChromeUserAgent(ses.getUserAgent());
  ses.setUserAgent(cleanUserAgent);
  const extApi = ses.extensions || ses;
  return extApi;
};
const extensionStorePath = () => path.join(app.getPath('userData'), 'extensions.json');
let extensionPaths = [];

function cleanChromeUserAgent(userAgent) {
  return String(userAgent || '')
    .replace(/\s*Electron\/[\d.]+/gi, '')
    .replace(/\s*Bolt[\w-]*\/[\d.]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function showWebStoreInstallToast(webContents, message) {
  if (webContents && !webContents.isDestroyed()) {
    const safeMessage = JSON.stringify(String(message));
    webContents.executeJavaScript(`(() => {
      const old = document.getElementById('bolt-install-toast');
      if (old) old.remove();
      const toast = document.createElement('div');
      toast.id = 'bolt-install-toast';
      toast.textContent = ${safeMessage};
      Object.assign(toast.style, {
        position: 'fixed', zIndex: '2147483647', right: '24px', bottom: '24px',
        padding: '12px 18px', borderRadius: '10px', background: '#20251d',
        color: '#eaffd2', border: '1px solid #b8f36b', font: '13px sans-serif',
        boxShadow: '0 4px 24px #0008'
      });
      document.documentElement.appendChild(toast);
      setTimeout(() => toast.remove(), 4500);
    })()`).catch(() => {});
  }
}
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
  if (extensionManager) extensionManager.selectTab(wc);
  send('page-state', { id, url: displayUrl(wc.getURL()), title: wc.getTitle() || 'New tab', canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() });
  publishTabs();
}
function internalPageForUrl(value) {
  const input = String(value || '').trim();
  const match = input.match(/^(?:chrome|bolt):\/\/([^/?#]+)(?:[/?#].*)?$/i);
  if (!match) return null;
  const page = match[1].toLowerCase();
  if (page === 'extensions') return 'extensions';
  if (page === 'newtab') return 'newtab';
  return 'unsupported';
}
function isExtensionsUrl(value) { return internalPageForUrl(value) === 'extensions'; }
function loadInternalPage(webContents, page) {
  if (!webContents || webContents.isDestroyed()) return;
  const file = page === 'extensions' ? 'extensions.html' : page === 'newtab' ? 'newtab.html' : null;
  if (file) webContents.loadFile(path.join(__dirname, file));
  else webContents.executeJavaScript(`document.body.innerHTML = '<main style="font:16px system-ui;padding:40px;color:#ddd;background:#10131b"><h1>Page not available</h1><p>This Chrome internal page is not implemented in Bolt Browser.</p><p>Try <code>chrome://extensions</code> to manage extensions.</p></main>'`).catch(() => {});
}
function openExtensionsPage(webContents) { loadInternalPage(webContents, 'extensions'); }
function navigateTo(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  const internalPage = internalPageForUrl(value);
  if (internalPage === 'extensions') return 'bolt://extensions';
  if (internalPage === 'newtab') return 'bolt://newtab';
  if (internalPage === 'unsupported') return '';
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
  if (extensionManager && win && !win.isDestroyed()) extensionManager.addTab(wc, win);
  // Keep the session and each embedded page on the same Chrome-like UA.
  wc.setUserAgent(cleanChromeUserAgent(browserSession().getUserAgent()));
  wc.on('ipc-message', async (event, channel, extensionId) => {
    if (channel !== 'bolt-webstore-install' || !/^[a-p]{32}$/.test(String(extensionId || ''))) return;
    let page;
    try { page = new URL(wc.getURL()); } catch (_) { return; }
    if (page.protocol !== 'https:' || page.hostname !== 'chromewebstore.google.com') return;
    const pathId = page.pathname.split('/').filter(Boolean).find(part => /^[a-p]{32}$/.test(part));
    if (pathId !== extensionId) return;
    try {
      const installed = await downloadCrxById(extensionId);
      if (installed?.canceled) {
        showWebStoreInstallToast(wc, 'Extension installation canceled.');
        return;
      }
      const label = installed?.name || 'Extension';
      showWebStoreInstallToast(wc, label + ' installed in Bolt Browser.');
      if (Notification.isSupported()) new Notification({ title: 'Extension installed', body: label + ' is ready to use.' }).show();
    } catch (error) {
      showWebStoreInstallToast(wc, 'Could not install extension: ' + error.message);
      console.error('Chrome Web Store installation failed:', error);
    }
  });
  attachDevToolsShortcut(wc);
  if (permissionManager) permissionManager.attachWebContents(wc);
  wc.on('context-menu', (_event, params) => {
    const items = extensionManager?.getContextMenuItems(wc, params) || [];
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win, x: params.x, y: params.y });
  });
  wc.on('did-create-window', childWindow => { if (childWindow?.webContents) { attachDevToolsShortcut(childWindow.webContents); if (permissionManager) permissionManager.attachWebContents(childWindow.webContents); } });
  wc.setWindowOpenHandler(({ url, features }) => {
    const internalPage = internalPageForUrl(url);
    if (internalPage) {
      createTab(url);
      return { action: 'deny' };
    }
    let target;
    try { target = new URL(url); } catch { return { action: 'deny' }; }
    if (!['http:', 'https:', 'about:'].includes(target.protocol)) {
      if (target.protocol !== 'about:') shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    }
    // Keep web popups inside Bolt's managed tab system. Creating an unmanaged
    // BrowserWindow here can detach Web Store auth/navigation from the tab
    // lifecycle and has caused the app window to become unstable.
    createTab(url);
    return { action: 'deny' };
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
    const internalPage = internalPageForUrl(navigatedUrl);
    if (internalPage) {
      event.preventDefault();
      loadInternalPage(wc, internalPage);
      return;
    }
    send('navigation-started', { id, url: navigatedUrl });
  });
  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && id === activeTabId) send('browser-error', { id, message: `Could not load ${validatedURL}: ${errorDescription} (${errorCode})` });
  });
  wc.on('render-process-gone', (_event, details) => send('browser-error', { id, message: 'A page process stopped: ' + details.reason }));
  activate(id);
  if (url === 'bolt://newtab' || internalPageForUrl(url) === 'newtab') {
    const override = extensionManager?.getURLOverrides().newtab;
    if (override) wc.loadURL(override); else loadInternalPage(wc, 'newtab');
  }
  else if (internalPageForUrl(url) === 'extensions') openExtensionsPage(wc);
  else if (internalPageForUrl(url) === 'unsupported') loadInternalPage(wc, 'unsupported');
  else wc.loadURL(navigateTo(url));
  return id;
}
function closeTab(id, fromExtension = false) {
  const item = tabs.get(id);
  if (!item) return;
  tabs.delete(id);
  if (extensionManager && !fromExtension) extensionManager.removeTab(item.view.webContents);
  win?.contentView.removeChildView(item.view);
  if (!item.view.webContents.isDestroyed()) item.view.webContents.close();
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
    webPreferences: { preload: path.join(__dirname, 'preload.bundle.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
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
function readProtoFields(buffer) {
  const fields = []; let offset = 0;
  const varint = () => { let value = 0n, shift = 0n; while (offset < buffer.length) { const byte = buffer[offset++]; value |= BigInt(byte & 0x7f) << shift; if (!(byte & 0x80)) return Number(value); shift += 7n; if (shift > 63n) throw new Error('Invalid CRX3 protobuf varint.'); } throw new Error('Truncated CRX3 protobuf.'); };
  while (offset < buffer.length) {
    const tag = varint(), field = tag >>> 3, wire = tag & 7;
    if (wire === 0) fields.push({ field, wire, value: varint() });
    else if (wire === 2) { const length = varint(); if (length < 0 || offset + length > buffer.length) throw new Error('Invalid CRX3 protobuf length.'); fields.push({ field, wire, value: buffer.subarray(offset, offset + length) }); offset += length; }
    else if (wire === 1) { fields.push({ field, wire, value: buffer.subarray(offset, offset + 8) }); offset += 8; }
    else if (wire === 5) { fields.push({ field, wire, value: buffer.subarray(offset, offset + 4) }); offset += 4; }
    else throw new Error('Unsupported CRX3 protobuf wire type.');
  }
  return fields;
}
function crxIdFromBytes(bytes) { return [...bytes].map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join(''); }
function parseCrx3(buffer) {
  if (buffer.length < 16 || buffer.toString('ascii', 0, 4) !== 'Cr24' || buffer.readUInt32LE(4) !== 3) throw new Error('Only valid CRX3 packages are supported.');
  const headerLength = buffer.readUInt32LE(8), payloadOffset = 12 + headerLength;
  if (!headerLength || payloadOffset >= buffer.length) throw new Error('Invalid CRX3 header length.');
  const header = buffer.subarray(12, payloadOffset), payload = buffer.subarray(payloadOffset);
  if (payload[0] !== 0x50 || payload[1] !== 0x4b) throw new Error('CRX3 package does not contain a ZIP payload.');
  const headerFields = readProtoFields(header);
  const signedData = headerFields.find(field => field.field === 10000 && field.wire === 2)?.value;
  const signedFields = signedData ? readProtoFields(signedData) : [];
  const crxId = signedFields.find(field => field.field === 1 && field.wire === 2)?.value;
  if (!crxId || crxId.length !== 16) throw new Error('CRX3 package is missing its extension ID.');
  const id = crxIdFromBytes(crxId);
  let publicKey = null, signature = null;
  for (const field of headerFields.filter(item => (item.field === 2 || item.field === 3) && item.wire === 2)) {
    const pair = readProtoFields(field.value);
    publicKey ||= pair.find(item => item.field === 1 && item.wire === 2)?.value || null;
    signature ||= pair.find(item => item.field === 2 && item.wire === 2)?.value || null;
  }
  if (!publicKey || !signature || !signedData) throw new Error('CRX3 package is missing its signature data.');
  const derivedId = crypto.createHash('sha256').update(publicKey).digest().subarray(0, 16);
  if (crxIdFromBytes(derivedId) !== id) throw new Error('CRX3 public key does not match its extension ID.');
  const signedBytes = Buffer.concat([signedData, crxId, payload]);
  const valid = crypto.verify('sha256', signedBytes, { key: publicKey, format: 'der', type: 'spki' }, signature);
  if (!valid) throw new Error('CRX3 signature verification failed. The package may be corrupted or tampered with.');
  return { id, publicKey: publicKey.toString('base64'), payload };
}
async function installCrxBuffer(buffer, expectedId) {
  const parsed = parseCrx3(buffer);
  if (expectedId && parsed.id !== expectedId) throw new Error('Downloaded extension ID does not match the requested ID.');
  const root = path.join(app.getPath('userData'), 'installed-extensions');
  const target = path.join(root, parsed.id);
  fs.mkdirSync(root, { recursive: true });
  const tempZip = path.join(os.tmpdir(), 'bolt-' + parsed.id + '-' + Date.now() + '.zip');
  const staging = target + '.extracting-' + process.pid;
  try {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.writeFileSync(tempZip, parsed.payload);
    await extractZip(tempZip, { dir: staging });
    const manifestPath = path.join(staging, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('CRX3 archive has no manifest.json.');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.manifest_version !== 3) throw new Error('Only Manifest V3 extensions are supported by Bolt.');
    const requested = [...(manifest.permissions || []), ...(manifest.host_permissions || [])];
    const approval = await dialog.showMessageBox(win, { type: 'warning', title: 'Review CRX extension permissions', message: 'Install "' + (manifest.name || parsed.id) + '"?', detail: requested.length ? 'This extension requests access to:\n' + requested.join('\n') : 'No permissions are declared in its manifest.', buttons: ['Cancel', 'Install extension'], defaultId: 0, cancelId: 0, noLink: true });
    if (approval.response !== 1) { fs.rmSync(staging, { recursive: true, force: true }); return { canceled: true }; }
    manifest.key = parsed.publicKey;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(staging, target);
    const extension = await browserExtensions().loadExtension(target, { allowFileAccess: false });
    if (extension.id !== parsed.id) {
      await browserExtensions().removeExtension(extension.id);
      fs.rmSync(target, { recursive: true, force: true });
      throw new Error('Electron loaded a different extension ID than the signed CRX3 package.');
    }
    if (!extensionPaths.includes(target)) extensionPaths.push(target);
    saveExtensionPaths();
    return extensionSummary(extension);
  } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error; }
  finally { fs.rmSync(tempZip, { force: true }); }
}
async function downloadCrxById(id) {
  if (!/^[a-p]{32}$/.test(id)) throw new Error('Enter a valid 32-character Chrome extension ID.');
  const endpoint = 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=131.0.0.0&acceptformat=crx2,crx3&x=id%3D' + id + '%26uc';
  const response = await net.fetch(endpoint, { redirect: 'follow' });
  if (!response.ok) throw new Error('Google update service returned HTTP ' + response.status + '.');
  return installCrxBuffer(Buffer.from(await response.arrayBuffer()), id);
}
function extractChromeExtensionId(input) {
  const value = String(input || '').trim();
  if (/^[a-p]{32}$/.test(value)) return value;
  let parsed; try { parsed = new URL(value); } catch (_) { throw new Error('Paste a Chrome Web Store URL or a 32-character extension ID.'); }
  if (!['https:'].includes(parsed.protocol) || !['chromewebstore.google.com','chrome.google.com'].includes(parsed.hostname)) throw new Error('Only official Chrome Web Store URLs are accepted.');
  const parts = parsed.pathname.split('/').filter(Boolean);
  const id = parts.find(part => /^[a-p]{32}$/.test(part));
  if (!id) throw new Error('Could not find a 32-character extension ID in that Web Store URL.');
  return id;
}
function extensionSummary(extension) {
  return { id: extension.id, name: extension.name, version: extension.version, description: extension.manifest?.description || '', hasPopup: Boolean(extension.manifest?.action?.default_popup || extension.manifest?.browser_action?.default_popup) };
}
function isAppUiSender(event) {
  try {
    if (!event?.sender || !event?.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
    const senderUrl = new URL(event.senderFrame.url);
    if (senderUrl.protocol !== 'file:' || senderUrl.search || senderUrl.hash) return false;
    const allowedFiles = new Set(['index.html', 'newtab.html', 'extensions.html']);
    const senderPath = path.resolve(fileURLToPath(senderUrl));
    const expectedPath = path.resolve(path.join(__dirname, path.basename(senderPath)));
    if (!allowedFiles.has(path.basename(senderPath)) || senderPath !== expectedPath) return false;
    const isBrowserUi = win && !win.isDestroyed() && event.sender === win.webContents;
    const isManagedTab = [...tabs.values()].some(item =>
      item.view.webContents === event.sender && !item.view.webContents.isDestroyed()
    );
    return Boolean(isBrowserUi || isManagedTab);
  } catch (_) { return false; }
}
function isExtensionsManagerSender(event) {
  return isAppUiSender(event);
}

ipcMain.handle('tab:overlay', (_e, isOpen) => {
  if (!isAppUiSender(_e)) throw new Error('Browser UI access denied.');
  overlayOpen = Boolean(isOpen);
  layoutViews();
});
ipcMain.handle('tab:new', (_e, url) => { if (!isAppUiSender(_e)) throw new Error('Browser UI access denied.'); return createTab(url || 'bolt://newtab'); });
ipcMain.handle('tab:activate', (_e, id) => { if (!isAppUiSender(_e)) throw new Error('Browser UI access denied.'); return activate(Number(id)); });
ipcMain.handle('tab:close', (_e, id) => { if (!isAppUiSender(_e)) throw new Error('Browser UI access denied.'); return closeTab(Number(id)); });
ipcMain.handle('tab:navigate', (_e, input) => {
  if (!isAppUiSender(_e)) throw new Error('Browser UI access denied.');
  const item = tabs.get(activeTabId);
  if (!item) return;
  const page = internalPageForUrl(input);
  if (page === 'extensions' || page === 'newtab') loadInternalPage(item.view.webContents, page);
  else if (page === 'unsupported') loadInternalPage(item.view.webContents, 'unsupported');
  else item.view.webContents.loadURL(navigateTo(input));
});
ipcMain.handle('tab:back', event => { if (!isAppUiSender(event)) throw new Error('Browser UI access denied.'); const wc = tabs.get(activeTabId)?.view.webContents; if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); });
ipcMain.handle('tab:forward', event => { if (!isAppUiSender(event)) throw new Error('Browser UI access denied.'); const wc = tabs.get(activeTabId)?.view.webContents; if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); });
ipcMain.handle('tab:reload', event => { if (!isAppUiSender(event)) throw new Error('Browser UI access denied.'); return tabs.get(activeTabId)?.view.webContents.reload(); });
ipcMain.handle('tab:home', event => { if (!isAppUiSender(event)) throw new Error('Browser UI access denied.'); const wc = tabs.get(activeTabId)?.view.webContents; if (wc) wc.loadFile(path.join(__dirname, 'newtab.html')); });
ipcMain.handle('download:open-folder', event => { if (!isAppUiSender(event)) throw new Error('Browser UI access denied.'); return shell.openPath(app.getPath('downloads')); });
ipcMain.handle('shield:get-state', event => { if (!isExtensionsManagerSender(event)) throw new Error('Settings access denied.'); return { enabled: shieldEnabled, blocked: blockedRequestCount }; });
ipcMain.handle('shield:set-enabled', (event, enabled) => { if (!isExtensionsManagerSender(event)) throw new Error('Settings access denied.'); return setShieldEnabled(enabled); });
ipcMain.handle('app:get-info', event => {
  if (!isExtensionsManagerSender(event)) throw new Error('Application information access denied.');
  return {
    version: app.getVersion(),
    electron: process.versions.electron || 'Unknown',
    chromium: process.versions.chrome || 'Unknown',
    node: process.versions.node || 'Unknown'
  };
});
ipcMain.handle('settings:get-ui', event => {
  if (!isExtensionsManagerSender(event)) throw new Error('Settings access denied.');
  return { ...uiSettings };
});
ipcMain.handle('settings:set-ui', (event, next) => {
  if (!isExtensionsManagerSender(event)) throw new Error('Settings access denied.');
  if (!next || typeof next !== 'object') throw new Error('Invalid UI settings.');
  const themes = ['bolt-dark','midnight-neon','oled-black','clean-light'];
  const theme = themes.includes(next.theme) ? next.theme : uiSettings.theme;
  const accent = /^#[0-9a-f]{6}$/i.test(String(next.accent || '')) ? next.accent : uiSettings.accent;
  const engines = ['google','duckduckgo','bing'];
  const searchEngine = engines.includes(next.searchEngine) ? next.searchEngine : uiSettings.searchEngine;
  uiSettings = { ...uiSettings, theme, accent, searchEngine, startup: 'newtab' };
  saveSettings();
  return { ...uiSettings };
});
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
  const requested = [...(manifest.permissions || []), ...(manifest.host_permissions || [])];
  const approval = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Review extension permissions',
    message: 'Install "' + (manifest.name || 'this extension') + '"?',
    detail: requested.length ? 'This extension requests access to:\n' + requested.join('\n') : 'This extension did not declare permissions in its manifest.',
    buttons: ['Cancel', 'Install extension'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (approval.response !== 1) return { canceled: true };
  const extension = await browserExtensions().loadExtension(extensionPath, { allowFileAccess: false });
  if (!extensionPaths.includes(extensionPath)) extensionPaths.push(extensionPath);
  saveExtensionPaths();
  return extensionSummary(extension);
});
ipcMain.handle('extensions:install-crx-file', async event => {
  if (!isExtensionsManagerSender(event)) throw new Error('Extension manager access denied.');
  const result = await dialog.showOpenDialog(win, { title: 'Select a Chrome CRX3 package', properties: ['openFile'], filters: [{ name: 'Chrome extension package', extensions: ['crx'] }] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const buffer = fs.readFileSync(result.filePaths[0]);
  const installed = await installCrxBuffer(buffer);
  if (installed?.canceled) return installed;
  const approval = await dialog.showMessageBox(win, { type: 'warning', title: 'Extension installed', message: 'Installed ' + installed.name + '.', detail: 'Only use extensions from sources you trust. Review the extension permissions in the extensions manager.', buttons: ['OK'], noLink: true });
  return installed;
});
ipcMain.handle('extensions:install-crx-url', async (event, input) => {
  if (!isExtensionsManagerSender(event)) throw new Error('Extension manager access denied.');
  const id = extractChromeExtensionId(input);
  const approval = await dialog.showMessageBox(win, { type: 'warning', title: 'Install Chrome Web Store extension?', message: 'Download and install extension ' + id + '?', detail: 'The package will be fetched from Google’s official update service. Extension permissions can provide broad access to websites and data.', buttons: ['Cancel', 'Download and install'], defaultId: 0, cancelId: 0, noLink: true });
  if (approval.response !== 1) return { canceled: true };
  return downloadCrxById(id);
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
  const crxDirectory = path.resolve(path.join(app.getPath('userData'), 'installed-extensions', id));
  if (crxDirectory.startsWith(path.resolve(path.join(app.getPath('userData'), 'installed-extensions')) + path.sep)) fs.rmSync(crxDirectory, { recursive: true, force: true });
  if (extension.path) {
    const removedPath = path.resolve(extension.path);
    extensionPaths = extensionPaths.filter(extensionPath => path.resolve(extensionPath) !== removedPath);
    saveExtensionPaths();
  }
  extensionPaths = extensionPaths.filter(extensionPath => path.resolve(extensionPath) !== crxDirectory);
  saveExtensionPaths();
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
  // Compute and apply the cleaned UA once, then reuse it for all session requests.
  const cleanUserAgent = cleanChromeUserAgent(ses.getUserAgent());
  ses.setUserAgent(cleanUserAgent);
  configureShield(ses);
  // Keep request headers consistent with the cleaned session UA. Electron's
  // brand can also appear in Chromium Client Hints; remove only that brand and
  // preserve the remaining Chromium brand/version entries.
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    headers['User-Agent'] = cleanUserAgent;
    headers['Accept-Language'] = 'en-US,en;q=0.9';
    for (const headerName of Object.keys(headers)) {
      if (!/^sec-ch-ua(?:-full-version-list)?$/i.test(headerName)) continue;
      const value = String(headers[headerName] || '');
      const cleaned = value
        .split(/,\s*(?=(?:"|'))/)
        .filter(entry => !/"Electron"\s*;\s*v\s*=|\bElectron\b/i.test(entry))
        .join(', ')
        .trim();
      if (cleaned) headers[headerName] = cleaned;
      else delete headers[headerName];
    }
    callback({ requestHeaders: headers });
  });
  permissionManager = configurePermissions({ ses, getWindow: () => win, getSettings: () => permissionSettings });
  extensionManager = new ElectronChromeExtensions({
    session: ses,
    createTab: async details => {
      if (!win || win.isDestroyed()) throw new Error('Bolt Browser window is not available.');
      if (typeof details.windowId === 'number' && details.windowId !== win.id) throw new Error('The requested browser window is not available.');
      const previousTabId = activeTabId;
      const id = createTab(details.url || 'bolt://newtab');
      const item = tabs.get(id);
      if (details.active === false && previousTabId && tabs.has(previousTabId)) activate(previousTabId);
      return [item.view.webContents, win];
    },
    selectTab: (webContents, browserWindow) => {
      if (!win || browserWindow !== win) return;
      const entry = [...tabs.entries()].find(([, item]) => item.view.webContents === webContents);
      if (entry) activate(entry[0]);
    },
    removeTab: webContents => {
      const entry = [...tabs.entries()].find(([, item]) => item.view.webContents === webContents);
      if (entry) closeTab(entry[0], true);
    },
    requestPermissions: async (extension, requested) => {
      const names = [...(requested.permissions || []), ...(requested.origins || [])];
      const result = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Extension permission request',
        message: (extension.name || 'An extension') + ' wants additional permissions.',
        detail: names.length ? names.join('\\n') : 'No additional permissions were specified.',
        buttons: ['Block', 'Allow'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      });
      return result.response === 1;
    }
  });
  ElectronChromeExtensions.handleCRXProtocol(ses);
  // The toolbar lives in the app window's default session; extension data lives in persist:bolt.
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);

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
