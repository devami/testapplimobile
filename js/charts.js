'use strict';

/* Graphiques SVG légers : courbe (avec réticule) et barres groupées, avec info-bulles. */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const tipEl = () => document.getElementById('tooltip');

  function showTip(html, x, y) {
    const t = tipEl();
    t.innerHTML = html;
    t.hidden = false;
    const r = t.getBoundingClientRect();
    let left = x + 14;
    let top = y - r.height - 12;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (left < 8) left = 8;
    if (top < 8) top = y + 18;
    t.style.left = `${left}px`;
    t.style.top = `${top}px`;
  }
  const hideTip = () => { const t = tipEl(); if (t) t.hidden = true; };

  function niceScale(min, max, count = 4) {
    if (min === max) { min -= 100; max += 100; }
    const step0 = (max - min) / count;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const n = step0 / mag;
    const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
    return { lo, hi, ticks };
  }

  const el = (name, attrs = {}, parent) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };

  function frame(container, height, label) {
    container.innerHTML = '';
    const W = Math.max(260, container.clientWidth || 320);
    const svg = el('svg', { width: W, height, viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': label, class: 'chart-svg' }, container);
    return { svg, W };
  }

  function yAxis(svg, scale, y, x0, x1, fmtTick) {
    const g = el('g', { class: 'axis' }, svg);
    for (const v of scale.ticks) {
      const yy = Math.round(y(v)) + 0.5;
      el('line', { x1: x0, x2: x1, y1: yy, y2: yy, class: v === 0 ? 'baseline' : 'grid' }, g);
      const t = el('text', { x: x0 - 6, y: yy + 4, 'text-anchor': 'end', class: 'tick' }, g);
      t.textContent = fmtTick(v);
    }
  }

  function xLabels(svg, labels, xAt, y, maxLabels, edgeAnchor = false) {
    const g = el('g', { class: 'axis' }, svg);
    const every = Math.max(1, Math.ceil(labels.length / maxLabels));
    labels.forEach((l, i) => {
      if (i % every) return;
      // Sur une courbe, les points extrêmes touchent les bords : on aligne leurs libellés vers l'intérieur.
      const anchor = edgeAnchor && i === 0 ? 'start' : edgeAnchor && i === labels.length - 1 ? 'end' : 'middle';
      const t = el('text', { x: xAt(i), y, 'text-anchor': anchor, class: 'tick' }, g);
      t.textContent = l;
    });
  }

  /**
   * Courbe à une série. data : [{ label, tipLabel, value }] (valeurs en centimes).
   */
  function line(container, data, { format, formatTick, label = 'Graphique' } = {}) {
    if (!container) return;
    const H = 210;
    const { svg, W } = frame(container, H, label);
    const m = { t: 14, r: 14, b: 26, l: 58 };
    const vals = data.map((d) => d.value);
    const scale = niceScale(Math.min(...vals), Math.max(...vals));
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const x = (i) => m.l + (data.length === 1 ? iw / 2 : (i * iw) / (data.length - 1));
    const y = (v) => m.t + ih - ((v - scale.lo) / (scale.hi - scale.lo)) * ih;
    yAxis(svg, scale, y, m.l, W - m.r, formatTick);
    xLabels(svg, data.map((d) => d.label), x, H - 6, Math.floor(iw / 48), true);

    const pts = data.map((d, i) => [x(i), y(d.value)]);
    const dLine = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const yBase = y(Math.max(scale.lo, Math.min(0, scale.hi)));
    el('path', { d: `${dLine}L${pts[pts.length - 1][0]},${yBase}L${pts[0][0]},${yBase}Z`, class: 'area s1' }, svg);
    el('path', { d: dLine, class: 'line s1' }, svg);
    const last = pts[pts.length - 1];
    el('circle', { cx: last[0], cy: last[1], r: 4, class: 'dot s1' }, svg);

    const cross = el('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' }, svg);
    const dot = el('circle', { r: 5, class: 'dot s1 ring', visibility: 'hidden' }, svg);
    const hit = el('rect', { x: m.l - 10, y: 0, width: iw + 20, height: H, fill: 'transparent' }, svg);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const i = Math.round(((px - m.l) / iw) * (data.length - 1));
      const k = Math.max(0, Math.min(data.length - 1, isNaN(i) ? 0 : i));
      const [cx, cy] = pts[k];
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
      showTip(`<div class="tip-title">${U.esc(data[k].tipLabel || data[k].label)}</div><div class="tip-val">${format(data[k].value)}</div>`, ev.clientX, r.top + cy);
    };
    const leave = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', leave);
  }

  /**
   * Barres groupées. data : [{ label, tipLabel, values: [a, b] }], series : [{ name, cls }].
   */
  function bars(container, data, series, { format, formatTick, label = 'Graphique' } = {}) {
    if (!container) return;
    const H = 220;
    const { svg, W } = frame(container, H, label);
    const m = { t: 14, r: 8, b: 26, l: 58 };
    const max = Math.max(1, ...data.flatMap((d) => d.values));
    const scale = niceScale(0, max);
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const y = (v) => m.t + ih - (v / scale.hi) * ih;
    yAxis(svg, scale, y, m.l, W - m.r, formatTick);
    const band = iw / data.length;
    const groupW = Math.min(band * 0.72, 56);
    const gap = 2;
    const bw = (groupW - gap * (series.length - 1)) / series.length;
    const cx = (i) => m.l + band * i + band / 2;
    xLabels(svg, data.map((d) => d.label), cx, H - 6, Math.floor(iw / 44));

    const y0 = y(0);
    data.forEach((d, i) => {
      const gx = cx(i) - groupW / 2;
      d.values.forEach((v, s) => {
        if (v <= 0) return;
        const x0 = gx + s * (bw + gap);
        const top = y(v);
        const h = y0 - top;
        const r = Math.min(4, bw / 2, h);
        el('path', {
          d: `M${x0},${y0}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${y0}Z`,
          class: `bar ${series[s].cls}`,
        }, svg);
      });
      const hit = el('rect', { x: m.l + band * i, y: m.t, width: band, height: ih, class: 'hit' }, svg);
      const show = (ev) => {
        const rows = series.map((s, k) => `<div class="tip-row"><span class="key ${s.cls}"></span>${U.esc(s.name)}<b>${format(d.values[k])}</b></div>`).join('');
        const extra = d.extra ? `<div class="tip-row muted">${d.extra}</div>` : '';
        showTip(`<div class="tip-title">${U.esc(d.tipLabel || d.label)}</div>${rows}${extra}`, ev.clientX, ev.clientY);
        hit.classList.add('on');
      };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', () => { hideTip(); hit.classList.remove('on'); });
    });
  }

  return { line, bars, hideTip };
})();
