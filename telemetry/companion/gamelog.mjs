// Lê o game.log.txt do jogo: perfil carregado (com horário), versão do jogo e se o plugin carregou.
// O jogo recria esse arquivo a cada vez que abre, então ele descreve só a sessão atual (ou a última).
const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

// "************ : log created on : Saturday November 14 2026 @ 20:29:20" → Date no horário local deste PC
export function parseCreated(text) {
  const m = String(text).match(/log created on\s*:\s*\w+\s+(\w+)\s+(\d+)\s+(\d{4})\s*@\s*(\d+):(\d+):(\d+)/i);
  if (!m || MONTHS[m[1].toLowerCase()] === undefined) return null;
  return new Date(+m[3], MONTHS[m[1].toLowerCase()], +m[2], +m[4], +m[5], +m[6]);
}
const rel = s => { const m = s.match(/^(\d+):(\d+):(\d+)\.(\d+)/); return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4] : null; };

export function parseGameLog(text) {
  const created = parseCreated(text);
  const out = { created, profiles: [], gameVersion: null, pluginLoaded: false, pluginActive: false, pluginError: null, otherPlugins: [] };
  for (const line of String(text).split(/\r?\n/)) {
    const ms = rel(line);
    const at = created && ms !== null ? new Date(created.getTime() + ms) : null;
    let m;
    if ((m = line.match(/New profile selected:\s*'([^']*)'/))) out.profiles.push({ at, name: m[1] });
    else if ((m = line.match(/loading '([^']+)' '([^']+)'/))) { if (m[1] === 'carreira-telemetria') out.pluginLoaded = true; else out.otherPlugins.push(m[1]); }
    else if (line.includes('[carreira-telemetria] ativo')) out.pluginActive = true;
    else if ((m = line.match(/\[carreira-telemetria\]\s*(.*)/)) && !out.pluginActive) out.pluginError = m[1].trim();
    else if (!out.gameVersion && (m = line.match(/(American Truck Simulator|Euro Truck Simulator 2)[^\d]*(\d+\.\d+\.\d+(?:\.\d+)?\w*)/))) out.gameVersion = m[2];
  }
  return out;
}

// Perfil ativo num instante (registro do plugin com horário real). null = não dá para saber (outra sessão do jogo).
export function profileAt(log, when) {
  if (!log || !log.created || !log.profiles.length) return null;
  const t = when instanceof Date ? when.getTime() : Date.parse(when);
  if (!isFinite(t) || t < log.created.getTime() - 60e3) return null;
  let name = null;
  for (const p of log.profiles) if (p.at && p.at.getTime() <= t + 2000) name = p.name;
  return name;
}
export const currentProfile = log => (log && log.profiles.length ? log.profiles.at(-1).name : null);
