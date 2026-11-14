/* ===== Motor de cálculo — Carreira Realista ATS =====
   Regras realistas (EUA 2026), com módulos que podem ser ligados/desligados. Cada viagem guarda as regras do
   momento em que foi lançada (contrato, carro, despesas e frete).
   Funções puras, sem DOM. */
const Engine = (() => {
  const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const WEEKDAYS_FULL = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const STATUSES = ['Excelente', 'Bom', 'Regular', 'Ruim', 'Atrasada'];
  const n = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
  const r2 = v => Math.round((n(v) + Number.EPSILON) * 100) / 100;
  const sum = (arr, f) => arr.reduce((a, t) => a + (typeof f === 'function' ? f(t) : n(t[f])), 0);
  const clone = o => JSON.parse(JSON.stringify(o));
  // As cinco classificações de vínculo (fixas: as predefinições dependem delas)
  const CLASSIFICATIONS = [
    'Nível 1: Company Driver (Empregado W-2)',
    'Nível 2: Lease Operator (Arrendatário)',
    'Nível 3: Owner-Operator (1099)',
    'Nível 4: Owner-Operator com Autoridade Própria (MC/DOT)',
    'Nível 5: Dono de Frota (Fleet Owner)'
  ];
  // Tipos de operação usados no mercado americano
  const OPERATIONS = ['Local (Day Cab)', 'Regional', 'Dedicated (cliente fixo)', 'OTR / Long Haul (Sleeper Cab)'];

  // Imposto de renda federal 2026 (IRS / Tax Foundation)
  const TAX2026 = {
    single:  { std: 16100, br: [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [Infinity, .37]] },
    married: { std: 32200, br: [[24800, .10], [100800, .12], [211400, .22], [403550, .24], [512450, .32], [768700, .35], [Infinity, .37]] }
  };

  function defaults() {
    return {
      day1Weekday: 0,
      costs: {
        breakfast: { on: true, val: 15 },
        lunch:     { on: true, val: 35 },
        dinner:    { on: true, val: 30 },
        hotel:     { on: true, val: 80 },
        housing:   { on: true, val: 500 },
        mealsMode: 'trip',                                   // trip = por viagem (planilha) | day = por dia trabalhado
        auto: { breakfast: false, lunch: true, dinner: false } // refeições automáticas por dia trabalhado
      },
      tripBonus: true,                                       // somar bônus das viagens de caminhão
      // Quem paga cada despesa da viagem de caminhão: 'driver' | 'company'
      expenses: { fuel: 'company', tolls: 'company', hotel: 'company', fines: 'driver', damage: 'deductible', deductible: 1000 },
      // Converte o frete inflado do jogo em frete de mercado antes da comissão
      market: { on: true, mode: 'factor', factor: 0.10, rpm: 2.5 },
      contract: {
        mode: 'weekly',
        hours: 50,
        tripBonus: true,
        weekly:  { value: 1300, commissionOn: true, commission: 5 },
        hourly:  { rate: 26, dailyCapOn: true, dailyCap: 10, weeklyCapOn: true, commissionOn: true, commission: 5, overtimeOn: false, otAfter: 40, otMult: 1.5 },
        cpm:     { rate: 0.55, detentionOn: true, detentionRate: 20, detentionFree: 2, stopOn: true, stopRate: 50, commissionOn: false, commission: 5 },
        percent: { commission: 25 },
        minimum: { on: false, value: 1100 },
        extras:  { layoverOn: true, layoverRate: 150, breakdownOn: true, breakdownRate: 20, tarpOn: false, tarpRate: 75 }
      },
      taxes: { on: true, type: 'w2', filing: 'single', federal: 'table', flatPct: 12, ficaPct: 7.65, sePct: 15.3, statePct: 0, qbi: true },
      benefits: { healthOn: true, health: 45, k401On: false, k401Pct: 4 },
      perDiem: { on: false, rate: 80 },
      opCosts: { on: false, maintenance: 0.404, tires: 0.05, insurance: 0.10, truckWeekly: 650, otherWeekly: 50 },
      hos: { on: true, cycle: '70/8', shortHaul: true, radius: 150, restart: true, penalties: true, resetSafety: true, inspectChance: 25, fine: 1000 },
      safety: { on: true, weeks: 13, amount: 300 },
      renome: { on: false, pct: 0 },
      borrowed: {
        on: true, settle: 'immediate', bonusOn: true,
        factor: 0.40,          // frete de mercado do carro = frete do jogo × fator
        bonusFactor: true,     // aplicar o mesmo fator ao bônus da viagem de carro
        pct: 35,               // emprestado: % do frete de mercado, sem custos do veículo
        personal: true,        // emprestado: refeições, hotel e multas continuam com o motorista
        ownOn: true,           // permitir carro próprio
        costPerMile: 0.50      // próprio: manutenção, pneus, seguro e depreciação por milha
      },
      payroll: { lagOn: true, lagWeeks: 1, paydayWeekday: 4, autoPay: true },
      loan: { on: false, installment: 0, freq: 'monthly', rate: 0 },   // parcela semanal ou mensal (30 dias), juros ao mês
      bills: { on: true, weekday: 0 },                                  // contas fixas cobradas pelo calendário, mesmo sem salário
      cities: ['Reno', 'Truckee', 'Carson City', 'Tonopah'],
      lists: { operation: OPERATIONS.slice() }
    };
  }

  function mergeDefaults(saved) {
    const walk = (base, over) => {
      if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
      const out = Array.isArray(base) ? [] : { ...base };
      for (const k of Object.keys(over)) {
        out[k] = (base && typeof base[k] === 'object' && !Array.isArray(base[k])) ? walk(base[k], over[k]) : over[k];
      }
      return out;
    };
    return walk(defaults(), saved || {});
  }

  /* ---------- Predefinições ---------- */
  const PRESETS = {
    w2:        'Company Driver (W-2)',
    lease:     'Lease Operator',
    owner:     'Owner-Operator (1099)',
    authority: 'Owner-Operator com autoridade própria',
    fleet:     'Dono de frota'
  };
  function presetKeyFor(classification) {
    const c = String(classification || '').toLowerCase();
    if (c.includes('frota') || c.includes('fleet')) return 'fleet';
    if (c.includes('autoridade') || c.includes('mc/dot')) return 'authority';
    if (c.includes('lease') || c.includes('arrend')) return 'lease';
    if (c.includes('owner') || c.includes('1099')) return 'owner';
    return 'w2';
  }
  // Aplica as condições típicas do vínculo a um conjunto de condições de contrato
  // (contract, expenses, benefits, perDiem, opCosts, safety). O tipo fiscal sai da classificação.
  function applyPreset(s, key, { otr = false } = {}) {
    const all = v => ({ fuel: v, tolls: v, hotel: v, fines: 'driver', damage: v === 'driver' ? 'driver' : 'deductible', deductible: s.expenses.deductible || 1000 });
    s.safety.on = key !== 'authority' && key !== 'fleet';
    s.benefits.healthOn = true;
    s.perDiem.on = !!otr;
    if (key === 'w2') { s.expenses = all('company'); s.opCosts.on = false; return s; }
    // Lease / owner-operator / autoridade / frota: paga tudo, recebe % do frete
    s.expenses = all('driver'); s.opCosts.on = true; s.contract.mode = 'percent';
    const P = { lease: [70, 650, 0.08, 60], owner: [75, 600, 0.10, 80], authority: [100, 600, 0.16, 180], fleet: [100, 600, 0.16, 250] }[key];
    if (P) { s.contract.percent.commission = P[0]; s.opCosts.truckWeekly = P[1]; s.opCosts.insurance = P[2]; s.opCosts.otherWeekly = P[3]; }
    return s;
  }
  const taxTypeFor = classification => presetKeyFor(classification) === 'w2' ? 'w2' : '1099';

  /* ---------- Calendário ---------- */
  const weekdayIdx = (day, s) => (((day - 1 + n(s.day1Weekday)) % 7) + 7) % 7;
  const weekStartOf = (day, s) => day - weekdayIdx(day, s);
  const dayLabel = (day, s) => WEEKDAYS[weekdayIdx(day, s)];
  const paydayFor = (weekStart, s) => weekStartOf(weekStart, s) + 7 * n(s.payroll.lagWeeks) + n(s.payroll.paydayWeekday);

  /* ---------- Regras gravadas na viagem ---------- */
  const _cache = new WeakMap();
  function contractOf(t, s) {
    if (!t || !t.contract) return s.contract;
    if (!_cache.has(t.contract)) _cache.set(t.contract, mergeDefaults({ contract: t.contract }).contract);
    return _cache.get(t.contract);
  }
  // Regra do carro gravada na viagem; sem regra gravada, usa a atual (emprestado)
  const carRuleOf = (t, s) => (t && t.car && t.car.mode) ? t.car : carSnapshot(s, 'borrowed');
  function carSnapshot(s, mode = 'borrowed') {
    const b = s.borrowed;
    return { mode, pct: n(b.pct), bonusOn: b.bonusOn !== false, factor: n(b.factor), bonusFactor: b.bonusFactor !== false, personal: b.personal !== false, costPerMile: n(b.costPerMile) };
  }
  const snapshotFor = (type, s, carMode) => type === 'borrowed' ? { car: carSnapshot(s, carMode) } : { contract: clone(s.contract) };
  const rulesSnapshot = s => ({ exp: clone(s.expenses), market: clone(s.market) });

  // Frete de mercado do caminhão (o carro usa o próprio fator em carBreakdown)
  function marketFreight(t, s) {
    const m = (t.rules && t.rules.market) || (s && s.market);
    if (!m || !m.on || t.type === 'borrowed') return n(t.freight);
    return m.mode === 'rpm' ? n(t.miles) * n(m.rpm) : n(t.freight) * n(m.factor);
  }

  // Despesas que saem do bolso do motorista nesta viagem
  function tripCosts(t, s) {
    const c = s.costs, car = t.type === 'borrowed', R = (t.rules && t.rules.exp) || s.expenses;
    const pays = k => car || R[k] === 'driver';
    const meals = car || c.mealsMode !== 'day';
    let damage = 0;
    if (car) damage = n(t.damage);
    else damage = R.damage === 'driver' ? n(t.damage) : R.damage === 'deductible' ? Math.min(n(t.damage), n(R.deductible)) : 0;
    const o = {
      fuel:      pays('fuel')  ? n(t.fuel)  : 0,
      tolls:     pays('tolls') ? n(t.tolls) : 0,
      breakfast: meals && c.breakfast.on ? n(t.breakfast) * n(c.breakfast.val) : 0,
      lunch:     meals && c.lunch.on     ? n(t.lunch)     * n(c.lunch.val)     : 0,
      dinner:    meals && c.dinner.on    ? n(t.dinner)    * n(c.dinner.val)    : 0,
      hotel:     (c.hotel.on && (car || R.hotel === 'driver')) ? n(t.hotel) * n(c.hotel.val) : 0,
      fines:     pays('fines') ? n(t.fines) : 0,
      damage
    };
    for (const k in o) o[k] = r2(o[k]);
    o.total = r2(sum(Object.values(o), x => x));
    return o;
  }

  // Resultado da viagem de carro, com o detalhamento
  function carBreakdown(t, s) {
    const B = carRuleOf(t, s), c = tripCosts(t, s);
    const o = { mode: B.mode, market: n(t.freight) * n(B.factor), share: 0, bonus: 0, vehicle: 0, fuel: 0, tolls: 0, damage: 0, fines: 0, personal: 0, total: 0 };
    o.bonus = B.bonusOn !== false ? n(t.bonus) * (B.bonusFactor !== false ? n(B.factor) : 1) : 0;
    if (B.mode === 'owned') {                        // dono: 100% do frete, paga tudo
      o.share = o.market; o.vehicle = n(t.miles) * n(B.costPerMile);
      o.fuel = n(t.fuel); o.tolls = n(t.tolls); o.damage = n(t.damage); o.fines = n(t.fines); o.personal = c.breakfast + c.lunch + c.dinner + c.hotel;
    } else {                                         // emprestado: % do frete, o dono paga o veículo
      o.share = o.market * n(B.pct) / 100;
      if (B.personal !== false) { o.fines = n(t.fines); o.personal = c.breakfast + c.lunch + c.dinner + c.hotel; }
    }
    for (const k in o) if (typeof o[k] === 'number') o[k] = r2(o[k]);
    o.total = r2(o.share + o.bonus - o.vehicle - o.fuel - o.tolls - o.damage - o.fines - o.personal);
    return o;
  }
  const borrowedValue = (t, s) => carBreakdown(t, s).total;

  function commissionRule(k) {
    const M = k[k.mode] || {};
    if (k.mode === 'percent') return { on: true, pct: n(M.commission) };
    return { on: !!M.commissionOn, pct: n(M.commission) };
  }
  const detentionPay = (t, M) => M.detentionOn ? Math.max(0, n(t.detention) - n(M.detentionFree)) * n(M.detentionRate) : 0;
  const stopPay = (t, M) => M.stopOn ? n(t.stops) * n(M.stopRate) : 0;

  // Ganho de uma viagem de caminhão pelo contrato gravado nela
  function tripPay(t, s) {
    const k = contractOf(t, s), M = k[k.mode] || {}, X = k.extras || {}, c = commissionRule(k);
    const p = { mode: k.mode, base: 0, detention: 0, stops: 0, layover: 0, breakdown: 0, tarp: 0, commission: 0, bonus: 0, market: r2(marketFreight(t, s)) };
    if (k.mode === 'hourly') p.base = (M.dailyCapOn ? Math.min(n(t.hours), n(M.dailyCap)) : n(t.hours)) * n(M.rate);
    if (k.mode === 'cpm') { p.base = n(t.miles) * n(M.rate); p.detention = detentionPay(t, M); p.stops = stopPay(t, M); }
    if (X.layoverOn) p.layover = n(t.layover) * n(X.layoverRate);
    if (X.breakdownOn) p.breakdown = n(t.breakdown) * n(X.breakdownRate);
    if (X.tarpOn && t.tarp) p.tarp = n(X.tarpRate);
    p.commission = c.on ? p.market * c.pct / 100 : 0;
    p.bonus = k.tripBonus ? n(t.bonus) : 0;
    for (const key of ['base', 'detention', 'stops', 'layover', 'breakdown', 'tarp', 'commission', 'bonus']) p[key] = r2(p[key]);
    p.total = r2(p.base + p.detention + p.stops + p.layover + p.breakdown + p.tarp + p.commission + p.bonus);
    return p;
  }

  // income: renda anual antes da dedução padrão. qbi: renda qualificada do negócio (1099);
  // a dedução é 20% do menor entre a QBI e a renda tributável (Section 199A, permanente desde 2025).
  function annualTax(income, filing, { qbi = 0 } = {}) {
    const T = TAX2026[filing] || TAX2026.single;
    let taxable = Math.max(0, income - T.std);
    if (qbi > 0) taxable -= 0.2 * Math.min(qbi, taxable);
    let tax = 0, prev = 0;
    for (const [cap, rate] of T.br) { if (taxable <= prev) break; tax += (Math.min(taxable, cap) - prev) * rate; prev = cap; }
    return tax;
  }

  /* ---------- DRE semanal ---------- */
  function dre(trips, s, extra = {}) {
    const co = trips.filter(t => t.type !== 'borrowed');
    const bo = trips.filter(t => t.type === 'borrowed');
    const freight = r2(sum(co, 'freight'));
    const marketTotal = r2(sum(co, t => marketFreight(t, s)));
    const miles = r2(sum(co, 'miles'));
    const groups = { weekly: [], hourly: [], cpm: [], percent: [] };
    for (const t of co) { const k = contractOf(t, s); (groups[k.mode] || groups.percent).push({ t, k }); }
    const allDays = new Set(co.map(t => t.day));
    const baseLines = [];
    let hoursWorked = 0, hoursPaid = 0, overtime = 0;
    if (groups.weekly.length) {
      const k = groups.weekly[groups.weekly.length - 1].k;
      const days = new Set(groups.weekly.map(g => g.t.day));
      const share = allDays.size ? days.size / allDays.size : 1;
      baseLines.push({ mode: 'weekly', rate: n(k.weekly.value), share, days: days.size, totalDays: allDays.size, value: r2(n(k.weekly.value) * share) });
    } else if (!co.length && s.contract.mode === 'weekly') {
      baseLines.push({ mode: 'weekly', rate: n(s.contract.weekly.value), share: 1, days: 0, totalDays: 0, value: r2(n(s.contract.weekly.value)) });
    }
    if (groups.hourly.length) {
      const k = groups.hourly[groups.hourly.length - 1].k, M = k.hourly;
      const perDay = {};
      for (const g of groups.hourly) perDay[g.t.day] = (perDay[g.t.day] || 0) + n(g.t.hours);
      hoursWorked = r2(sum(groups.hourly, g => n(g.t.hours)));
      hoursPaid = Object.values(perDay).reduce((a, h) => a + (M.dailyCapOn ? Math.min(h, n(M.dailyCap)) : h), 0);
      if (M.weeklyCapOn) hoursPaid = Math.min(hoursPaid, n(k.hours));
      hoursPaid = r2(hoursPaid);
      if (M.overtimeOn) overtime = r2(Math.max(0, hoursPaid - n(M.otAfter)) * n(M.rate) * (n(M.otMult) - 1));
      baseLines.push({ mode: 'hourly', rate: n(M.rate), hoursWorked, hoursPaid, value: r2(hoursPaid * n(M.rate)), otAfter: M.overtimeOn ? n(M.otAfter) : null, otMult: n(M.otMult) });
    }
    if (groups.cpm.length) {
      const rates = [...new Set(groups.cpm.map(g => n(g.k.cpm.rate)))];
      const f = groups.cpm[0].k.cpm;
      baseLines.push({ mode: 'cpm', rate: rates.length === 1 ? rates[0] : null, miles: r2(sum(groups.cpm, g => n(g.t.miles))),
        value: r2(sum(groups.cpm, g => n(g.t.miles) * n(g.k.cpm.rate))), detentionRate: n(f.detentionRate), detentionFree: n(f.detentionFree), stopRate: n(f.stopRate) });
    }
    const base = r2(sum(baseLines, l => l.value));
    const pays = co.map(t => tripPay(t, s));
    const pick = k => r2(sum(pays, p => p[k]));
    const detention = pick('detention'), stops = pick('stops'), layover = pick('layover'), breakdown = pick('breakdown'), tarp = pick('tarp');
    const commission = pick('commission'), tripBonus = pick('bonus');
    const pcts = new Set(co.map(t => commissionRule(contractOf(t, s))).filter(c => c.on).map(c => c.pct));
    const modes = [...new Set(co.map(t => contractOf(t, s).mode))];

    const truckPay = r2(base + overtime + detention + stops + layover + breakdown + tarp + commission + tripBonus);
    const lastK = co.length ? contractOf(co[co.length - 1], s) : s.contract;
    const minimum = (co.length && lastK.minimum && lastK.minimum.on && truckPay < n(lastK.minimum.value)) ? r2(n(lastK.minimum.value) - truckPay) : 0;
    const renome = r2(s.renome.on ? (base + commission) * n(s.renome.pct) / 100 : 0);
    const safety = r2(extra.safety || 0);
    const borrowedTotal = r2(sum(bo, t => borrowedValue(t, s)));
    const borrowed = (s.borrowed.on && s.borrowed.settle === 'payroll') ? borrowedTotal : 0;
    const revenue = r2(truckPay + minimum + renome + safety + borrowed);

    // Despesas de viagem (bolso do motorista)
    const v = { fuel: 0, tolls: 0, breakfast: 0, lunch: 0, dinner: 0, hotel: 0, fines: 0, damage: 0 };
    for (const t of co) { const c = tripCosts(t, s); for (const key in v) v[key] += c[key]; }
    let workedDays = 0;
    if (s.costs.mealsMode === 'day') {
      workedDays = allDays.size;
      for (const m of ['breakfast', 'lunch', 'dinner']) if (s.costs.auto && s.costs.auto[m] && s.costs[m].on) v[m] += workedDays * n(s.costs[m].val);
    }
    for (const key in v) v[key] = r2(v[key]);
    v.total = r2(sum(Object.values(v), x => x));

    // Custos operacionais do caminhão (owner-operator)
    const O = s.opCosts, op = { maintenance: 0, tires: 0, insurance: 0, truck: 0, other: 0 };
    if (O.on) { op.maintenance = miles * n(O.maintenance); op.tires = miles * n(O.tires); op.insurance = miles * n(O.insurance); op.truck = n(O.truckWeekly); op.other = n(O.otherWeekly); }
    for (const key in op) op[key] = r2(op[key]);
    op.total = r2(sum(Object.values(op), x => x));

    // Diária (per diem) isenta de imposto: dias com pernoite fora de casa
    const awayDays = new Set(co.filter(t => t.away).map(t => t.day)).size;
    const perDiem = r2(s.perDiem.on ? Math.min(revenue, awayDays * n(s.perDiem.rate)) : 0);

    // Impostos e descontos do holerite
    const B = s.benefits, T = s.taxes;
    const ded = { federal: 0, fica: 0, se: 0, state: 0, health: 0, k401: 0 };
    ded.health = B.healthOn ? n(B.health) : 0;
    ded.k401 = B.k401On ? revenue * n(B.k401Pct) / 100 : 0;
    let taxable = 0, qbi = 0;
    if (T.on && revenue > 0) {
      if (T.type === '1099') {
        // Autônomo (Schedule C): o self-employment tax incide sobre o lucro do negócio.
        // Plano de saúde e aposentadoria reduzem só o imposto de renda, não o SE tax.
        const business = v.fuel + v.tolls + v.damage + op.total;
        const netSE = Math.max(0, revenue - business - perDiem * 0.8);
        ded.se = netSE * 0.9235 * n(T.sePct) / 100;
        taxable = Math.max(0, netSE - ded.se / 2 - ded.health - ded.k401);
        qbi = T.qbi !== false ? taxable * 52 : 0;
      } else {
        ded.fica = Math.max(0, revenue - perDiem - ded.health) * n(T.ficaPct) / 100;
        taxable = Math.max(0, revenue - perDiem - ded.health - ded.k401);
      }
      ded.federal = T.federal === 'flat' ? taxable * n(T.flatPct) / 100 : annualTax(taxable * 52, T.filing, { qbi }) / 52;
      ded.state = taxable * n(T.statePct) / 100;
    }
    for (const key in ded) ded[key] = r2(ded[key]);
    ded.total = r2(sum(Object.values(ded), x => x));

    const f = {
      housing: r2(s.costs.housing.on ? n(s.costs.housing.val) : 0),
      loan: r2(extra.loan !== undefined ? extra.loan : (s.loan.on ? n(s.loan.installment) : 0))
    };
    f.total = r2(f.housing + f.loan);

    const takeHome = r2(revenue - ded.total);
    const net = r2(takeHome - v.total - op.total - f.total);
    return {
      mode: modes.length === 1 ? modes[0] : (modes.length ? 'mixed' : s.contract.mode), modes, baseLines,
      freight, marketTotal, miles, base, hoursWorked, hoursPaid, overtime, detention, stops, layover, breakdown, tarp,
      commission, commissionPcts: [...pcts], commissionPct: pcts.size === 1 ? [...pcts][0] : 0, tripBonus,
      minimum, renome, safety, borrowed, borrowedTotal, revenue,
      perDiem, awayDays, taxable: r2(taxable), taxType: T.on ? T.type : null, deductions: ded, takeHome,
      variable: v, opCosts: op, fixed: f, net,
      counts: { company: co.length, borrowed: bo.length, workedDays },
      clean: !co.some(t => n(t.fines) > 0 || n(t.damage) > 0)
    };
  }

  /* ---------- Jornada (FMCSA) ---------- */
  function hos(trips, s, { local = false, gameDay = 1, days = [] } = {}) {
    const H = s.hos;
    const byDay = {};
    for (const t of trips.filter(t => t.type !== 'borrowed')) {
      const d = byDay[t.day] || (byDay[t.day] = { drive: 0, duty: 0, maxMiles: 0, brk: false, trips: 0 });
      d.drive += n(t.drive); d.duty += n(t.hours); d.maxMiles = Math.max(d.maxMiles, n(t.miles)); d.brk = d.brk || !!t.brk; d.trips++;
    }
    const roadRadius = n(H.radius) * 1.15; // milhas aéreas → aproximação em milhas de estrada
    // Cada alerta: code (regra), level ('bad' = infração, 'warn' = aviso) e texto curto
    const rows = days.map(day => {
      const d = byDay[day] || { drive: 0, duty: 0, maxMiles: 0, brk: false, trips: 0 };
      const outRadius = local && H.shortHaul && d.maxMiles > roadRadius;
      const exempt = local && H.shortHaul && !outRadius && d.duty <= 14;   // isenção de curta distância vale neste dia
      const alerts = [];
      if (d.drive > 11) alerts.push({ code: 'drive11', level: 'bad', text: `Direção acima de 11h (${r2(d.drive)}h)` });
      if (d.duty > 14) alerts.push({ code: 'duty14', level: 'bad', text: `Jornada acima de 14h (${r2(d.duty)}h)` });
      if (d.drive > 8 && !d.brk && !exempt) alerts.push({ code: 'break30', level: 'bad', text: 'Faltou a pausa de 30 min após 8h de direção' });
      if (outRadius) alerts.push({ code: 'radius', level: 'warn', text: `Fora do raio local: viagem de ${r2(d.maxMiles)} mi (limite ~${Math.round(roadRadius)} mi de estrada)` });
      return { day, ...d, drive: r2(d.drive), duty: r2(d.duty), exempt, alerts };
    });
    const [limit, window] = H.cycle === '60/7' ? [60, 7] : [70, 8];
    // Soma do ciclo: volta dia a dia até o limite da janela. Um dia inteiro sem viagem de caminhão
    // equivale ao restart de 34 horas de folga e zera a contagem (regra opcional da FMCSA).
    let cycleUsed = 0, restartDay = null;
    for (let d = gameDay; d > gameDay - window && d >= 1; d--) {
      if (byDay[d]) cycleUsed += byDay[d].duty;
      else if (H.restart !== false && d < gameDay) { restartDay = d; break; }
    }
    cycleUsed = r2(cycleUsed);
    return { rows, limit, window, cycleUsed, cycleLeft: r2(Math.max(0, limit - cycleUsed)), over: cycleUsed > limit, restartDay };
  }

  return { WEEKDAYS, WEEKDAYS_FULL, STATUSES, CLASSIFICATIONS, OPERATIONS, PRESETS, TAX2026, n, r2, defaults, mergeDefaults,
    presetKeyFor, taxTypeFor, applyPreset, weekdayIdx, weekStartOf, dayLabel, paydayFor,
    contractOf, carRuleOf, carSnapshot, carBreakdown, snapshotFor, rulesSnapshot, marketFreight, tripCosts, borrowedValue,
    commissionRule, tripPay, annualTax, dre, hos };
})();
if (typeof module !== 'undefined') module.exports = Engine;
