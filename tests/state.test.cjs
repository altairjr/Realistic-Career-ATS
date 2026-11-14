// Testes do estado do app (carreira, contas, empréstimo, infrações, importação).
// Carrega o motor e os módulos sem interface num contexto isolado. Rodar: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function load() {
  const ctx = vm.createContext({ console, Math, Date, JSON, TextDecoder, TextEncoder });
  const run = f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  ['engine.js', 'app/00-core.js', 'app/20-state.js', 'app/22-ledger.js', 'app/60-xlsx.js', 'app/62-sheet-io.js'].forEach(run);
  return { ctx, js: code => vm.runInContext(code, ctx) };
}
const plain = o => JSON.parse(JSON.stringify(o));

test('nova carreira W-2: uma empresa, um contrato e ajustes sem condições de contrato', () => {
  const { js } = load();
  const st = plain(js(`newCareer({ name: 'Altair', company: 'ADM', clsKey: 'w2', opening: 3000 })`));
  assert.equal(st.v, 3);
  assert.equal(st.companies.length, 1);
  assert.equal(st.contracts[0].classification, 'Nível 1: Company Driver (Empregado W-2)');
  assert.equal(st.contracts[0].terms.expenses.fuel, 'company');
  for (const k of ['contract', 'expenses', 'benefits', 'perDiem', 'opCosts', 'safety', 'renome']) assert.equal(st.settings[k], undefined);
});

test('owner-operator: paga as despesas, recebe percentual e é 1099', () => {
  const { js } = load();
  const r = plain(js(`(() => { const st = newCareer({ clsKey: 'owner' }); const e = effSettings(st); return { tax: e.taxes.type, fuel: e.expenses.fuel, mode: e.contract.mode, pct: e.contract.percent.commission, op: e.opCosts.on }; })()`));
  assert.deepEqual(r, { tax: '1099', fuel: 'driver', mode: 'percent', pct: 75, op: true });
});

test('dados antigos: nomes de operação e campos obsoletos são atualizados', () => {
  const { js } = load();
  const st = plain(js(`(() => { const st = newCareer({}); st.v = 2; st.contracts[0].operation = 'Local/Dedicated'; st.settings.lists.operation = ['Local/Dedicated', 'OTR / Longa Distância (Sleeper Cab)']; st.settings._v6 = true; st.settings.payroll.deposit = 'net'; st.contracts[0].terms.ruleset = 'sheet'; return normalize(st); })()`));
  assert.equal(st.contracts[0].operation, 'Local (Day Cab)');
  assert.ok(st.settings.lists.operation.includes('OTR / Long Haul (Sleeper Cab)'));
  assert.ok(!st.settings.lists.operation.includes('Local/Dedicated'));
  assert.equal(st.settings._v6, undefined);
  assert.equal(st.settings.payroll.deposit, undefined);
  assert.equal(st.contracts[0].terms.ruleset, undefined);
});

test('contas fixas: moradia sai toda segunda, mesmo sem viagens', () => {
  const { js } = load();
  const r = plain(js(`(() => { const st = newCareer({ opening: 3000 }); st.gameDay = 15; runBills(st); return { days: st.ledger.map(e => e.day), bal: balance(st) }; })()`));
  assert.deepEqual(r.days, [1, 8, 15]);
  assert.equal(r.bal, 1500);
});

test('empréstimo: parcela mensal paga os juros e abate a dívida', () => {
  const { js } = load();
  const r = plain(js(`(() => { const st = newCareer({ opening: 5000 }); st.settings.bills.on = false; st.settings.loan = { on: true, installment: 450, freq: 'monthly', rate: 1 }; st.bank.loanTotal = 10000; st.career.loanNext = 31; st.gameDay = 31; runBills(st); return { total: st.bank.loanTotal, next: st.career.loanNext, paid: st.ledger[0].amount }; })()`));
  assert.deepEqual(r, { total: 9650, next: 61, paid: -450 });
});

test('compactação: lançamentos antigos viram saldo acumulado sem mudar o saldo', () => {
  const { js } = load();
  const r = plain(js(`(() => { const st = newCareer({ opening: 1000 }); st.settings.bills.on = false;
    st.ledger.push({ id: 'a', day: 2, amount: 300, locked: true }, { id: 'b', day: 150, amount: -50, locked: true });
    st.payroll.push({ id: 'p', status: 'paid', paidDay: 5, amount: 300 });
    st.gameDay = 200; const before = balance(st); compact(st);
    return { before, after: balance(st), ledger: st.ledger.length, archived: st.bank.archived, payroll: st.payroll.length }; })()`));
  assert.equal(r.before, r.after);
  assert.deepEqual([r.ledger, r.archived, r.payroll], [1, 300, 0]);
});

test('infrações da semana: jornada acima de 14h e pausa exigida fora do raio local', () => {
  const { js } = load();
  const codes = plain(js(`(() => { S = newCareer({}); H = [];
    const eff = SS(), mk = (o) => Object.assign({ id: uid(), type: 'company', day: 1 }, E.snapshotFor('company', eff), { rules: E.rulesSnapshot(eff) }, o);
    S.week.trips = [mk({ miles: 184, drive: 4.3, hours: 9 }), mk({ miles: 185, drive: 4.3, hours: 9 })];
    return weekViolations().map(v => v.code); })()`));
  assert.deepEqual(codes.sort(), ['break30', 'duty14']);
});

test('planilha: erros apontam aba, linha e coluna e nada é montado', () => {
  const { js } = load();
  const r = plain(js(`parseCareerSheet({
    Motorista: [['Campo', 'Valor'], ['Saldo bancário atual (USD)', '8.239,15'], ['Dia atual do jogo', 17]],
    Empresa: [['Campo', 'Valor'], ['Nome da empresa', 'ADM'], ['Classificação', 'Motorista legal']],
    Viagens: [['Dia', 'Veículo', 'Destino', 'Distância (mi)', 'Frete (USD)'], [20, 'Moto', '', 10, 'abc']] })`));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Classificação')));
  assert.ok(r.errors.some(e => e.includes('linha 2') && e.includes('Veículo')));
  assert.ok(r.errors.some(e => e.includes('não é um número')));
});

test('planilha válida: saldo final igual ao informado e semanas antigas no histórico', () => {
  const { js } = load();
  const r = plain(js(`(() => { const p = parseCareerSheet({
    Motorista: [['Campo', 'Valor'], ['Nome do motorista', 'Altair'], ['Saldo bancário atual (USD)', 8239.15], ['Dia atual do jogo', 17]],
    Empresa: [['Campo', 'Valor'], ['Nome da empresa', 'ADM'], ['Classificação', 'W-2'], ['Operação', 'Local']],
    Viagens: [['Dia', 'Veículo', 'Origem', 'Destino', 'Distância (mi)', 'Frete (USD)'], [2, 'Caminhão', 'Carson City', 'Reno', 72, 2125], [9, 'Carro emprestado', 'Reno', 'Tonopah', 275, 1026], [16, 'Caminhão', 'Carson City', 'Truckee', 184, 4543]] });
    const b = buildFromSheet(p.data);
    return { ok: p.ok, bal: balance(b.state), hist: b.history.length, open: b.state.week.trips.length, op: b.state.contracts[0].operation }; })()`));
  assert.deepEqual(r, { ok: true, bal: 8239.15, hist: 2, open: 1, op: 'Local (Day Cab)' });
});
