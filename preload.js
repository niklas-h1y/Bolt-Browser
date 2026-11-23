const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('bolt', {
  newTab: url => invoke('tab:new', url),
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
  openDownloads: () => invoke('download:open-folder'),
  on: (channel, callback) => {
    const allowed = ['tabs-updated', 'page-state', 'navigation-started', 'browser-error', 'download-started', 'download-progress', 'download-finished'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_event, data) => callback(data));
  }
});
