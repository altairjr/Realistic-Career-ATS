// Testes do motor de cálculo. Rodar: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

const s = () => E.defaults();
const truck = (st, o) => Object.assign({ type: 'company', day: 15, miles: 0, freight: 0, bonus: 0, breakfast: 0, lunch: 0, dinner: 0, hotel: 0 }, E.snapshotFor('company', st), { rules: E.rulesSnapshot(st) }, o);
const car = (st, mode, o) => Object.assign({ type: 'borrowed', miles: 0, freight: 0, bonus: 0 }, { car: E.carSnapshot(st, mode) }, o);

test('frete de mercado do caminhão = frete do jogo × 0,10', () => {
  const st = s();
  assert.equal(E.marketFreight(truck(st, { freight: 4543 }), st), 454.3);
});

test('fixo semanal: $1.300 + 5% do frete de mercado', () => {
  const st = s();
  const d = E.dre([truck(st, { freight: 4543, miles: 184 })], st);
  assert.equal(d.base, 1300);
  assert.equal(d.commission, 22.72);
});

test('por hora respeita o limite diário de 10h', () => {
  const st = s(); st.contract.mode = 'hourly';
  const d = E.dre([truck(st, { day: 1, hours: 8 }), truck(st, { day: 1, hours: 4 })], st);
  assert.equal(d.hoursPaid, 10);
  assert.equal(d.base, 260);
});

test('CPM com detention após 2h livres e stop pay', () => {
  const st = s(); st.contract.mode = 'cpm';
  const p = E.tripPay(truck(st, { miles: 100, detention: 5, stops: 2 }), st);
  assert.equal(p.base, 55); assert.equal(p.detention, 60); assert.equal(p.stops, 100);
});

test('W-2: empresa paga combustível; franquia de dano limitada a $1.000', () => {
  const st = s();
  const c = E.tripCosts(truck(st, { fuel: 200, damage: 2500 }), st);
  assert.equal(c.fuel, 0); assert.equal(c.damage, 1000);
});

test('imposto federal 2026 (solteiro, $67.600/ano) = $6.042', () => {
  assert.equal(Math.round(E.annualTax(67600, 'single')), 6042);
});

test('carro emprestado: 35% de (frete × 0,40) + bônus × 0,40, sem custos do veículo', () => {
  const st = s();
  const b = E.carBreakdown(car(st, 'borrowed', { freight: 1026, miles: 275, bonus: 100, fuel: 50 }), st);
  assert.equal(b.share, 143.64); assert.equal(b.bonus, 40); assert.equal(b.fuel, 0); assert.equal(b.total, 183.64);
});

test('carro próprio: 100% do frete − $0,50/mi − combustível', () => {
  const st = s();
  const b = E.carBreakdown(car(st, 'owned', { freight: 1026, miles: 275, fuel: 55 }), st);
  assert.equal(b.total, 217.9);
});

test('pay lag: semana do dia 8 é paga na sexta seguinte (dia 19)', () => {
  assert.equal(E.paydayFor(8, s()), 19);
});

test('jornada: alerta acima de 11h de direção', () => {
  const st = s();
  const r = E.hos([truck(st, { day: 3, drive: 12, hours: 13, miles: 50 })], st, { days: [3], gameDay: 3 });
  assert.ok(r.rows[0].alerts.some(a => a.code === 'drive11' && a.level === 'bad'));
});

test('jornada local: fora do raio é aviso e passa a exigir a pausa de 30 min', () => {
  const st = s();
  const r = E.hos([truck(st, { day: 1, drive: 8.6, hours: 12, miles: 185 })], st, { local: true, days: [1], gameDay: 1 });
  const codes = r.rows[0].alerts.map(a => a.code + ':' + a.level);
  assert.ok(codes.includes('radius:warn'));
  assert.ok(codes.includes('break30:bad'));
});

test('jornada local dentro do raio: sem pausa obrigatória', () => {
  const st = s();
  const r = E.hos([truck(st, { day: 1, drive: 9, hours: 12, miles: 80 })], st, { local: true, days: [1], gameDay: 1 });
  assert.equal(r.rows[0].alerts.length, 0);
});
