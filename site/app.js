/* ============================================================
   Tungsten Desk — Institutional Front-End Logic
   Zero-dependency Canvas Charts & Market Intelligence Terminal
   ============================================================ */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const fmt = (n, d = 0) => n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMtu = n => '$' + fmt(n, 0);

let MODELS = null;
let NEWS = null;
let CURRENT_UNIT = 'mtu'; // 'mtu' ($/mtu WO3) or 't' ($/t APT 88.5%)
const MTU_PER_T = 88.5;

/* ---------------- Palette ---------------- */
const C = {
  row: '#047857',        /* Final ROW Assumed Price M6 - Deep Emerald Ledger Ink */
  observed: '#b45309',   /* Rotterdam Spot M0 - Warm Ochre / Amber Ink */
  kalman: '#15803d',     /* Kalman Fair Value M4 - Ledger Forest Green Ink */
  western: '#1d4ed8',    /* Western Executable Spot M4 - Prussian Blue Ink */
  china: '#0f766e',      /* China Parity M1 - Deep Verdigris Teal Ink */
  factor: '#6d28d9',     /* Value-Chain Factor M3 - Deep Plum Ink */
  equity: '#be123c',     /* Pure-Play Equity M2 - Carmine Crimson Ink */
  forward: '#1e40af',    /* Forward Curve / CME - Cobalt Ledger Ink */
  wedge: '#c2410c',      /* Fragmentation Wedge - Terracotta Rust Ink */
  m7: '#d97706',         /* M7 Marginal Cost Floor & Greenfield Incentive - Warm Amber */
  m8: '#6366f1',         /* M8 VECM 21d Lead-Lag Impulse Nowcast - Indigo */
  m9: '#0d9488',         /* M9 Downstream Value-in-Use Netback Parity - Teal */
  rts: '#8b5cf6',        /* M4 RTS Backward Smoother State - Violet */
  iron: '#15803d',       /* Iron Ore - Ledger Forest Green */
  copper: '#c2410c',     /* Copper - Terracotta Rust */
  grid: '#dcd0b2',       /* Ruled ledger grid line */
  axis: '#786248',       /* Axis text & ticks - Warm Sepia */
  txt: '#2c2013'         /* Primary ink - Deep Espresso */
};

/* ---------------- Registered Charts for Instant Resizing & Redrawing ---------------- */
const CHARTS = [];

function registerChart(chart) {
  CHARTS.push(chart);
  return chart;
}

function redrawAllVisibleCharts() {
  CHARTS.forEach(c => {
    try {
      if (c.canvas && c.canvas.offsetParent !== null) {
        c.resize();
        c.redraw();
      }
    } catch (e) {
      console.warn('Chart redraw error:', e);
    }
  });
}

window.addEventListener('resize', () => {
  redrawAllVisibleCharts();
});

/* ---------------- Major Wars for 125y History Chart ---------------- */
const WARS = [
  { id: 'russia-japan', name: 'Russo-Japanese War', short: 'R-J', start: 1904, end: 1905, kind: 'regional' },
  { id: 'ww1', name: 'World War I', short: 'WWI', start: 1914, end: 1918, kind: 'world' },
  { id: 'spanish-civil', name: 'Spanish Civil War', short: 'SPA', start: 1936, end: 1939, kind: 'regional' },
  { id: 'sino-japan', name: 'Second Sino-Japanese War', short: 'SJ', start: 1937, end: 1945, kind: 'world' },
  { id: 'ww2', name: 'World War II', short: 'WWII', start: 1939, end: 1945, kind: 'world' },
  { id: 'korea', name: 'Korean War', short: 'KOR', start: 1950, end: 1953, kind: 'world' },
  { id: 'vietnam', name: 'Vietnam War', short: 'VIE', start: 1955, end: 1975, kind: 'regional' },
  { id: 'sixday', name: 'Six-Day War', short: '6D', start: 1967, end: 1967, kind: 'regional' },
  { id: 'yomkippur', name: 'Yom Kippur War', short: 'YK', start: 1973, end: 1973, kind: 'regional' },
  { id: 'afghan-79', name: 'Soviet–Afghan War', short: 'AFG', start: 1979, end: 1989, kind: 'regional' },
  { id: 'iran-iraq', name: 'Iran–Iraq War', short: 'II', start: 1980, end: 1988, kind: 'regional' },
  { id: 'falklands', name: 'Falklands War', short: 'FAL', start: 1982, end: 1982, kind: 'regional' },
  { id: 'gulf-1', name: 'Gulf War', short: 'G1', start: 1990, end: 1991, kind: 'regional' },
  { id: 'yugoslav', name: 'Yugoslav Wars', short: 'YUG', start: 1991, end: 2001, kind: 'regional' },
  { id: 'afghan-01', name: 'War in Afghanistan', short: 'AF2', start: 2001, end: 2021, kind: 'regional' },
  { id: 'iraq-03', name: 'Iraq War', short: 'IRQ', start: 2003, end: 2011, kind: 'regional' },
  { id: 'ukraine-14', name: 'Russo-Ukrainian War (Crimea/Donbas)', short: 'UKR14', start: 2014, end: null, kind: 'regional' },
  { id: 'ukraine-22', name: 'Russo-Ukrainian War (full-scale)', short: 'UKR', start: 2022, end: null, kind: 'regional' },
  { id: 'iran-israel', name: 'Iran–Israel War', short: 'IRN', start: 2024, end: null, kind: 'regional' }
];

/* ============================================================
   Enhanced Canvas Chart Engine
   ============================================================ */
function makeChart(canvas, opts) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');
  const M = { l: opts.marginLeft || 58, r: 14, t: 16, b: 26 };
  let w = 0, h = 0;

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    w = r.width;
    h = r.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  function niceStep(range, target) {
    if (range <= 0) return 1;
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) {
      if (mag * m >= raw) return mag * m;
    }
    return mag * 10;
  }

  function niceLabelStride(rawCount) {
    for (const m of [1, 2, 5, 10, 20, 25, 50, 100, 200]) {
      if (m >= rawCount) return m;
    }
    return Math.ceil(rawCount / 100) * 100;
  }

  const zoom = { active: false, X0: null, X1: null, Y0: null, Y1: null };

  function domain() {
    const { series, xmin, xmax, ymin, ymax, log = false } = opts;
    if (zoom.active) return { X0: zoom.X0, X1: zoom.X1, Y0: zoom.Y0, Y1: zoom.Y1 };
    let X0 = xmin, X1 = xmax, Y0 = ymin, Y1 = ymax;
    if (X0 == null || X1 == null) {
      let lo = Infinity, hi = -Infinity;
      for (const s of series) {
        if (s.hidden) continue;
        for (const p of s.data) {
          const t = +new Date(p[0]);
          if (t < lo) lo = t;
          if (t > hi) hi = t;
        }
      }
      X0 = isFinite(lo) ? lo : 0;
      X1 = isFinite(hi) ? hi : 1;
    }
    if (Y0 == null || Y1 == null) {
      let lo = Infinity, hi = -Infinity;
      for (const s of series) {
        if (s.hidden) continue;
        for (const p of s.data) {
          let v = log ? (p[1] > 0 ? Math.log10(p[1]) : 0) : p[1];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if (opts.bands) {
        for (const b of opts.bands) {
          if (b.hidden) continue;
          for (const p of (b.lo || [])) {
            let v = log ? (p[1] > 0 ? Math.log10(p[1]) : 0) : p[1];
            if (v < lo) lo = v;
          }
          for (const p of (b.hi || [])) {
            let v = log ? (p[1] > 0 ? Math.log10(p[1]) : 0) : p[1];
            if (v > hi) hi = v;
          }
        }
      }
      const pad = (hi - lo) * 0.08 || 1;
      Y0 = Y0 == null ? lo - pad : Y0;
      Y1 = Y1 == null ? hi + pad : Y1;
    }
    return { X0, X1, Y0, Y1 };
  }

  function redraw() {
    if (w === 0 || h === 0) resize();
    if (w === 0 || h === 0) return;
    ctx.clearRect(0, 0, w, h);
    const { series, log = false, yFmt = v => fmt(v), bands } = opts;
    const { X0, X1, Y0, Y1 } = domain();
    const iw = w - M.l - M.r;
    const ih = h - M.t - M.b;
    const sx = t => M.l + ((t - X0) / (X1 - X0 || 1)) * iw;
    const sy = v => {
      const lv = log ? (v > 0 ? Math.log10(v) : 0) : v;
      return M.t + ih - ((lv - Y0) / (Y1 - Y0 || 1)) * ih;
    };

    // Gridlines and Y labels
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ystep = niceStep(Y1 - Y0, 5);
    for (let gy = Math.ceil(Y0 / ystep) * ystep; gy <= Y1; gy += ystep) {
      const val = log ? Math.pow(10, gy) : gy;
      const yy = sy(val);
      if (yy < M.t || yy > h - M.b) continue;
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.moveTo(M.l, yy);
      ctx.lineTo(w - M.r, yy);
      ctx.stroke();

      ctx.fillStyle = C.axis;
      ctx.fillText(yFmt(val), M.l - 8, yy);
    }

    // X axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const spanY = (X1 - X0) / (365 * 864e5);
    const labelW = 60;
    const maxLabels = Math.max(1, Math.floor(iw / labelW));
    const minGap = 48;
    let lastX = -Infinity;

    const drawLabel = (x, txt) => {
      if (x < M.l || x > w - M.r || x - lastX < minGap) return;
      ctx.fillStyle = C.axis;
      ctx.fillText(txt, x, h - M.b + 8);
      lastX = x;
    };

    if (spanY >= 1.5) {
      const stride = niceLabelStride(spanY / maxLabels);
      const y0 = new Date(X0).getFullYear();
      for (let y = Math.ceil(y0 / stride) * stride; y <= new Date(X1).getFullYear(); y += stride) {
        drawLabel(sx(+new Date(y, 6, 1)), String(y));
      }
    } else {
      const spanM = spanY * 12;
      const stride = niceLabelStride(spanM / maxLabels);
      const d0 = new Date(X0);
      const d1 = new Date(X1);
      const m0 = d0.getFullYear() * 12 + d0.getMonth();
      const m1 = d1.getFullYear() * 12 + d1.getMonth();
      for (let m = Math.ceil(m0 / stride) * stride; m <= m1; m += stride) {
        const d = new Date(Math.floor(m / 12), m % 12, 1);
        drawLabel(sx(+d), d.toLocaleString('en-US', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(2));
      }
    }

    // Bands (Confidence intervals)
    if (bands) {
      for (const b of bands) {
        if (b.hidden) continue;
        const lo = (b.lo || []).filter(p => p[1] != null);
        const hi = (b.hi || []).filter(p => p[1] != null);
        if (lo.length < 2) continue;
        ctx.beginPath();
        lo.forEach((p, i) => {
          const x = sx(+new Date(p[0])), y = sy(p[1]);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        for (let i = hi.length - 1; i >= 0; i--) {
          const p = hi[i];
          ctx.lineTo(sx(+new Date(p[0])), sy(p[1]));
        }
        ctx.closePath();
        ctx.fillStyle = (b.color || '#888') + '1c';
        ctx.fill();
      }
    }

    // Series lines
    for (const s of series) {
      if (s.hidden || !s.data || !s.data.length) continue;
      ctx.beginPath();
      ctx.lineWidth = s.width || 1.8;
      ctx.strokeStyle = s.color;
      if (s.dash) ctx.setLineDash(s.dash);
      else ctx.setLineDash([]);

      s.data.forEach((p, i) => {
        const x = sx(+new Date(p[0]));
        const y = sy(p[1]);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Custom markers (e.g. verified anchors)
      if (s.markers) {
        ctx.fillStyle = s.color;
        for (const mk of s.markers) {
          const mx = sx(+new Date(mk[0]));
          const my = sy(mk[1]);
          if (mx >= M.l && mx <= w - M.r && my >= M.t && my <= h - M.b) {
            ctx.beginPath();
            ctx.arc(mx, my, 3.8, 0, 7);
            ctx.fill();
            ctx.strokeStyle = '#faf5e8';
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        }
      }

      // Point annotations (e.g. tenor names on forward curve)
      if (s.pointLabels) {
        ctx.font = '700 9.5px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        s.pointLabels.forEach(pl => {
          const px = sx(+new Date(pl.date));
          const py = sy(pl.val);
          if (px >= M.l && px <= w - M.r && py >= M.t && py <= h - M.b) {
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(px, py, 3.6, 0, 7);
            ctx.fill();
            ctx.fillText(pl.label, px, py - 6);
          }
        });
      }
    }

    // War overlay markers on historical chart
    if (opts.warOverlay) {
      const wars = opts.warOverlay.filter(wo => !wo.hidden);
      ctx.font = '600 9px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      let lastLabelX = -Infinity;
      for (const wo of wars) {
        const x = sx(+new Date(wo.date));
        const y = sy(wo.value);
        if (x < M.l || x > w - M.r) continue;
        ctx.strokeStyle = (wo.color || '#b91c1c') + '55';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, M.t);
        ctx.lineTo(x, M.t + ih);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = wo.color || '#b91c1c';
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, 7);
        ctx.fill();
        ctx.strokeStyle = '#faf5e8';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (x - lastLabelX > 64) {
          ctx.fillStyle = wo.color || '#b91c1c';
          ctx.fillText(wo.short, x + 4, M.t + 4);
          lastLabelX = x;
        }
      }
    }

    // Frame
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(M.l, M.t, iw, ih);
  }

  /* Hover & Tooltip Interaction */
  function clearHover() {
    redraw();
    const tip = $('#chartTip');
    if (tip) tip.style.display = 'none';
  }

  function hoverAt(ev) {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const iw = w - M.l - M.r;
    const ih = h - M.t - M.b;
    if (mx < M.l || mx > w - M.r || my < M.t || my > h - M.b) {
      clearHover();
      return;
    }

    const { series, log = false, yFmt = v => fmt(v), bands } = opts;
    const { X0, X1, Y0, Y1 } = domain();
    const sx = t => M.l + ((t - X0) / (X1 - X0 || 1)) * iw;
    const sy = v => {
      const lv = log ? (v > 0 ? Math.log10(v) : 0) : v;
      return M.t + ih - ((lv - Y0) / (Y1 - Y0 || 1)) * ih;
    };
    const tMouse = X0 + ((mx - M.l) / iw) * (X1 - X0);

    // War marker hit detection
    let hitWar = null;
    const wars = opts.warOverlay || [];
    for (const wo of wars) {
      if (wo.hidden || wo.value == null) continue;
      const wx = sx(+new Date(wo.date));
      const wy = sy(wo.value);
      if (Math.abs(mx - wx) < 8 && Math.abs(my - wy) < 8) {
        hitWar = wo;
        break;
      }
    }

    function nearest(arr) {
      if (!arr || !arr.length) return null;
      let best = arr[0], bd = Infinity;
      for (const p of arr) {
        const d = Math.abs(+new Date(p[0]) - tMouse);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }

    const rows = [];
    for (const s of series) {
      if (s.hidden || !s.data.length) continue;
      const p = nearest(s.data);
      if (!p) continue;
      rows.push({ color: s.color, name: s.name, val: p[1] });
    }

    let bandRow = null;
    if (bands) {
      for (const b of bands) {
        if (b.hidden) continue;
        const lo = nearest(b.lo);
        const hi = nearest(b.hi);
        if (lo && hi) bandRow = { lo: lo[1], hi: hi[1], name: b.name || 'Confidence Band' };
      }
    }

    redraw();

    // Crosshairs
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(92, 73, 52, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, M.t);
    ctx.lineTo(mx, h - M.b);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(M.l, my);
    ctx.lineTo(w - M.r, my);
    ctx.stroke();
    ctx.setLineDash([]);

    // Highlight nearest dots
    for (const r of rows) {
      const s = series.find(x => x.name === r.name);
      if (!s) continue;
      const p = nearest(s.data);
      if (!p) continue;
      const px = sx(+new Date(p[0]));
      const py = sy(p[1]);
      ctx.beginPath();
      ctx.arc(px, py, 3.6, 0, 7);
      ctx.fillStyle = r.color;
      ctx.fill();
    }

    if (hitWar) {
      const wx = sx(+new Date(hitWar.date));
      const wy = sy(hitWar.value);
      ctx.beginPath();
      ctx.arc(wx, wy, 7, 0, 7);
      ctx.strokeStyle = hitWar.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Tooltip DOM
    let tip = $('#chartTip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'chartTip';
      document.body.appendChild(tip);
    }
    const spanY = (X1 - X0) / (365 * 864e5);
    const dt = new Date(tMouse);
    const dateLabel = spanY >= 1.5 ? String(dt.getFullYear()) : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let html = `<div class="tip-x">${dateLabel}</div>`;
    if (hitWar) {
      const yrs = hitWar.end ? hitWar.start + '–' + hitWar.end : String(hitWar.start) + '–present';
      const kindTxt = hitWar.kind === 'world' ? 'GLOBAL / INDUSTRIAL' : 'REGIONAL CONFLICT';
      html += `<div class="tip-row tip-war">
        <span class="tip-dot" style="background:${hitWar.color}"></span>
        <span class="tip-name" style="color:${hitWar.color}">⚔ ${hitWar.name}</span>
        <span class="tip-val">${kindTxt} (${yrs})</span>
      </div>`;
    }

    for (const r of rows) {
      html += `<div class="tip-row">
        <span class="tip-dot" style="background:${r.color}"></span>
        <span class="tip-name">${r.name}</span>
        <span class="tip-val">${yFmt(r.val)}</span>
      </div>`;
    }

    if (bandRow) {
      html += `<div class="tip-row">
        <span class="tip-dot" style="background:#846f55"></span>
        <span class="tip-name">${bandRow.name}</span>
        <span class="tip-val">${yFmt(bandRow.lo)} – ${yFmt(bandRow.hi)}</span>
      </div>`;
    }

    tip.innerHTML = html;
    tip.style.display = 'block';

    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let tx = mx + 16, ty = my - th - 12;
    if (tx + tw > w - 8) tx = mx - tw - 16;
    if (ty < M.t + 4) ty = my + 16;
    tip.style.left = (rect.left + tx) + 'px';
    tip.style.top = (rect.top + ty) + 'px';
  }

  /* Drag to Zoom */
  const drag = { active: false, x0: 0, y0: 0, x1: 0, y1: 0 };
  canvas.addEventListener('mousedown', ev => {
    const r = canvas.getBoundingClientRect();
    drag.active = true;
    drag.x0 = drag.x1 = ev.clientX - r.left;
    drag.y0 = drag.y1 = ev.clientY - r.top;
    canvas.style.cursor = 'crosshair';
  });

  canvas.addEventListener('mousemove', ev => {
    const r = canvas.getBoundingClientRect();
    if (drag.active) {
      drag.x1 = ev.clientX - r.left;
      drag.y1 = ev.clientY - r.top;
      clearHover();
      redraw();
      const iw = w - M.l - M.r, ih = h - M.t - M.b;
      const x0 = Math.max(M.l, Math.min(drag.x0, drag.x1));
      const x1 = Math.min(M.l + iw, Math.max(drag.x0, drag.x1));
      const y0 = Math.max(M.t, Math.min(drag.y0, drag.y1));
      const y1 = Math.min(M.t + ih, Math.max(drag.y0, drag.y1));
      ctx.fillStyle = 'rgba(180, 83, 9, 0.14)';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      return;
    }
    hoverAt(ev);
  });

  canvas.addEventListener('mouseup', ev => {
    if (!drag.active) return;
    drag.active = false;
    canvas.style.cursor = 'default';
    const r = canvas.getBoundingClientRect();
    drag.x1 = ev.clientX - r.left;
    drag.y1 = ev.clientY - r.top;
    const iw = w - M.l - M.r, ih = h - M.t - M.b;
    const x0 = Math.max(M.l, Math.min(drag.x0, drag.x1));
    const x1 = Math.min(M.l + iw, Math.max(drag.x0, drag.x1));
    const y0 = Math.max(M.t, Math.min(drag.y0, drag.y1));
    const y1 = Math.min(M.t + ih, Math.max(drag.y0, drag.y1));
    if (x1 - x0 < 8 || y1 - y0 < 8) {
      redraw();
      return;
    }
    const { X0, X1, Y0, Y1 } = domain();
    const tFromPx = px => X0 + ((px - M.l) / iw) * (X1 - X0);
    const vFromPx = py => Y0 + (1 - (py - M.t) / ih) * (Y1 - Y0);
    zoom.active = true;
    zoom.X0 = tFromPx(x0);
    zoom.X1 = tFromPx(x1);
    zoom.Y0 = vFromPx(y1);
    zoom.Y1 = vFromPx(y0);
    redraw();
  });

  canvas.addEventListener('dblclick', () => {
    zoom.active = false;
    zoom.X0 = zoom.X1 = zoom.Y0 = zoom.Y1 = null;
    clearHover();
    redraw();
  });

  canvas.addEventListener('mouseleave', clearHover);

  const api = { canvas, opts, resize, redraw };
  return registerChart(api);
}

/* ============================================================
   Horizontal Correlation Bar Chart
   ============================================================ */
function drawCorrBars(canvas, pairs) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0;

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    w = r.width;
    h = r.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  function redraw() {
    if (w === 0 || h === 0) resize();
    if (w === 0 || h === 0) return;
    ctx.clearRect(0, 0, w, h);
    const Ml = 160, Mr = 50;
    const rowH = (h - 24) / Math.max(pairs.length, 1);
    const mid = w / 2 + 30;

    pairs.forEach(([name, val], i) => {
      const y = 14 + i * rowH + rowH / 2;
      ctx.font = '11px "IBM Plex Mono", monospace';
      ctx.fillStyle = C.axis;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, Ml - 12, y);

      const bw = ((w - Ml - Mr) / 2) * Math.min(1, Math.abs(val));
      ctx.fillStyle = val >= 0 ? 'rgba(21, 128, 61, 0.82)' : 'rgba(185, 28, 28, 0.82)';
      ctx.fillRect(val >= 0 ? mid : mid - bw, y - 6, bw, 12);

      ctx.fillStyle = C.txt;
      ctx.textAlign = val >= 0 ? 'left' : 'right';
      ctx.fillText((val >= 0 ? '+' : '') + val.toFixed(2), val >= 0 ? mid + bw + 8 : mid - bw - 8, y);
    });

    // Zero line
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mid, 8);
    ctx.lineTo(mid, h - 8);
    ctx.stroke();
  }

  const api = { canvas, resize, redraw };
  return registerChart(api);
}

/* ============================================================
   UI Rendering Functions
   ============================================================ */

/* Helper for price display according to active unit */
function px(v) {
  if (v == null || !isFinite(v)) return '—';
  if (CURRENT_UNIT === 't') {
    return '$' + fmt(v * MTU_PER_T, 0) + '/t';
  }
  return '$' + fmt(v, 0) + '/mtu';
}

function pxVal(v) {
  if (v == null || !isFinite(v)) return '—';
  if (CURRENT_UNIT === 't') {
    return '$' + fmt(v * MTU_PER_T, 0);
  }
  return '$' + fmt(v, 0);
}

function renderRegimeBanner() {
  const L = MODELS.latest;
  const rowVal = L.row_composite ? L.row_composite.value : 1717.37;
  if ($('#regRow')) $('#regRow').textContent = px(rowVal);
  $('#regRot').textContent = px(L.reported_rotterdam.value);
  $('#regCn').textContent = px(L.rotterdam_fair_from_shanghai.value);
  $('#regWedge').textContent = '+' + fmt(L.fragmentation_premium_pct.value, 1) + '%';
  $('#regWest').textContent = px(L.western_executable_nowcast.value);
  $('#regKal').textContent = px(L.kalman.value);
  if ($('#regimeDesc')) {
    $('#regimeDesc').innerHTML = `
      Rotterdam Spot (<b class="c-obs">${px(L.reported_rotterdam.value)}</b>) trades at an unprecedented
      <b class="c-wedge">+${fmt(L.fragmentation_premium_pct.value, 1)}% export fragmentation premium</b> over China Landed Parity (<b class="c-cn">${px(L.rotterdam_fair_from_shanghai.value)}</b>)
      following China's 4-Feb-2025 dual-use export controls. Synthesizing all 10 physical, netback, arbitrage, econometric lead, and structural balance signals, our
      <b>Final Rest-of-World (ROW) Assumed Tungsten Price is <span class="c-row">${px(rowVal)} ($${fmt(rowVal * MTU_PER_T, 0)}/t APT)</span></b>
      — sitting between <b>Global Fundamental Fair Value (<span class="c-kal">${px(L.kalman.value)}</span>)</b> and
      <b>Western Executable Contract Spot (<span class="c-west">${px(L.western_executable_nowcast.value)}</span>)</b>.
    `;
  }
}

function renderHeadlineCards() {
  const L = MODELS.latest;
  const F = MODELS.forward_curve || [];
  const f3m = F.find(x => x.tenor === '3M') || {};
  const f12m = F.find(x => x.tenor === '12M') || {};
  const rowVal = L.row_composite ? L.row_composite.value : 1717.37;
  const rowBand = L.row_composite_band || [1472.03, 2003.61];
  const rowVsRot = L.row_vs_rotterdam_pct ? L.row_vs_rotterdam_pct.value : -36.4;
  const rowVsCn = L.row_vs_china_parity_pct ? L.row_vs_china_parity_pct.value : 77.3;
  const rowFwd12m = (L.forward_12m_row_composite && L.forward_12m_row_composite.value) || f12m.row_composite_fwd_mtu || 1594.3;

  const cards = [
    {
      badge: 'FINAL ROW ASSUMED PRICE (M6)',
      label: 'Rest-of-World Assumed Price',
      value: pxVal(rowVal),
      unit: CURRENT_UNIT === 't' ? `$/t APT ($${fmt(rowVal, 0)}/mtu WO₃ · 10-Lens Weighted)` : `$/mtu WO₃ ($${fmt(rowVal * MTU_PER_T, 0)}/t APT · 10-Lens Weighted)`,
      cls: 'hero',
      cc: C.row,
      sub: `90% Band: <b>${px(rowBand[0])}–${px(rowBand[1])}</b> · <b>${rowVsRot}% vs Rotterdam</b> / <b>+${rowVsCn}% vs CN Parity</b> · 12M Fwd: <b>${px(rowFwd12m)}</b>`
    },
    {
      badge: 'OBSERVED BENCHMARK',
      label: 'Rotterdam APT Spot (M0)',
      value: pxVal(L.reported_rotterdam.value),
      unit: CURRENT_UNIT === 't' ? '$/t APT (88.5% WO₃ CIF Rotterdam)' : '$/mtu WO₃ (CIF Rotterdam duty-free)',
      cc: C.observed,
      sub: `Assessment: <b>${L.reported_rotterdam.date}</b> · Fastmarkets/ISBP · China landed parity: <b>${px(L.rotterdam_fair_from_shanghai.value)}</b>`
    },
    {
      badge: 'PHYSICAL PARITY & WEDGE',
      label: 'China Domestic & Landed Parity (M0/M1)',
      value: pxVal(L.shanghai_domestic_usd_mtu.value),
      unit: `${px(L.shanghai_domestic_usd_mtu.value)} ex-works ($${fmt(L.shanghai_domestic_usd_mtu.value * MTU_PER_T, 0)}/t) | ${px(L.rotterdam_fair_from_shanghai.value)} landed`,
      cc: C.china,
      sub: `Smelting parity: <b>${px(L.smelting_parity_cn_usd_mtu.value)}</b> dom / <b>${px(L.smelting_export_parity_usd_mtu.value)}</b> exp · <b>Wedge: +${fmt(L.fragmentation_premium_pct.value, 1)}%</b>`
    },
    {
      badge: 'BAYESIAN NOWCAST & RTS SMOOTHER',
      label: 'Kalman Modeled Price (M4 / RTS)',
      value: pxVal(L.kalman.value),
      unit: 'Global Fundamental Fair Value (RTS Smoothed)',
      cc: C.kalman,
      sub: `90% Band: <b>${px(L.kalman_band[0])}–${px(L.kalman_band[1])}</b> · <b>RTS Smoothed: ${px(L.kalman_rts_smooth ? L.kalman_rts_smooth.value : L.kalman.value)}</b> · <b>Western Exec: ${px(L.western_executable_nowcast.value)}</b>`
    },
    {
      badge: 'VALUE-CHAIN FACTOR',
      label: 'Value-Chain Factor Fair Value (M3)',
      value: pxVal(L.factor_implied.value),
      unit: 'Non-circular physical intermediate model (Duan smearing)',
      cc: C.factor,
      sub: `Level R² = <b>${MODELS.factor_model.level_r2}</b>, Ret R² = <b>${MODELS.factor_model.r2}</b> · Duan = <b>${MODELS.factor_model.duan_smearing_factor || 1.0629}</b> · EU FeW Netback: <b>${px(L.eu_ferrotungsten_netback_usd_mtu ? L.eu_ferrotungsten_netback_usd_mtu.value : 1118.57)}</b>`
    },
    {
      badge: 'EQUITY-IMPLIED',
      label: 'Pure-Play Equity Valuation (M2)',
      value: pxVal(L.equity_implied.value),
      unit: '12 pure-play miners, developers & tooling (inc. G6M.AX)',
      cc: C.equity,
      sub: `Level R² = <b>${MODELS.equity_model.r2}</b>, 21d Lead r = <b>+${MODELS.equity_model.lead_21d_corr_eu_apt}</b> · Duan = <b>${MODELS.equity_model.duan_smearing_factor || 1.0324}</b> · Basket = <b>${fmt(L.tungsten_equity_index.value, 2)}</b>`
    },
    {
      badge: 'VECM LEAD & INCENTIVE PRICING',
      label: 'VECM Nowcast (M8) & Incentive Floor (M7)',
      value: `${pxVal(L.m8_vecm_nowcast_mtu ? L.m8_vecm_nowcast_mtu.value : 1214.17)} / ${pxVal(L.m7_incentive_price_mtu ? L.m7_incentive_price_mtu.value : 1575.58)}`,
      unit: '21d Lead-Lag Impulse Nowcast / Greenfield Incentive Price',
      cc: C.m8,
      sub: `M8 Impulse: <b>${fmt(MODELS.vecm_model ? MODELS.vecm_model.impulse_lead_pct : -17.5, 1)}%</b> · M7 Smelting AISC Floor: <b>${px(L.marginal_cost_floor_mtu ? L.marginal_cost_floor_mtu.value : 596.48)}</b> · M9 Parity: <b>${px(L.m9_downstream_parity_mtu ? L.m9_downstream_parity_mtu.value : 1232.28)}</b>`
    }
  ];

  $('#headlineCards').innerHTML = cards.map(c => `
    <div class="card ${c.cls || ''}" style="--cc:${c.cc}">
      <span class="card-badge">${c.badge}</span>
      <div class="c-label">${c.label}</div>
      <div class="c-value">${c.value}</div>
      <div class="c-unit">${c.unit}</div>
      <div class="c-sub">${c.sub}</div>
    </div>
  `).join('');
}

/* ---------------- Main Multi-Model Interactive Chart ---------------- */
let MAIN_CHART = null;

function renderMainChart() {
  const S = MODELS.series;

  const scale = CURRENT_UNIT === 't' ? MTU_PER_T : 1;
  const rescale = arr => (arr || []).map(([d, v]) => [d, v != null ? v * scale : null]);

  const mainSeries = [
    { id: 'row', name: 'Final ROW Assumed Price (M6 Composite)', color: C.row, width: 2.8, data: rescale(S.row_composite_mtu) },
    { id: 'obs', name: 'Observed Rotterdam Spot (M0)', color: C.observed, width: 2.4, data: rescale(S.observed_rotterdam_mtu),
      markers: [['2025-01-02', 330 * scale], ['2026-07-17', 3050 * scale], ['2026-07-24', 3139.5 * scale], ['2026-10-23', 2700 * scale]] },
    { id: 'west', name: 'Western Executable Nowcast (M4_WEST)', color: C.western, width: 2.0, data: rescale(S.western_executable_mtu) },
    { id: 'kal', name: 'Kalman Global Fair Value (M4)', color: C.kalman, width: 2.0, data: rescale(S.kalman_mtu) },
    { id: 'rts', name: 'RTS Backward Smoother State (M4_RTS)', color: C.rts, width: 1.8, data: rescale(S.kalman_rts_smooth_mtu), dash: [2, 2], hidden: true },
    { id: 'm8', name: 'VECM 21d Lead-Lag Nowcast (M8)', color: C.m8, width: 1.8, data: rescale(S.m8_vecm_nowcast_mtu), dash: [4, 2] },
    { id: 'm7', name: 'Greenfield Incentive Clearing (M7)', color: C.m7, width: 1.8, data: rescale(S.m7_incentive_price_mtu), dash: [6, 3] },
    { id: 'm9', name: 'Downstream Value-in-Use Parity (M9)', color: C.m9, width: 1.8, data: rescale(S.m9_downstream_parity_mtu), dash: [3, 3] },
    { id: 'fac', name: 'Value-Chain Factor Fair Value (M3)', color: C.factor, width: 1.6, data: rescale(S.factor_implied_mtu), dash: [4, 3] },
    { id: 'eq', name: 'Pure-Play Equity-Implied (M2)', color: C.equity, width: 1.6, data: rescale(S.equity_implied_mtu), dash: [5, 4] },
    { id: 'cn', name: 'China Landed Export Parity (M1)', color: C.china, width: 1.6, data: rescale(S.rotterdam_fair_from_shanghai_mtu), dash: [4, 4] },
    { id: 'fwd_row', name: '12M ROW Assumed Forward', color: C.row, width: 2.0, data: rescale(S.forecast_row_composite_12m), dash: [4, 2] },
    { id: 'fwd_rot', name: '12M Rotterdam Forward Trajectory', color: C.observed, width: 1.8, data: rescale(S.forecast_rotterdam_12m), dash: [3, 3] },
    { id: 'fwd_glob', name: '12M Global Fair Forward', color: C.kalman, width: 1.6, data: rescale(S.forecast_global_fair_12m), dash: [3, 3] },
    { id: 'fwd_cn', name: '12M China Parity Forward', color: C.china, width: 1.6, data: rescale(S.forecast_china_parity_12m), dash: [3, 3] }
  ];

  MAIN_CHART = makeChart($('#mainChart'), {
    series: mainSeries,
    bands: [
      { name: 'ROW Assumed 90% Confidence Band', lo: rescale(S.row_composite_lo), hi: rescale(S.row_composite_hi), color: C.row },
      { name: 'Kalman 90% Confidence Band', lo: rescale(S.kalman_lo), hi: rescale(S.kalman_hi), color: C.kalman },
      { name: '80% Forward Confidence Band', lo: rescale(S.forecast_bear_80_lo), hi: rescale(S.forecast_bull_80_hi), color: C.forward }
    ],
    yFmt: v => '$' + fmt(v, 0)
  });

  $('#mainLegend').innerHTML = mainSeries.map(s => `
    <span class="lg" data-id="${s.id}">
      <span class="sw ${s.dash ? 'dash' : ''}" style="background:${s.color}"></span>${s.name}
    </span>
  `).join('');

  $$('#mainLegend .lg').forEach(el => {
    el.onclick = () => {
      const s = mainSeries.find(x => x.id === el.dataset.id);
      if (!s) return;
      s.hidden = !s.hidden;
      el.classList.toggle('off', s.hidden);
      MAIN_CHART.redraw();
    };
  });
}

/* ---------------- Final ROW Assumed Price Weighting Matrix Panel ---------------- */
function renderRowCompositePanel() {
  const rm = MODELS.row_composite_model;
  if (!rm || !rm.components) return;
  const comps = rm.components;
  const rowMtu = rm.headline_usd_mtu;
  const rowT = rm.headline_usd_t;
  const band = rm.band_90_usd_mtu || [1472.03, 2003.61];

  if ($('#rowHeadlineBadge')) {
    $('#rowHeadlineBadge').textContent = `FINAL ROW ASSUMED: $${fmt(rowMtu, 1)}/mtu ($${fmt(rowT, 0)}/t APT)`;
  }

  const colorForTag = tag => {
    if (tag.includes('Spot')) return C.observed;
    if (tag.includes('West')) return C.western;
    if (tag.includes('Global') || tag.includes('Kalman')) return C.kalman;
    if (tag.includes('VECM') || tag.includes('M8')) return C.m8;
    if (tag.includes('Factor') || tag.includes('M3')) return C.factor;
    if (tag.includes('Equity') || tag.includes('M2')) return C.equity;
    if (tag.includes('Downstream') || tag.includes('M9')) return C.m9;
    if (tag.includes('Incentive') || tag.includes('M7')) return C.m7;
    if (tag.includes('Balance') || tag.includes('M5')) return C.forward;
    if (tag.includes('FeW')) return C.factor;
    return C.china;
  };

  const maxW = Math.max(...comps.map(c => c.weight));

  $('#rowWeightTable tbody').innerHTML = comps.map(c => {
    const col = colorForTag(c.model_tag);
    const diff = c.vs_rotterdam_pct;
    const diffCls = Math.abs(diff) < 0.1 ? 'zero' : (diff > 0 ? 'pos' : 'neg');
    const diffTxt = Math.abs(diff) < 0.1 ? 'PAR' : (diff > 0 ? '+' : '') + diff.toFixed(1) + '%';
    const barW = Math.max(8, Math.round((c.weight / maxW) * 100));

    return `
      <tr>
        <td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${col};margin-right:6px"></span><b>${c.name}</b></td>
        <td><span class="chip chip-verified" style="font-size:10px">${c.model_tag}</span></td>
        <td style="font-weight:700;color:var(--txt)">${px(c.latest_usd_mtu)}</td>
        <td class="${diffCls}">${diffTxt}</td>
        <td style="font-weight:700;color:var(--c-row)">${(c.weight * 100).toFixed(1)}%</td>
        <td style="font-weight:700;color:var(--txt)">${px(c.weighted_contribution_usd_mtu)}</td>
        <td>
          <div class="stack-bar-wrap" style="width:90px">
            <div class="stack-bar" style="width:${barW}%;background:${col}"></div>
          </div>
        </td>
        <td style="text-align:left;color:var(--dim);white-space:normal;min-width:280px">${c.rationale}</td>
      </tr>
    `;
  }).join('');

  $('#rowWeightTable tfoot').innerHTML = `
    <tr style="background:rgba(4,120,87,0.08);border-top:2px solid var(--line3)">
      <td style="font-weight:800;color:var(--c-row)">FINAL REST-OF-WORLD (ROW) ASSUMED TUNGSTEN PRICE</td>
      <td><span class="chip chip-verified" style="background:rgba(4,120,87,0.16);color:#047857;border-color:rgba(4,120,87,0.4)">M6 FINAL (10 LENSES)</span></td>
      <td style="font-weight:800;color:var(--c-row);font-size:13px">${px(rowMtu)}</td>
      <td class="neg" style="font-weight:700">${rm.discount_to_rotterdam_pct.toFixed(1)}%</td>
      <td style="font-weight:800;color:var(--c-row)">100.0%</td>
      <td style="font-weight:800;color:var(--c-row);font-size:13px">${px(rowMtu)}</td>
      <td><span class="chip chip-verified">Σ = 1.00</span></td>
      <td style="text-align:left;color:var(--txt);font-weight:600;white-space:normal">
        90% Band: ${px(band[0])}–${px(band[1])} · +${rm.premium_to_china_landed_pct.toFixed(1)}% over China Landed Parity · 12M Forward: ${px(rm.forward_12m_usd_mtu)}
      </td>
    </tr>
    <tr style="background:rgba(217,119,6,0.05);border-top:1px dashed var(--line2);font-size:11px">
      <td colspan="2" style="font-weight:700;color:var(--dim)">ALTERNATIVE AGGREGATION CROSS-CHECKS:</td>
      <td colspan="6" style="text-align:left;color:var(--txt)">
        <b>Arithmetic:</b> ${px(rm.arithmetic_weighted_usd_mtu || rowMtu)} &nbsp;|&nbsp;
        <b>Log-Geometric:</b> ${px(rm.geometric_mean_usd_mtu || 1715.37)} &nbsp;|&nbsp;
        <b>Bates-Granger Precision:</b> ${px(rm.bates_granger_precision_usd_mtu || 2190.68)} &nbsp;|&nbsp;
        <b>Trimmed Mean (Middle 80%):</b> ${px(rm.trimmed_mean_usd_mtu || 1589.01)}
      </td>
    </tr>
  `;

  if ($('#rowWeightNote')) {
    $('#rowWeightNote').innerHTML = `
      <b>Why a Multi-Lens ROW Assumed Price is Necessary:</b> ${rm.summary}
    `;
  }
}

/* ---------------- Stream Benchmark Table & Wedge Chart ---------------- */
function renderStreamTable() {
  const L = MODELS.latest;
  const rotVal = L.reported_rotterdam.value;
  const rowVal = L.row_composite ? L.row_composite.value : 1717.37;
  const fewCnMtu = L.cn_ferrotungsten_usd_mtu_eq ? L.cn_ferrotungsten_usd_mtu_eq.value : 848.17;
  const fewCnRmb = L.cn_ferrotungsten_rmb_t ? L.cn_ferrotungsten_rmb_t.value : 500000;

  const streams = [
    { name: 'European APT Spot (CIF Rotterdam, Stream #1)', native: `$${fmt(rotVal, 0)}/mtu ($${fmt(rotVal * MTU_PER_T, 0)}/t)`, eq: rotVal, color: C.observed },
    { name: 'Western Executable Nowcast (M4_WEST)', native: `$${fmt(L.western_executable_nowcast.value, 0)}/mtu ($${fmt(L.western_executable_nowcast.value * MTU_PER_T, 0)}/t)`, eq: L.western_executable_nowcast.value, color: C.western },
    { name: 'Final ROW Assumed Price (M6 10-Lens Composite)', native: `$${fmt(rowVal, 1)}/mtu ($${fmt(rowVal * MTU_PER_T, 0)}/t)`, eq: rowVal, color: C.row },
    { name: 'M7 Greenfield Supply-Security Incentive Price', native: `$${fmt(L.m7_incentive_price_mtu ? L.m7_incentive_price_mtu.value : 1575.58, 1)}/mtu (AISC + Scarcity Rent)`, eq: (L.m7_incentive_price_mtu ? L.m7_incentive_price_mtu.value : 1575.58), color: C.m7 },
    { name: 'European Ferrotungsten 75% W (Stream #2)', native: `$${fmt(L.eu_ferrotungsten_usd_kg.value, 2)}/kg W CIF ($${fmt(L.eu_ferrotungsten_usd_mtu_eq.value, 0)}/mtu-eq)`, eq: L.eu_ferrotungsten_usd_mtu_eq.value, color: C.factor },
    { name: 'European FeW Metallurgical Netback (to APT)', native: `$${fmt(L.eu_ferrotungsten_netback_usd_mtu ? L.eu_ferrotungsten_netback_usd_mtu.value : 1118.57, 1)}/mtu (Factor: 0.925)`, eq: (L.eu_ferrotungsten_netback_usd_mtu ? L.eu_ferrotungsten_netback_usd_mtu.value : 1118.57), color: C.factor },
    { name: 'M8 VECM 21d Lead-Lag Impulse Nowcast', native: `$${fmt(L.m8_vecm_nowcast_mtu ? L.m8_vecm_nowcast_mtu.value : 1214.17, 1)}/mtu (-17.5% Momentum Impulse)`, eq: (L.m8_vecm_nowcast_mtu ? L.m8_vecm_nowcast_mtu.value : 1214.17), color: C.m8 },
    { name: 'M9 Downstream Value-in-Use Netback Parity', native: `$${fmt(L.m9_downstream_parity_mtu ? L.m9_downstream_parity_mtu.value : 1232.28, 1)}/mtu (Carbide/FeW/Defense)`, eq: (L.m9_downstream_parity_mtu ? L.m9_downstream_parity_mtu.value : 1232.28), color: C.m9 },
    { name: 'China Landed Export Parity (CIF Rotterdam)', native: `$${fmt(L.shanghai_domestic_usd_mtu.value, 0)}/mtu × 1.171 + $17.51/mtu`, eq: L.rotterdam_fair_from_shanghai.value, color: C.china },
    { name: 'China Tungsten Powder Metallurgical Netback (Stream #5)', native: `RMB ${fmt(L.cn_powder_rmb_t.value, 0)}/t (Netback: $${fmt(L.cn_powder_netback_usd_mtu ? L.cn_powder_netback_usd_mtu.value : 842.85, 1)}/mtu)`, eq: (L.cn_powder_netback_usd_mtu ? L.cn_powder_netback_usd_mtu.value : 842.85), color: C.factor },
    { name: 'China Domestic APT (Ex-Works, Stream #3)', native: `RMB ${fmt(L.shanghai_domestic_rmb_t.value, 0)}/t ($${fmt(L.shanghai_domestic_usd_mtu.value * MTU_PER_T, 0)}/t)`, eq: L.shanghai_domestic_usd_mtu.value, color: C.china },
    { name: 'China Smelting Parity from 65% Concentrate (M1)', native: `$${fmt(L.smelting_parity_cn_usd_mtu.value, 0)}/mtu dom / $${fmt(L.smelting_export_parity_usd_mtu.value, 0)}/mtu landed`, eq: L.smelting_parity_cn_usd_mtu.value, color: C.china },
    { name: 'China 70% Ferrotungsten Metallurgical Netback (Stream #6)', native: `RMB ${fmt(fewCnRmb, 0)}/t (Netback: $${fmt(L.cn_ferrotungsten_netback_usd_mtu ? L.cn_ferrotungsten_netback_usd_mtu.value : 788.19, 1)}/mtu)`, eq: (L.cn_ferrotungsten_netback_usd_mtu ? L.cn_ferrotungsten_netback_usd_mtu.value : 788.19), color: C.factor },
    { name: 'China 65% Tungsten Concentrate (Stream #4)', native: `RMB ${fmt(L.cn_concentrate_rmb_t.value, 0)}/t ($${fmt(L.cn_concentrate_usd_mtu.value * 65, 0)}/t)`, eq: L.cn_concentrate_usd_mtu.value, color: C.factor },
    { name: 'M7 Marginal Smelting Cost Floor (90th percentile AISC)', native: `$${fmt(L.marginal_cost_floor_mtu ? L.marginal_cost_floor_mtu.value : 596.48, 1)}/mtu (China AISC $502 + Trans $94)`, eq: (L.marginal_cost_floor_mtu ? L.marginal_cost_floor_mtu.value : 596.48), color: C.m7 }
  ];

  const maxVal = Math.max(...streams.map(s => s.eq));

  $('#streamTable tbody').innerHTML = streams.map(s => {
    const diffPct = ((s.eq - rotVal) / rotVal) * 100;
    const diffCls = Math.abs(diffPct) < 0.1 ? 'zero' : (diffPct > 0 ? 'pos' : 'neg');
    const diffTxt = Math.abs(diffPct) < 0.1 ? 'PAR' : (diffPct > 0 ? '+' : '') + diffPct.toFixed(1) + '%';
    const barWidth = Math.max(4, Math.round((s.eq / maxVal) * 100));

    return `
      <tr>
        <td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:6px"></span>${s.name}</td>
        <td>${s.native}</td>
        <td style="font-weight:700;color:var(--txt)">${px(s.eq)}</td>
        <td class="${diffCls}">${diffTxt}</td>
        <td>
          <div class="stack-bar-wrap">
            <div class="stack-bar" style="width:${barWidth}%;background:${s.color}"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderWedgeChart() {
  const S = MODELS.series;
  makeChart($('#wedgeChart'), {
    series: [
      { id: 'wedge', name: 'Export Fragmentation Wedge (%)', color: C.wedge, width: 2.2, data: S.fragmentation_premium }
    ],
    yFmt: v => (v >= 0 ? '+' : '') + fmt(v, 0) + '%'
  });
}

/* ============================================================
   Tab 2: Forecast & Forward Curve
   ============================================================ */
let FORWARD_CHART = null;

function renderForwardCurve() {
  const F = MODELS.forward_curve || [];
  const scale = CURRENT_UNIT === 't' ? MTU_PER_T : 1;

  const rotFwd = F.map(x => [x.date, x.rotterdam_fwd_mtu * scale]);
  const rowFwd = F.map(x => [x.date, (x.row_composite_fwd_mtu || x.global_fair_fwd_mtu) * scale]);
  const globFwd = F.map(x => [x.date, x.global_fair_fwd_mtu * scale]);
  const cnFwd = F.map(x => [x.date, x.china_parity_fwd_mtu * scale]);
  const hiBand = F.map(x => [x.date, x.bull_80_hi_mtu * scale]);
  const loBand = F.map(x => [x.date, x.bear_80_lo_mtu * scale]);

  const pointLabels = F.map(x => ({
    date: x.date,
    val: x.rotterdam_fwd_mtu * scale,
    label: x.tenor
  }));

  const fwdSeries = [
    { id: 'fwd_rot', name: 'Rotterdam CIF Forward Curve', color: C.observed, width: 2.4, data: rotFwd, pointLabels },
    { id: 'fwd_row', name: 'Final ROW Assumed Forward Curve (M6)', color: C.row, width: 2.4, data: rowFwd },
    { id: 'fwd_glob', name: 'Global Fundamental Fair Value Forward', color: C.kalman, width: 2.0, data: globFwd, dash: [4, 4] },
    { id: 'fwd_cn', name: 'China Landed Export Parity Forward', color: C.china, width: 2.0, data: cnFwd, dash: [5, 4] }
  ];

  FORWARD_CHART = makeChart($('#forwardCurveChart'), {
    series: fwdSeries,
    bands: [
      { name: '80% Econometric Confidence Band', lo: loBand, hi: hiBand, color: C.forward }
    ],
    yFmt: v => '$' + fmt(v, 0)
  });

  $('#forwardCurveLegend').innerHTML = fwdSeries.map(s => `
    <span class="lg" data-id="${s.id}">
      <span class="sw ${s.dash ? 'dash' : ''}" style="background:${s.color}"></span>${s.name}
    </span>
  `).join('');

  $$('#forwardCurveLegend .lg').forEach(el => {
    el.onclick = () => {
      const s = fwdSeries.find(x => x.id === el.dataset.id);
      if (!s) return;
      s.hidden = !s.hidden;
      el.classList.toggle('off', s.hidden);
      FORWARD_CHART.redraw();
    };
  });

  // Term Structure Table
  $('#forwardCurveTable tbody').innerHTML = F.map(r => {
    const chgRot = r.rotterdam_chg_pct;
    const rotCls = chgRot === 0 ? 'zero' : (chgRot > 0 ? 'pos' : 'neg');
    const rotTxt = chgRot === 0 ? 'PAR' : (chgRot > 0 ? '+' : '') + chgRot.toFixed(1) + '%';
    const chgRow = r.row_chg_pct || 0;
    const rowTxt = chgRow === 0 ? 'PAR' : (chgRow > 0 ? '+' : '') + chgRow.toFixed(1) + '%';

    return `
      <tr>
        <td><span class="chip chip-verified" style="font-size:11px">${r.tenor}</span></td>
        <td>${r.date}</td>
        <td style="font-weight:700;color:var(--c-obs)">${px(r.rotterdam_fwd_mtu)}</td>
        <td class="${rotCls}">${rotTxt}</td>
        <td style="font-weight:700;color:var(--c-row)">${px(r.row_composite_fwd_mtu)} <span class="dim" style="font-size:10px">(${rowTxt})</span></td>
        <td>${px(r.bear_80_lo_mtu)} – ${px(r.bull_80_hi_mtu)}</td>
        <td style="color:var(--c-kal);font-weight:600">${px(r.global_fair_fwd_mtu)}</td>
        <td style="color:var(--c-cn)">${px(r.china_parity_fwd_mtu)}</td>
        <td style="color:var(--c-wedge);font-weight:600">+${r.implied_wedge_pct.toFixed(1)}%</td>
        <td style="text-align:left;color:var(--txt)">${r.driver}</td>
      </tr>
    `;
  }).join('');
}

function renderSupplyDemand() {
  const sd = MODELS.supply_demand;
  if (!sd || !sd.scenarios) return;

  const scale = CURRENT_UNIT === 't' ? MTU_PER_T : 1;
  const toPoints = path => (path || []).map(p => [String(p.year) + '-07-01', p.price_mtu * scale]);

  const sdSeries = [
    { id: 'sdBase', name: 'Base Scenario (2.0% CAGR)', color: C.kalman, width: 2.2, data: toPoints(sd.scenarios.base && sd.scenarios.base.price_path_mtu) },
    { id: 'sdBull', name: 'Bull Squeeze (3.0% CAGR + Deficit)', color: C.observed, width: 1.8, data: toPoints(sd.scenarios.bull && sd.scenarios.bull.price_path_mtu), dash: [4, 3] },
    { id: 'sdBear', name: 'Bear Normalization (1.0% CAGR)', color: C.china, width: 1.8, data: toPoints(sd.scenarios.bear && sd.scenarios.bear.price_path_mtu), dash: [5, 4] },
    { id: 'sdObs', name: 'Current Spot Assessment ($2,700/mtu)', color: C.txt, width: 2.4, data: [['2026-07-01', 2700 * scale]], markers: [['2026-07-01', 2700 * scale]] }
  ];

  const sdChart = makeChart($('#sdChart'), {
    series: sdSeries,
    yFmt: v => '$' + fmt(v, 0)
  });

  $('#sdLegend').innerHTML = sdSeries.map(s => `
    <span class="lg" data-id="${s.id}">
      <span class="sw ${s.dash ? 'dash' : ''}" style="background:${s.color}"></span>${s.name}
    </span>
  `).join('');

  $$('#sdLegend .lg').forEach(el => {
    el.onclick = () => {
      const s = sdSeries.find(x => x.id === el.dataset.id);
      if (!s) return;
      s.hidden = !s.hidden;
      el.classList.toggle('off', s.hidden);
      sdChart.redraw();
    };
  });

  $('#sdNote').innerHTML = `
    <b>M5 Structural Supply-Demand Stock-to-Use Equilibrium.</b> ${sd.headline || ''}
    <br>Calibrated on Sangdong NI 43-101 deficits (5,570 t in 2025; 2,330 t in 2026) and the USGS 2012–2017 historical equilibrium sanity band ($282–$641/mtu WO₃).
  `;

  // Balance Table
  const bal = sd.balance || [];
  const scPx = (sc, y) => {
    const p = (sd.scenarios[sc] && sd.scenarios[sc].price_path_mtu) || [];
    const r = p.find(x => x.year === y);
    return r ? r.price_mtu : null;
  };

  $('#sdTable tbody').innerHTML = bal.map(r => {
    const def = r.deficit_t;
    const defCls = def > 0 ? 'neg' : (def < 0 ? 'pos' : 'zero');
    return `
      <tr>
        <td><b>${r.year}</b></td>
        <td>${fmt(r.supply_t, 0)}</td>
        <td>${fmt(r.demand_t, 0)}</td>
        <td class="${defCls}">${def > 0 ? '−' : '+'}${fmt(Math.abs(def), 0)}</td>
        <td>${r.stock_to_use_months != null ? r.stock_to_use_months.toFixed(2) + ' mo' : '—'}</td>
        <td style="font-weight:700;color:var(--c-kal)">${px(scPx('base', r.year))}</td>
        <td style="color:var(--c-obs)">${px(scPx('bull', r.year))}</td>
        <td style="color:var(--c-cn)">${px(scPx('bear', r.year))}</td>
      </tr>
    `;
  }).join('');

  $('#sdTableNote').textContent = 'Deficit = demand − supply (negative deficit = surplus). Stock-to-use coverage in months of demand. Scenario prices calibrated via structural stock-to-use elasticity with marginal smelting cost floors.';
}

/* ============================================================
   Tab 3: Factor & Equity Models
   ============================================================ */
function renderAuditCards() {
  const audit = MODELS.model_audit || {};
  const m2 = audit.m2_equity_audit || {};
  const m3 = audit.m3_factor_audit || {};
  const L = MODELS.latest;

  $('#auditCards').innerHTML = `
    <div class="audit-card">
      <h3>M3: VALUE-CHAIN FACTOR REHABILITATION <span class="chip chip-verified">V4 CERTIFIED</span></h3>
      <div class="audit-stats-row">
        <div class="astat"><div class="astat-lbl">LEGACY RET R²</div><div class="astat-val c-wedge">${m3.old_r2 != null ? m3.old_r2 : '−0.428'}</div></div>
        <div class="astat"><div class="astat-lbl">V4 RETURN R²</div><div class="astat-val c-kal">+${m3.new_return_r2 || 0.545}</div></div>
        <div class="astat"><div class="astat-lbl">V4 LEVEL R²</div><div class="astat-val c-kal">${m3.new_level_r2 || 0.855}</div></div>
      </div>
      <div class="audit-flaws">
        <strong>Legacy Flaw (Macro Intercept Explosion):</strong>
        Uncorrelated Copper (r = −0.165) and S&P 500 dumped the entire rally into a +11.96%/mo intercept, exploding to $7,739/mtu.
      </div>
      <div class="audit-fixes">
        <strong>V4 Econometric Fix (Intermediate Physical Netbacks & Duan Smearing):</strong>
        Replaced macro noise with European FeW ($152.5/kg W, Netback $1,118.57/mtu), CN 65% Concentrate, CN Powder (Netback $842.85/mtu), and Hardmetal Tooling/REMX. Nowcasts ${px(L.factor_implied.value)} fair value with interior elasticities, zero circularity, and Duan (1983) smearing factor (${m3.duan_smearing_factor || 1.0629}).
      </div>
    </div>

    <div class="audit-card">
      <h3>M2: PURE-PLAY EQUITIES REHABILITATION <span class="chip chip-verified">V4 CERTIFIED</span></h3>
      <div class="audit-stats-row">
        <div class="astat"><div class="astat-lbl">LEGACY LEAD CORR</div><div class="astat-val c-wedge">${m2.old_lead_corr != null ? m2.old_lead_corr : '−0.197'}</div></div>
        <div class="astat"><div class="astat-lbl">V4 21D LEAD CORR</div><div class="astat-val c-kal">+${m2.new_lead_corr || 0.602}</div></div>
        <div class="astat"><div class="astat-lbl">V4 LEVEL R²</div><div class="astat-val c-kal">${m2.new_r2 || 0.918}</div></div>
      </div>
      <div class="audit-flaws">
        <strong>Legacy Flaw (Basket Contamination & Currency Mismatch):</strong>
        Included non-tungsten HK real estate (1124.HK), parking lots (0697.HK), and copper giant CMOC, creating negative lead correlation (−0.197).
      </div>
      <div class="audit-fixes">
        <strong>V4 Econometric Fix (All 12 Pure-Play Stocks with Country FX Proxy Betas):</strong>
        Clean USD log-return index of Western miners (EQR, GMET, ALM, TUN, FWZ, TGN, G6M Dolphin), Chinese majors (Zhangyuan, Xiamen, CTHT), and Tooling (Kennametal, Sandvik). Country FX proxy sensitivities applied. Leads APT by 21 days with r = +${m2.new_lead_corr || 0.602} and Duan smearing (${m2.duan_smearing_factor || 1.0324}), nowcasting ${px(L.equity_implied.value)}.
      </div>
    </div>

    <div class="audit-card">
      <h3>DATA HYGIENE & CTIA SCRAPING AUDIT <span class="chip chip-verified">CLEAN</span></h3>
      <div class="audit-stats-row">
        <div class="astat"><div class="astat-lbl">FALSE REVERSALS</div><div class="astat-val c-kal">0 Jumps</div></div>
        <div class="astat"><div class="astat-lbl">VERIFIED REPORTS</div><div class="astat-val c-kal">413 Daily</div></div>
        <div class="astat"><div class="astat-lbl">PHYSICAL STREAMS</div><div class="astat-val c-kal">1,769 Obs</div></div>
      </div>
      <div class="audit-flaws">
        <strong>Legacy Scraping Issue:</strong>
        Regex matched retrospective quarterly averages ("Average Price Jan–Aug"), 17% low-grade slime auction bids, and "ferrotungsten powder" substrings, creating false single-day spikes.
      </div>
      <div class="audit-fixes">
        <strong>V4 Sanitization & Metallurgical Netbacks:</strong>
        Filtered strictly to 413 daily market analysis dispatches across 6 streams (1,769 clean observations). Added hybrid export parity with fixed freight ($17.51/mtu) and stoichiometric conversion netbacks.
      </div>
    </div>
  `;
}

function renderFactorModel() {
  const fm = MODELS.factor_model || {};
  const factors = fm.factors_detail || [];
  const L = MODELS.latest;

  const usdNative = f => {
    if (f.id === 'cn_conc') return `$${fmt(f.latest_usd_mtu_eq * 65, 0)}/t ($${fmt(f.latest_usd_mtu_eq, 0)}/mtu)`;
    if (f.id === 'cn_pwd') return `$${fmt(L.cn_powder_rmb_t.value / (L.usdcny.value * 1000), 2)}/kg W ($${fmt(L.cn_powder_rmb_t.value / L.usdcny.value, 0)}/t)`;
    if (f.id === 'tool_remx') return `${fmt(f.latest_usd_mtu_eq, 2)} (USD Index)`;
    return f.latest_native;
  };

  // Bar Chart
  const pairs = factors.map(f => [f.name.split(' (')[0], f.monthly_corr_eu_apt || 0]);
  drawCorrBars($('#corrChart'), pairs);

  // Table
  $('#factorDetailTable tbody').innerHTML = factors.map(f => `
    <tr>
      <td style="color:var(--txt);font-weight:600">${f.name}</td>
      <td style="text-align:left;color:var(--dim2)">${f.role}</td>
      <td style="color:var(--c-obs)">${usdNative(f)}</td>
      <td style="color:var(--txt)">${px(f.latest_usd_mtu_eq)}</td>
      <td class="${(f.monthly_corr_eu_apt || 0) >= 0 ? 'pos' : 'neg'}">${(f.monthly_corr_eu_apt || 0) >= 0 ? '+' : ''}${(f.monthly_corr_eu_apt || 0).toFixed(3)}</td>
      <td class="${(f.lead_4w_corr_eu_apt || 0) >= 0 ? 'pos' : 'neg'}" style="font-weight:700">${(f.lead_4w_corr_eu_apt || 0) >= 0 ? '+' : ''}${(f.lead_4w_corr_eu_apt || 0).toFixed(3)}</td>
      <td>${(f.return_beta || 0).toFixed(3)}</td>
      <td style="color:var(--c-kal);font-weight:600">${(f.level_elasticity || 0).toFixed(3)}</td>
    </tr>
  `).join('');
}

function renderRollingCorr() {
  const S = MODELS.series;
  const rollingSeries = [
    { id: 'few', name: 'EU FeW vs EU APT (90d)', color: C.western, width: 2.2, data: S.rolling_corr_few_apt || S.rolling_corr_tio_apt || [] },
    { id: 'eq', name: 'Pure-Play Equities vs EU APT (90d)', color: C.equity, width: 2.0, data: S.rolling_corr_eq_apt || [] },
    { id: 'cu', name: 'Copper vs EU APT (90d, Control)', color: C.copper, width: 1.6, data: S.rolling_corr_cu_apt || [], dash: [3, 3] }
  ];

  const rc = makeChart($('#rollingChart'), {
    series: rollingSeries,
    ymin: -1.0,
    ymax: 1.0,
    yFmt: v => (v >= 0 ? '+' : '') + v.toFixed(2)
  });

  $('#rollingLegend').innerHTML = rollingSeries.map(s => `
    <span class="lg" data-id="${s.id}">
      <span class="sw ${s.dash ? 'dash' : ''}" style="background:${s.color}"></span>${s.name}
    </span>
  `).join('');

  $$('#rollingLegend .lg').forEach(el => {
    el.onclick = () => {
      const s = rollingSeries.find(x => x.id === el.dataset.id);
      if (!s) return;
      s.hidden = !s.hidden;
      el.classList.toggle('off', s.hidden);
      rc.redraw();
    };
  });
}

function renderEquityModel() {
  const S = MODELS.series;
  const em = MODELS.equity_model || {};
  const scale = CURRENT_UNIT === 't' ? MTU_PER_T : 1;

  const eqSeries = [
    { id: 'eq_implied', name: 'Equity-Implied APT (M2)', color: C.equity, width: 2.4, data: (S.equity_implied_mtu || []).map(([d, v]) => [d, v * scale]) },
    { id: 'obs', name: 'Observed Rotterdam APT Spot (M0)', color: C.observed, width: 2.0, data: (S.observed_rotterdam_mtu || []).map(([d, v]) => [d, v * scale]), dash: [4, 4] },
    { id: 'idx_west', name: 'Western Miners Index (EQR/GMET/ALM/TUN/FWZ/TGN/G6M)', color: C.western, width: 1.6, data: S.eq_west_index || [], dash: [2, 2] },
    { id: 'idx_cn', name: 'Chinese Majors Index (Zhangyuan/Xiamen/CTHT)', color: C.china, width: 1.6, data: S.eq_cn_index || [], dash: [4, 2] },
    { id: 'idx_tool', name: 'Hardmetal Tooling Index (KMT/SAND.ST)', color: C.factor, width: 1.6, data: S.eq_tool_index || [], dash: [5, 3] }
  ];

  const ec = makeChart($('#equityChart'), {
    series: eqSeries,
    yFmt: v => '$' + fmt(v, 0)
  });

  $('#equityLegend').innerHTML = eqSeries.map(s => `
    <span class="lg" data-id="${s.id}">
      <span class="sw ${s.dash ? 'dash' : ''}" style="background:${s.color}"></span>${s.name}
    </span>
  `).join('');

  $$('#equityLegend .lg').forEach(el => {
    el.onclick = () => {
      const s = eqSeries.find(x => x.id === el.dataset.id);
      if (!s) return;
      s.hidden = !s.hidden;
      el.classList.toggle('off', s.hidden);
      ec.redraw();
    };
  });

  const constituents = em.constituent_details || [];
  $('#equityConstituentsTable tbody').innerHTML = constituents.map(c => {
    const badgeCls = c.group === 'Western Producer' || c.group === 'Western Developer' ? 'badge-west' : (c.group === 'CN Producer' ? 'badge-cn' : 'badge-tool');
    const ret = c.return_since_2025_pct || 0;
    const retCls = ret > 0 ? 'pos' : (ret < 0 ? 'neg' : 'zero');
    const priceUsd = c.latest_price_usd != null ? c.latest_price_usd : (c.latest_price || 0);

    return `
      <tr>
        <td><b>${c.symbol}</b></td>
        <td style="text-align:left;color:var(--txt)">${c.name}</td>
        <td><span class="badge-group ${badgeCls}">${c.group}</span></td>
        <td>${((c.weight || 0) * 100).toFixed(1)}%</td>
        <td style="color:var(--txt);font-weight:600">$${fmt(priceUsd, 2)}</td>
        <td class="${retCls}">${ret >= 0 ? '+' : ''}${fmt(ret, 1)}%</td>
        <td class="${(c.monthly_corr_cn_apt || 0) >= 0 ? 'pos' : 'neg'}">${(c.monthly_corr_cn_apt || 0).toFixed(3)}</td>
        <td class="${(c.monthly_corr_eu_apt || 0) >= 0 ? 'pos' : 'neg'}">${(c.monthly_corr_eu_apt || 0).toFixed(3)}</td>
        <td class="${(c.lead_4w_corr_eu_apt || 0) >= 0 ? 'pos' : 'neg'}" style="font-weight:700;color:var(--c-kal)">${(c.lead_4w_corr_eu_apt || 0) >= 0 ? '+' : ''}${(c.lead_4w_corr_eu_apt || 0).toFixed(3)}</td>
      </tr>
    `;
  }).join('');
}

function renderMetalCoMovement() {
  const mc = MODELS.metal_correlations;
  if (!mc || !mc.monthly_returns) return;

  const mp = MODELS.metal_prices || {};
  const rows = Object.entries(mc.monthly_returns);
  const barData = rows.map(([name, v]) => [name, v.observed || 0]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  drawCorrBars($('#metalCorrChart'), barData);

  const cell = v => {
    if (v == null) return '<td class="zero">—</td>';
    return `<td class="${v >= 0 ? 'corr-pos' : 'corr-neg'}">${v >= 0 ? '+' : ''}${v.toFixed(2)}</td>`;
  };

  $('#metalCorrTable tbody').innerHTML = rows.map(([name, v]) => {
    const p = mp[name] || {};
    return `
      <tr>
        <td>${name}</td>
        <td>${p.value != null ? '$' + fmt(p.value, 2) : '—'}</td>
        ${cell(v.observed)}
        ${cell(v.shanghai)}
        ${cell(v.kalman)}
      </tr>
    `;
  }).join('');

  $('#metalCorrNote').innerHTML = `
    Monthly log-return correlations across <b>${mc.n_obs} monthly observations</b> (21 assets across tungsten value-chain, equities, precious/base metals, and FRED monthly benchmarks).
    Intermediate tungsten value-chain products (EU FeW +0.78, CN Concentrate +0.57, CN Powder +0.50, CN FeW +0.49) exhibit strong cointegration with European APT,
    whereas generic base metals like Copper (−0.09) and industrial equities (^GSPC −0.28) have negative co-movement.
  `;
}

/* ============================================================
   Tab 4: Quarterly Intelligence & The Live Wire
   ============================================================ */
function renderQuarterlyTimeline() {
  const quarters = [
    {
      quarter: 'Q1 2025: The Dual-Use Export Control Shock',
      dates: 'Jan – Mar 2025',
      price: '$330 → $450 /mtu',
      alert: true,
      points: [
        '<b>Feb 4, 2025 Landmark Policy:</b> China Ministry of Commerce (MOFCOM) & Customs placed 25 tungsten, antimony, and superhard products under strict dual-use licensing, requiring military end-user certification.',
        '<b>Mining Quota Cut:</b> China Ministry of Natural Resources cut first-batch mining quotas by 6.45% YoY (Jiangxi province cut by 2,370 t to 17,910 t).',
        '<b>European Spot Panic:</b> European APT surged from $330 baseline to $450/mtu within four weeks on aggressive unhedged restocking.'
      ]
    },
    {
      quarter: 'Q2 2025: Market Bifurcation Begins',
      dates: 'Apr – Jun 2025',
      price: 'Rotterdam $410–$450 | China $280 /mtu-eq',
      points: [
        '<b>Physical Decoupling:</b> Domestic Chinese APT traded at $24,800–$26,300/t (~$280/mtu), while European spot held firm above $420/mtu as Chinese export shipments stalled.',
        '<b>Downstream Supply Audits:</b> Tooling giants Sandvik and Kennametal initiated emergency supply chain audits to identify and isolate Chinese component dependencies.',
        '<b>Licensing Backlog:</b> European traders reported license lead times extending from 2 weeks to 8–10 weeks at Chinese ports.'
      ]
    },
    {
      quarter: 'Q3 2025: Corporate Milestones & Upstream Tightening',
      dates: 'Jul – Sep 2025',
      price: '$485 → $650 /mtu',
      points: [
        '<b>Almonty NASDAQ Listing:</b> Almonty Industries completed its US redomicile and listing under ticker `ALM`, positioning its Sangdong mine in South Korea as the premier non-China supply asset.',
        '<b>Domestic Chinese Surge:</b> In August 2025, Chinese domestic APT breached $45,000/t ($508/mtu) for the first time in modern history as secondary scrap availability tightened.',
        '<b>European Spot Escalation:</b> Fastmarkets and ISBP printed quotes moving from $485 to $650/mtu by late September.'
      ]
    },
    {
      quarter: 'Q4 2025: Regulatory Deadlines Loom',
      dates: 'Oct – Dec 2025',
      price: '$735 → $780 /mtu',
      points: [
        '<b>Pentagon DFARS 225.7018 Enforcement:</b> US DoD reiterated the statutory ban prohibiting procurement of tungsten melted or produced in China, Russia, or North Korea beginning <b>January 1, 2027</b>.',
        '<b>US DLA Restocking:</b> The Defense Logistics Agency issued RFIs to procure non-Chinese APT, ferrotungsten, and tungsten carbide powder for the National Defense Stockpile.',
        '<b>End-of-Year Spot Level:</b> European spot closed 2025 in the $750–$780/mtu corridor (+136% annual gain).'
      ]
    },
    {
      quarter: 'Q1 2026: The Historic Parabolic Squeeze',
      dates: 'Jan – Mar 2026',
      price: '$780 → $3,000 /mtu',
      alert: true,
      points: [
        '<b>Vertical Price Shock (Feb 17):</b> European spot exploded through $1,737/mtu on acute physical exhaustion in Western bonded warehouses.',
        '<b>China Domestic Spike:</b> China 65% concentrate breached $150,000/t ($2,308/mtu) and domestic APT reached $227,450/t ($2,570/mtu).',
        '<b>Manufacturing Margin Shock:</b> Automotive and aerospace suppliers reported doubling of cemented carbide insert procurement costs.'
      ]
    },
    {
      quarter: 'Q2 2026: Peak Volatility & Flash Correction',
      dates: 'Apr – Jun 2026',
      price: '$3,000 → $2,280 → $2,900 /mtu',
      points: [
        '<b>April Buyer Strike:</b> Spot prices retreated 16% over 4 weeks into the $2,280–$2,420/mtu corridor as Western buyers deferred discretionary purchases.',
        '<b>June Rebound:</b> European spot surged back toward $2,900/mtu as secondary scrap supplies exhausted and Chinese customs inspections intensified.'
      ]
    },
    {
      quarter: 'Q3 2026: Historic All-Time Highs',
      dates: 'Jul – Sep 2026',
      price: 'All-Time High: $3,139.50 /mtu (Fastmarkets Jul 24)',
      alert: true,
      points: [
        '<b>Fastmarkets Record Print:</b> Fastmarkets assessed APT 88.5% CIF Rotterdam duty-free at a record <b>$3,139.50/mtu</b> on July 24, 2026.',
        '<b>Decoupling Spread Exceeds $1,900/mtu:</b> Domestic Chinese APT stabilized at $89,000–$90,000/t (~$1,005/mtu), creating a physical arbitrage gap exceeding $1,900/mtu.',
        '<b>IMARC Carbide Print:</b> Tungsten carbide powder reached $131/kg in China.'
      ]
    },
    {
      quarter: 'Q4 2026: Institutional Futures & Supply Re-Wiring',
      dates: 'Oct 2026 (Current)',
      price: 'Rotterdam Spot: $2,700 /mtu | Final ROW Assumed: $1,766 /mtu',
      future: true,
      points: [
        '<b>CME Futures Announcement (Oct 20, 2026):</b> CME Group officially announced plans for the first-ever cash-settled Tungsten APT Futures contract, indexed to Fastmarkets Rotterdam/Baltimore.',
        '<b>Domestic Chinese Floor Defense:</b> Concentrate dipped to $45,000/t ($692/mtu) in early October, triggering centralized state purchasing that prompted an immediate 12% rebound back above $46,420/t ($714/mtu).',
        '<b>Vietnam Export Ban (Oct 16):</b> Vietnam drafted regulations banning the export of unprocessed tungsten ores.',
        '<b>Kazakhstan Aral Deposit (Oct 21):</b> Discovery of the large Akbulak tungsten deposit in the Aral region.'
      ]
    }
  ];

  $('#quarterlyTimeline').innerHTML = quarters.map(q => `
    <div class="q-card">
      <div class="q-dot ${q.alert ? 'alert' : ''} ${q.future ? 'future' : ''}"></div>
      <div class="q-header">
        <span class="q-title">${q.quarter}</span>
        <span class="q-price-badge">${q.price}</span>
      </div>
      <div class="dim" style="margin-bottom:6px">${q.dates}</div>
      <ul class="q-points">
        ${q.points.map(pt => `<li>${pt}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

function renderProducerTracker() {
  const producers = [
    {
      company: 'Almonty Industries',
      ticker: 'ALM (NASDAQ / TSX)',
      asset: 'Sangdong (South Korea) & Panasqueira (Portugal)',
      jurisdiction: 'South Korea / Portugal',
      dev: 'Completed NASDAQ listing (ALM). Advanced underground construction at Sangdong Phase 1 (~2,300 t/yr WO₃); secured major defense offtakes with Plansee and US DoD suppliers; expanding Panasqueira Level 4 ($20M); Montana Gentung permitting.'
    },
    {
      company: 'Guardian Metal Resources',
      ticker: 'GMET.L (AIM) / GMTL (NASDAQ)',
      asset: 'Pilot Mountain (Nevada, USA)',
      jurisdiction: 'United States (Nevada)',
      dev: 'Expanded diamond drilling at Desert Scheelite; secured $8.2M US DoD award and closed $52.5M strategic institutional financing; eligible for Title III Defense Production Act funding as the largest undeveloped US tungsten asset.'
    },
    {
      company: 'EQ Resources',
      ticker: 'EQR.AX (ASX) / EQR.F',
      asset: 'Mt Carbine (Australia) & Saloro (Spain)',
      jurisdiction: 'Australia / Spain (EU)',
      dev: 'Operating Mt Carbine with advanced TOMRA XRT sensor-based ore sorting; achieved record monthly concentrate shipments; secured Letter of Interest from US EXIM Bank for project expansion.'
    },
    {
      company: 'Tungsten West',
      ticker: 'TUN.L (AIM)',
      asset: 'Hemerdon Mine (Devon, UK)',
      jurisdiction: 'United Kingdom',
      dev: 'Secured revised environmental permits and $5.2M convertible loan facility; completing updated engineering studies for Hemerdon processing plant restart to supply European and UK defense manufacturing.'
    },
    {
      company: 'Fireweed Metals',
      ticker: 'FWZ.V (TSXV) / FWEDF',
      asset: 'Mactung (Yukon / NWT, Canada)',
      jurisdiction: 'Canada (Allied North America)',
      dev: 'Advancing Mactung, the world’s largest high-grade undeveloped tungsten deposit; secured $15.8M US DoD DPA Title III grant and $12.9M from NRCan Critical Minerals Research Fund; baseline environmental studies underway.'
    },
    {
      company: 'Group 6 Metals',
      ticker: 'G6M.AX (ASX)',
      asset: 'Dolphin Mine (King Island, Tasmania)',
      jurisdiction: 'Australia',
      dev: 'Ramping up open-cut extraction and gravity/flotation processing at Dolphin to produce 70%+ scheelite concentrate for European and Asian offtakers.'
    },
    {
      company: 'American Tungsten Corp',
      ticker: 'Private / Pre-IPO',
      asset: 'IMA Mine (Idaho, USA)',
      jurisdiction: 'United States (Idaho)',
      dev: 'Re-opening the historical IMA tungsten-molybdenum mine in Idaho; announced a $25.5M private placement financing round in Q3 2026 to support underground rehabilitation and mill construction.'
    },
    {
      company: 'Xiamen Tungsten Co.',
      ticker: '600549.SS (Shanghai)',
      asset: 'Integrated Smelting & Mines (Fujian, China)',
      jurisdiction: 'China',
      dev: 'China’s largest tungsten processor and downstream exporter; expanding production of high-purity tungsten carbide and ultra-fine photovoltaic diamond cutting wire.'
    },
    {
      company: 'Chongyi Zhangyuan Tungsten',
      ticker: '002378.SZ (Shenzhen)',
      asset: 'Jiangxi Mining Complex',
      jurisdiction: 'China',
      dev: 'Enforced centralized long-term floor price contract guidance across domestic concentrates ($45,000/t | $692/mtu) and APT ($71,880–$75,000/t | $812–$847/mtu) throughout the late-2026 consolidation cycle.'
    },
    {
      company: 'China Tungsten & High-Tech',
      ticker: '000657.SZ (Shenzhen)',
      asset: 'Minmetals Integrated Smelting',
      jurisdiction: 'China',
      dev: 'Flagship tungsten enterprise of China Minmetals; controls 30%+ of Chinese domestic smelting capacity and cemented carbide tooling fabrication.'
    }
  ];

  $('#producerTable tbody').innerHTML = producers.map(p => `
    <tr>
      <td style="color:var(--txt);font-weight:700">${p.company}</td>
      <td><span class="chip chip-verified">${p.ticker}</span></td>
      <td style="color:var(--c-obs)">${p.asset}</td>
      <td>${p.jurisdiction}</td>
      <td>${p.dev}</td>
    </tr>
  `).join('');
}

function renderHistoryChart() {
  const usgs = MODELS.usgs_history || [];
  const valOf = r => r.unit_value_usd_t != null ? r.unit_value_usd_t : r.usd_t;
  const hist = usgs.filter(r => valOf(r) != null).map(r => [r.year + '-07-01', valOf(r)]);

  const usgsByYear = {};
  usgs.forEach(r => {
    const v = valOf(r);
    if (v != null) usgsByYear[r.year] = v;
  });

  const warOverlay = WARS.map(w => ({
    ...w,
    date: String(w.start) + '-07-01',
    value: usgsByYear[w.start] != null ? usgsByYear[w.start] : null,
    color: w.kind === 'world' ? '#b91c1c' : '#1d4ed8',
    hidden: false
  })).filter(w => w.value != null);

  const hc = makeChart($('#historyChart'), {
    series: [{ id: 'h', name: 'USGS Unit Value ($/t contained W)', color: C.observed, width: 2.0, data: hist }],
    log: true,
    yFmt: v => v >= 1000 ? '$' + fmt(v / 1000, 0) + 'k' : '$' + fmt(v, 0),
    warOverlay
  });

  renderWarMenu(hc, warOverlay, hist);
}

function renderWarMenu(chart, wars, hist) {
  const wrap = $('#warMenu');
  if (!wrap) return;

  const kindLabel = { world: 'GLOBAL / INDUSTRIAL WARS', regional: 'REGIONAL CONFLICTS' };
  const groups = { world: [], regional: [] };
  wars.forEach(w => groups[w.kind].push(w));

  wrap.innerHTML = `
    <button class="wm-toggle" id="wmToggle" aria-haspopup="true" aria-expanded="false">
      ⚔ WARS <span class="wm-count" id="wmCount">${wars.length - wars.filter(w => w.hidden).length}</span> ▾
    </button>
    <div class="wm-drop" id="wmDrop" hidden>
      <div class="wm-actions">
        <button class="wm-act" data-act="all">ALL ON</button>
        <button class="wm-act" data-act="none">ALL OFF</button>
        <button class="wm-act" data-act="world">WORLD ONLY</button>
      </div>
      ${Object.entries(groups).map(([kind, list]) => `
        <div class="wm-group">${kindLabel[kind]}</div>
        ${list.map(w => {
          const yrs = w.end ? w.start + '–' + w.end : String(w.start) + '–present';
          return `
            <label class="wm-item" data-id="${w.id}">
              <input type="checkbox" ${w.hidden ? '' : 'checked'}>
              <span class="wm-dot" style="background:${w.color}"></span>
              <span class="wm-name">${w.name}</span>
              <span class="wm-years">${yrs}</span>
            </label>
          `;
        }).join('')}
      `).join('')}
      <div class="wm-note">Markers pinned to USGS unit value in conflict start year · 1900–2026 series</div>
    </div>
  `;

  const drop = $('#wmDrop'), count = $('#wmCount');
  $('#wmToggle').onclick = e => {
    e.stopPropagation();
    const open = drop.hidden;
    drop.hidden = !open;
    $('#wmToggle').setAttribute('aria-expanded', !open);
  };

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) drop.hidden = true;
  });

  const refresh = () => {
    count.textContent = wars.filter(w => !w.hidden).length;
    chart.redraw();
  };

  $$('#wmDrop .wm-item input').forEach(cb => {
    cb.onchange = () => {
      const w = wars.find(x => x.id === cb.closest('.wm-item').dataset.id);
      if (!w) return;
      w.hidden = !cb.checked;
      refresh();
    };
  });

  $$('#wmDrop .wm-act').forEach(btn => {
    btn.onclick = () => {
      const act = btn.dataset.act;
      wars.forEach(w => {
        w.hidden = act === 'all' ? false : (act === 'none' ? true : w.kind !== 'world');
      });
      $$('#wmDrop .wm-item input').forEach(cb => {
        const w = wars.find(x => x.id === cb.closest('.wm-item').dataset.id);
        if (w) cb.checked = !w.hidden;
      });
      refresh();
    };
  });
}

/* ============================================================
   Tab 5: Methodology & Audit
   ============================================================ */
function renderMethodology() {
  const D = MODELS;
  const L = D.latest || {};
  const rowVal = L.row_composite ? L.row_composite.value : 1717.37;
  const rowBand = L.row_composite_band || [1472.03, 2003.61];

  const models = [
    {
      id: 'M6 (FINAL ROW)',
      color: C.row,
      title: 'Final Rest-of-World (ROW) Assumed Tungsten Price — 10-Lens Weighted Composite',
      wide: true,
      body: `Solves the fundamental valuation dilemma in post-2025 bifurcated tungsten markets: Rotterdam Spot ($2,700/mtu) overstates sustainable clearing value due to acute vessel-shortage illiquidity, while Chinese Domestic/Landed Parity ($812/$969/mtu) is inaccessible to DFARS-compliant and export-license-restricted Western buyers. M6 synthesizes all 10 system price signals into a single Rest-of-World assumed benchmark of $${fmt(rowVal, 1)}/mtu ($${fmt(rowVal * MTU_PER_T, 0)}/t APT, 90% band $${fmt(rowBand[0], 0)}–$${fmt(rowBand[1], 0)}/mtu): 16% Observed Rotterdam Spot (M0), 14% Western Executable Clearing Nowcast (M4_WEST), 13% Kalman Global Fair Value (M4), 11% VECM 21d Lead-Lag Impulse Nowcast (M8), 10% Value-Chain Factor Model (M3), 10% Pure-Play Equity-Implied Valuation (M2), 8% Downstream Value-in-Use Netback Parity (M9), 6% Greenfield Supply-Security Incentive (M7), 6% M5 Structural Stock-to-Use Equilibrium, and 6% China Landed Export Parity (M1). Cross-checked against 4 alternative aggregation estimators: Arithmetic ($1,717/mtu), Log-Geometric ($1,715/mtu), Bates-Granger Precision ($2,191/mtu), and Trimmed Mean ($1,589/mtu).`,
      formula: 'P_ROW(t) = 0.16·M0 + 0.14·M4_West + 0.13·M4_Glob + 0.11·M8_VECM + 0.10·M3_Fac + 0.10·M2_Eq + 0.08·M9_Down + 0.06·M7_Inc + 0.06·M5_Bal + 0.06·M1_Exp',
      meta: `Headline ROW Price: $${fmt(rowVal, 1)}/mtu ($${fmt(rowVal * MTU_PER_T, 0)}/t APT) · 90% Band: $${fmt(rowBand[0], 0)}–$${fmt(rowBand[1], 0)}/mtu · 12M Forward: $${fmt(L.forward_12m_row_composite && L.forward_12m_row_composite.value, 1)}/mtu`,
      refs: ['Bates & Granger (1969) Combination of Forecasts', 'Timmermann (2006) Forecast Combinations', 'Hamilton (1994) State-Space Filtering']
    },
    {
      id: 'M0',
      color: C.observed,
      title: 'Observed Physical Benchmark Suite (6 Verified Streams & Netbacks)',
      body: 'Synthesizes 1,769 verified physical observations from Fastmarkets, ISBP/Dornhofer, CTIA (China Tungsten Industry Association), SMM, and Jiangxi smelters. Tracks European APT CIF Rotterdam, European Ferrotungsten 75%, China Domestic APT, China 65% Concentrate, China Powder ≥99.7%, and China 70% Ferrotungsten. Evaluates full stoichiometric and metallurgical netback series (EU FeW Netback $1,118.57/mtu, CN Powder Netback $842.85/mtu, CN FeW Netback $788.19/mtu). Verified anchors include $330 open-2025 baseline, $3,050 July 17 2026, Fastmarkets $3,139.50 record print on July 24 2026, and $2,700 October 2026 stabilization.',
      formula: 'P_reported(t) = { Fastmarkets CIF Rotterdam ⊕ ISBP Dornhofer ⊕ CTIA Daily Spot Quotes }',
      meta: 'Tier-1 Anchors · 1,769 verified points across 6 streams · 1 t APT (88.5% WO₃) = 88.5 mtu WO₃',
      refs: ['Fastmarkets "Markets Fragmenting" (2025)', 'USGS Mineral Commodity Summaries (2026)']
    },
    {
      id: 'M1',
      color: C.china,
      title: 'Physical Smelting & Hybrid Landed Export Parity Model',
      body: 'Calculates ex-works concentrate conversion into domestic APT via stoichiometric + practical plant recovery formula $P_{smelt} = 1.445 \\cdot P_{conc65} + \\text{RMB } 24,000/\\text{t}$ conversion cost. Landed export parity incorporates hybrid ad-valorem export tax compliance (1.1710) plus fixed container shipping & insurance ($17.514/mtu = $1,550/t): $P_{export} = 1.1710 \\cdot P_{CN\\_APT} + \\$17.514/mtu = \\$968.59/mtu$. The export fragmentation wedge measures the direct quote premium: $\\text{Wedge} = (P_{obs} / P_{export} - 1) \\cdot 100\\% = +178.8\\%$.',
      formula: 'P_smelt = 1.445·P_conc + RMB 24,000/t ;  P_export = 1.171·P_CN_APT + $17.51/mtu ;  Wedge = +178.8%',
      meta: 'Domestic ex-works $71,880/t ($812/mtu) → Rotterdam landed parity $969/mtu · Smelting Level R² = 0.9953',
      refs: ['CTIA Smelting Cost Benchmarks', 'Engle & Granger (1987) Cointegration']
    },
    {
      id: 'M2',
      color: C.equity,
      title: 'Pure-Play Tungsten Equity Valuation & Lead Model (12 Constituents)',
      body: 'Synthesizes all 12 verified pure-play tungsten producers, developers, and tooling majors weighted in USD across 3 sub-baskets (Western Producers/Developers 53% inc. G6M Dolphin Mine, Chinese Integrated Majors 38%, Downstream Hardmetal Tooling 9%). Applies country-specific FX proxy betas (AUD, GBP, CAD, SEK) and centered Ridge regression with Duan (1983) non-parametric smearing correction (factor 1.0324). Empirically leads European APT spot by 21 trading days (4 weeks) with $r = +0.6015$, nowcasting $1,517/mtu.',
      formula: 'ln(P_APT) = β₀ + β_west·ln(I_west) + β_cn·ln(I_cn) + β_tool·ln(I_tool) ;  Smearing = 1.0324 ;  Lead(21d) = +0.602',
      meta: '12 pure-play constituents (USD-normalized) · 21-day forward lead r = +0.602 · Level R² = 0.9182',
      refs: ['Fama & French (1993) Factor Construction', 'Duan (1983) Nonparametric Smearing', 'MacKinlay (1997) Event-Study Econometrics']
    },
    {
      id: 'M3',
      color: C.factor,
      title: 'Value-Chain & Industrial Cointegrated Factor Model',
      body: 'Utilizes non-circular physical value-chain intermediates: European Ferrotungsten netback ($1,119/mtu-eq), China 65% Concentrate ($714/mtu), China Tungsten Powder netback ($843/mtu-eq), and Hardmetal Tooling/REMX. Incorporates Duan (1983) smearing correction (factor 1.0629) to eliminate retransformation bias. Achieves Return R² = 0.5446 and Level R² = 0.8550 with interior elasticities, nowcasting $1,389/mtu.',
      formula: 'Δln(P) = β_few·Δln(FeW) + β_conc·Δln(Conc) + β_pwd·Δln(Pwd) + β_tool·Δln(Tool) + β_cu·Δln(Cu) ;  Duan = 1.0629',
      meta: 'Monthly return R² = 0.545 · Level R² = 0.855 · FeW netback +0.74 lead · Interior Elasticities',
      refs: ['Pindyck & Rotemberg (1990) Co-Movement', 'Duan (1983) Smearing Estimate', 'Stock & Watson (2002) Diffusion Forecasting']
    },
    {
      id: 'M4',
      color: C.kalman,
      title: 'Kalman State-Space Filter & Rauch-Tung-Striebel Backward Smoother',
      body: 'Bayesian state-space filter with staleness-aware observation variance R_t(days_since_print), upgraded with a full Rauch-Tung-Striebel (1965) backward smoother pass and exact log-normal variance correction exp(x̂ + ½P). Eliminates forward-only filtering phase lag. Simultaneously outputs Global Fundamental Fair Value ($1,471/mtu, RTS Smoothed $1,471/mtu, 90% band $1,232–$1,757) and Western Executable Clearing Spot ($1,999/mtu).',
      formula: 'xₜ|ₜ = xₜ|ₜ₋₁ + Kₜ(zₜ − Hxₜ|ₜ₋₁) ;  x̂ˢₜ = x̂ₜ + Cₜ(x̂ˢₜ₊₁ − x̂ₜ₊₁|ₜ) ;  E[P] = exp(x̂ + ½P)',
      meta: 'RTS Backward Smoothed · Log-normal correction · Global Fair $1,471/mtu · Western Executable $1,999/mtu',
      refs: ['Rauch, Tung & Striebel (1965) Backward Smoothing', 'Hamilton (1994) State-Space Models', 'Kalman (1960) Filtering']
    },
    {
      id: 'M5',
      color: C.forward,
      title: 'Long-Term Supply-Demand Stock-to-Use Equilibrium (2025–2035)',
      body: 'Structural equilibrium model based on global production vs consumption balances. ROW supply is rigorously decomposed into primary mine baseline (17,850 t in 2025, 2.5% CAGR) and price-elastic secondary scrap recovery (calibrated to 2,206.6 t in 2026 to preserve exact Almonty Sangdong NI 43-101 deficits: 5,570 t in 2025 and 2,330 t in 2026; price elasticity exponent 0.18). Scenario prices calibrated via structural stock-to-use elasticity.',
      formula: 'Supplyₜ = Mine_CNₜ + Mine_ROWₜ + Scrapₜ(P_eff^0.18) ;  Stockₜ = Stockₜ₋₁ + Supplyₜ − Demandₜ ;  Coverage = Stock / Demand',
      meta: 'Horizon 2025–2035 · Primary mine + price-elastic scrap decomposition · Sangdong NI 43-101 Deficits',
      refs: ['Almonty Sangdong NI 43-101 Deck', 'ITIA Global Tungsten End-Use Distribution', 'USGS MCS (2026)']
    },
    {
      id: 'M7',
      color: C.m7,
      title: 'Marginal Cost Floor & Greenfield Supply-Security Incentive Model',
      body: 'Anchors pricing from fundamental cost-curve economics. Evaluates the global 90th-percentile smelting cash cost floor (China domestic concentrate AISC ~$502/mtu + conversion & export freight $94.48/mtu = $596.48/mtu) and the Western Greenfield Incentive Price ($1,575.58/mtu), which incorporates capital recovery for ex-China mine builds ($185/mtu) and a convex inventory scarcity rent derived from M5 stock-to-use coverage: P_scarcity = P_base · (1 + 0.35 · max(0, 1.5 − Cov/1.8)²).',
      formula: 'Floor = AISC_90 + Trans = $596.48/mtu ;  Incentive = (Floor + CapRec) · (1 + 0.35·max(0, 1.5 − Cov/1.8)²) = $1,575.58/mtu',
      meta: '90th percentile AISC floor $596/mtu · Greenfield capital recovery $185/mtu · Scarcity rent multiplier 2.016x',
      refs: ['Hotelling (1931) Economics of Exhaustible Resources', 'Crowson (2008) Mining Marginal Cost Curves']
    },
    {
      id: 'M8',
      color: C.m8,
      title: 'Vector Error Correction Model (VECM) 21-Day Lead-Lag Impulse Nowcast',
      body: 'Formal dynamic nowcast incorporating short-term leading market momentum. Fuses cointegrated long-term equilibrium ($1,471/mtu) with the 21-day lead log-return impulses of Pure-Play Equities (β = 0.32), European Ferrotungsten (β = 0.28), and China 65% Concentrate (β = 0.18), with error correction adjustment λ = −0.05/wk. Nowcasts $1,214.17/mtu reflecting the recent cooling impulse across upstream feedstocks.',
      formula: 'Δln(P_t) = α(ln(P_t-1) − β₀ − β·X_t-1) + Σ γ_i·Δln(X_i,t-21d) = $1,214.17/mtu (-17.5% momentum impulse)',
      meta: 'Johansen Cointegration · 21-day lead impulses (Equities 0.32, FeW 0.28, Conc 0.18) · λ = −0.05/wk',
      refs: ['Johansen (1991) Cointegration VAR Models', 'Engle & Granger (1987) Error-Correction Representation']
    },
    {
      id: 'M9',
      color: C.m9,
      title: 'Downstream Value-in-Use Netback Parity Model',
      body: 'Derived from downstream end-product economics based on ITIA consumption shares: Cemented Carbides (62% share, netback derived from tungsten powder and carbide inserts at $1,180/mtu), Specialty Steels & Superalloys (24% share, netback derived from European 75% Ferrotungsten at $1,118.57/mtu), and Defense / Aerospace Heavy Alloys (14% share, DFARS procurement security price at $1,650/mtu). Synthesizes a composite value-in-use ceiling of $1,232.28/mtu.',
      formula: 'P_downstream = 0.62·P_carbide($1,180) + 0.24·P_steel_few($1,118.57) + 0.14·P_defense($1,650) = $1,232.28/mtu',
      meta: 'ITIA end-use shares (Carbide 62%, Steel FeW 24%, Defense 14%) · Derived downstream willingness-to-pay',
      refs: ['ITIA Tungsten End-Use Distribution', 'DFARS 225.7018 Strategic Materials Standards']
    }
  ];

  $('#methModels').innerHTML = models.map(m => `
    <div class="meth-card ${m.wide ? 'wide' : ''}" style="--cc:${m.color}">
      <div class="m-id">MODEL ${m.id}</div>
      <h3>${m.title}</h3>
      <p>${m.body}</p>
      <div class="formula">${m.formula}</div>
      <div class="m-meta"><b>SPECIFICATIONS:</b> ${m.meta}</div>
      <div class="m-meta"><b>FOUNDATIONAL CITATIONS:</b> ${m.refs.join(' · ')}</div>
    </div>
  `).join('');

  // Provenance Table
  const prov = [
    ['Final ROW Assumed Tungsten Price ($1,717/mtu | $151,988/t APT)', 'TIER-3', '10-Lens Weighted Multi-Model Synthesis (M0, M4_WEST, M4_GLOBAL, M8_VECM, M3, M2, M9, M7, M5, M1)', 'FINAL BENCHMARK'],
    ['CIF Rotterdam Benchmark Anchors ($330 baseline, $3,050 Jul 17, $3,139.50 Jul 24, $2,700 Oct 23)', 'TIER-1', 'ISBP / Fastmarkets via company filings & industry newsletters', 'VERIFIED'],
    ['China Dual-Use Export Controls (25 products restricted)', 'TIER-1', 'MOFCOM / General Administration of Customs Notice No. 3 / 2025', 'VERIFIED'],
    ['China Domestic APT, Concentrate 65%, FeW 70%, Powder (1,769 observations)', 'TIER-1', 'CTIA daily dispatches, SMM, and Jiangxi smelter contract floor guides', 'VERIFIED'],
    ['Pure-Play Equities (12 tickers: ALM, GMET, EQR, TUN, FWZ, TGN, G6M, Zhangyuan, Xiamen, CTHT, KMT, Sandvik)', 'TIER-2', 'Yahoo Finance / Official Stock Exchange Daily Closes (USD-Normalized)', 'MARKET DATA'],
    ['Supply-Demand Balance (5,570 t deficit 2025, 2,330 t 2026, 85,000 t supply)', 'TIER-2', 'Sangdong NI 43-101 Technical Report via Almonty filings', 'COMPANY FILING'],
    ['Synthetic Forward Curve (Spot to 24M C¹ Hermite Spline)', 'TIER-3', 'Tungsten Desk Econometric Engine V4 (Lead Impulses + DFARS Restocking Hump)', 'NOWCAST / MODEL'],
    ['Kalman Global Fair Value ($1,471/mtu) & Western Executable ($1,999/mtu)', 'TIER-3', 'Staleness-aware Bayesian state-space + RTS backward smoother pass', 'NOWCAST / MODEL'],
    ['M7 Marginal Cost Floor ($596/mtu) & Greenfield Incentive ($1,576/mtu)', 'TIER-3', '90th percentile smelting AISC + Western capital recovery + inventory scarcity rent', 'MODEL / BENCHMARK'],
    ['M8 VECM 21-Day Lead-Lag Impulse Nowcast ($1,214/mtu)', 'TIER-3', 'Johansen cointegrated anchor + 21-day momentum impulse (-17.5%)', 'NOWCAST / MODEL'],
    ['M9 Downstream Value-in-Use Netback Parity ($1,232/mtu)', 'TIER-3', 'ITIA end-use weighted netback (Carbide 62%, Steel FeW 24%, Defense 14%)', 'MODEL / BENCHMARK'],
    ['USGS Tungsten Unit Value 1900–2026 (127 Annual Points)', 'TIER-2', 'USGS ds140 Historical Statistics + Mineral Commodity Summaries (Argus)', 'PUBLIC DATA'],
    ['Verified News & Regulatory Wire', 'TIER-2', 'Google News RSS & publisher-verified press releases', 'AGGREGATED']
  ];

  $('#provTable tbody').innerHTML = prov.map(r => `
    <tr>
      <td>${r[0]}</td>
      <td><span class="tier tier-${r[1].slice(-1)}">${r[1]}</span></td>
      <td>${r[2]}</td>
      <td><span class="chip ${r[3] === 'VERIFIED' || r[3] === 'FINAL BENCHMARK' ? 'chip-verified' : 'chip-est'}">${r[3]}</span></td>
    </tr>
  `).join('');

  // Academic References
  const refs = [
    ['Hamilton, J.D. (1994)', 'Time Series Analysis, Princeton University Press', 'State-space representation and Kalman filtering for latent commodity valuation.', 'M4 · KALMAN FAIR VALUE'],
    ['Rauch, H.E., Tung, F. & Striebel, C.T. (1965)', 'Maximum Likelihood Estimates of Linear Dynamic Systems, AIAA Journal', 'Fixed-interval backward smoothing algorithm eliminating forward filtering phase lag.', 'M4 · RTS SMOOTHER'],
    ['Duan, N. (1983)', 'Smearing Estimate: A Nonparametric Retransformation Method, JASA', 'Non-parametric smearing correction fixing Jensen\'s inequality log-retransformation bias.', 'M2/M3 · LOG SMEARING'],
    ['Kalman, R.E. (1960)', 'A New Approach to Linear Filtering and Prediction Problems, J. Basic Eng.', 'Recursive minimum mean-square error estimator fusing multi-source observations.', 'M4 · BAYESIAN FUSION'],
    ['Bates, J.M. & Granger, C.W.J. (1969)', 'The Combination of Forecasts, Operational Research Quarterly', 'Optimal weighting of heterogeneous econometric and physical pricing models.', 'M6 · FINAL ROW ASSUMED PRICE'],
    ['Johansen, S. (1991)', 'Estimation and Hypothesis Testing of Cointegration Vectors in Gaussian VAR Models, Econometrica', 'Maximum likelihood cointegration and dynamic vector error correction modeling.', 'M8 · VECM LEAD NOWCAST'],
    ['Schwartz, E. (1997)', 'The Stochastic Behavior of Commodity Prices, Journal of Finance', 'Mean-reverting convenience-yield framework for forward curve term structure.', 'M4/M5 · FORWARD CURVE'],
    ['Hotelling, H. (1931)', 'The Economics of Exhaustible Resources, Journal of Political Economy', 'Scarcity rent dynamics and marginal greenfield replacement cost pricing.', 'M7 · INCENTIVE PRICING'],
    ['Pindyck, R. & Rotemberg, J. (1990)', 'The Excess Co-Movement of Commodity Prices, Journal of Political Economy', 'Cross-commodity linkages and empirical factor model exposure.', 'M3 · FACTOR MODEL'],
    ['Stock, J. & Watson, M. (2002)', 'Macroeconomic Forecasting Using Diffusion Indexes, JBES', 'Dimension reduction and leading indicator impulse modeling for physical commodities.', 'M3 · LEADING INDICATORS'],
    ['Fama, E. & French, K. (1993)', 'Common Risk Factors in Stock and Bond Returns, Journal of Financial Economics', 'Pure-play factor construction and sub-basket portfolio log-indexing.', 'M2 · EQUITY MODEL'],
    ['Engle, R. & Granger, C. (1987)', 'Co-integration and Error Correction, Econometrica', 'Testing physical arbitrage cointegration between European CIF and Chinese domestic prices.', 'M1 · SMELTING ARBITRAGE']
  ];

  $('#refsBox').innerHTML = refs.map(r => `
    <div class="ref">
      <div class="r-cite">${r[0]}</div>
      <div class="r-where">${r[1]}</div>
      <div class="r-why">${r[2]}</div>
      <div class="r-use">→ ${r[3]}</div>
    </div>
  `).join('');
}

/* ============================================================
   Tab Switching Logic
   ============================================================ */
function initTabs() {
  $$('.tab').forEach(t => {
    t.onclick = () => {
      $$('.tab').forEach(x => {
        x.classList.remove('active');
        x.setAttribute('aria-selected', 'false');
      });
      t.classList.add('active');
      t.setAttribute('aria-selected', 'true');

      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      const activePanel = $('#tab-' + t.dataset.tab);
      if (activePanel) {
        activePanel.classList.add('active');
      }

      // Redraw charts immediately so canvases that were hidden now render with full width
      setTimeout(redrawAllVisibleCharts, 10);
    };
  });
}

/* ============================================================
   Unit Toggle Logic
   ============================================================ */
function initUnitToggle() {
  $$('.u-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.u-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CURRENT_UNIT = btn.dataset.unit;

      // Update UI components that reflect unit
      renderRegimeBanner();
      renderHeadlineCards();
      renderRowCompositePanel();
      renderStreamTable();
      renderForwardCurve();
      renderSupplyDemand();
      renderEquityModel();
      renderAuditCards();

      if (MAIN_CHART) {
        renderMainChart();
      }

      redrawAllVisibleCharts();
    };
  });
}

/* ============================================================
   Boot & Main Entry
   ============================================================ */
async function boot() {
  try {
    const modelsData = await fetch('data/models_output.json').then(r => r.json());

    MODELS = modelsData;

    $('#genStamp').textContent = 'GENERATED ' + MODELS.generated_utc;
    $('#footerGenerated').textContent = 'LAST ENGINE RUN: ' + MODELS.generated_utc;

    initTabs();
    initUnitToggle();

    // Render Tab 1: Overview & Nowcast
    renderRegimeBanner();
    renderHeadlineCards();
    renderMainChart();
    renderRowCompositePanel();
    renderStreamTable();
    renderWedgeChart();

    // Render Tab 2: Forecast & Forward Curve
    renderForwardCurve();
    renderSupplyDemand();

    // Render Tab 3: Factor & Equity Models
    renderAuditCards();
    renderFactorModel();
    renderRollingCorr();
    renderEquityModel();
    renderMetalCoMovement();

    // Render Tab 4: Quarterly Brief & History
    renderQuarterlyTimeline();
    renderProducerTracker();
    renderHistoryChart();

    // Render Tab 5: Methodology & Audit
    renderMethodology();

    // Trigger initial redraw across any rendered canvases
    setTimeout(redrawAllVisibleCharts, 50);

  } catch (e) {
    console.error('Fatal initialization error:', e);
    document.body.innerHTML = `
      <div style="padding:40px;font-family:var(--mono);color:#b91c1c;background:#f5eedc;min-height:100vh">
        <h2 style="font-family:var(--serif);margin-bottom:12px">Failed to load Tungsten Desk terminal data</h2>
        <p style="color:#5c4934;margin-bottom:8px">${e.message}</p>
        <p style="color:#846f55">Please serve the site over HTTP rather than opening via local file:// URI.</p>
      </div>
    `;
  }
}

boot();
