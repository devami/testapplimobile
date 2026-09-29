'use strict';

/* Utilitaires : dates ISO (YYYY-MM-DD), montants en centimes, formatage FR. */
const U = (() => {
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');

  // ---------- Dates ----------
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => toISO(new Date());
  const parseISO = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m : 0-11
  const addDays = (iso, n) => {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  };
  // Ajoute n mois en conservant le jour d'ancrage (ex. 31 → 30/28 selon le mois).
  const addMonths = (iso, n, anchorDay) => {
    const d = parseISO(iso);
    const day = anchorDay || d.getDate();
    let y = d.getFullYear();
    let m = d.getMonth() + n;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return toISO(new Date(y, m, Math.min(day, daysInMonth(y, m))));
  };
  const monthKey = (iso) => iso.slice(0, 7);
  const monthStart = (key) => `${key}-01`;
  const monthEnd = (key) => {
    const [y, m] = key.split('-').map(Number);
    return `${key}-${pad(daysInMonth(y, m - 1))}`;
  };
  const shiftMonth = (key, n) => addMonths(`${key}-01`, n).slice(0, 7);
  const monthsBetween = (fromKey, toKey) => {
    const out = [];
    for (let k = fromKey; k <= toKey; k = shiftMonth(k, 1)) out.push(k);
    return out;
  };
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const monthLabel = (key, long = false) => {
    const [y, m] = key.split('-').map(Number);
    return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
  };
  const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
    parseISO(iso).toLocaleDateString('fr-FR', opts);
  const fmtDay = (iso) => {
    const t = today();
    if (iso === t) return "Aujourd'hui";
    if (iso === addDays(t, -1)) return 'Hier';
    if (iso === addDays(t, 1)) return 'Demain';
    return fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: iso.slice(0, 4) === t.slice(0, 4) ? undefined : 'numeric' });
  };
  const daysUntil = (iso) => Math.round((parseISO(iso) - parseISO(today())) / 86400000);

  // ---------- Montants ----------
  const fmtCache = new Map();
  const nf = (currency, compact) => {
    const k = currency + (compact ? ':c' : '');
    if (!fmtCache.has(k)) {
      try {
        fmtCache.set(k, new Intl.NumberFormat('fr-FR', compact
          ? { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }
          : { style: 'currency', currency }));
      } catch {
        fmtCache.set(k, new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
    }
    return fmtCache.get(k);
  };
  const money = (cents, currency = 'EUR', { sign = false, compact = false } = {}) => {
    const s = nf(currency, compact).format(Math.abs(cents) / 100);
    if (cents < 0) return `−${s}`;
    if (sign && cents > 0) return `+${s}`;
    return s;
  };
  // Accepte "1 234,56", "1.234,56", "1,234.56", "-12", "12€"...
  const parseAmount = (input) => {
    if (typeof input === 'number') return Math.round(input * 100);
    let s = String(input ?? '').replace(/[\s  ]/g, '').replace(/[^\d,.\-+]/g, '');
    if (!s) return NaN;
    const neg = s.startsWith('-') || s.endsWith('-');
    s = s.replace(/[-+]/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma > -1) {
      s = s.replace(',', '.');
    }
    const v = parseFloat(s);
    if (Number.isNaN(v)) return NaN;
    return Math.round((neg ? -v : v) * 100);
  };
  const centsToInput = (cents) => (cents / 100).toFixed(2).replace('.', ',');

  // ---------- Divers ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const debounce = (fn, ms = 200) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  const download = (filename, content, mime = 'text/plain') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const readFile = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // SHA-256 en JS pur (fonctionne même hors contexte sécurisé, ex. http sur le réseau local).
  const sha256 = (() => {
    const primes = [];
    for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n);
    const frac = (x) => ((x - Math.floor(x)) * 0x100000000) | 0;
    const K = primes.map((p) => frac(Math.cbrt(p)));
    const H0 = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    return (str) => {
      const bytes = new TextEncoder().encode(str);
      const len = bytes.length;
      const total = Math.ceil((len + 9) / 64) * 64;
      const buf = new Uint8Array(total);
      buf.set(bytes);
      buf[len] = 0x80;
      const dv = new DataView(buf.buffer);
      dv.setUint32(total - 8, Math.floor((len * 8) / 0x100000000));
      dv.setUint32(total - 4, (len * 8) >>> 0);
      const H = H0.slice();
      const W = new Int32Array(64);
      for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++) W[i] = dv.getInt32(off + i * 4);
        for (let i = 16; i < 64; i++) {
          const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
          const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
          W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) {
          const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
          const ch = (e & f) ^ (~e & g);
          const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
          const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const t2 = (S0 + maj) | 0;
          h = g; g = f; f = e; e = (d + t1) | 0;
          d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
      }
      return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
    };
  })();

  return {
    uid, pad, toISO, today, parseISO, addDays, addMonths, monthKey, monthStart, monthEnd, shiftMonth,
    monthsBetween, monthLabel, fmtDate, fmtDay, daysUntil, money, parseAmount, centsToInput,
    esc, norm, debounce, download, readFile, clamp, sha256, MONTHS_LONG,
  };
})();
