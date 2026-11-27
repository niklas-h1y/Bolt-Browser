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
  const isAddToChromeButton = element => {
    if (!element?.matches?.('button,[role="button"]')) return false;
    const label = [element.innerText, element.getAttribute('aria-label'), element.getAttribute('title')]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return /(add\s+to\s+chrome|hinzufügen)/i.test(label);
  };
  const enableStoreInstallButton = () => {
    document.querySelectorAll('button,[role="button"]').forEach(button => {
      if (!isAddToChromeButton(button)) return;
      if (button.disabled) button.disabled = false;
      if (button.hasAttribute('disabled')) button.removeAttribute('disabled');
      if (button.getAttribute('aria-disabled') === 'true') button.setAttribute('aria-disabled', 'false');
      if (button.style.pointerEvents === 'none') button.style.pointerEvents = 'auto';
    });
  };
  enableStoreInstallButton();
  new MutationObserver(enableStoreInstallButton).observe(document, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['disabled', 'aria-disabled']
  });
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button,[role="button"]');
    if (!isAddToChromeButton(button)) return;
    const extensionId = window.location.pathname.split('/').filter(Boolean)
      .find(part => /^[a-p]{32}$/.test(part));
    if (!extensionId) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    ipcRenderer.sendToHost('bolt-webstore-install', extensionId);
  }, true);
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
    setOverlayOpen: isOpen => invoke('tab:overlay', isOpen),
    activateTab: id => invoke('tab:activate', id),
    closeTab: id => invoke('tab:close', id),
    navigate: url => invoke('tab:navigate', url),
    back: () => invoke('tab:back'),
    forward: () => invoke('tab:forward'),
    reload: () => invoke('tab:reload'),
    home: () => invoke('tab:home'),
    listExtensions: () => invoke('extensions:list'),
    installExtension: () => invoke('extensions:install'),
    removeExtension: id => invoke('extensions:remove', id),
    openExtensionPopup: id => invoke('extensions:open-popup', id),
    openDownloads: () => invoke('download:open-folder'),
    getShieldState: () => invoke('shield:get-state'),
    setShieldEnabled: enabled => invoke('shield:set-enabled', enabled),
    getUiSettings: () => invoke('settings:get-ui'),
    setUiSettings: settings => invoke('settings:set-ui', settings),
    getPermissionSettings: () => invoke('settings:get-permissions'),
    setPermissionSettings: settings => invoke('settings:set-permissions', settings),
    on: (channel, callback) => {
      const allowed = ['tabs-updated', 'page-state', 'navigation-started', 'browser-error', 'download-started', 'download-progress', 'download-finished', 'fullscreen-changed', 'shield-state', 'shield-count'];
      if (allowed.includes(channel)) ipcRenderer.on(channel, (_event, data) => callback(data));
    }
  });
}
