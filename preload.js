const { contextBridge, ipcRenderer } = require('electron');
if (window.location.protocol === 'file:' && window.location.pathname.endsWith('/index.html')) {
  const { injectBrowserAction } = require('electron-chrome-extensions/browser-action');
  injectBrowserAction();
}

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

// The Web Store's private Chrome API is not implemented by Electron. Forward an
// explicit user click to the main process, where the signed CRX is verified and
// the user is shown the normal extension-permissions approval dialog.
if (window.location.protocol === 'https:' && window.location.hostname === 'chromewebstore.google.com') {
  const INSTALL_LABEL = /(?:add\s+to\s+chrome|hinzufügen|zu\s+chrome\s+hinzufügen|zu\s+chrome\s+hinzuf[uü]gen|install(?:ieren)?)/i;
  const isInstallButton = element => {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const role = element.getAttribute('role');
    if (!element.matches('button,[role="button"],[data-testid*="install" i]')) return false;
    const label = [
      element.innerText,
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('data-testid')
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return INSTALL_LABEL.test(label);
  };
  const getInstallButton = target => {
    const path = typeof target?.composedPath === 'function' ? target.composedPath() : [];
    for (const node of path) if (isInstallButton(node)) return node;
    return target?.closest?.('button,[role="button"],[data-testid*="install" i]') || null;
  };
  const enableStoreInstallButtons = () => {
    document.querySelectorAll('button,[role="button"],[data-testid*="install" i]').forEach(button => {
      if (!isInstallButton(button)) return;
      button.disabled = false;
      button.removeAttribute('disabled');
      button.setAttribute('aria-disabled', 'false');
      if (button.style.pointerEvents === 'none') button.style.pointerEvents = 'auto';
    });
  };
  const sendInstallRequest = event => {
    const button = getInstallButton(event.target);
    if (!isInstallButton(button)) return;
    const extensionId = window.location.pathname.split('/').filter(Boolean)
      .find(part => /^[a-p]{32}$/.test(part));
    if (!extensionId) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    ipcRenderer.sendToHost('bolt-webstore-install', extensionId);
  };
  enableStoreInstallButtons();
  new MutationObserver(enableStoreInstallButtons).observe(document, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'data-testid']
  });
  // Capture before the Store's own handlers. Both pointer and keyboard-generated
  // click events arrive here, including controls rendered inside open shadow DOM.
  document.addEventListener('click', sendInstallRequest, true);
}

if (window.location.protocol === 'file:' && window.location.pathname.endsWith('/extensions.html')) {
  contextBridge.exposeInMainWorld('boltExtensions', {
    list: () => invoke('extensions:list'),
    installUnpacked: () => invoke('extensions:install'),
    remove: id => invoke('extensions:remove', id),
    installCrxFile: () => invoke('extensions:install-crx-file'),
    installCrxUrl: input => invoke('extensions:install-crx-url', input),
    getUiSettings: () => invoke('settings:get-ui'),
    setUiSettings: settings => invoke('settings:set-ui', settings),
    getShieldState: () => invoke('shield:get-state'),
    setShieldEnabled: enabled => invoke('shield:set-enabled', enabled)
  });
} else if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('bolt', {
    newTab: url => invoke('tab:new', url),
    newIncognitoTab: url => invoke('tab:new-incognito', url),
    setOverlayOpen: isOpen => invoke('tab:overlay', isOpen),
    activateTab: id => invoke('tab:activate', id),
    setTabGroup: (id, group) => invoke('tab:set-group', id, group),
    getWorkspaces: () => invoke('workspace:list'),
    getHistory: () => invoke('history:list'),
    clearHistory: () => invoke('history:clear'),
    quit: () => invoke('app:quit'),
    createWorkspace: name => invoke('workspace:create', name),
    switchWorkspace: name => invoke('workspace:switch', name),
    closeTab: id => invoke('tab:close', id),
    navigate: url => invoke('tab:navigate', url),
    back: () => invoke('tab:back'),
    forward: () => invoke('tab:forward'),
    reload: () => invoke('tab:reload'),
    recoverTab: () => invoke('tab:recover'),
    home: () => invoke('tab:home'),
    listExtensions: () => invoke('extensions:list'),
    installExtension: () => invoke('extensions:install'),
    removeExtension: id => invoke('extensions:remove', id),
    openExtensionPopup: id => invoke('extensions:open-popup', id),
    openDownloads: () => invoke('download:open-folder'),
    getAppInfo: () => invoke('app:get-info'),
    getShieldState: () => invoke('shield:get-state'),
    setShieldEnabled: enabled => invoke('shield:set-enabled', enabled),
    getUiSettings: () => invoke('settings:get-ui'),
    setUiSettings: settings => invoke('settings:set-ui', settings),
    pickNewTabBackground: () => invoke('settings:pick-background'),
    clearNewTabBackground: () => invoke('settings:clear-background'),
    toggleReaderMode: () => invoke('reader:toggle'),
    getResourceStats: () => invoke('resource:get-stats'),
    getSiteSettings: () => invoke('site:get-settings'),
    setSiteSettings: settings => invoke('site:set-settings', settings),
    exportBackup: () => invoke('backup:export'),
    importBackup: () => invoke('backup:import'),
    getPermissionSettings: () => invoke('settings:get-permissions'),
    setPermissionSettings: settings => invoke('settings:set-permissions', settings),
    on: (channel, callback) => {
      const allowed = ['tabs-updated', 'page-state', 'navigation-started', 'browser-error', 'download-started', 'download-progress', 'download-finished', 'fullscreen-changed', 'shield-state', 'shield-count', 'ui-settings-updated', 'resource-stats', 'site-settings-updated', 'workspaces-updated', 'reader-state', 'incognito-state'];
      if (allowed.includes(channel)) ipcRenderer.on(channel, (_event, data) => callback(data));
    }
  });
}
