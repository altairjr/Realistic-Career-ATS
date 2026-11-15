// Ponte segura entre as janelas e o programa: o painel e o app no overlay só chamam estas funções.
const { contextBridge, ipcRenderer } = require('electron');
const call = (name, ...a) => ipcRenderer.invoke(name, ...a);
contextBridge.exposeInMainWorld('carreiraDesktop', {
  isDesktop: true,
  getState: () => call('get-state'),
  onState: cb => ipcRenderer.on('state', (e, s) => cb(s)),
  login: (email, password) => call('login', email, password),
  logout: () => call('logout'),
  setCollect: on => call('collect', on),
  linkProfile: name => call('link-profile', name),
  install: game => call('install', game),
  remove: game => call('remove', game),
  settings: patch => call('settings', patch),
  openApp: () => call('open-app'),
  openFolder: () => call('open-folder'),
  toggleOverlay: () => call('toggle-overlay'),
  hideOverlay: () => call('hide-overlay')
});
