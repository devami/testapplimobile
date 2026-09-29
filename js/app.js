'use strict';

/* Interface : routeur par hash, écrans, formulaires en panneau (bottom sheet). */
const App = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = () => Store.state;
  const esc = U.esc;
  const view = $('#view');

  const cur = () => S().settings.currency;
  const moneyTxt = (c, o) => U.money(c, cur(), o);
  const money = (c, o) => `<span class="amt">${moneyTxt(c, o)}</span>`;
  const signed = (c) => `<span class="amt ${c > 0 ? 'pos' : ''}">${moneyTxt(c, { sign: true })}</span>`;
  const cat = (id) => Store.get('categories', id);
  const acc = (id) => Store.get('accounts', id);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const byName = (a, b) => a.name.localeCompare(b.name, 'fr');

  const ICON = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  };
  const ACCOUNT_ICONS = { checking: '🏦', savings: '🐷', credit: '💳', cash: '💶', investment: '📈', loan: '📄', other: '📁' };

  const ui = {
    tx: { q: '', account: '', category: '', type: '', period: 'month', month: U.monthKey(U.today()), from: '', to: '', cleared: '', tag: '', limit: 200 },
    budgetMonth: U.monthKey(U.today()),
    report: { period: '6m', account: '' },
    reconcile: false,
    accLimit: 200,
    lastAccount: null,
  };

  // ======================================================================
  // Composants
  // ======================================================================
  const header = (title, { back = null, actions = '' } = {}) => `
    <header class="page-head">
      ${back ? `<a class="icon-btn" href="${back}" aria-label="Retour">${ICON.back}</a>` : ''}
      <h1>${esc(title)}</h1>
      <div class="head-actions">${actions}</div>
    </header>`;

  const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
  const accountOptions = (sel, { empty = null, includeArchived = false } = {}) =>
    (empty !== null ? opt('', empty, sel) : '') +
    S().accounts.filter((a) => includeArchived || !a.archived || a.id === sel).map((a) => opt(a.id, a.name, sel)).join('');
  const categoryOptions = (type, sel, empty = 'Non catégorisé') =>
    (empty !== null ? opt('', empty, sel) : '') +
    S().categories.filter((c) => c.type === type).sort(byName).map((c) => opt(c.id, `${c.icon} ${c.name}`, sel)).join('');
  const categoryOptionsAll = (sel, empty) =>
    (empty !== null ? opt('', empty, sel) : '') +
    `<optgroup label="Dépenses">${categoryOptions('expense', sel, null)}</optgroup>` +
    `<optgroup label="Revenus">${categoryOptions('income', sel, null)}</optgroup>`;

  const monthNav = (key, action) => `
    <div class="month-nav">
      <button class="icon-btn" data-action="${action}" data-delta="-1" aria-label="Mois précédent"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <strong>${cap(U.monthLabel(key, true))}</strong>
      <button class="icon-btn" data-action="${action}" data-delta="1" aria-label="Mois suivant">${ICON.chevron}</button>
    </div>`;

  const empty = (text, action = '') => `<div class="empty"><p>${text}</p>${action}</div>`;

  const progress = (value, max, { state = 'ok', marker = null, label = '' } = {}) => {
    const w = max > 0 ? U.clamp((value / max) * 100, 0, 100) : 0;
    return `<div class="progress ${state}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(w)}" aria-label="${esc(label)}">
      <span class="progress-fill" style="width:${w}%"></span>
      ${marker !== null ? `<span class="progress-marker" style="left:${U.clamp(marker * 100, 0, 100)}%" title="Rythme attendu"></span>` : ''}
    </div>`;
  };

  function txRow(t, o = {}) {
    const c = cat(t.categoryId);
    const isTr = t.type === 'transfer';
    const icon = isTr ? '⇄' : c ? c.icon : '❔';
    const title = t.payee || (isTr ? 'Virement' : c ? c.name : 'Opération');
    const sub = isTr
      ? `${acc(t.accountId)?.name ?? '?'} → ${acc(t.toAccountId)?.name ?? '?'}`
      : [c ? c.name : 'Non catégorisé', o.accountId ? null : acc(t.accountId)?.name].filter(Boolean).join(' · ');
    const val = o.accountId ? Store.effect(t, o.accountId) : isTr ? null : Store.effect(t);
    const amount = val === null ? `<span class="amt neutral">${moneyTxt(t.amount)}</span>` : signed(val);
    const future = t.date > U.today() ? '<span class="badge">À venir</span>' : '';
    const tags = (t.tags || []).map((x) => `<span class="tag">#${esc(x)}</span>`).join('');
    return `<li>
      <button class="row tx-row${t.cleared ? ' cleared' : ''}${o.reconcile ? ' reconciling' : ''}" data-action="${o.reconcile ? 'toggle-cleared' : 'edit-tx'}" data-id="${t.id}">
        <span class="row-icon" aria-hidden="true">${icon}</span>
        <span class="row-main">
          <span class="row-title">${esc(title)} ${future}</span>
          <span class="row-sub">${esc(sub)}${t.note ? ` · ${esc(t.note)}` : ''} ${tags}</span>
        </span>
        <span class="row-end">
          ${amount}
          ${o.running !== undefined ? `<span class="row-sub">${money(o.running)}</span>` : ''}
        </span>
        <span class="clr" title="${t.cleared ? 'Pointée' : 'Non pointée'}" aria-label="${t.cleared ? 'Pointée' : 'Non pointée'}">${t.cleared ? '✓' : ''}</span>
      </button></li>`;
  }

  function txList(list, o = {}) {
    if (!list.length) return empty('Aucune opération.');
    const groups = new Map();
    for (const t of list) {
      if (!groups.has(t.date)) groups.set(t.date, []);
      groups.get(t.date).push(t);
    }
    let html = '';
    for (const [date, items] of groups) {
      const total = items.reduce((s, t) => s + (o.accountId ? Store.effect(t, o.accountId) : Store.effect(t)), 0);
      html += `<section class="day-group">
        <h3 class="day-head"><span>${cap(U.fmtDay(date))}</span><span>${total ? signed(total) : ''}</span></h3>
        <ul class="list">${items.map((t) => txRow(t, { ...o, running: o.running ? o.running.get(t.id) : undefined })).join('')}</ul>
      </section>`;
    }
    return html;
  }

  const sortDesc = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);

  function accountCard(a) {
    const b = Store.balance(a.id, U.today());
    return `<li><a class="row" href="#/account/${a.id}">
      <span class="row-icon" aria-hidden="true"><span class="acc-dot" style="background:${a.color}"></span>${ACCOUNT_ICONS[a.type] || '🏦'}</span>
      <span class="row-main"><span class="row-title">${esc(a.name)}</span><span class="row-sub">${esc(Store.ACCOUNT_TYPES[a.type] || '')}${a.bank ? ` · ${esc(a.bank)}` : ''}</span></span>
      <span class="row-end">${signedPlain(b)}</span>
    </a></li>`;
  }
  const signedPlain = (c) => `<span class="amt${c < 0 ? ' neg' : ''}">${moneyTxt(c)}</span>`;

  // ======================================================================
  // Écrans
  // ======================================================================
  function home() {
    const s = S();
    const privacyBtn = `<button class="icon-btn" data-action="toggle-privacy" aria-label="${s.settings.hideAmounts ? 'Afficher' : 'Masquer'} les montants" aria-pressed="${s.settings.hideAmounts}">${s.settings.hideAmounts ? ICON.eyeOff : ICON.eye}</button>`;
    if (!s.accounts.length) {
      return {
        html: header('Mes Comptes') + `
        <section class="card welcome">
          <h2>Bienvenue 👋</h2>
          <p>Suivez tous vos comptes, dépenses, budgets, échéances et objectifs d'épargne. Vos données restent uniquement sur cet appareil.</p>
          <div class="btn-col">
            <button class="btn primary" data-action="new-account">Créer mon premier compte</button>
            <button class="btn" data-action="load-demo">Essayer avec des données de démonstration</button>
            <button class="btn ghost" data-action="import-json">Restaurer une sauvegarde</button>
          </div>
        </section>`,
      };
    }
    const t = U.today();
    const mk = U.monthKey(t);
    const nw = Store.netWorth(t);
    const st = Store.stats(U.monthStart(mk), U.monthEnd(mk));
    const pk = U.shiftMonth(mk, -1);
    const prev = Store.stats(U.monthStart(pk), U.monthEnd(pk));
    const fc = Store.forecast(U.monthEnd(mk));
    const upcoming = Store.occurrences(U.addDays(t, 30)).slice(0, 6);
    const recent = [...s.transactions].filter((x) => x.date <= t).sort(sortDesc).slice(0, 6);
    const accounts = s.accounts.filter((a) => !a.archived);

    const alerts = s.budgets.map((b) => ({ b, c: cat(b.categoryId), spent: Store.spentInCategory(b.categoryId, mk) }))
      .filter((r) => r.c && r.spent >= r.b.amount * 0.8).sort((a, b) => b.spent / b.b.amount - a.spent / a.b.amount);

    const top = [...st.byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topMax = top.length ? top[0][1] : 1;

    const html = header('Mes Comptes', { actions: privacyBtn }) + `
      <section class="card hero">
        <div class="hero-label">Patrimoine net</div>
        <div class="hero-value">${signedPlain(nw)}</div>
        <div class="hero-sub">Prévision fin ${U.MONTHS_LONG[Number(mk.slice(5)) - 1]} : <strong>${signedPlain(fc)}</strong></div>
      </section>

      <section class="kpis">
        <div class="kpi"><span class="kpi-label">Revenus du mois</span><span class="kpi-value">${money(st.income)}</span><span class="kpi-sub">Mois dernier : ${money(prev.income)}</span></div>
        <div class="kpi"><span class="kpi-label">Dépenses du mois</span><span class="kpi-value">${money(st.expense)}</span><span class="kpi-sub">Mois dernier : ${money(prev.expense)}</span></div>
        <div class="kpi"><span class="kpi-label">Solde du mois</span><span class="kpi-value">${signed(st.income - st.expense)}</span><span class="kpi-sub">${st.income ? `Épargne : ${pct(st.income - st.expense, st.income)} %` : '—'}</span></div>
      </section>

      <div class="cols">
        <div>
          <section class="card">
            <div class="card-head"><h2>Comptes</h2><a href="#/accounts" class="link">Gérer</a></div>
            <ul class="list">${accounts.map(accountCard).join('')}</ul>
          </section>

          ${alerts.length ? `<section class="card">
            <div class="card-head"><h2>Alertes budget</h2><a href="#/budgets" class="link">Budgets</a></div>
            <ul class="list plain">${alerts.map(({ b, c, spent }) => {
              const over = spent > b.amount;
              return `<li class="alert-row ${over ? 'over' : 'warn'}"><span aria-hidden="true">${over ? '⛔' : '⚠️'}</span>
                <span class="row-main"><span class="row-title">${c.icon} ${esc(c.name)}</span>
                <span class="row-sub">${over ? `Dépassé de ${money(spent - b.amount)}` : `${pct(spent, b.amount)} % utilisé`} · ${money(spent)} / ${money(b.amount)}</span></span></li>`;
            }).join('')}</ul>
          </section>` : ''}

          <section class="card">
            <div class="card-head"><h2>À venir (30 jours)</h2><a href="#/recurring" class="link">Échéancier</a></div>
            ${upcoming.length ? `<ul class="list plain">${upcoming.map(({ r, date }) => occurrenceRow(r, date)).join('')}</ul>` : empty('Aucune échéance prévue.', '<a class="btn small" href="#/recurring">Ajouter une échéance</a>')}
          </section>
        </div>
        <div>
          <section class="card">
            <div class="card-head"><h2>Évolution du patrimoine</h2><span class="muted small">12 mois</span></div>
            <div id="chart-nw" class="chart"></div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Dépenses du mois</h2><a href="#/reports" class="link">Rapports</a></div>
            ${top.length ? hbars(top.map(([id, v]) => ({ id, label: catName(id), value: v, share: pct(v, st.expense) })), topMax) : empty('Aucune dépense ce mois-ci.')}
          </section>
        </div>
      </div>

      <section class="card">
        <div class="card-head"><h2>Dernières opérations</h2><a href="#/tx" class="link">Tout voir</a></div>
        ${txList(recent)}
      </section>`;

    return {
      html,
      after() {
        const months = U.monthsBetween(U.shiftMonth(mk, -11), mk);
        const series = Store.balanceSeries(months);
        series[series.length - 1] = nw;
        Charts.line($('#chart-nw'), months.map((k, i) => ({ label: U.monthLabel(k), tipLabel: cap(U.monthLabel(k, true)), value: series[i] })),
          { format: moneyTxt, formatTick: (v) => moneyTxt(v, { compact: true }), label: 'Évolution du patrimoine net sur 12 mois' });
      },
    };
  }

  const catName = (id) => { const c = cat(id); return c ? `${c.icon} ${c.name}` : '❔ Non catégorisé'; };

  function hbars(items, max, action = '') {
    return `<ul class="hbars">${items.map((it) => `
      <li><${action ? `button type="button" data-action="${action}" data-id="${it.id ?? ''}"` : 'div'} class="hbar-row">
        <span class="hbar-label">${esc(it.label)}</span>
        <span class="hbar-val">${money(it.value)}${it.share !== undefined ? ` <small>${it.share} %</small>` : ''}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${max ? Math.max(1, (it.value / max) * 100) : 0}%"></span></span>
      </${action ? 'button' : 'div'}></li>`).join('')}</ul>`;
  }

  function occurrenceRow(r, date) {
    const c = cat(r.categoryId);
    const isTr = r.type === 'transfer';
    const d = U.daysUntil(date);
    const when = d < 0 ? `<span class="badge crit">En retard</span>` : d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : `Dans ${d} j`;
    const val = isTr ? `<span class="amt neutral">${moneyTxt(r.amount)}</span>` : signed(r.type === 'income' ? r.amount : -r.amount);
    return `<li class="row static">
      <span class="row-icon" aria-hidden="true">${isTr ? '⇄' : c ? c.icon : '🔁'}</span>
      <span class="row-main"><span class="row-title">${esc(r.payee || (c ? c.name : 'Échéance'))}</span>
      <span class="row-sub">${U.fmtDate(date, { day: 'numeric', month: 'short' })} · ${when}${r.auto ? ' · auto' : ''}</span></span>
      <span class="row-end">${val}</span></li>`;
  }

  // ---------------------------------------------------------------- Comptes
  function accounts() {
    const s = S();
    const active = s.accounts.filter((a) => !a.archived);
    const archived = s.accounts.filter((a) => a.archived);
    const t = U.today();
    const groups = Object.entries(Store.ACCOUNT_TYPES).map(([type, label]) => {
      const list = active.filter((a) => a.type === type);
      if (!list.length) return '';
      const total = list.reduce((sum, a) => sum + Store.balance(a.id, t), 0);
      return `<section class="card">
        <div class="card-head"><h2>${label}</h2>${signedPlain(total)}</div>
        <ul class="list">${list.map(accountCard).join('')}</ul></section>`;
    }).join('');
    const assets = s.accounts.reduce((sum, a) => { const b = Store.balance(a.id, t); return b > 0 ? sum + b : sum; }, 0);
    const debts = s.accounts.reduce((sum, a) => { const b = Store.balance(a.id, t); return b < 0 ? sum + b : sum; }, 0);
    return {
      html: header('Comptes', { actions: `<button class="btn primary small" data-action="new-account">${ICON.plus} Compte</button>` }) + `
        ${s.accounts.length ? `<section class="kpis">
          <div class="kpi"><span class="kpi-label">Patrimoine net</span><span class="kpi-value">${signedPlain(assets + debts)}</span></div>
          <div class="kpi"><span class="kpi-label">Avoirs</span><span class="kpi-value">${money(assets)}</span></div>
          <div class="kpi"><span class="kpi-label">Dettes</span><span class="kpi-value">${signedPlain(debts)}</span></div>
        </section>` : ''}
        ${groups || empty('Aucun compte pour le moment.', '<button class="btn primary" data-action="new-account">Créer un compte</button>')}
        ${archived.length ? `<details class="card"><summary>Comptes archivés (${archived.length})</summary><ul class="list">${archived.map(accountCard).join('')}</ul></details>` : ''}`,
    };
  }

  function account(id) {
    const a = acc(id);
    if (!a) { location.hash = '#/accounts'; return { html: '' }; }
    const t = U.today();
    const mk = U.monthKey(t);
    const list = S().transactions.filter((x) => x.accountId === id || x.toAccountId === id);
    // Solde courant après chaque opération.
    const asc = [...list].sort((x, y) => x.date.localeCompare(y.date) || (x.createdAt || 0) - (y.createdAt || 0));
    const running = new Map();
    let run = a.initialBalance || 0;
    for (const x of asc) { run += Store.effect(x, id); running.set(x.id, run); }
    const desc = asc.reverse();
    const shown = desc.slice(0, ui.accLimit);
    const uncleared = list.filter((x) => !x.cleared).length;

    return {
      html: header(a.name, {
        back: '#/accounts',
        actions: `<button class="icon-btn" data-action="edit-account" data-id="${id}" aria-label="Modifier le compte">${ICON.edit}</button>`,
      }) + `
        <section class="card hero">
          <div class="hero-label"><span class="acc-dot" style="background:${a.color}"></span> ${esc(Store.ACCOUNT_TYPES[a.type] || '')}${a.bank ? ` · ${esc(a.bank)}` : ''}${a.number ? ` · ${esc(a.number)}` : ''}</div>
          <div class="hero-value">${signedPlain(Store.balance(id, t))}</div>
          <div class="hero-grid">
            <div><span class="muted small">Solde pointé</span><br>${signedPlain(Store.balance(id, null, { clearedOnly: true }))}</div>
            <div><span class="muted small">Avec opérations futures</span><br>${signedPlain(Store.balance(id))}</div>
            <div><span class="muted small">Prévision fin de mois</span><br>${signedPlain(Store.forecast(U.monthEnd(mk), id))}</div>
          </div>
        </section>
        <div class="btn-row wrap">
          <button class="btn small primary" data-action="new-tx" data-account="${id}">${ICON.plus} Opération</button>
          <button class="btn small${ui.reconcile ? ' active' : ''}" data-action="toggle-reconcile" aria-pressed="${ui.reconcile}">✓ Pointage${uncleared ? ` (${uncleared})` : ''}</button>
          <button class="btn small" data-action="adjust-balance" data-id="${id}">Ajuster le solde</button>
          <button class="btn small" data-action="import-csv" data-account="${id}">Importer un relevé</button>
          <button class="btn small" data-action="export-account" data-id="${id}">${ICON.download} CSV</button>
        </div>
        ${ui.reconcile ? '<p class="hint">Mode pointage : touchez une opération pour la marquer comme présente sur votre relevé bancaire. Comparez le « solde pointé » avec votre relevé.</p>' : ''}
        <section class="card">
          <div class="card-head"><h2>Évolution du solde</h2><span class="muted small">12 mois</span></div>
          <div id="chart-acc" class="chart"></div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Opérations</h2><span class="muted small">${list.length}</span></div>
          ${txList(shown, { accountId: id, running, reconcile: ui.reconcile })}
          ${desc.length > shown.length ? '<button class="btn block" data-action="acc-more">Afficher plus</button>' : ''}
        </section>`,
      after() {
        const months = U.monthsBetween(U.shiftMonth(mk, -11), mk);
        const series = Store.balanceSeries(months, id);
        series[series.length - 1] = Store.balance(id, t);
        Charts.line($('#chart-acc'), months.map((k, i) => ({ label: U.monthLabel(k), tipLabel: cap(U.monthLabel(k, true)), value: series[i] })),
          { format: moneyTxt, formatTick: (v) => moneyTxt(v, { compact: true }), label: `Évolution du solde de ${a.name}` });
      },
    };
  }

  // ---------------------------------------------------------------- Opérations
  function periodRange(f) {
    const t = U.today();
    switch (f.period) {
      case 'month': return [U.monthStart(f.month), U.monthEnd(f.month)];
      case '30d': return [U.addDays(t, -30), t];
      case '90d': return [U.addDays(t, -90), t];
      case 'year': return [`${t.slice(0, 4)}-01-01`, `${t.slice(0, 4)}-12-31`];
      case 'range': return [f.from || null, f.to || null];
      case 'upcoming': return [U.addDays(t, 1), null];
      default: return [null, null];
    }
  }

  function filterTx(f) {
    const [from, to] = periodRange(f);
    const q = U.norm(f.q);
    const qAmount = /^[\d\s.,]+$/.test(f.q.trim()) ? Math.abs(U.parseAmount(f.q)) : NaN;
    return S().transactions.filter((x) => {
      if (from && x.date < from) return false;
      if (to && x.date > to) return false;
      if (f.account && x.accountId !== f.account && x.toAccountId !== f.account) return false;
      if (f.category === '__none') { if (x.categoryId || x.type === 'transfer') return false; }
      else if (f.category && x.categoryId !== f.category) return false;
      if (f.type && x.type !== f.type) return false;
      if (f.cleared === '1' && !x.cleared) return false;
      if (f.cleared === '0' && x.cleared) return false;
      if (f.tag && !(x.tags || []).includes(f.tag)) return false;
      if (q) {
        const c = cat(x.categoryId);
        const hay = U.norm(`${x.payee} ${x.note} ${(x.tags || []).join(' ')} ${c ? c.name : ''} ${x.method}`);
        if (!hay.includes(q) && x.amount !== qAmount) return false;
      }
      return true;
    }).sort(sortDesc);
  }

  function transactions() {
    const f = ui.tx;
    const tags = Store.tags();
    const periods = [['month', 'Par mois'], ['30d', '30 derniers jours'], ['90d', '90 derniers jours'], ['year', 'Cette année'], ['upcoming', 'À venir'], ['all', 'Tout']];
    if (f.period === 'range') periods.push(['range', `Du ${f.from ? U.fmtDate(f.from) : '…'} au ${f.to ? U.fmtDate(f.to) : '…'}`]);
    return {
      html: header('Opérations', { actions: `<button class="icon-btn" data-action="export-filtered" aria-label="Exporter la sélection en CSV">${ICON.download}</button>` }) + `
        <div class="filters">
          <label class="search">${ICON.search}<input type="search" id="tx-q" placeholder="Rechercher un libellé, une note, un montant…" value="${esc(f.q)}" aria-label="Rechercher"></label>
          <div class="filter-row">
            <select id="tx-period" aria-label="Période">${periods.map(([v, l]) => opt(v, l, f.period)).join('')}</select>
            <select id="tx-account" aria-label="Compte">${accountOptions(f.account, { empty: 'Tous les comptes', includeArchived: true })}</select>
            <select id="tx-category" aria-label="Catégorie">${opt('', 'Toutes catégories', f.category)}${opt('__none', '❔ Non catégorisé', f.category)}${categoryOptionsAll(f.category, null)}</select>
            <select id="tx-type" aria-label="Type">${[['', 'Tous types'], ['expense', 'Dépenses'], ['income', 'Revenus'], ['transfer', 'Virements']].map(([v, l]) => opt(v, l, f.type)).join('')}</select>
            <select id="tx-cleared" aria-label="Pointage">${[['', 'Pointées ou non'], ['1', 'Pointées'], ['0', 'Non pointées']].map(([v, l]) => opt(v, l, f.cleared)).join('')}</select>
            ${tags.length ? `<select id="tx-tag" aria-label="Étiquette">${opt('', 'Toutes étiquettes', f.tag)}${tags.map((x) => opt(x, `#${x}`, f.tag)).join('')}</select>` : ''}
          </div>
          ${f.period === 'month' ? monthNav(f.month, 'tx-month') : ''}
        </div>
        <div id="tx-results"></div>`,
      after() {
        renderTxResults();
        const q = $('#tx-q');
        q.addEventListener('input', U.debounce(() => { f.q = q.value; f.limit = 200; renderTxResults(); }, 150));
        const bind = (sel, key) => { const e = $(sel); if (e) e.addEventListener('change', () => { f[key] = e.value; f.limit = 200; if (key === 'period') render(); else renderTxResults(); }); };
        bind('#tx-period', 'period'); bind('#tx-account', 'account'); bind('#tx-category', 'category');
        bind('#tx-type', 'type'); bind('#tx-cleared', 'cleared'); bind('#tx-tag', 'tag');
      },
    };
  }

  function renderTxResults() {
    const box = $('#tx-results');
    if (!box) return;
    const list = filterTx(ui.tx);
    let inc = 0; let exp = 0;
    for (const x of list) { if (x.type === 'income') inc += x.amount; else if (x.type === 'expense') exp += x.amount; }
    const shown = list.slice(0, ui.tx.limit);
    box.innerHTML = `
      <div class="summary-bar">
        <span>${list.length} opération${list.length > 1 ? 's' : ''}</span>
        <span>Entrées ${signed(inc)}</span>
        <span>Sorties ${signed(-exp)}</span>
        <span>Net ${signed(inc - exp)}</span>
      </div>
      <section class="card flush">${txList(shown)}</section>
      ${list.length > shown.length ? '<button class="btn block" data-action="tx-more">Afficher plus</button>' : ''}`;
  }

  // ---------------------------------------------------------------- Budgets
  function budgets() {
    const mk = ui.budgetMonth;
    const t = U.today();
    const isCurrent = mk === U.monthKey(t);
    const dim = Number(U.monthEnd(mk).slice(8));
    const elapsed = isCurrent ? Number(t.slice(8)) / dim : mk < U.monthKey(t) ? 1 : 0;
    const rows = S().budgets.map((b) => ({ b, c: cat(b.categoryId), spent: Store.spentInCategory(b.categoryId, mk) }))
      .filter((r) => r.c).sort((x, y) => y.spent / y.b.amount - x.spent / x.b.amount);
    const totalBudget = rows.reduce((s, r) => s + r.b.amount, 0);
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
    const st = Store.stats(U.monthStart(mk), U.monthEnd(mk));
    const budgeted = new Set(rows.map((r) => r.b.categoryId));
    const unbudgeted = [...st.byCategory.entries()].filter(([id]) => !budgeted.has(id)).sort((a, b) => b[1] - a[1]);
    const daysLeft = isCurrent ? dim - Number(t.slice(8)) + 1 : 0;
    const remaining = totalBudget - totalSpent;

    const stateOf = (spent, amount) => (spent > amount ? 'over' : spent >= amount * 0.8 ? 'warn' : 'ok');
    const statusText = (spent, amount) => {
      const s = stateOf(spent, amount);
      if (s === 'over') return `<span class="status crit">⛔ Dépassé de ${money(spent - amount)}</span>`;
      if (s === 'warn') return `<span class="status warn">⚠️ Reste ${money(amount - spent)}</span>`;
      return `<span class="status ok">Reste ${money(amount - spent)}</span>`;
    };

    return {
      html: header('Budgets', { actions: `<button class="btn primary small" data-action="new-budget">${ICON.plus} Budget</button>` }) + `
        ${monthNav(mk, 'budget-month')}
        ${rows.length ? `<section class="card hero">
          <div class="hero-label">Budget total du mois</div>
          <div class="hero-value">${money(totalSpent)} <span class="muted hero-of">/ ${money(totalBudget)}</span></div>
          ${progress(totalSpent, totalBudget, { state: stateOf(totalSpent, totalBudget), marker: isCurrent ? elapsed : null, label: 'Budget total' })}
          <div class="hero-sub">${statusText(totalSpent, totalBudget)}${isCurrent && remaining > 0 ? ` · soit ${money(Math.floor(remaining / daysLeft))} par jour sur ${daysLeft} jour${daysLeft > 1 ? 's' : ''}` : ''}</div>
        </section>
        <section class="card">
          <ul class="list">${rows.map(({ b, c, spent }) => `<li><button class="row budget-row" data-action="edit-budget" data-id="${b.id}">
            <span class="row-icon" aria-hidden="true">${c.icon}</span>
            <span class="row-main">
              <span class="row-title between"><span>${esc(c.name)}</span><span>${money(spent)} <span class="muted">/ ${money(b.amount)}</span></span></span>
              ${progress(spent, b.amount, { state: stateOf(spent, b.amount), marker: isCurrent ? elapsed : null, label: c.name })}
              <span class="row-sub">${statusText(spent, b.amount)} · ${pct(spent, b.amount)} %</span>
            </span></button></li>`).join('')}</ul>
          ${isCurrent ? '<p class="hint small">Le trait vertical indique le rythme attendu à cette date du mois.</p>' : ''}
        </section>` : empty('Aucun budget défini. Fixez un plafond mensuel par catégorie pour garder le contrôle de vos dépenses.',
          '<div class="btn-col"><button class="btn primary" data-action="new-budget">Créer un budget</button><button class="btn" data-action="suggest-budgets">Proposer des budgets d\'après mes dépenses</button></div>')}
        ${unbudgeted.length ? `<section class="card">
          <div class="card-head"><h2>Dépenses hors budget</h2>${money(unbudgeted.reduce((s, [, v]) => s + v, 0))}</div>
          <ul class="list">${unbudgeted.map(([id, v]) => `<li class="row static">
            <span class="row-icon" aria-hidden="true">${cat(id)?.icon || '❔'}</span>
            <span class="row-main"><span class="row-title">${esc(cat(id)?.name || 'Non catégorisé')}</span></span>
            <span class="row-end">${money(v)}</span>
            ${id ? `<button class="btn small" data-action="quick-budget" data-cat="${id}">+ Budget</button>` : ''}</li>`).join('')}</ul>
        </section>` : ''}
        ${rows.length ? '<button class="btn block" data-action="suggest-budgets">Proposer des budgets manquants (moyenne 3 mois)</button>' : ''}`,
    };
  }

  // ---------------------------------------------------------------- Rapports
  const REPORT_PERIODS = { month: 'Ce mois', last: 'Mois dernier', '3m': '3 mois', '6m': '6 mois', '12m': '12 mois', ytd: 'Cette année', all: 'Tout' };
  function reportRange(p) {
    const mk = U.monthKey(U.today());
    switch (p) {
      case 'month': return [mk, mk];
      case 'last': { const k = U.shiftMonth(mk, -1); return [k, k]; }
      case '3m': return [U.shiftMonth(mk, -2), mk];
      case '6m': return [U.shiftMonth(mk, -5), mk];
      case '12m': return [U.shiftMonth(mk, -11), mk];
      case 'ytd': return [`${mk.slice(0, 4)}-01`, mk];
      default: {
        const dates = S().transactions.map((x) => x.date).sort();
        return [dates.length ? U.monthKey(dates[0]) : mk, mk];
      }
    }
  }

  function reports() {
    const r = ui.report;
    const [fromK, toK] = reportRange(r.period);
    const months = U.monthsBetween(fromK, toK);
    const from = U.monthStart(fromK);
    const to = U.monthEnd(toK);
    const st = Store.stats(from, to, { accountId: r.account });
    const net = st.income - st.expense;
    const cats = [...st.byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const incs = [...st.incomeByCategory.entries()].sort((a, b) => b[1] - a[1]);
    const payees = [...st.byPayee.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const avgExp = Math.round(st.expense / months.length);
    const avgInc = Math.round(st.income / months.length);
    const monthRows = months.map((k) => ({ k, ...(st.byMonth.get(k) || { income: 0, expense: 0 }) }));

    return {
      html: header('Rapports') + `
        <div class="chips" role="group" aria-label="Période">
          ${Object.entries(REPORT_PERIODS).map(([k, l]) => `<button class="chip${r.period === k ? ' active' : ''}" data-action="report-period" data-p="${k}" aria-pressed="${r.period === k}">${l}</button>`).join('')}
        </div>
        <div class="filter-row single"><select id="rp-account" aria-label="Compte">${accountOptions(r.account, { empty: 'Tous les comptes', includeArchived: true })}</select></div>
        <p class="muted small">Du ${U.fmtDate(from)} au ${U.fmtDate(to)} · les virements entre vos comptes sont exclus.</p>

        <section class="kpis four">
          <div class="kpi"><span class="kpi-label">Revenus</span><span class="kpi-value">${money(st.income)}</span><span class="kpi-sub">${money(avgInc)} / mois</span></div>
          <div class="kpi"><span class="kpi-label">Dépenses</span><span class="kpi-value">${money(st.expense)}</span><span class="kpi-sub">${money(avgExp)} / mois</span></div>
          <div class="kpi"><span class="kpi-label">Solde net</span><span class="kpi-value">${signed(net)}</span><span class="kpi-sub">${st.count} opérations</span></div>
          <div class="kpi"><span class="kpi-label">Taux d'épargne</span><span class="kpi-value">${st.income ? `${pct(net, st.income)} %` : '—'}</span><span class="kpi-sub">du revenu</span></div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Revenus et dépenses par mois</h2></div>
          <div class="legend"><span><i class="key s1"></i>Revenus</span><span><i class="key s2"></i>Dépenses</span></div>
          <div id="chart-io" class="chart"></div>
          <details class="table-view"><summary>Voir le tableau</summary>
            <table class="table"><thead><tr><th>Mois</th><th>Revenus</th><th>Dépenses</th><th>Solde</th></tr></thead><tbody>
            ${monthRows.map((m) => `<tr><td>${cap(U.monthLabel(m.k, true))}</td><td>${money(m.income)}</td><td>${money(m.expense)}</td><td>${signed(m.income - m.expense)}</td></tr>`).join('')}
            </tbody></table>
          </details>
        </section>

        <section class="card">
          <div class="card-head"><h2>${r.account ? 'Évolution du solde' : 'Évolution du patrimoine'}</h2></div>
          <div id="chart-bal" class="chart"></div>
        </section>

        <div class="cols">
          <section class="card">
            <div class="card-head"><h2>Dépenses par catégorie</h2>${money(st.expense)}</div>
            ${cats.length ? hbars(cats.map(([id, v]) => ({ id: id || '__none', label: catName(id), value: v, share: pct(v, st.expense) })), cats[0][1], 'goto-cat') : empty('Aucune dépense sur la période.')}
          </section>
          <div>
            <section class="card">
              <div class="card-head"><h2>Revenus par catégorie</h2>${money(st.income)}</div>
              ${incs.length ? hbars(incs.map(([id, v]) => ({ id: id || '__none', label: catName(id), value: v, share: pct(v, st.income) })), incs[0][1], 'goto-cat') : empty('Aucun revenu sur la période.')}
            </section>
            <section class="card">
              <div class="card-head"><h2>Principaux bénéficiaires</h2></div>
              ${payees.length ? hbars(payees.map(([p, v]) => ({ label: p, value: v, share: pct(v, st.expense) })), payees[0][1]) : empty('—')}
            </section>
          </div>
        </div>`,
      after() {
        $('#rp-account').addEventListener('change', (e) => { r.account = e.target.value; render(); });
        Charts.bars($('#chart-io'), monthRows.map((m) => ({
          label: U.monthLabel(m.k), tipLabel: cap(U.monthLabel(m.k, true)), values: [m.income, m.expense],
          extra: `Solde ${moneyTxt(m.income - m.expense, { sign: true })}`,
        })), [{ name: 'Revenus', cls: 's1' }, { name: 'Dépenses', cls: 's2' }],
        { format: moneyTxt, formatTick: (v) => moneyTxt(v, { compact: true }), label: 'Revenus et dépenses par mois' });
        const bm = months.length >= 2 ? months : [U.shiftMonth(fromK, -1), ...months];
        const series = Store.balanceSeries(bm, r.account || null);
        Charts.line($('#chart-bal'), bm.map((k, i) => ({ label: U.monthLabel(k), tipLabel: `Fin ${U.monthLabel(k, true)}`, value: series[i] })),
          { format: moneyTxt, formatTick: (v) => moneyTxt(v, { compact: true }), label: 'Évolution du solde' });
      },
    };
  }

  // ---------------------------------------------------------------- Plus
  function more() {
    const items = [
      ['#/recurring', '🔁', 'Échéancier', 'Opérations récurrentes : salaire, loyer, abonnements…'],
      ['#/goals', '🎯', "Objectifs d'épargne", 'Suivez vos projets et le montant à mettre de côté'],
      ['#/categories', '🏷️', 'Catégories', 'Personnalisez vos catégories de dépenses et revenus'],
      ['#/rules', '🪄', 'Règles automatiques', 'Catégorisez automatiquement selon le libellé'],
      ['#/data', '💾', 'Import, export et sauvegarde', 'Relevés CSV, sauvegarde JSON, données de démo'],
      ['#/settings', '⚙️', 'Paramètres', 'Devise, thème, code PIN, confidentialité'],
    ];
    return {
      html: header('Plus') + `<section class="card"><ul class="list">${items.map(([href, icon, title, sub]) => `
        <li><a class="row" href="${href}"><span class="row-icon" aria-hidden="true">${icon}</span>
        <span class="row-main"><span class="row-title">${title}</span><span class="row-sub">${sub}</span></span>
        <span class="row-end chev">${ICON.chevron}</span></a></li>`).join('')}</ul></section>
        ${installPrompt ? '<button class="btn block primary" data-action="install-app">📲 Installer l\'application</button>' : ''}
        <p class="muted small center">Mes Comptes · données stockées localement sur cet appareil</p>`,
    };
  }

  // ---------------------------------------------------------------- Échéancier
  const monthlyFactor = (r) => {
    const n = r.interval || 1;
    return { daily: 365 / 12, weekly: 52 / 12, monthly: 1, yearly: 1 / 12 }[r.frequency] / n;
  };
  function recurring() {
    const t = U.today();
    const list = [...S().recurring].sort((a, b) => (Store.isActive(b) - Store.isActive(a)) || (a.nextDate || '').localeCompare(b.nextDate || ''));
    const active = list.filter(Store.isActive);
    const mIn = active.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount * monthlyFactor(r), 0);
    const mOut = active.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount * monthlyFactor(r), 0);
    const row = (r) => {
      const c = cat(r.categoryId);
      const isTr = r.type === 'transfer';
      const on = Store.isActive(r);
      const due = on && r.nextDate <= t && !r.auto;
      const val = isTr ? `<span class="amt neutral">${moneyTxt(r.amount)}</span>` : signed(r.type === 'income' ? r.amount : -r.amount);
      const accName = isTr ? `${acc(r.accountId)?.name ?? '?'} → ${acc(r.toAccountId)?.name ?? '?'}` : acc(r.accountId)?.name ?? '?';
      return `<li class="rec-item${on ? '' : ' off'}">
        <button class="row" data-action="edit-recurring" data-id="${r.id}">
          <span class="row-icon" aria-hidden="true">${isTr ? '⇄' : c ? c.icon : '🔁'}</span>
          <span class="row-main"><span class="row-title">${esc(r.payee || (c ? c.name : 'Échéance'))}</span>
          <span class="row-sub">${Store.frequencyLabel(r)} · ${esc(accName)}</span>
          <span class="row-sub">${on ? `Prochaine : ${U.fmtDate(r.nextDate)}` : r.paused ? 'En pause' : 'Terminée'}
            ${on ? (r.auto ? ' · <span class="badge">Auto</span>' : ' · <span class="badge">Manuelle</span>') : ''}
            ${due ? ' <span class="badge crit">À valider</span>' : ''}</span></span>
          <span class="row-end">${val}</span>
        </button>
        ${due ? `<div class="btn-row inset"><button class="btn small primary" data-action="post-recurring" data-id="${r.id}">✓ Valider l'opération</button><button class="btn small" data-action="skip-recurring" data-id="${r.id}">Ignorer cette fois</button></div>` : ''}
      </li>`;
    };
    return {
      html: header('Échéancier', { back: '#/more', actions: `<button class="btn primary small" data-action="new-recurring">${ICON.plus} Échéance</button>` }) + `
        ${list.length ? `<section class="kpis">
          <div class="kpi"><span class="kpi-label">Revenus fixes / mois</span><span class="kpi-value">${money(Math.round(mIn))}</span></div>
          <div class="kpi"><span class="kpi-label">Charges fixes / mois</span><span class="kpi-value">${money(Math.round(mOut))}</span></div>
          <div class="kpi"><span class="kpi-label">Reste à vivre</span><span class="kpi-value">${signed(Math.round(mIn - mOut))}</span></div>
        </section>
        <section class="card"><ul class="list">${list.map(row).join('')}</ul></section>
        <p class="hint small">Les échéances « Auto » sont saisies automatiquement à leur date. Les « Manuelles » attendent votre validation (utile pour les montants variables).</p>`
        : empty('Aucune opération récurrente. Ajoutez votre salaire, loyer, abonnements… pour anticiper votre solde.', '<button class="btn primary" data-action="new-recurring">Ajouter une échéance</button>')}`,
    };
  }

  // ---------------------------------------------------------------- Objectifs
  function monthsLeft(deadline) {
    const t = U.today();
    const [y1, m1] = t.split('-').map(Number);
    const [y2, m2] = deadline.split('-').map(Number);
    return Math.max(1, (y2 - y1) * 12 + (m2 - m1));
  }
  function goals() {
    const list = S().goals;
    const card = (g) => {
      const saved = Store.goalSaved(g);
      const done = saved >= g.target;
      const left = g.target - saved;
      const deadline = g.deadline ? `Échéance : ${U.fmtDate(g.deadline)}${!done && g.deadline > U.today() ? ` · ${money(Math.ceil(left / monthsLeft(g.deadline)))} / mois nécessaires` : ''}` : 'Sans échéance';
      return `<section class="card goal">
        <div class="card-head"><h2><span aria-hidden="true">${esc(g.icon || '🎯')}</span> ${esc(g.name)}</h2>
          <button class="icon-btn" data-action="edit-goal" data-id="${g.id}" aria-label="Modifier l'objectif">${ICON.edit}</button></div>
        <div class="goal-amounts">${money(saved)} <span class="muted">/ ${money(g.target)}</span> <strong>${pct(saved, g.target)} %</strong></div>
        ${progress(saved, g.target, { state: done ? 'done' : 'ok', label: g.name })}
        <p class="row-sub">${done ? '🎉 Objectif atteint !' : `Reste ${money(left)}`} · ${deadline}</p>
        <p class="row-sub">${g.accountId ? `Suivi via le compte « ${esc(acc(g.accountId)?.name || '?')} »` : 'Suivi manuel'}</p>
        ${g.accountId ? '' : `<div class="btn-row"><button class="btn small primary" data-action="contribute-goal" data-id="${g.id}">+ Versement</button><button class="btn small" data-action="contribute-goal" data-id="${g.id}" data-withdraw="1">− Retrait</button></div>`}
      </section>`;
    };
    return {
      html: header("Objectifs d'épargne", { back: '#/more', actions: `<button class="btn primary small" data-action="new-goal">${ICON.plus} Objectif</button>` }) +
        (list.length ? list.map(card).join('') : empty('Aucun objectif. Vacances, voiture, apport immobilier, épargne de précaution… fixez-vous un cap !', '<button class="btn primary" data-action="new-goal">Créer un objectif</button>')),
    };
  }

  // ---------------------------------------------------------------- Catégories
  function categories() {
    const count = new Map();
    S().transactions.forEach((x) => { if (x.categoryId) count.set(x.categoryId, (count.get(x.categoryId) || 0) + 1); });
    const section = (type, title) => `<section class="card"><div class="card-head"><h2>${title}</h2></div><ul class="list">
      ${S().categories.filter((c) => c.type === type).sort(byName).map((c) => `<li><button class="row" data-action="edit-category" data-id="${c.id}">
        <span class="row-icon" aria-hidden="true">${esc(c.icon)}</span><span class="row-main"><span class="row-title">${esc(c.name)}</span></span>
        <span class="row-end muted small">${count.get(c.id) || 0} op.</span></button></li>`).join('')}</ul></section>`;
    return {
      html: header('Catégories', { back: '#/more', actions: `<button class="btn primary small" data-action="new-category">${ICON.plus} Catégorie</button>` }) +
        `<div class="cols">${section('expense', 'Dépenses')}${section('income', 'Revenus')}</div>`,
    };
  }

  // ---------------------------------------------------------------- Règles
  function rules() {
    const list = S().rules;
    return {
      html: header('Règles automatiques', { back: '#/more', actions: `<button class="btn primary small" data-action="new-rule">${ICON.plus} Règle</button>` }) + `
        <p class="hint">Quand le libellé d'une opération contient le texte indiqué, la catégorie est proposée automatiquement (saisie et import de relevés). Sans règle, la dernière catégorie utilisée pour ce tiers est reprise.</p>
        ${list.length ? `<section class="card"><ul class="list">${list.map((r) => `<li><button class="row" data-action="edit-rule" data-id="${r.id}">
          <span class="row-icon" aria-hidden="true">🪄</span>
          <span class="row-main"><span class="row-title">« ${esc(r.pattern)} »</span><span class="row-sub">→ ${esc(catName(r.categoryId))}</span></span></button></li>`).join('')}</ul></section>` : empty('Aucune règle.')}
        <button class="btn block" data-action="apply-rules">Appliquer aux opérations non catégorisées</button>`,
    };
  }

  // ---------------------------------------------------------------- Données
  function data() {
    const s = S();
    let size = 0;
    try { size = (localStorage.getItem('mescomptes.data.v1') || '').length; } catch { /* ignore */ }
    return {
      html: header('Import, export et sauvegarde', { back: '#/more' }) + `
        <section class="card">
          <p class="muted">${s.accounts.length} comptes · ${s.transactions.length} opérations · ${(size / 1024).toFixed(0)} Ko utilisés</p>
          <div class="btn-col">
            <button class="btn" data-action="import-csv">📥 Importer un relevé bancaire (CSV)</button>
            <button class="btn" data-action="export-csv">📤 Exporter toutes les opérations (CSV / Excel)</button>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Sauvegarde</h2></div>
          <p class="hint">Vos données ne quittent jamais cet appareil. Pensez à sauvegarder régulièrement, et restaurez le fichier pour les transférer sur un autre appareil.</p>
          <div class="btn-col">
            <button class="btn primary" data-action="export-json">💾 Télécharger une sauvegarde complète</button>
            <button class="btn" data-action="import-json">♻️ Restaurer une sauvegarde</button>
          </div>
        </section>
        <section class="card danger-zone">
          <div class="card-head"><h2>Zone sensible</h2></div>
          <div class="btn-col">
            <button class="btn" data-action="load-demo">🧪 Charger les données de démonstration</button>
            <button class="btn danger" data-action="reset-all">🗑️ Tout effacer</button>
          </div>
        </section>`,
    };
  }

  // ---------------------------------------------------------------- Paramètres
  const CURRENCIES = [['EUR', 'Euro (€)'], ['USD', 'Dollar US ($)'], ['GBP', 'Livre sterling (£)'], ['CHF', 'Franc suisse (CHF)'], ['CAD', 'Dollar canadien ($ CA)'], ['XOF', 'Franc CFA BCEAO (F CFA)'], ['XAF', 'Franc CFA BEAC (FCFA)'], ['MAD', 'Dirham marocain (MAD)'], ['TND', 'Dinar tunisien (TND)'], ['DZD', 'Dinar algérien (DZD)'], ['JPY', 'Yen (¥)'], ['CNY', 'Yuan (CNY)']];
  function settings() {
    const st = S().settings;
    return {
      html: header('Paramètres', { back: '#/more' }) + `
        <section class="card form">
          <label class="field"><span>Devise</span><select data-setting="currency">${CURRENCIES.map(([c, l]) => opt(c, l, st.currency)).join('')}</select></label>
          <div class="field"><span>Thème</span>
            <div class="seg">${[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => `<label><input type="radio" name="theme" data-setting="theme" value="${v}" ${st.theme === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
          </div>
          <label class="check"><input type="checkbox" data-setting="hideAmounts" ${st.hideAmounts ? 'checked' : ''}> Masquer les montants (mode discret en public)</label>
        </section>
        <section class="card">
          <div class="card-head"><h2>Verrouillage</h2><span class="badge${st.pinHash ? ' good' : ''}">${st.pinHash ? '🔒 Activé' : 'Désactivé'}</span></div>
          <p class="hint">Un code PIN protège l'accès à l'application sur cet appareil.</p>
          <div class="btn-row wrap">
            <button class="btn primary small" data-action="set-pin">${st.pinHash ? 'Changer le code PIN' : 'Définir un code PIN'}</button>
            ${st.pinHash ? '<button class="btn small" data-action="remove-pin">Supprimer le code</button>' : ''}
          </div>
          ${st.pinHash ? `<label class="field"><span>Reverrouiller après</span><select data-setting="lockDelay">${[[0, 'Immédiatement'], [60, '1 minute'], [300, '5 minutes'], [900, '15 minutes']].map(([v, l]) => opt(v, l, st.lockDelay)).join('')}</select></label>` : ''}
        </section>
        ${installPrompt ? '<button class="btn block primary" data-action="install-app">📲 Installer l\'application</button>' : ''}`,
    };
  }

  // ======================================================================
  // Panneaux (formulaires)
  // ======================================================================
  let lastFocus = null;
  function openSheet(title, body, onMount) {
    Charts.hideTip();
    lastFocus = document.activeElement;
    const root = $('#sheet-root');
    root.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header class="sheet-head"><h2 id="sheet-title">${esc(title)}</h2><button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">✕</button></header>
        <div class="sheet-body">${body}</div>
      </div>`;
    root.classList.add('open');
    document.body.classList.add('no-scroll');
    const sheet = $('.sheet', root);
    onMount?.(sheet);
    const first = sheet.querySelector('[autofocus]') || sheet.querySelector('input:not([type=radio]):not([type=checkbox]), select, textarea');
    setTimeout(() => first?.focus(), 50);
  }
  function closeSheet() {
    const root = $('#sheet-root');
    root.classList.remove('open');
    root.innerHTML = '';
    document.body.classList.remove('no-scroll');
    lastFocus?.focus?.();
  }
  function onSubmit(form, fn) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try { fn(new FormData(form)); } catch (err) {
        const box = form.querySelector('.form-error');
        box.textContent = err.message;
        box.hidden = false;
      }
    });
  }
  const formEnd = (buttons) => `<p class="form-error" role="alert" hidden></p><div class="form-actions">${buttons}</div>`;

  // ---- Champs communs opération / échéance
  function opFields(t, { recurring: isRec = false } = {}) {
    const types = [['expense', 'Dépense'], ['income', 'Revenu'], ['transfer', 'Virement']];
    return `
      <div class="seg" role="radiogroup" aria-label="Type d'opération">
        ${types.map(([v, l]) => `<label><input type="radio" name="type" value="${v}" ${t.type === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
      <label class="field amount-field"><span>Montant</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${t.amount ? U.centsToInput(t.amount) : ''}" required autofocus></label>
      <div class="grid2">
        <label class="field"><span><span class="no-transfer">Compte</span><span class="only-transfer">Depuis le compte</span></span><select name="accountId" required>${accountOptions(t.accountId)}</select></label>
        <label class="field only-transfer"><span>Vers le compte</span><select name="toAccountId">${accountOptions(t.toAccountId, { empty: 'Choisir…' })}</select></label>
        ${isRec ? '' : `<label class="field"><span>Date</span><input type="date" name="date" value="${t.date}" required></label>`}
      </div>
      <label class="field"><span>Tiers / libellé</span><input name="payee" list="payee-list" autocomplete="off" value="${esc(t.payee)}" placeholder="ex. Carrefour, Loyer, Employeur…"></label>
      <datalist id="payee-list">${Store.payees().slice(0, 300).map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
      <label class="field no-transfer"><span>Catégorie</span><select name="categoryId"></select></label>
      <div class="grid2">
        <label class="field"><span>Moyen de paiement</span><select name="method">${opt('', '—', t.method)}${Store.PAYMENT_METHODS.map((m) => opt(m, m, t.method)).join('')}</select></label>
        <label class="field"><span>Étiquettes</span><input name="tags" value="${esc((t.tags || []).join(', '))}" placeholder="ex. vacances, pro"></label>
      </div>
      <label class="field"><span>Note</span><textarea name="note" rows="2">${esc(t.note)}</textarea></label>`;
  }
  function bindOpForm(form, t) {
    const f = form.elements;
    const fill = () => {
      const type = f.type.value;
      form.dataset.type = type;
      const current = f.categoryId.value || t.categoryId || '';
      f.categoryId.innerHTML = categoryOptions(type === 'income' ? 'income' : 'expense', current);
    };
    form.addEventListener('change', (e) => { if (e.target.name === 'type') fill(); });
    f.payee.addEventListener('change', () => {
      if (f.type.value === 'transfer' || f.categoryId.value) return;
      const c = Store.categoryFor(f.payee.value, f.type.value);
      if (c) f.categoryId.value = c;
    });
    fill();
  }
  function readOp(fd) {
    const type = fd.get('type');
    const amount = Math.abs(U.parseAmount(fd.get('amount')));
    if (!amount) throw new Error('Saisissez un montant valide (ex. 12,50).');
    const accountId = fd.get('accountId');
    if (!accountId) throw new Error('Choisissez un compte.');
    const toAccountId = fd.get('toAccountId');
    if (type === 'transfer') {
      if (!toAccountId) throw new Error('Choisissez le compte de destination.');
      if (toAccountId === accountId) throw new Error('Les comptes de départ et de destination doivent être différents.');
    }
    return {
      type, amount, accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : fd.get('categoryId') || null,
      payee: String(fd.get('payee') || '').trim(),
      note: String(fd.get('note') || '').trim(),
      tags: String(fd.get('tags') || '').split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean),
      method: fd.get('method') || '',
    };
  }
  const defaultAccount = () => {
    const active = S().accounts.filter((a) => !a.archived);
    return (ui.lastAccount && active.find((a) => a.id === ui.lastAccount)?.id) || active[0]?.id || '';
  };
  const requireAccount = () => {
    if (S().accounts.some((a) => !a.archived)) return true;
    toast("Créez d'abord un compte.");
    accountForm();
    return false;
  };

  // ---- Opération
  function txForm(tx = null, preset = {}) {
    if (!requireAccount()) return;
    const isNew = !tx;
    const t = tx ? { ...tx } : {
      type: 'expense', amount: 0, date: U.today(), accountId: defaultAccount(), toAccountId: '', categoryId: '', payee: '', note: '', tags: [], method: 'Carte', cleared: false, ...preset,
    };
    openSheet(isNew ? 'Nouvelle opération' : "Modifier l'opération", `
      <form class="form" data-type="${t.type}" novalidate>
        ${opFields(t)}
        <label class="check"><input type="checkbox" name="cleared" ${t.cleared ? 'checked' : ''}> Pointée (présente sur le relevé bancaire)</label>
        ${isNew ? `<label class="field"><span>Répéter</span><select name="repeat">${opt('', 'Non, opération unique', '')}${opt('weekly', 'Chaque semaine', '')}${opt('monthly', 'Chaque mois', '')}${opt('yearly', 'Chaque année', '')}</select></label>` : ''}
        ${tx?.recurringId ? '<p class="hint small">🔁 Générée par une échéance.</p>' : ''}
        ${formEnd(`${isNew ? '' : '<button type="button" class="btn danger" data-action="delete-tx">Supprimer</button><button type="button" class="btn" data-action="duplicate-tx">Dupliquer</button>'}<button type="submit" class="btn primary">Enregistrer</button>`)}
      </form>`, (sheet) => {
      const form = $('form', sheet);
      bindOpForm(form, t);
      onSubmit(form, (fd) => {
        const op = readOp(fd);
        const date = fd.get('date');
        if (!date) throw new Error('Choisissez une date.');
        Store.upsert('transactions', { ...op, id: tx?.id, date, cleared: fd.get('cleared') === 'on', recurringId: tx?.recurringId || null });
        ui.lastAccount = op.accountId;
        const repeat = fd.get('repeat');
        if (repeat) {
          const anchorDay = Number(date.slice(8));
          const r = { ...op, frequency: repeat, interval: 1, anchorDay, auto: true, paused: false, endDate: null };
          r.nextDate = Store.nextOccurrence(r, date);
          Store.upsert('recurring', r);
        }
        closeSheet();
        toast(isNew ? 'Opération ajoutée' : 'Opération modifiée');
      });
      sheet.addEventListener('click', (e) => {
        const a = e.target.closest('[data-action]')?.dataset.action;
        if (a === 'delete-tx' && confirm('Supprimer cette opération ?')) {
          Store.remove('transactions', tx.id);
          closeSheet();
          toast('Opération supprimée');
        } else if (a === 'duplicate-tx') {
          e.stopPropagation();
          const { id, createdAt, recurringId, ...rest } = tx;
          closeSheet();
          txForm(null, { ...rest, date: U.today(), cleared: false });
        }
      });
    });
  }

  // ---- Compte
  function accountForm(a = null) {
    const isNew = !a;
    const x = a || { name: '', type: 'checking', initialBalance: 0, color: Store.ACCOUNT_COLORS[S().accounts.length % 8], bank: '', number: '', archived: false };
    const n = a ? S().transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length : 0;
    openSheet(isNew ? 'Nouveau compte' : 'Modifier le compte', `
      <form class="form" novalidate>
        <label class="field"><span>Nom du compte</span><input name="name" required value="${esc(x.name)}" placeholder="ex. Compte courant, Livret A…" autofocus></label>
        <div class="grid2">
          <label class="field"><span>Type</span><select name="type">${Object.entries(Store.ACCOUNT_TYPES).map(([v, l]) => opt(v, l, x.type)).join('')}</select></label>
          <label class="field"><span>Solde initial</span><input name="initialBalance" inputmode="decimal" value="${U.centsToInput(x.initialBalance || 0)}"></label>
        </div>
        <p class="hint small">Solde initial : le solde du compte avant la première opération saisie (négatif pour une carte de crédit ou un prêt).</p>
        <div class="grid2">
          <label class="field"><span>Banque</span><input name="bank" value="${esc(x.bank)}" placeholder="facultatif"></label>
          <label class="field"><span>N° / IBAN</span><input name="number" value="${esc(x.number)}" placeholder="facultatif, ex. •••• 1234"></label>
        </div>
        <fieldset class="field"><legend>Couleur</legend><div class="swatches">
          ${Store.ACCOUNT_COLORS.map((c, i) => `<label><input type="radio" name="color" value="${c}" ${x.color === c ? 'checked' : ''} aria-label="Couleur ${i + 1}"><span style="background:${c}"></span></label>`).join('')}
        </div></fieldset>
        ${isNew ? '' : `<label class="check"><input type="checkbox" name="archived" ${x.archived ? 'checked' : ''}> Archiver (compte clôturé, masqué des listes)</label>`}
        ${formEnd(`${isNew ? '' : '<button type="button" class="btn danger" data-action="delete-account">Supprimer</button>'}<button type="submit" class="btn primary">Enregistrer</button>`)}
      </form>`, (sheet) => {
      const form = $('form', sheet);
      onSubmit(form, (fd) => {
        const name = String(fd.get('name')).trim();
        if (!name) throw new Error('Donnez un nom au compte.');
        const ib = U.parseAmount(fd.get('initialBalance') || '0');
        if (Number.isNaN(ib)) throw new Error('Solde initial invalide.');
        const saved = Store.upsert('accounts', {
          id: a?.id, name, type: fd.get('type'), initialBalance: ib, bank: String(fd.get('bank')).trim(), number: String(fd.get('number')).trim(),
          color: fd.get('color') || x.color, archived: fd.get('archived') === 'on',
        });
        closeSheet();
        toast(isNew ? 'Compte créé' : 'Compte modifié');
        if (isNew) location.hash = `#/account/${saved.id}`;
      });
      sheet.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')?.dataset.action !== 'delete-account') return;
        if (confirm(`Supprimer « ${a.name} » et ses ${n} opération(s) ? Cette action est irréversible.\n\nAstuce : vous pouvez plutôt l'archiver.`)) {
          Store.removeAccount(a.id);
          closeSheet();
          location.hash = '#/accounts';
          toast('Compte supprimé');
        }
      });
    });
  }

  function adjustForm(id) {
    const a = acc(id);
    const b = Store.balance(id, U.today());
    openSheet('Ajuster le solde', `
      <form class="form" novalidate>
        <p class="hint">Solde actuel dans l'application : <strong>${money(b)}</strong>. Saisissez le solde réel affiché par votre banque : une opération d'ajustement sera créée pour la différence.</p>
        <label class="field amount-field"><span>Solde réel de « ${esc(a.name)} »</span><input name="real" inputmode="decimal" required autofocus value="${U.centsToInput(b)}"></label>
        ${formEnd('<button type="submit" class="btn primary">Ajuster</button>')}
      </form>`, (sheet) => {
      onSubmit($('form', sheet), (fd) => {
        const real = U.parseAmount(fd.get('real'));
        if (Number.isNaN(real)) throw new Error('Montant invalide.');
        const diff = real - b;
        if (diff) {
          Store.upsert('transactions', { type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), accountId: id, toAccountId: null, categoryId: null, payee: 'Ajustement de solde', note: '', tags: [], method: '', cleared: true, date: U.today() });
        }
        closeSheet();
        toast(diff ? `Ajustement de ${moneyTxt(diff, { sign: true })}` : 'Le solde était déjà juste 👍');
      });
    });
  }

  // ---- Budget
  function budgetForm(b = null, presetCat = '') {
    const used = new Set(S().budgets.filter((x) => x.id !== b?.id).map((x) => x.categoryId));
    const avail = S().categories.filter((c) => c.type === 'expense' && !used.has(c.id)).sort(byName);
    if (!b && !avail.length) { toast('Toutes les catégories ont déjà un budget.'); return; }
    const catId = b?.categoryId || presetCat || avail[0]?.id;
    // Moyenne des 3 derniers mois pour aider à fixer le montant.
    const mk = U.monthKey(U.today());
    const avg = (id) => Math.round([1, 2, 3].reduce((s, k) => s + Store.spentInCategory(id, U.shiftMonth(mk, -k)), 0) / 3);
    openSheet(b ? 'Modifier le budget' : 'Nouveau budget', `
      <form class="form" novalidate>
        <label class="field"><span>Catégorie</span><select name="categoryId">${avail.map((c) => opt(c.id, `${c.icon} ${c.name}`, catId)).join('')}</select></label>
        <label class="field amount-field"><span>Plafond mensuel</span><input name="amount" inputmode="decimal" required autofocus value="${b ? U.centsToInput(b.amount) : ''}" placeholder="0,00"></label>
        <p class="hint small" id="avg-hint"></p>
        ${formEnd(`${b ? '<button type="button" class="btn danger" data-action="delete-budget">Supprimer</button>' : ''}<button type="submit" class="btn primary">Enregistrer</button>`)}
      </form>`, (sheet) => {
      const form = $('form', sheet);
      const hint = () => { $('#avg-hint', sheet).innerHTML = `Moyenne des 3 derniers mois : <strong>${money(avg(form.elements.categoryId.value))}</strong>`; };
      form.elements.categoryId.addEventListener('change', hint);
      hint();
      onSubmit(form, (fd) => {
        const amount = Math.abs(U.parseAmount(fd.get('amount')));
        if (!amount) throw new Error('Saisissez un montant.');
        Store.upsert('budgets', { id: b?.id, categoryId: fd.get('categoryId'), amount });
        closeSheet();
        toast('Budget enregistré');
      });
      sheet.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')?.dataset.action === 'delete-budget' && confirm('Supprimer ce budget ?')) {
          Store.remove('budgets', b.id);
          closeSheet();
        }
      });
    });
  }

  function suggestBudgets() {
    const mk = U.monthKey(U.today());
    const used = new Set(S().budgets.map((b) => b.categoryId));
    const proposals = [];
    for (const c of S().categories.filter((x) => x.type === 'expense' && !used.has(x.id))) {
      const avg = [1, 2, 3].reduce((s, k) => s + Store.spentInCategory(c.id, U.shiftMonth(mk, -k)), 0) / 3;
      if (avg >= 500) proposals.push({ categoryId: c.id, amount: Math.ceil(avg / 1000) * 1000 });
    }
    if (!proposals.length) { toast('Pas assez d\'historique pour proposer des budgets.'); return; }
    const list = proposals.map((p) => `${catName(p.categoryId)} : ${moneyTxt(p.amount)}`).join('\n');
    if (!confirm(`Créer ${proposals.length} budget(s) d'après vos dépenses moyennes ?\n\n${list}`)) return;
    proposals.forEach((p) => Store.upsert('budgets', p, { silent: true }));
    Store.save();
    toast(`${proposals.length} budget(s) créé(s)`);
  }

  // ---- Échéance
  function recurringForm(r = null) {
    if (!requireAccount()) return;
    const t = r ? { ...r } : { type: 'expense', amount: 0, accountId: defaultAccount(), toAccountId: '', categoryId: '', payee: '', note: '', tags: [], method: 'Prélèvement', frequency: 'monthly', interval: 1, nextDate: U.today(), endDate: '', auto: true, paused: false };
    openSheet(r ? "Modifier l'échéance" : 'Nouvelle échéance', `
      <form class="form" data-type="${t.type}" novalidate>
        ${opFields(t, { recurring: true })}
        <div class="grid2">
          <label class="field"><span>Fréquence</span><select name="frequency">${Object.entries({ daily: 'Quotidienne', weekly: 'Hebdomadaire', monthly: 'Mensuelle', yearly: 'Annuelle' }).map(([v, l]) => opt(v, l, t.frequency)).join('')}</select></label>
          <label class="field"><span>Tous les… (intervalle)</span><input name="interval" type="number" min="1" max="99" value="${t.interval || 1}"></label>
          <label class="field"><span>Prochaine échéance</span><input type="date" name="nextDate" required value="${t.nextDate || U.today()}"></label>
          <label class="field"><span>Date de fin (facultatif)</span><input type="date" name="endDate" value="${t.endDate || ''}"></label>
        </div>
        <label class="check"><input type="checkbox" name="auto" ${t.auto ? 'checked' : ''}> Saisie automatique à l'échéance</label>
        <label class="check"><input type="checkbox" name="paused" ${t.paused ? 'checked' : ''}> Mettre en pause</label>
        ${formEnd(`${r ? '<button type="button" class="btn danger" data-action="delete-recurring">Supprimer</button>' : ''}<button type="submit" class="btn primary">Enregistrer</button>`)}
      </form>`, (sheet) => {
      const form = $('form', sheet);
      bindOpForm(form, t);
      onSubmit(form, (fd) => {
        const op = readOp(fd);
        const nextDate = fd.get('nextDate');
        if (!nextDate) throw new Error('Indiquez la prochaine échéance.');
        const endDate = fd.get('endDate') || null;
        if (endDate && endDate < nextDate) throw new Error('La date de fin est antérieure à la prochaine échéance.');
        Store.upsert('recurring', {
          ...op, id: r?.id, frequency: fd.get('frequency'), interval: Math.max(1, Number(fd.get('interval')) || 1),
          nextDate, anchorDay: Number(nextDate.slice(8)), endDate, auto: fd.get('auto') === 'on', paused: fd.get('paused') === 'on',
        });
        const created = Store.processRecurring();
        closeSheet();
        toast(created ? `Échéance enregistrée · ${created} opération(s) générée(s)` : 'Échéance enregistrée');
      });
      sheet.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')?.dataset.action === 'delete-recurring' && confirm('Supprimer cette échéance ? Les opérations déjà saisies sont conservées.')) {
          Store.remove('recurring', r.id);
          closeSheet();
        }
      });
    });
  }

  // ---- Objectif
  function goalForm(g = null) {
    const x = g || { name: '', icon: '🎯', target: 0, deadline: '', accountId: null };
    openSheet(g ? "Modifier l'objectif" : 'Nouvel objectif', `
      <form class="form" novalidate>
        <div class="grid-icon">
          <label class="field"><span>Icône</span><input name="icon" value="${esc(x.icon)}" maxlength="4" class="icon-input"></label>
          <label class="field"><span>Nom</span><input name="name" required value="${esc(x.name)}" placeholder="ex. Vacances, Voiture…" autofocus></label>
        </div>
        <div class="grid2">
          <label class="field"><span>Montant visé</span><input name="target" inputmode="decimal" required value="${x.target ? U.centsToInput(x.target) : ''}" placeholder="0,00"></label>
          <label class="field"><span>Échéance (facultatif)</span><input type="date" name="deadline" value="${x.deadline || ''}"></label>
        </div>
        <label class="field"><span>Suivi</span><select name="accountId">${opt('', 'Manuel (versements saisis ici)', x.accountId)}${S().accounts.filter((a) => !a.archived).map((a) => opt(a.id, `Solde du compte « ${a.name} »`, x.accountId)).join('')}</select></label>
        ${formEnd(`${g ? '<button type="button" class="btn danger" data-action="delete-goal">Supprimer</button>' : ''}<button type="submit" class="btn primary">Enregistrer</button>`)}
      </form>`, (sheet) => {
      const form = $('form', sheet);
      onSubmit(form, (fd) => {
        const name = String(fd.get('name')).trim();
        const target = Math.abs(U.parseAmount(fd.get('target')));
        if (!name) throw new Error("Donnez un nom à l'objectif.");
        if (!target) throw new Error('Indiquez le montant visé.');
        Store.upsert('goals', { id: g?.id, name, icon: String(fd.get('icon')).trim() || '🎯', target, deadline: fd.get('deadline') || null, accountId: fd.get('accountId') || null, contributions: g?.contributions || [] });
        closeSheet();
        toast('Objectif enregistré');
      });
      sheet.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')?.dataset.action === 'delete-goal' && confirm('Supprimer cet objectif ?')) {
          Store.remove('goals', g.id);
          closeSheet();
        }
      });
    });
  }
  function contributeForm(g, withdraw) {
    openSheet(withdraw ? `Retrait · ${g.name}` : `Versement · ${g.name}`, `
      <form class="form" novalidate>
        <label class="field amount-field"><span>Montant</span><input name="amount" inputmode="decimal" required autofocus placeholder="0,00"></label>
        <label class="field"><span>Date</span><input type="date" name="date" value="${U.today()}"></label>
        ${formEnd('<button type="submit" class="btn primary">Enregistrer</button>')}
      </form>`, (sheet) => {
      onSubmit($('form', sheet), (fd) => {
        const amount = Math.abs(U.parseAmount(fd.get('amount')));
        if (!amount) throw new Error('Saisissez un montant.');
        g.contributions = [...(g.contributions || []), { date: fd.get('date') || U.today(), amount: withdraw ? -amount : amount }];
        Store.save();
        closeSheet();
        toast(withdraw ? 'Retrait enregistré' : 'Versement enregistré 💪');
      });
    });
  }

  // ---- Catégorie
  function categoryForm(c = null) {
    const x = c || { name: '', icon: '📁', type: 'expense' };
    openSheet(c ? 'Modifier la catégorie' : 'Nouvelle catégorie', `
      <form class="form" novalidate>
        ${c ? '' : `<div class="seg">${[['expense', 'Dépense'], ['income', 'Revenu']].map(([v, l]) => `<label><input type="radio" name="type" value="${v}" ${x.type === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`}
        <div class="grid-icon">
          <label class="field"><span>Icône</span><input name="icon" value="${esc(x.icon)}" maxlength="4" class="icon-input"></label>
          <label class="field"><span>Nom</span><input name="name" required value="${esc(x.name)}" autofocus></label>
        </div>
        ${formEnd(`${c ? '<button type="button" class="btn danger" data-action="delete-category">Supprimer</button>' : ''}<button type="submit" class="btn primary">Enregistrer</button>`)}
      </form>`, (sheet) => {
      onSubmit($('form', sheet), (fd) => {
        const name = String(fd.get('name')).trim();
        if (!name) throw new Error('Donnez un nom à la catégorie.');
        Store.upsert('categories', { id: c?.id, name, icon: String(fd.get('icon')).trim() || '📁', type: c ? c.type : fd.get('type') });
        closeSheet();
      });
      sheet.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')?.dataset.action === 'delete-category' && confirm(`Supprimer « ${c.name} » ? Les opérations concernées deviendront « Non catégorisé ».`)) {
          Store.removeCategory(c.id);
          closeSheet();
        }
      });
    });
  }

  // ---- Règle
  function ruleForm(r = null) {
    openSheet(r ? 'Modifier la règle' : 'Nouvelle règle', `
      <form class="form" novalidate>
        <label class="field"><span>Si le libellé contient</span><input name="pattern" required value="${esc(r?.pattern || '')}" placeholder="ex. carrefour, sncf, netflix" autofocus></label>
        <label class="field"><span>Alors catégoriser en</span><select name="categoryId">${categoryOptionsAll(r?.categoryId, null)}</select></label>
        ${formEnd(`${r ? '<button type="button" class="btn danger" data-action="delete-rule">Supprimer</button>' : ''}<button type="submit" class="btn primary">Enregistrer</button>`)}
      </form>`, (sheet) => {
      onSubmit($('form', sheet), (fd) => {
        const pattern = String(fd.get('pattern')).trim();
        if (!pattern) throw new Error('Indiquez un texte à rechercher.');
        Store.upsert('rules', { id: r?.id, pattern, categoryId: fd.get('categoryId') });
        closeSheet();
      });
      sheet.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')?.dataset.action === 'delete-rule') { Store.remove('rules', r.id); closeSheet(); }
      });
    });
  }

  // ---- Import de relevé CSV
  function csvImportForm(presetAccount = '') {
    if (!requireAccount()) return;
    let rows = [];
    const cfg = { header: true, mode: 'single', date: 0, label: 1, amount: 2, debit: -1, credit: -1, invert: false };
    openSheet('Importer un relevé bancaire', `
      <form class="form" novalidate>
        <p class="hint">Exportez vos opérations au format CSV depuis l'espace client de votre banque, puis choisissez le fichier. Les doublons déjà présents sont ignorés et les catégories sont devinées automatiquement.</p>
        <label class="field"><span>Compte de destination</span><select name="accountId">${accountOptions(presetAccount || defaultAccount())}</select></label>
        <label class="field"><span>Fichier CSV</span><input type="file" name="file" accept=".csv,.txt,text/csv"></label>
        <div id="csv-map"></div>
        ${formEnd('<button type="submit" class="btn primary" disabled>Importer</button>')}
      </form>`, (sheet) => {
      const form = $('form', sheet);
      const box = $('#csv-map', sheet);
      const submit = $('button[type=submit]', sheet);
      const colOpts = (sel, allowNone) => {
        const width = Math.max(...rows.slice(0, 20).map((r) => r.length));
        const names = Array.from({ length: width }, (_, i) => (cfg.header && rows[0][i] ? rows[0][i] : `Colonne ${i + 1}`));
        return (allowNone ? opt(-1, '—', sel) : '') + names.map((n, i) => opt(i, n, sel)).join('');
      };
      const parseRow = (r) => {
        const date = CSV.parseDate(r[cfg.date]);
        const payee = (r[cfg.label] || '').replace(/\s+/g, ' ').trim();
        let amount;
        if (cfg.mode === 'single') amount = U.parseAmount(r[cfg.amount]);
        else {
          const d = cfg.debit >= 0 ? U.parseAmount(r[cfg.debit]) : NaN;
          const c = cfg.credit >= 0 ? U.parseAmount(r[cfg.credit]) : NaN;
          amount = (Number.isNaN(c) ? 0 : Math.abs(c)) - (Number.isNaN(d) ? 0 : Math.abs(d));
          if (Number.isNaN(d) && Number.isNaN(c)) amount = NaN;
        }
        if (cfg.invert && !Number.isNaN(amount)) amount = -amount;
        return { date, payee, amount, ok: !!date && !Number.isNaN(amount) && amount !== 0 };
      };
      const dataRows = () => (cfg.header ? rows.slice(1) : rows);
      const draw = () => {
        const parsed = dataRows().map(parseRow);
        const ok = parsed.filter((p) => p.ok);
        box.innerHTML = `
          <label class="check"><input type="checkbox" data-k="header" ${cfg.header ? 'checked' : ''}> La première ligne contient les titres des colonnes</label>
          <div class="grid2">
            <label class="field"><span>Colonne date</span><select data-k="date">${colOpts(cfg.date)}</select></label>
            <label class="field"><span>Colonne libellé</span><select data-k="label">${colOpts(cfg.label)}</select></label>
          </div>
          <div class="seg"><label><input type="radio" name="mode" data-k="mode" value="single" ${cfg.mode === 'single' ? 'checked' : ''}><span>Montant signé</span></label><label><input type="radio" name="mode" data-k="mode" value="split" ${cfg.mode === 'split' ? 'checked' : ''}><span>Débit / Crédit</span></label></div>
          ${cfg.mode === 'single'
            ? `<label class="field"><span>Colonne montant</span><select data-k="amount">${colOpts(cfg.amount)}</select></label>`
            : `<div class="grid2"><label class="field"><span>Colonne débit</span><select data-k="debit">${colOpts(cfg.debit, true)}</select></label><label class="field"><span>Colonne crédit</span><select data-k="credit">${colOpts(cfg.credit, true)}</select></label></div>`}
          <label class="check"><input type="checkbox" data-k="invert" ${cfg.invert ? 'checked' : ''}> Inverser les signes (si les dépenses apparaissent en positif)</label>
          <p class="muted small">${ok.length} opération(s) reconnue(s) sur ${parsed.length} ligne(s). Aperçu :</p>
          <div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>
            ${parsed.slice(0, 6).map((p) => `<tr class="${p.ok ? '' : 'bad'}"><td>${p.date ? U.fmtDate(p.date, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '⚠️'}</td><td>${esc(p.payee)}</td><td>${Number.isNaN(p.amount) ? '⚠️' : signed(p.amount)}</td></tr>`).join('')}
          </tbody></table></div>`;
        submit.disabled = !ok.length;
      };
      box.addEventListener('change', (e) => {
        const k = e.target.dataset.k;
        if (!k) return;
        cfg[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'radio' ? e.target.value : Number(e.target.value);
        draw();
      });
      form.elements.file.addEventListener('change', async () => {
        const file = form.elements.file.files[0];
        if (!file) return;
        let text = await U.readFile(file);
        if (text.includes('�')) {
          // Fichier probablement en Latin-1 (fréquent dans les exports bancaires français).
          text = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(file, 'windows-1252'); });
        }
        rows = CSV.parse(text);
        // Certaines banques ajoutent des lignes d'information avant le tableau : on cherche la première ligne « tableau ».
        const width = Math.max(...rows.map((r) => r.length));
        const start = rows.findIndex((r) => r.length >= Math.min(3, width));
        if (start > 0) rows = rows.slice(start);
        if (!rows.length) { box.innerHTML = '<p class="form-error">Fichier vide ou illisible.</p>'; return; }
        cfg.header = !rows[0].some((c) => CSV.parseDate(c));
        if (cfg.header) {
          const g = CSV.guessColumns(rows[0]);
          cfg.date = g.date;
          cfg.label = g.label >= 0 ? g.label : rows[0].findIndex((_, i) => i !== g.date && i !== g.amount);
          if (g.amount >= 0) { cfg.mode = 'single'; cfg.amount = g.amount; } else if (g.debit >= 0 || g.credit >= 0) { cfg.mode = 'split'; cfg.debit = g.debit; cfg.credit = g.credit; }
        }
        draw();
      });
      onSubmit(form, (fd) => {
        const accountId = fd.get('accountId');
        const key = (d, a, p) => `${d}|${a}|${U.norm(p)}`;
        const existing = new Set(S().transactions.filter((t) => t.accountId === accountId && t.type !== 'transfer').map((t) => key(t.date, t.type === 'income' ? t.amount : -t.amount, t.payee)));
        let added = 0; let dup = 0;
        for (const p of dataRows().map(parseRow)) {
          if (!p.ok) continue;
          const k = key(p.date, p.amount, p.payee);
          if (existing.has(k)) { dup++; continue; }
          const type = p.amount < 0 ? 'expense' : 'income';
          Store.upsert('transactions', { type, amount: Math.abs(p.amount), accountId, toAccountId: null, categoryId: Store.categoryFor(p.payee, type), payee: p.payee, note: '', tags: [], method: '', cleared: true, date: p.date }, { silent: true });
          added++;
        }
        Store.save();
        closeSheet();
        toast(`${added} opération(s) importée(s)${dup ? `, ${dup} doublon(s) ignoré(s)` : ''}`);
      });
    });
  }

  // ---- Code PIN
  function pinForm() {
    openSheet('Code PIN', `
      <form class="form" novalidate>
        <label class="field"><span>Nouveau code (4 à 8 chiffres)</span><input name="pin" type="password" inputmode="numeric" autocomplete="new-password" pattern="\\d{4,8}" required autofocus></label>
        <label class="field"><span>Confirmer le code</span><input name="pin2" type="password" inputmode="numeric" autocomplete="new-password" required></label>
        <p class="hint small">Le code verrouille l'accès à l'interface. En cas d'oubli, il faudra effacer les données du navigateur : gardez une sauvegarde.</p>
        ${formEnd('<button type="submit" class="btn primary">Enregistrer</button>')}
      </form>`, (sheet) => {
      onSubmit($('form', sheet), (fd) => {
        const pin = String(fd.get('pin'));
        if (!/^\d{4,8}$/.test(pin)) throw new Error('Le code doit contenir 4 à 8 chiffres.');
        if (pin !== fd.get('pin2')) throw new Error('Les deux codes ne correspondent pas.');
        const salt = U.uid();
        Object.assign(S().settings, { pinSalt: salt, pinHash: U.sha256(`${salt}:${pin}`) });
        Store.save();
        closeSheet();
        toast('Code PIN activé 🔒');
      });
    });
  }

  function lock() {
    const st = S().settings;
    if (!st.pinHash) return;
    const el = $('#lock');
    el.hidden = false;
    el.innerHTML = `<form class="lock-box" novalidate>
      <div class="lock-logo" aria-hidden="true">🔒</div>
      <h1>Mes Comptes</h1>
      <label class="field"><span>Code PIN</span><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" autofocus></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">Déverrouiller</button>
    </form>`;
    document.body.classList.add('no-scroll');
    const form = $('form', el);
    setTimeout(() => form.elements.pin.focus(), 50);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (U.sha256(`${st.pinSalt}:${form.elements.pin.value}`) === st.pinHash) {
        el.hidden = true;
        el.innerHTML = '';
        if (!$('#sheet-root').classList.contains('open')) document.body.classList.remove('no-scroll');
      } else {
        const err = $('.form-error', form);
        err.textContent = 'Code incorrect.';
        err.hidden = false;
        form.elements.pin.value = '';
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      }
    });
  }

  // ======================================================================
  // Actions
  // ======================================================================
  function pickFile(accept, cb) {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => i.files[0] && cb(i.files[0]);
    i.click();
  }
  function exportTx(list, filename) {
    const rows = [['Date', 'Type', 'Compte', 'Vers le compte', 'Tiers', 'Catégorie', 'Montant', 'Devise', 'Moyen de paiement', 'Étiquettes', 'Note', 'Pointée']];
    const types = { expense: 'Dépense', income: 'Revenu', transfer: 'Virement' };
    for (const t of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
      const v = t.type === 'expense' ? -t.amount : t.amount;
      rows.push([U.fmtDate(t.date, { day: '2-digit', month: '2-digit', year: 'numeric' }), types[t.type], acc(t.accountId)?.name || '', acc(t.toAccountId)?.name || '', t.payee, cat(t.categoryId)?.name || '', (v / 100).toFixed(2).replace('.', ','), cur(), t.method, (t.tags || []).join(', '), t.note, t.cleared ? 'oui' : 'non']);
    }
    U.download(filename, CSV.stringify(rows), 'text/csv;charset=utf-8');
  }

  const actions = {
    'close-sheet': closeSheet,
    'new-tx': (el) => txForm(null, el.dataset.account ? { accountId: el.dataset.account } : {}),
    'edit-tx': (el) => txForm(Store.get('transactions', el.dataset.id)),
    'toggle-cleared': (el) => { const t = Store.get('transactions', el.dataset.id); if (t) { t.cleared = !t.cleared; Store.save(); } },
    'tx-more': () => { ui.tx.limit += 200; renderTxResults(); },
    'acc-more': () => { ui.accLimit += 200; render(); },
    'tx-month': (el) => { ui.tx.month = U.shiftMonth(ui.tx.month, Number(el.dataset.delta)); render(); },
    'export-filtered': () => exportTx(filterTx(ui.tx), `operations-${U.today()}.csv`),
    'new-account': () => accountForm(),
    'edit-account': (el) => accountForm(acc(el.dataset.id)),
    'adjust-balance': (el) => adjustForm(el.dataset.id),
    'toggle-reconcile': () => { ui.reconcile = !ui.reconcile; render(); },
    'export-account': (el) => exportTx(S().transactions.filter((t) => t.accountId === el.dataset.id || t.toAccountId === el.dataset.id), `${U.norm(acc(el.dataset.id).name).replace(/\W+/g, '-')}-${U.today()}.csv`),
    'budget-month': (el) => { ui.budgetMonth = U.shiftMonth(ui.budgetMonth, Number(el.dataset.delta)); render(); },
    'new-budget': () => budgetForm(),
    'edit-budget': (el) => budgetForm(Store.get('budgets', el.dataset.id)),
    'quick-budget': (el) => budgetForm(null, el.dataset.cat),
    'suggest-budgets': suggestBudgets,
    'report-period': (el) => { ui.report.period = el.dataset.p; render(); },
    'goto-cat': (el) => {
      const [fromK, toK] = reportRange(ui.report.period);
      Object.assign(ui.tx, { q: '', category: el.dataset.id, account: ui.report.account, type: '', cleared: '', tag: '', period: 'range', from: U.monthStart(fromK), to: U.monthEnd(toK), limit: 200 });
      location.hash = '#/tx';
    },
    'new-recurring': () => recurringForm(),
    'edit-recurring': (el) => recurringForm(Store.get('recurring', el.dataset.id)),
    'post-recurring': (el) => { if (Store.postRecurring(el.dataset.id)) toast('Opération enregistrée'); },
    'skip-recurring': (el) => { Store.skipRecurring(el.dataset.id); toast('Échéance ignorée'); },
    'new-goal': () => goalForm(),
    'edit-goal': (el) => goalForm(Store.get('goals', el.dataset.id)),
    'contribute-goal': (el) => contributeForm(Store.get('goals', el.dataset.id), !!el.dataset.withdraw),
    'new-category': () => categoryForm(),
    'edit-category': (el) => categoryForm(cat(el.dataset.id)),
    'new-rule': () => ruleForm(),
    'edit-rule': (el) => ruleForm(Store.get('rules', el.dataset.id)),
    'apply-rules': () => { const n = Store.applyRulesToUncategorized(); toast(n ? `${n} opération(s) catégorisée(s)` : 'Aucune opération à catégoriser'); },
    'import-csv': (el) => csvImportForm(el.dataset.account),
    'export-csv': () => exportTx(S().transactions, `operations-${U.today()}.csv`),
    'export-json': () => U.download(`mescomptes-sauvegarde-${U.today()}.json`, JSON.stringify(Store.exportData(), null, 1), 'application/json'),
    'import-json': () => pickFile('.json,application/json', async (file) => {
      try {
        const d = JSON.parse(await U.readFile(file));
        if (S().transactions.length && !confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
        Store.replaceAll(d);
        applySettings();
        location.hash = '#/home';
        toast('Sauvegarde restaurée ✅');
      } catch (e) { toast(`Échec : ${e.message}`); }
    }),
    'load-demo': () => {
      if (S().transactions.length && !confirm('Remplacer vos données par les données de démonstration ?')) return;
      Store.loadDemo();
      Store.processRecurring();
      location.hash = '#/home';
      toast('Données de démonstration chargées');
    },
    'reset-all': () => {
      if (!confirm('Effacer définitivement tous les comptes, opérations, budgets et objectifs ?')) return;
      if (!confirm('Vraiment tout effacer ? Téléchargez une sauvegarde avant si besoin.')) return;
      Store.reset();
      location.hash = '#/home';
      toast('Données effacées');
    },
    'toggle-privacy': () => { S().settings.hideAmounts = !S().settings.hideAmounts; Store.save(); applySettings(); },
    'set-pin': pinForm,
    'remove-pin': () => { if (confirm('Supprimer le code PIN ?')) { Object.assign(S().settings, { pinHash: null, pinSalt: null }); Store.save(); toast('Code PIN supprimé'); } },
    'install-app': async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); },
  };

  // ======================================================================
  // Routeur & démarrage
  // ======================================================================
  const routes = { home, accounts, account, tx: transactions, budgets, reports, more, recurring, goals, categories, rules, data, settings };
  const NAV_PARENT = { account: 'accounts', recurring: 'more', goals: 'more', categories: 'more', rules: 'more', data: 'more', settings: 'more' };
  let lastRoute = '';
  function parseHash() {
    const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
    return { name: routes[name] ? name : 'home', param: param ? decodeURIComponent(param) : null };
  }
  function render() {
    Charts.hideTip();
    const { name, param } = parseHash();
    const key = `${name}/${param || ''}`;
    if (key !== lastRoute) { ui.reconcile = false; ui.accLimit = 200; }
    const out = routes[name](param);
    const y = window.scrollY;
    view.innerHTML = out.html;
    if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; } else window.scrollTo(0, y);
    const navName = NAV_PARENT[name] || name;
    $$('.nav a').forEach((a) => {
      const on = a.dataset.route === navName;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    out.after?.();
  }

  function applySettings() {
    const st = S().settings;
    const root = document.documentElement;
    if (st.theme === 'light' || st.theme === 'dark') root.dataset.theme = st.theme; else delete root.dataset.theme;
    document.body.classList.toggle('privacy', !!st.hideAmounts);
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  let installPrompt = null;

  function init() {
    Store.load();
    Store.onError = () => toast('⚠️ Enregistrement impossible : stockage plein ou indisponible.');
    applySettings();
    Store.processRecurring();
    Store.subscribe(render);

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const fn = actions[el.dataset.action];
      if (fn) { e.preventDefault(); fn(el, e); }
    });
    document.addEventListener('change', (e) => {
      const k = e.target.dataset?.setting;
      if (!k) return;
      const st = S().settings;
      st[k] = e.target.type === 'checkbox' ? e.target.checked : k === 'lockDelay' ? Number(e.target.value) : e.target.value;
      Store.save();
      applySettings();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('#sheet-root').classList.contains('open')) closeSheet();
    });
    window.addEventListener('hashchange', render);
    window.addEventListener('resize', U.debounce(() => { if (!$('#sheet-root').classList.contains('open')) render(); }, 250));
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

    // Reverrouillage après une période en arrière-plan + génération des échéances du jour.
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      const st = S().settings;
      if (st.pinHash && Date.now() - hiddenAt >= (st.lockDelay || 0) * 1000) lock();
      Store.processRecurring();
    });

    render();
    lock();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  return { init, toast, render };
})();

App.init();
