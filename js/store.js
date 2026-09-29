'use strict';

/*
 * Stockage local (localStorage) et logique métier.
 * Tous les montants sont des entiers en centimes, toujours positifs sur une opération :
 * le signe dépend du type (expense = débit, income = crédit, transfer = compte → compte).
 */
const Store = (() => {
  const KEY = 'mescomptes.data.v1';
  const listeners = new Set();
  let state = null;

  const ACCOUNT_TYPES = {
    checking: 'Compte courant',
    savings: 'Épargne',
    credit: 'Carte de crédit',
    cash: 'Espèces',
    investment: 'Investissement',
    loan: 'Prêt / Crédit',
    other: 'Autre',
  };
  const ACCOUNT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  const PAYMENT_METHODS = ['Carte', 'Virement', 'Prélèvement', 'Chèque', 'Espèces', 'Autre'];
  const FREQUENCIES = { daily: 'jour', weekly: 'semaine', monthly: 'mois', yearly: 'an' };

  const DEFAULT_CATEGORIES = [
    ['Alimentation', '🛒', 'expense'], ['Logement', '🏠', 'expense'], ['Énergie & eau', '💡', 'expense'],
    ['Transport', '🚗', 'expense'], ['Santé', '💊', 'expense'], ['Restaurants & cafés', '☕', 'expense'],
    ['Loisirs', '🎬', 'expense'], ['Shopping', '🛍️', 'expense'], ['Abonnements', '📱', 'expense'],
    ['Voyages', '✈️', 'expense'], ['Éducation', '📚', 'expense'], ['Enfants', '🧸', 'expense'],
    ['Animaux', '🐾', 'expense'], ['Cadeaux & dons', '🎁', 'expense'], ['Impôts & taxes', '🏛️', 'expense'],
    ['Assurances', '🛡️', 'expense'], ['Frais bancaires', '🏦', 'expense'], ['Remboursement de prêt', '📉', 'expense'],
    ['Divers', '📦', 'expense'],
    ['Salaire', '💼', 'income'], ['Primes', '🏆', 'income'], ['Remboursements', '↩️', 'income'],
    ['Revenus locatifs', '🏘️', 'income'], ['Allocations & aides', '🤝', 'income'],
    ['Intérêts & dividendes', '📈', 'income'], ['Ventes', '🏷️', 'income'], ['Autres revenus', '➕', 'income'],
  ];

  function defaultState() {
    return {
      version: 1,
      settings: { currency: 'EUR', theme: 'auto', hideAmounts: false, pinHash: null, pinSalt: null, lockDelay: 60 },
      accounts: [],
      transactions: [],
      categories: DEFAULT_CATEGORIES.map(([name, icon, type]) => ({ id: U.uid(), name, icon, type })),
      budgets: [],
      recurring: [],
      goals: [],
      rules: [],
    };
  }

  function migrate(s) {
    const d = defaultState();
    for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
    s.settings = { ...d.settings, ...s.settings };
    return s;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { /* stockage indisponible */ }
    try { state = raw ? migrate(JSON.parse(raw)) : defaultState(); } catch { state = defaultState(); }
    return state;
  }

  let onError = () => {};
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      onError(e);
    }
    listeners.forEach((fn) => fn());
  }
  const subscribe = (fn) => listeners.add(fn);

  // ---------- CRUD générique ----------
  const get = (coll, id) => state[coll].find((x) => x.id === id);
  function upsert(coll, obj, { silent = false } = {}) {
    const list = state[coll];
    if (!obj.id) {
      obj.id = U.uid();
      obj.createdAt = Date.now();
      list.push(obj);
    } else {
      const i = list.findIndex((x) => x.id === obj.id);
      if (i >= 0) list[i] = { ...list[i], ...obj };
      else list.push(obj);
    }
    if (!silent) save();
    return get(coll, obj.id);
  }
  function remove(coll, id) {
    state[coll] = state[coll].filter((x) => x.id !== id);
    save();
  }

  function removeAccount(id) {
    state.transactions = state.transactions.filter((t) => t.accountId !== id && t.toAccountId !== id);
    state.recurring = state.recurring.filter((r) => r.accountId !== id && r.toAccountId !== id);
    state.goals.forEach((g) => { if (g.accountId === id) g.accountId = null; });
    remove('accounts', id);
  }
  function removeCategory(id) {
    state.transactions.forEach((t) => { if (t.categoryId === id) t.categoryId = null; });
    state.recurring.forEach((r) => { if (r.categoryId === id) r.categoryId = null; });
    state.budgets = state.budgets.filter((b) => b.categoryId !== id);
    state.rules = state.rules.filter((r) => r.categoryId !== id);
    remove('categories', id);
  }

  // ---------- Soldes ----------
  // Effet signé d'une opération sur un compte donné (ou sur le patrimoine si accId absent).
  function effect(tx, accId) {
    if (!accId) return tx.type === 'income' ? tx.amount : tx.type === 'expense' ? -tx.amount : 0;
    let v = 0;
    if (tx.accountId === accId) v += tx.type === 'income' ? tx.amount : -tx.amount;
    if (tx.type === 'transfer' && tx.toAccountId === accId) v += tx.amount;
    return v;
  }
  function balance(accId, upto = null, { clearedOnly = false } = {}) {
    const acc = get('accounts', accId);
    if (!acc) return 0;
    let b = acc.initialBalance || 0;
    for (const t of state.transactions) {
      if (upto && t.date > upto) continue;
      if (clearedOnly && !t.cleared) continue;
      b += effect(t, accId);
    }
    return b;
  }
  function netWorth(upto = null) {
    let b = state.accounts.reduce((s, a) => s + (a.initialBalance || 0), 0);
    for (const t of state.transactions) if (!upto || t.date <= upto) b += effect(t);
    return b;
  }
  // Solde fin de mois pour une série de mois (un seul passage sur les opérations).
  function balanceSeries(monthKeys, accId = null) {
    const ends = monthKeys.map(U.monthEnd);
    const out = new Array(ends.length).fill(0);
    const base = accId ? (get('accounts', accId)?.initialBalance || 0)
      : state.accounts.reduce((s, a) => s + (a.initialBalance || 0), 0);
    for (const t of state.transactions) {
      const v = effect(t, accId);
      if (!v) continue;
      for (let i = 0; i < ends.length; i++) if (t.date <= ends[i]) out[i] += v;
    }
    return out.map((v) => v + base);
  }

  // ---------- Statistiques ----------
  function stats(from, to, { accountId = '' } = {}) {
    const res = { income: 0, expense: 0, byCategory: new Map(), incomeByCategory: new Map(), byPayee: new Map(), byMonth: new Map(), count: 0 };
    for (const t of state.transactions) {
      if (t.type === 'transfer') continue;
      if (from && t.date < from) continue;
      if (to && t.date > to) continue;
      if (accountId && t.accountId !== accountId) continue;
      res.count++;
      const mk = U.monthKey(t.date);
      if (!res.byMonth.has(mk)) res.byMonth.set(mk, { income: 0, expense: 0 });
      const m = res.byMonth.get(mk);
      const cat = t.categoryId || null;
      if (t.type === 'income') {
        res.income += t.amount;
        m.income += t.amount;
        res.incomeByCategory.set(cat, (res.incomeByCategory.get(cat) || 0) + t.amount);
      } else {
        res.expense += t.amount;
        m.expense += t.amount;
        res.byCategory.set(cat, (res.byCategory.get(cat) || 0) + t.amount);
        const p = (t.payee || '').trim();
        if (p) res.byPayee.set(p, (res.byPayee.get(p) || 0) + t.amount);
      }
    }
    return res;
  }
  function spentInCategory(catId, monthKey) {
    const from = U.monthStart(monthKey);
    const to = U.monthEnd(monthKey);
    let s = 0;
    for (const t of state.transactions) {
      if (t.type === 'expense' && t.categoryId === catId && t.date >= from && t.date <= to) s += t.amount;
    }
    return s;
  }

  // ---------- Opérations récurrentes ----------
  function nextOccurrence(r, iso) {
    const n = Math.max(1, r.interval || 1);
    switch (r.frequency) {
      case 'daily': return U.addDays(iso, n);
      case 'weekly': return U.addDays(iso, 7 * n);
      case 'yearly': return U.addMonths(iso, 12 * n, r.anchorDay);
      default: return U.addMonths(iso, n, r.anchorDay);
    }
  }
  const isActive = (r) => !r.paused && r.nextDate && (!r.endDate || r.nextDate <= r.endDate);
  function txFromRecurring(r, date) {
    return {
      id: U.uid(), createdAt: Date.now(), type: r.type, amount: r.amount, accountId: r.accountId,
      toAccountId: r.type === 'transfer' ? r.toAccountId : null, categoryId: r.type === 'transfer' ? null : r.categoryId,
      payee: r.payee || '', note: r.note || '', tags: r.tags || [], method: r.method || '', cleared: false, date, recurringId: r.id,
    };
  }
  // Génère les opérations automatiques échues.
  function processRecurring(today = U.today()) {
    let created = 0;
    for (const r of state.recurring) {
      if (!r.auto) continue;
      let guard = 0;
      while (isActive(r) && r.nextDate <= today && guard++ < 2000) {
        state.transactions.push(txFromRecurring(r, r.nextDate));
        r.nextDate = nextOccurrence(r, r.nextDate);
        created++;
      }
    }
    if (created) save();
    return created;
  }
  function postRecurring(id) {
    const r = get('recurring', id);
    if (!r || !isActive(r)) return null;
    const tx = txFromRecurring(r, r.nextDate);
    state.transactions.push(tx);
    r.nextDate = nextOccurrence(r, r.nextDate);
    save();
    return tx;
  }
  function skipRecurring(id) {
    const r = get('recurring', id);
    if (!r || !isActive(r)) return;
    r.nextDate = nextOccurrence(r, r.nextDate);
    save();
  }
  // Occurrences futures (non encore saisies) jusqu'à la date `to`, en retard incluses.
  function occurrences(to) {
    const out = [];
    for (const r of state.recurring) {
      let d = r.nextDate;
      let guard = 0;
      while (d && !r.paused && d <= to && (!r.endDate || d <= r.endDate) && guard++ < 500) {
        out.push({ r, date: d });
        d = nextOccurrence(r, d);
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  function forecast(to, accId = null) {
    let b = accId ? balance(accId, to) : netWorth(to);
    for (const { r } of occurrences(to)) {
      b += effect({ type: r.type, amount: r.amount, accountId: r.accountId, toAccountId: r.toAccountId }, accId);
    }
    return b;
  }
  const frequencyLabel = (r) => {
    const n = r.interval || 1;
    const unit = FREQUENCIES[r.frequency] || 'mois';
    if (n === 1) return { daily: 'Chaque jour', weekly: 'Chaque semaine', monthly: 'Chaque mois', yearly: 'Chaque année' }[r.frequency] || 'Chaque mois';
    return `Tous les ${n} ${unit === 'mois' ? 'mois' : unit + 's'}`;
  };

  // ---------- Règles & suggestions ----------
  function categoryFor(payee, type = 'expense') {
    const p = U.norm(payee);
    if (!p) return null;
    for (const rule of state.rules) {
      if (rule.pattern && p.includes(U.norm(rule.pattern))) {
        const c = get('categories', rule.categoryId);
        if (c && c.type === type) return c.id;
      }
    }
    // Sinon : dernière catégorie utilisée pour ce tiers.
    let best = null;
    for (const t of state.transactions) {
      if (t.type === type && t.categoryId && U.norm(t.payee) === p && (!best || t.date > best.date)) best = t;
    }
    return best ? best.categoryId : null;
  }
  function applyRulesToUncategorized() {
    let n = 0;
    for (const t of state.transactions) {
      if (t.type === 'transfer' || t.categoryId) continue;
      const c = categoryFor(t.payee, t.type);
      if (c) { t.categoryId = c; n++; }
    }
    if (n) save();
    return n;
  }
  function payees() {
    const count = new Map();
    for (const t of state.transactions) {
      const p = (t.payee || '').trim();
      if (p) count.set(p, (count.get(p) || 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  }
  function tags() {
    const s = new Set();
    state.transactions.forEach((t) => (t.tags || []).forEach((x) => s.add(x)));
    return [...s].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  // ---------- Objectifs ----------
  function goalSaved(g) {
    if (g.accountId) return Math.max(0, balance(g.accountId));
    return (g.contributions || []).reduce((s, c) => s + c.amount, 0);
  }

  // ---------- Import / export / réinitialisation ----------
  function replaceAll(data) {
    if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
      throw new Error('Fichier de sauvegarde invalide.');
    }
    const pin = { pinHash: state.settings.pinHash, pinSalt: state.settings.pinSalt };
    state = migrate(data);
    // Le code PIN de l'appareil est conservé (il ne voyage pas avec les sauvegardes).
    Object.assign(state.settings, pin);
    save();
  }
  function exportData() {
    const copy = JSON.parse(JSON.stringify(state));
    copy.settings.pinHash = null;
    copy.settings.pinSalt = null;
    copy.exportedAt = new Date().toISOString();
    return copy;
  }
  function reset() {
    const settings = { ...state.settings };
    state = defaultState();
    state.settings = { ...state.settings, currency: settings.currency, theme: settings.theme, pinHash: settings.pinHash, pinSalt: settings.pinSalt };
    save();
  }

  // ---------- Données de démonstration ----------
  function loadDemo() {
    let seed = 42;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const between = (a, b) => Math.round((a + rnd() * (b - a)) * 100);
    const s = defaultState();
    s.settings = { ...state.settings };
    const cat = (name) => s.categories.find((c) => c.name === name).id;
    const acc = (name, type, initial, color) => { const a = { id: U.uid(), name, type, initialBalance: initial, color, bank: 'Ma Banque', archived: false, createdAt: Date.now() }; s.accounts.push(a); return a.id; };
    const courant = acc('Compte courant', 'checking', 120000, ACCOUNT_COLORS[0]);
    const livret = acc('Livret A', 'savings', 450000, ACCOUNT_COLORS[2]);
    const cash = acc('Portefeuille', 'cash', 6000, ACCOUNT_COLORS[3]);
    const tx = (date, type, amount, accountId, categoryId, payee, extra = {}) => s.transactions.push({
      id: U.uid(), createdAt: Date.now(), date, type, amount, accountId, categoryId, payee, note: '', tags: [], method: type === 'income' ? 'Virement' : 'Carte', cleared: date < U.addDays(U.today(), -3), toAccountId: null, ...extra,
    });
    const t = U.today();
    const startKey = U.shiftMonth(U.monthKey(t), -6);
    for (const mk of U.monthsBetween(startKey, U.monthKey(t))) {
      const d = (day) => `${mk}-${U.pad(Math.min(day, Number(U.monthEnd(mk).slice(8))))}`;
      const add = (day, ...a) => { const date = d(day); if (date <= t) tx(date, ...a); };
      add(1, 'expense', 85000, courant, cat('Logement'), 'Loyer', { method: 'Prélèvement' });
      add(3, 'expense', between(60, 90), courant, cat('Énergie & eau'), 'EDF', { method: 'Prélèvement' });
      add(5, 'expense', 1999, courant, cat('Abonnements'), 'Free Mobile', { method: 'Prélèvement' });
      add(8, 'expense', 1349, courant, cat('Abonnements'), 'Netflix');
      add(10, 'expense', 4500, courant, cat('Assurances'), 'MAAF', { method: 'Prélèvement' });
      add(12, 'expense', 8640, courant, cat('Transport'), 'Navigo', { method: 'Prélèvement' });
      for (const day of [2, 9, 16, 23, 30]) add(day, 'expense', between(35, 120), courant, cat('Alimentation'), rnd() > 0.5 ? 'Carrefour' : 'Monoprix');
      for (const day of [6, 14, 21]) add(day, 'expense', between(12, 45), courant, cat('Restaurants & cafés'), ['Le Petit Bistrot', 'Starbucks', 'Sushi Shop'][Math.floor(rnd() * 3)]);
      add(18, 'expense', between(15, 80), courant, cat('Loisirs'), rnd() > 0.5 ? 'Cinéma UGC' : 'Fnac');
      add(20, 'expense', between(20, 150), courant, cat('Shopping'), rnd() > 0.5 ? 'Zara' : 'Amazon');
      add(24, 'expense', between(10, 40), cash, cat('Alimentation'), 'Marché');
      if (rnd() > 0.6) add(15, 'expense', between(25, 60), courant, cat('Santé'), 'Pharmacie');
      add(27, 'income', 245000, courant, cat('Salaire'), 'Employeur SA');
      add(28, 'transfer', 20000, courant, null, 'Épargne mensuelle', { toAccountId: livret, method: 'Virement' });
    }
    const rec = (o) => s.recurring.push({ id: U.uid(), interval: 1, frequency: 'monthly', auto: false, paused: false, note: '', tags: [], method: '', ...o, anchorDay: Number(o.nextDate.slice(8)) });
    const next = (day) => { let dt = `${U.monthKey(t)}-${U.pad(day)}`; if (dt <= t) dt = U.addMonths(dt, 1, day); return dt; };
    rec({ type: 'expense', amount: 85000, accountId: courant, categoryId: cat('Logement'), payee: 'Loyer', nextDate: next(1), auto: true });
    rec({ type: 'income', amount: 245000, accountId: courant, categoryId: cat('Salaire'), payee: 'Employeur SA', nextDate: next(27) });
    rec({ type: 'expense', amount: 1349, accountId: courant, categoryId: cat('Abonnements'), payee: 'Netflix', nextDate: next(8), auto: true });
    rec({ type: 'expense', amount: 1999, accountId: courant, categoryId: cat('Abonnements'), payee: 'Free Mobile', nextDate: next(5), auto: true });
    rec({ type: 'transfer', amount: 20000, accountId: courant, toAccountId: livret, categoryId: null, payee: 'Épargne mensuelle', nextDate: next(28) });
    const budget = (name, amount) => s.budgets.push({ id: U.uid(), categoryId: cat(name), amount });
    budget('Alimentation', 40000); budget('Restaurants & cafés', 10000); budget('Loisirs', 6000); budget('Shopping', 10000); budget('Transport', 9000);
    s.goals.push({ id: U.uid(), name: 'Vacances d\'été', icon: '🏖️', target: 200000, deadline: `${Number(t.slice(0, 4)) + 1}-07-01`, accountId: null, contributions: [{ date: t, amount: 45000 }] });
    s.goals.push({ id: U.uid(), name: 'Épargne de précaution', icon: '🛟', target: 800000, deadline: null, accountId: livret, contributions: [] });
    s.rules.push({ id: U.uid(), pattern: 'carrefour', categoryId: cat('Alimentation') });
    s.rules.push({ id: U.uid(), pattern: 'sncf', categoryId: cat('Transport') });
    state = s;
    save();
  }

  return {
    load, save, subscribe, get, upsert, remove, removeAccount, removeCategory,
    effect, balance, netWorth, balanceSeries, stats, spentInCategory,
    nextOccurrence, processRecurring, postRecurring, skipRecurring, occurrences, forecast, frequencyLabel, isActive,
    categoryFor, applyRulesToUncategorized, payees, tags, goalSaved,
    replaceAll, exportData, reset, loadDemo,
    ACCOUNT_TYPES, ACCOUNT_COLORS, PAYMENT_METHODS, FREQUENCIES,
    set onError(fn) { onError = fn; },
    get state() { return state; },
  };
})();
