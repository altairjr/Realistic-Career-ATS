/* Núcleo: atalhos, formatação e variáveis globais do app */
const E = Engine;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = v => { const x = E.r2(v); return (x < 0 ? '-' : '') + '$' + Math.abs(x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const fmtN = v => E.r2(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clone = o => JSON.parse(JSON.stringify(o));
const CLIENT = uid();
const LS_KEY = 'carreira-ats-v1';
// Leitura e gravação tolerantes no armazenamento do navegador (pode estar bloqueado)
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let S = null;            // estado do app
let H = [];              // semanas arquivadas
let tab = 'painel';
// Sincronização: backend ativo (conta Claude ou servidor próprio), situação e se a primeira leitura já chegou
const store = { backend: null, mode: 'local', uid: null, status: 'local', loaded: false };
