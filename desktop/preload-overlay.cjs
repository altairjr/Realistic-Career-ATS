// Ponte do app aberto por cima do jogo: esconder a janela e o tempo do jogo (avançar / ir para uma hora).
// Nada de instalar, login ou arquivos; os valores são conferidos de novo no programa (runner.mjs).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('carreiraDesktop', {
  isDesktop: true, overlay: true,
  hideOverlay: () => ipcRenderer.invoke('hide-overlay'),
  gameClock: () => ipcRenderer.invoke('game-clock'),
  advanceTime: minutes => ipcRenderer.invoke('advance-time', Number(minutes)),
  setTime: (h, m) => ipcRenderer.invoke('set-time', Number(h), Number(m))
});
