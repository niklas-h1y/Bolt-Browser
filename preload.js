const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
if (window.location.protocol === 'file:' && window.location.pathname.endsWith('/extensions.html')) {
  contextBridge.exposeInMainWorld('boltExtensions', {
    list: () => invoke('extensions:list'),
    installUnpacked: () => invoke('extensions:install'),
    remove: id => invoke('extensions:remove', id)
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
    getPermissionSettings: () => invoke('settings:get-permissions'),
    setPermissionSettings: settings => invoke('settings:set-permissions', settings),
    on: (channel, callback) => {
      const allowed = ['tabs-updated', 'page-state', 'navigation-started', 'browser-error', 'download-started', 'download-progress', 'download-finished', 'fullscreen-changed'];
      if (allowed.includes(channel)) ipcRenderer.on(channel, (_event, data) => callback(data));
    }
  });
}
