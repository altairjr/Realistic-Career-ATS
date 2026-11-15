// Ponte do app aberto por cima do jogo: só permite esconder a janela (nada de instalar, login ou arquivos).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('carreiraDesktop', { isDesktop: true, overlay: true, hideOverlay: () => ipcRenderer.invoke('hide-overlay') });
