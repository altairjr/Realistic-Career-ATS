// Interpreta os registros do plugin (telemetria.jsonl) e decide o que enviar para a conta.
// Funções puras, sem arquivo nem rede: facilitam os testes (tests/telemetry.test.cjs).
//
// Saídas de apply():
//   { type: 'draft',  draft }   entrega concluída → rascunho de viagem (tabela trip_drafts)
//   { type: 'status', status }  situação atual do jogo → tabela game_status (dia, trabalho em andamento)
//   { type: 'log',    text }    mensagem para a tela do programa

export const KM_TO_MI = 0.621371;
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
// Primeiro atributo numérico encontrado entre os nomes possíveis (o SDK pode mudar nomes entre versões)
const pick = (attrs, names) => { for (const n of names) { const v = num(attrs && attrs[n]); if (v !== null) return v; } return null; };
const text = (attrs, names) => { for (const n of names) if (attrs && typeof attrs[n] === 'string' && attrs[n].trim()) return attrs[n].trim(); return ''; };
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const gameDayOf = minutes => Math.floor(minutes / 1440) + 1;

export function createState() {
  return { game: 'ats', gameVersion: '', online: false, gameTime: null, job: null, jobOdometerStart: null, acc: emptyAcc(), truck: '' };
}
const emptyAcc = () => ({ fines: 0, tolls: 0, fuel: 0, fuelLiters: 0, events: [] });

function jobSummary(state) {
  const j = state.job; if (!j) return null;
  const km = pick(j, ['planned_distance.km']);
  return {
    cargo: text(j, ['cargo', 'cargo.id']), origin: text(j, ['source.city', 'source.city.id']), dest: text(j, ['destination.city', 'destination.city.id']),
    originCompany: text(j, ['source.company']), destCompany: text(j, ['destination.company']),
    plannedMiles: km !== null ? r1(km * KM_TO_MI) : null, income: pick(j, ['income']), deadline: pick(j, ['delivery.time']),
    special: !!(j['is.special.job'] ?? j['special.job']), market: text(j, ['job.market'])
  };
}
export function statusOf(state) {
  return { game: state.game, online: state.online, game_time: state.gameTime, job: jobSummary(state), truck: state.truck || null };
}
const money = v => '$' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function apply(state, rec) {
  const out = [];
  if (!rec || typeof rec !== 'object') return out;
  if (typeof rec.gameTime === 'number') state.gameTime = rec.gameTime;
  const status = () => out.push({ type: 'status', status: statusOf(state) });

  switch (rec.t) {
    case 'start':
      state.online = true; state.plugin = rec.plugin || null; state.game = rec.game === 'eut2' ? 'ets2' : 'ats'; state.gameVersion = (String(rec.gameName || '').match(/\d+\.\d+[\w.]*/) || [rec.gameVersion || ''])[0];
      out.push({ type: 'log', text: `Jogo aberto (${rec.gameName || state.game}, plugin ${rec.plugin || '?'}).${rec.gameplayEvents === false ? ' Atenção: esta versão do jogo não envia eventos de entrega.' : ''}` });
      status(); break;
    case 'stop':
      state.online = false; out.push({ type: 'log', text: 'Jogo fechado.' }); status(); break;
    case 'time':
      out.push({ type: 'log', text: `Dia ${gameDayOf(rec.gameTime)} no jogo.` }); status(); break;
    case 'truck': {
      const t = [rec.attrs && rec.attrs.brand, rec.attrs && rec.attrs.name].filter(Boolean).join(' ');
      if (t && t !== state.truck) { state.truck = t; status(); }
      break;
    }
    case 'job': {
      const has = rec.attrs && Object.keys(rec.attrs).length > 0;
      const before = JSON.stringify(state.job);
      state.job = has ? rec.attrs : null;
      if (has) state.jobOdometerStart = typeof rec.jobOdometerStart === 'number' ? rec.jobOdometerStart : state.jobOdometerStart;
      if (JSON.stringify(state.job) !== before) {
        const j = jobSummary(state);
        out.push({ type: 'log', text: j ? `Trabalho: ${j.cargo || 'carga'} de ${j.origin} para ${j.dest}${j.plannedMiles ? `, ${j.plannedMiles} mi` : ''}${j.income ? `, ${money(j.income)}` : ''}.` : 'Sem trabalho no momento.' });
        status();
      }
      break;
    }
    case 'event': {
      const a = rec.attrs || {}, id = String(rec.id || '');
      if (id === 'player.fined') { const v = pick(a, ['fine.amount', 'amount']) || 0; state.acc.fines += v; out.push({ type: 'log', text: `Multa: ${money(v)}${a['fine.offence'] ? ` (${a['fine.offence']})` : ''}.` }); }
      else if (id === 'player.tollgate.paid' || id === 'player.use.ferry' || id === 'player.use.train') {
        const v = pick(a, ['pay.amount', 'amount']) || 0; state.acc.tolls += v;
        out.push({ type: 'log', text: `${id === 'player.tollgate.paid' ? 'Pedágio' : id === 'player.use.ferry' ? 'Balsa' : 'Trem'}: ${money(v)}.` });
      }
      else if (id.includes('refuel')) {
        // o SDK informa litros; valor em dinheiro só se vier um atributo de pagamento
        const paid = pick(a, ['pay.amount', 'refuel.paid', 'amount.paid']), liters = pick(a, ['refuel.amount', 'amount']);
        if (paid !== null) state.acc.fuel += paid; if (liters !== null && paid === null) state.acc.fuelLiters += liters;
        out.push({ type: 'log', text: `Abastecimento${paid !== null ? ': ' + money(paid) : liters !== null ? `: ${r1(liters)} L` : ''}.` });
      }
      else if (id === 'job.cancelled') {
        out.push({ type: 'log', text: `Trabalho cancelado${pick(a, ['cancel.penalty']) ? `, multa de ${money(pick(a, ['cancel.penalty']))}` : ''}. Nada é enviado.` });
        state.job = null; state.acc = emptyAcc(); status();
      }
      else if (id === 'job.delivered') {
        const draft = buildDraft(state, rec);
        out.push({ type: 'draft', draft });
        out.push({ type: 'log', text: `Entrega: ${draft.data.origin || '?'} → ${draft.data.dest || '?'}, ${draft.data.miles} mi, frete ${money(draft.data.freight)}. Enviada para revisar no app.` });
        state.job = null; state.acc = emptyAcc(); status();
      }
      else out.push({ type: 'log', text: `Evento do jogo: ${id}.` });
      break;
    }
  }
  return out;
}

export function buildDraft(state, rec) {
  const a = rec.attrs || {}, j = state.job || {};
  const odoKm = typeof rec.odometer === 'number' && typeof (rec.jobOdometerStart ?? state.jobOdometerStart) === 'number' ? rec.odometer - (rec.jobOdometerStart ?? state.jobOdometerStart) : null;
  const km = pick(a, ['distance.km']) ?? (odoKm !== null && odoKm > 0 ? odoKm : null) ?? pick(j, ['planned_distance.km']) ?? 0;
  const freight = pick(a, ['revenue']) ?? pick(j, ['income']) ?? 0;
  const gameTime = typeof rec.gameTime === 'number' ? rec.gameTime : state.gameTime;
  const drive = r1((num(rec.driveMinutes) || 0) / 60), jobMinutes = pick(a, ['delivery.time']);
  const dest = text(j, ['destination.city', 'destination.city.id']), origin = text(j, ['source.city', 'source.city.id']);
  const damage = pick(a, ['cargo.damage']);
  return {
    event_id: `${state.game}-${gameTime ?? 'x'}-${Math.round(freight)}-${slug(dest) || 'destino'}`,
    source: 'telemetria', game: state.game,
    data: {
      vehicle: 'truck', origin, dest, cargo: text(j, ['cargo', 'cargo.id']),
      originCompany: text(j, ['source.company']), destCompany: text(j, ['destination.company']),
      miles: r1(km * KM_TO_MI), freight: r2(freight), bonus: 0,
      fuel: r2(state.acc.fuel), fuelLiters: r1(state.acc.fuelLiters), tolls: r2(state.acc.tolls), fines: r2(state.acc.fines), damage: 0,
      cargoDamagePct: damage !== null ? r1(damage * 100) : null, xp: pick(a, ['earned.xp']),
      drive, hours: drive, jobMinutes, autoPark: !!a['auto.park.used'], autoLoad: !!a['auto.load.used'],
      gameTime, gameDay: typeof gameTime === 'number' ? gameDayOf(gameTime) : null, truck: state.truck || null
    }
  };
}
