'use strict';

/* Lecture / écriture CSV (relevés bancaires, exports). */
const CSV = (() => {
  function detectDelimiter(text) {
    const line = text.split(/\r?\n/).find((l) => l.trim()) || '';
    const counts = [';', ',', '\t', '|'].map((d) => [d, line.split(d).length]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 1 ? counts[0][0] : ';';
  }

  function parse(text, delimiter = detectDelimiter(text)) {
    text = text.replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === delimiter) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()));
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()));
    return rows;
  }

  function stringify(rows, delimiter = ';') {
    const q = (v) => {
      const s = String(v ?? '');
      return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + rows.map((r) => r.map(q).join(delimiter)).join('\r\n');
  }

  // Formats acceptés : JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA, JJ/MM/AA, AAAA-MM-JJ, AAAA/MM/JJ.
  function parseDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return valid(y, +m[2], +m[1]);
    }
    return null;
  }
  function valid(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d);
    if (dt.getMonth() !== mo - 1) return null;
    return U.toISO(dt);
  }

  // Devine les colonnes à partir des en-têtes.
  function guessColumns(header) {
    const h = header.map(U.norm);
    const find = (...keys) => h.findIndex((x) => keys.some((k) => x.includes(k)));
    return {
      date: Math.max(0, find('date op', 'date', 'jour')),
      label: find('libelle', 'label', 'description', 'intitule', 'detail', 'tiers', 'beneficiaire', 'payee'),
      amount: find('montant', 'amount', 'somme', 'valeur'),
      debit: find('debit'),
      credit: find('credit'),
    };
  }

  return { parse, stringify, parseDate, guessColumns, detectDelimiter };
})();
