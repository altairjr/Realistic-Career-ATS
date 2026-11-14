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

// Planilha no modelo "Carreira Realista ATS": cada aba é uma lista de linhas, como o leitor de .xlsx devolve
const sheetBook = (over = {}) => Object.assign({
  Config: [['Configurações'], [], [], [], [], ['Parâmetro', 'Valor Base (USD)'], ['Alimentação - Café da Manhã', 15], ['Alimentação - Almoço', 35], ['Alimentação - Jantar', 30], ['Diária de Pernoite / Hotel', 80], ['Moradia / Custo de Vida Fixo', 450], ['Porcentagem comissão frete carro emprestado', 0.3]],
  Parametros: [['Cidades ', 'Reno'], ['Reno'], ['Carson City'], ['Elko']],
  'Motorista & Carreira': [['Ficha'], [], [],
    ['Nome Do Motorista', 'Nacionalidade', 'Capacitação (Nivel do Motorista no Jogo)', 'Saldo Bancario (USD)', 'Emprestimo Total / Parcelas (USD)', 'Emprestimo Parcelas (USD)'],
    ['Altair Junior', 'Brasileiro', 1, 8239.15, 2000, 100],
    ['Classificação do Vínculo', 'Forma de Pagamento', 'Especificações da Operação', 'Horas de Trabalho Contratual (Horas por Semanal)', 'Valor (USD)', 'Comissão'],
    ['Nivel 1: Company Driver (Empregado W-2)', 'Pagamento fixo semanal', 'Local/Dedicated', 50, 1300, 0.05],
    ['Nome da Empresa', 'Garagem Sede / Estado / País', 'Renome na Empresa', 'Bonus Por Renome', 'Caminhão Fixo (Emprestado)', 'Trailer Fixo (Emprestado)'],
    ['ADM', 'Carson City / Nevada / EUA', 2, 0.02, 'Modelo do caminhão', 'Kenworth T680']],
  'Diário de bordo': [['Diário'], [], [], ['Dia do jogo', 'Origem', 'Destino', 'Status da Entrega', 'Distância (mi)', 'Frete Bruto (USD)', 'Combustível (USD)', 'Pedágios (USD)', 'Cafés Da Manhã', 'Almoços', 'Janta', 'Diárias', 'Multas / Danos (USD)', 'Status Pagamento'],
    [16, 'Carson City', 'Truckee', 'Razoável ', 184, 4543, 0, 0, 0, 1, 0, 0, 0, 'Aberto'], ['', '', '', '', '', '', '', '', '', '', '', '', '', '']],
  'Histórioco holerite': [['Painel'], [], [], ['Previsão do pagamento  (Dia do jogo)', 'Dia do pagamento (Dia do jogo)', 'Semana trabalhada (Referência)', 'Valor Consolidado (USD)', 'Status Pagamento'], [19, '', '8 - 12', 1400, 'A pagar']],
  'Historico de fretes': [['Histórico'], [], [], ['Dia do jogo', 'Origem', 'Destino', 'Status da Entrega', 'Distância (mi)', 'Frete Bruto (USD)', 'Combustível (USD)', 'Pedágios (USD)', 'Cafés Da Manhã', 'Almoços', 'Janta', 'Diárias', 'Multas / Danos (USD)'],
    [2, 'Carson City', 'Reno', 'Excelente', 72, 2125, 0, 0, 0, 1, 0, 0, 0], ['Final de semana'], [], [9, 'Carson City', 'Reno', 'Bom trabalho', 68, 2804, 0, 0, 1, 1, 0, 0, 50], ['Final de semana']],
  'Diário de bordo carro': [['Carro'], [], [], ['ID Viagem', 'Dia do jogo', 'Origem', 'Destino', 'Tipo do trabalho', 'Status da Entrega', 'Distância (mi)', 'Frete Bruto (USD)', 'Bonus (USD)', 'Combustível (USD)', 'Pedágios (USD)', 'Cafés Da Manhã', 'Almoços', 'Janta', 'Diárias', 'Multas / Danos (USD)'],
    [1, 10, 'Reno', 'Tonopah', 'Carro Emprestado', 'Excelente', 275, 1026, 353, 0, 0, 0, 1, 0, 0, 0], [2, 17, 'Reno', 'Elko', 'Carro próprio', 'Excelente', 100, 500, -1, 20, 0, 0, 0, 0, 0, 0]]
}, over);

test('planilha no modelo: lê motorista, contrato, custos, cidades e as três tabelas de viagens', () => {
  const { js, ctx } = load(); ctx.book = sheetBook();
  const r = plain(js(`parseCareerSheet(book)`));
  assert.deepEqual(r.errors, []);
  const D = r.data;
  assert.equal(D.profile.name, 'Altair Junior'); assert.equal(D.balance, 8239.15); assert.equal(D.gameDay, 17, 'dia atual = dia da última viagem');
  assert.equal(D.clsKey, 'w2'); assert.equal(D.payMode, 'weekly'); assert.equal(D.baseV, 1300); assert.equal(D.commV, 5, 'comissão em fração vira pontos percentuais');
  assert.equal(D.operation, 'Local (Day Cab)');
  assert.deepEqual(D.extras.costs, { breakfast: 15, lunch: 35, dinner: 30, hotel: 80, housing: 450 });
  assert.equal(D.extras.borrowedPct, 30); assert.deepEqual(D.extras.cities, ['Reno', 'Carson City', 'Elko']);
  assert.equal(D.extras.truck, '', 'o texto de exemplo do modelo não vira nome de caminhão'); assert.equal(D.extras.trailer, 'Kenworth T680');
  assert.equal(D.trips.length, 5, '"Final de semana" e linhas vazias não viram viagens');
  assert.equal(D.trips.find(t => t.day === 16).status, 'Razoável');
  assert.deepEqual(D.trips.filter(t => t.type === 'borrowed').map(t => [t.carMode, t.bonus]), [['borrowed', 353], ['owned', -1]]);
});

test('planilha no modelo: erros apontam aba, linha e coluna e nada é montado', () => {
  const { js, ctx } = load();
  const b = sheetBook(); b['Motorista & Carreira'][6][0] = 'Motorista legal'; b['Motorista & Carreira'][4][3] = '';
  b['Diário de bordo'][4] = [16, 'Carson City', '', 'Ótimo', 'abc', 4543];
  ctx.book = b;
  const r = plain(js(`parseCareerSheet(book)`));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Classificação do Vínculo') && e.includes('A7')));
  assert.ok(r.errors.some(e => e.includes('Saldo Bancario') && e.includes('obrigatório')));
  assert.ok(r.errors.some(e => e.includes('Diário de bordo › linha 5') && e.includes('não é um número')));
  assert.ok(r.errors.some(e => e.includes('linha 5') && e.includes('Status da Entrega')));
  ctx.book = { Planilha1: [] };
  assert.ok(plain(js(`parseCareerSheet(book)`)).errors[0].includes('Faltam as abas'));
});

test('planilha no modelo: saldo final igual ao informado, semanas no histórico e holerite conforme a aba', () => {
  const { js, ctx } = load(); ctx.book = sheetBook();
  const r = plain(js(`(() => { const p = parseCareerSheet(book); const b = buildFromSheet(p.data); const st = b.state, ct = st.contracts[0];
    return { bal: balance(st), hist: b.history.map(w => w.start), open: st.week.trips.length, housing: st.settings.costs.housing.val, pct: st.settings.borrowed.pct, loan: [st.bank.loanTotal, st.settings.loan.on, st.settings.loan.installment],
      renome: [ct.renomeLevel, ct.terms.renome.perLevel], pay: st.payroll.map(x => [x.weekStart, x.status]), cities: st.settings.cities.includes('Elko') }; })()`));
  assert.deepEqual(r, { bal: 8239.15, hist: [1, 8], open: 2, housing: 450, pct: 30, loan: [2000, true, 100], renome: [2, 1], pay: [[1, 'paid'], [8, 'pending']], cities: true });
});

test('exportar planilha: mesmo modelo, dados nas mesmas células, e a planilha exportada volta igual', async t => {
  const { js, ctx } = load();
  try { new DecompressionStream('deflate-raw'); } catch (e) { return t.skip('este Node não descompacta zip (deflate-raw); use Node 20.12 ou mais novo'); }
  Object.assign(ctx, { atob, DecompressionStream, Response, Blob, Uint8Array, book: sheetBook() });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'app', '61-sheet-model.js'), 'utf8'), ctx);
  const out = await js(`(async () => { const b = buildFromSheet(parseCareerSheet(book).data); S = b.state; H = b.history;
    const bytes = await buildSheetFile(S, H), f = await XL.open(bytes.buffer), x = n => f.files.get(f.sheets[n]);
    const cell = (n, ref) => { const m = x(n).match(new RegExp('<c r="' + ref + '"[^>]*?(?:/>|>([^]*?)</c>)')); return m ? (m[1] || '').replace(/<[^>]+>/g, '') : undefined; };
    return { names: Object.keys(f.sheets), name: cell('Motorista & Carreira', 'A5'), bal: cell('Motorista & Carreira', 'D5'), cls: cell('Motorista & Carreira', 'A7'), comm: cell('Motorista & Carreira', 'F7'),
      housing: cell('Config', 'B11'), b1: cell('Config', 'B1'), city3: cell('Parametros', 'A4'), open: [cell('Diário de bordo', 'A5'), cell('Diário de bordo', 'D5'), cell('Diário de bordo', 'N5')],
      hist: [cell('Historico de fretes', 'A5'), cell('Historico de fretes', 'A6'), cell('Historico de fretes', 'A8')], merges: (x('Historico de fretes').match(/<mergeCell ref="[^"]+"/g) || []).length,
      car: [cell('Diário de bordo carro', 'E5'), cell('Diário de bordo carro', 'E6')], carF: cell('Dashboard carro', 'L6'), dv: /sqref="D5:D1003"/.test(x('Diário de bordo')), pay: cell('Histórioco holerite', 'E6'), lag: +cell('Dashboard & DRE', 'B21') > 0,
      secret: [...f.files.values()].some(v => /Subabase/i.test(v)) }; })()`);
  const r = plain(out);
  assert.deepEqual(r.names, ['Config', 'Parametros', 'Motorista & Carreira', 'Diário de bordo', 'Dashboard & DRE', 'Histórioco holerite', 'Historico de fretes', 'Diário de bordo carro', 'Dashboard carro']);
  assert.equal(r.name, 'Altair Junior'); assert.equal(r.bal, '8239.15'); assert.equal(r.cls, 'Nivel 1: Company Driver (Empregado W-2)');
  assert.equal(r.comm, '5% + INT((C5 - 1) / 2) * 1%', 'comissão igual à da fórmula do modelo mantém a fórmula');
  assert.equal(r.housing, '450'); assert.equal(r.b1, ''); assert.equal(r.city3, 'Elko');
  assert.deepEqual(r.open, ['16', 'Razoável ', 'Aberto']);
  assert.deepEqual(r.hist, ['2', 'Final de semana', '9']); assert.equal(r.merges, 2);
  assert.deepEqual(r.car, ['Carro Emprestado', 'Carro próprio']);
  assert.ok(r.carF.includes('Config!$B$12') && r.carF.includes('K6')); assert.ok(r.dv); assert.equal(r.pay, 'A pagar'); assert.ok(r.lag);
  assert.equal(r.secret, false);
});
