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
  observed: '#f59e0b',   /* Rotterdam Spot M0 - Amber */
  kalman: '#10b981',     /* Kalman Fair Value M4 - Emerald */
  western: '#38bdf8',    /* Western Executable Spot M4 - Sky */
  china: '#06b6d4',      /* China Parity M1 - Cyan */
  factor: '#a855f7',     /* Value-Chain Factor M3 - Violet */
  equity: '#f43f5e',     /* Pure-Play Equity M2 - Rose */
  forward: '#3b82f6',    /* Forward Curve / CME - Electric Blue */
  wedge: '#f97316',      /* Fragmentation Wedge - Orange */
  iron: '#22c55e',       /* Iron Ore - Green */
  copper: '#f97316',     /* Copper - Orange */
  grid: '#1b2536',
  axis: '#55667d',
  txt: '#f0f4f8'
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
            ctx.strokeStyle = '#07090e';
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
        ctx.strokeStyle = (wo.color || '#ef4444') + '55';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, M.t);
        ctx.lineTo(x, M.t + ih);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = wo.color || '#ef4444';
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, 7);
        ctx.fill();
        ctx.strokeStyle = '#07090e';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (x - lastLabelX > 64) {
          ctx.fillStyle = wo.color || '#ef4444';
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
    ctx.strokeStyle = 'rgba(240, 244, 248, 0.3)';
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
        <span class="tip-dot" style="background:#55667d"></span>
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
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = '#3b82f6';
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
      ctx.fillStyle = val >= 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)';
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

function renderTicker() {
  const L = MODELS.latest;
  const tkItems = [
    ['ROTTERDAM SPOT (M0)', px(L.reported_rotterdam.value), 'up'],
    ['CHINA LANDED PARITY (M1)', px(L.rotterdam_fair_from_shanghai.value), 'dn'],
    ['FRAGMENTATION WEDGE', '+' + fmt(L.fragmentation_premium_pct.value, 1) + '%', 'up'],
    ['KALMAN GLOBAL FAIR (M4)', px(L.kalman.value), 'up'],
    ['WESTERN EXECUTABLE (M4_WEST)', px(L.western_executable_nowcast.value), 'up'],
    ['VALUE-CHAIN FACTOR (M3)', px(L.factor_implied.value), 'up'],
    ['PURE-PLAY EQUITY (M2)', px(L.equity_implied.value), 'up'],
    ['3M SYNTHETIC FWD', px(L.forward_3m_rotterdam.value), 'dn'],
    ['12M SYNTHETIC FWD', px(L.forward_12m_rotterdam.value), 'dn'],
    ['EU FERROTUNGSTEN', '$' + fmt(L.eu_ferrotungsten_usd_kg.value, 1) + '/kg W', 'up'],
    ['CN CONCENTRATE 65%', 'RMB ' + fmt(L.cn_concentrate_rmb_t.value, 0) + '/t', 'up'],
    ['CN APT EX-WORKS', 'RMB ' + fmt(L.shanghai_domestic_rmb_t.value, 0) + '/t', 'up'],
    ['USD/CNY', fmt(L.usdcny.value, 4), '']
  ];

  const half = tkItems.map(([k, v, cls]) => `
    <span class="tk-item"><b>${k}</b> ${v} ${cls ? `<span class="${cls}">${cls === 'up' ? '▲' : '▼'}</span>` : ''}</span>
  `).join('');
  $('#tickerTrack').innerHTML = `<div class="ticker-inner">${half}${half}</div>`;
}

function renderRegimeBanner() {
  const L = MODELS.latest;
  $('#regRot').textContent = px(L.reported_rotterdam.value);
  $('#regCn').textContent = px(L.rotterdam_fair_from_shanghai.value);
  $('#regWedge').textContent = '+' + fmt(L.fragmentation_premium_pct.value, 1) + '%';
  $('#regWest').textContent = px(L.western_executable_nowcast.value);
  $('#regKal').textContent = px(L.kalman.value);
}

function renderHeadlineCards() {
  const L = MODELS.latest;
  const F = MODELS.forward_curve || [];
  const f3m = F.find(x => x.tenor === '3M') || {};
  const f12m = F.find(x => x.tenor === '12M') || {};

  const cards = [
    {
      badge: 'OBSERVED BENCHMARK',
      label: 'Rotterdam APT Spot (M0)',
      value: pxVal(L.reported_rotterdam.value),
      unit: CURRENT_UNIT === 't' ? '$/t APT (88.5% WO₃ CIF Rotterdam)' : '$/mtu WO₃ (CIF Rotterdam duty-free)',
      cls: 'hero',
      cc: C.observed,
      sub: `Assessment: <b>${L.reported_rotterdam.date}</b> · Fastmarkets/ISBP · China landed parity: <b>${px(L.rotterdam_fair_from_shanghai.value)}</b>`
    },
    {
      badge: 'PHYSICAL PARITY & WEDGE',
      label: 'China Domestic & Landed Parity (M0/M1)',
      value: `RMB ${fmt(L.shanghai_domestic_rmb_t.value, 0)}/t`,
      unit: `${px(L.shanghai_domestic_usd_mtu.value)} ex-works | ${px(L.rotterdam_fair_from_shanghai.value)} landed parity`,
      cc: C.china,
      sub: `Smelting parity: <b>${px(L.smelting_parity_cn_usd_mtu.value)}</b> dom / <b>${px(L.smelting_export_parity_usd_mtu.value)}</b> exp · <b>Wedge: +${fmt(L.fragmentation_premium_pct.value, 1)}%</b>`
    },
    {
      badge: 'BAYESIAN NOWCAST',
      label: 'Kalman Modeled Price (M4)',
      value: pxVal(L.kalman.value),
      unit: 'Global Fundamental Fair Value',
      cc: C.kalman,
      sub: `90% Band: <b>${px(L.kalman_band[0])}–${px(L.kalman_band[1])}</b> · <b>Western Executable: ${px(L.western_executable_nowcast.value)}</b>`
    },
    {
      badge: 'VALUE-CHAIN FACTOR',
      label: 'Value-Chain Factor Fair Value (M3)',
      value: pxVal(L.factor_implied.value),
      unit: 'Non-circular physical intermediate model',
      cc: C.factor,
      sub: `Level R² = <b>${MODELS.factor_model.level_r2}</b>, Ret R² = <b>${MODELS.factor_model.r2}</b> · EU FeW, CN Conc, CN Powder, Tooling`
    },
    {
      badge: 'EQUITY-IMPLIED',
      label: 'Pure-Play Equity Valuation (M2)',
      value: pxVal(L.equity_implied.value),
      unit: '11 pure-play miners, developers & tooling',
      cc: C.equity,
      sub: `Level R² = <b>${MODELS.equity_model.r2}</b>, 21d Lead r = <b>+${MODELS.equity_model.lead_21d_corr_eu_apt}</b> · Index = <b>${L.tungsten_equity_index.value}</b>`
    },
    {
      badge: '12M SYNTHETIC FORWARD',
      label: 'Synthetic 3M / 12M Forward (M4/M5)',
      value: `${pxVal(f3m.rotterdam_fwd_mtu || L.forward_3m_rotterdam.value)} / ${pxVal(f12m.rotterdam_fwd_mtu || L.forward_12m_rotterdam.value)}`,
      unit: 'Rotterdam Forward Term Structure',
      cc: C.forward,
      sub: `Global Fair: <b>${px(f12m.global_fair_fwd_mtu || L.forward_12m_global_fair.value)}</b> · China Parity: <b>${px(f12m.china_parity_fwd_mtu || 1258)}</b>`
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
  const L = MODELS.latest;

  const scale = CURRENT_UNIT === 't' ? MTU_PER_T : 1;
  const rescale = arr => (arr || []).map(([d, v]) => [d, v != null ? v * scale : null]);

  const mainSeries = [
    { id: 'obs', name: 'Observed Rotterdam Spot (M0)', color: C.observed, width: 2.6, data: rescale(S.observed_rotterdam_mtu),
      markers: [['2025-01-02', 330 * scale], ['2026-07-17', 3050 * scale], ['2026-07-24', 3139.5 * scale], ['2026-10-23', 2700 * scale]] },
    { id: 'west', name: 'Western Executable Nowcast (M4_WEST)', color: C.western, width: 2.0, data: rescale(S.western_executable_mtu) },
    { id: 'kal', name: 'Kalman Global Fair Value (M4)', color: C.kalman, width: 2.0, data: rescale(S.kalman_mtu) },
    { id: 'fac', name: 'Value-Chain Factor Fair Value (M3)', color: C.factor, width: 1.6, data: rescale(S.factor_implied_mtu), dash: [4, 3] },
    { id: 'eq', name: 'Pure-Play Equity-Implied (M2)', color: C.equity, width: 1.6, data: rescale(S.equity_implied_mtu), dash: [5, 4] },
    { id: 'cn', name: 'China Landed Export Parity (M1)', color: C.china, width: 1.6, data: rescale(S.rotterdam_fair_from_shanghai_mtu), dash: [4, 4] },
    { id: 'fwd_rot', name: '12M Rotterdam Forward Trajectory', color: C.observed, width: 1.8, data: rescale(S.forecast_rotterdam_12m), dash: [3, 3] },
    { id: 'fwd_glob', name: '12M Global Fair Forward', color: C.kalman, width: 1.6, data: rescale(S.forecast_global_fair_12m), dash: [3, 3] },
    { id: 'fwd_cn', name: '12M China Parity Forward', color: C.china, width: 1.6, data: rescale(S.forecast_china_parity_12m), dash: [3, 3] }
  ];

  MAIN_CHART = makeChart($('#mainChart'), {
    series: mainSeries,
    bands: [
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

/* ---------------- Stream Benchmark Table & Wedge Chart ---------------- */
function renderStreamTable() {
  const L = MODELS.latest;
  const rotVal = L.reported_rotterdam.value;

  const streams = [
    { name: 'European APT Spot (CIF Rotterdam)', native: '$2,700/mtu CIF', eq: rotVal, color: C.observed },
    { name: 'Western Executable Nowcast (M4_WEST)', native: '$2,109/mtu Nowcast', eq: L.western_executable_nowcast.value, color: C.western },
    { name: 'European Ferrotungsten (75% W)', native: '$152.50/kg W CIF', eq: L.eu_ferrotungsten_usd_mtu_eq.value, color: C.factor },
    { name: 'China Landed Export Parity (CIF Rotterdam)', native: '$812 ex-works × 1.192', eq: L.rotterdam_fair_from_shanghai.value, color: C.china },
    { name: 'China Tungsten Powder (≥99.7% W)', native: `RMB ${fmt(L.cn_powder_rmb_t.value, 0)}/t`, eq: L.cn_powder_usd_mtu_eq.value, color: C.factor },
    { name: 'China Domestic APT (Ex-Works)', native: `RMB ${fmt(L.shanghai_domestic_rmb_t.value, 0)}/t`, eq: L.shanghai_domestic_usd_mtu.value, color: C.china },
    { name: 'China Smelting Parity from 65% Concentrate', native: '$781 dom / $931 landed', eq: L.smelting_parity_cn_usd_mtu.value, color: C.china },
    { name: 'China 65% Tungsten Concentrate', native: `RMB ${fmt(L.cn_concentrate_rmb_t.value, 0)}/t`, eq: L.cn_concentrate_usd_mtu.value, color: C.factor }
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
  const S = MODELS.series;
  const scale = CURRENT_UNIT === 't' ? MTU_PER_T : 1;

  const rotFwd = F.map(x => [x.date, x.rotterdam_fwd_mtu * scale]);
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

    return `
      <tr>
        <td><span class="chip chip-verified" style="font-size:11px">${r.tenor}</span></td>
        <td>${r.date}</td>
        <td style="font-weight:700;color:var(--c-obs)">${px(r.rotterdam_fwd_mtu)}</td>
        <td class="${rotCls}">${rotTxt}</td>
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
  const dh = audit.data_hygiene_audit || {};

  $('#auditCards').innerHTML = `
    <div class="audit-card">
      <h3>M3: VALUE-CHAIN FACTOR REHABILITATION <span class="chip chip-verified">FIXED</span></h3>
      <div class="audit-stats-row">
        <div class="astat"><div class="astat-lbl">LEGACY RET R²</div><div class="astat-val c-wedge">${m3.old_r2 != null ? m3.old_r2 : '−0.428'}</div></div>
        <div class="astat"><div class="astat-lbl">V3 RETURN R²</div><div class="astat-val c-kal">+${m3.new_return_r2 || 0.551}</div></div>
        <div class="astat"><div class="astat-lbl">V3 LEVEL R²</div><div class="astat-val c-kal">${m3.new_level_r2 || 0.878}</div></div>
      </div>
      <div class="audit-flaws">
        <strong>Legacy Flaw (Macro Intercept Explosion):</strong>
        Uncorrelated Copper (r = −0.165) and S&P 500 dumped the entire rally into a +11.96%/mo intercept, exploding to $7,739/mtu.
      </div>
      <div class="audit-fixes">
        <strong>V3 Econometric Fix (Intermediate Physical Factors):</strong>
        Replaced macro noise with European FeW ($152.5/kg), CN 65% Concentrate, CN Powder, and Hardmetal Tooling/REMX. Nowcasts $1,379/mtu fair value with zero circularity.
      </div>
    </div>

    <div class="audit-card">
      <h3>M2: PURE-PLAY EQUITIES REHABILITATION <span class="chip chip-verified">FIXED</span></h3>
      <div class="audit-stats-row">
        <div class="astat"><div class="astat-lbl">LEGACY LEAD CORR</div><div class="astat-val c-wedge">${m2.old_lead_corr != null ? m2.old_lead_corr : '−0.197'}</div></div>
        <div class="astat"><div class="astat-lbl">V3 21D LEAD CORR</div><div class="astat-val c-kal">+${m2.new_lead_corr || 0.626}</div></div>
        <div class="astat"><div class="astat-lbl">V3 LEVEL R²</div><div class="astat-val c-kal">${m2.new_r2 || 0.944}</div></div>
      </div>
      <div class="audit-flaws">
        <strong>Legacy Flaw (Basket Contamination):</strong>
        Included non-tungsten HK real estate (1124.HK), parking lots (0697.HK), and copper giant CMOC, creating negative lead correlation (−0.197).
      </div>
      <div class="audit-fixes">
        <strong>V3 Econometric Fix (11 Verified Pure-Play Stocks):</strong>
        Clean log-return index of Western miners (ALM, EQR, GMET, TUN, FWZ), Chinese majors (Zhangyuan, Xiamen), and Tooling (Kennametal, Sandvik). Leads APT by 21 days with r = +0.626.
      </div>
    </div>

    <div class="audit-card">
      <h3>DATA HYGIENE & CTIA SCRAPING AUDIT <span class="chip chip-verified">CLEAN</span></h3>
      <div class="audit-stats-row">
        <div class="astat"><div class="astat-lbl">FALSE JUMPS REMOVED</div><div class="astat-val c-wedge">79 Jumps</div></div>
        <div class="astat"><div class="astat-lbl">VERIFIED REPORTS</div><div class="astat-val c-kal">413 Daily</div></div>
        <div class="astat"><div class="astat-lbl">PHYSICAL STREAMS</div><div class="astat-val c-kal">1,750 Obs</div></div>
      </div>
      <div class="audit-flaws">
        <strong>Legacy Scraping Issue:</strong>
        Regex matched retrospective quarterly averages ("Average Price Jan–Aug") and 17% low-grade slime auction bids, creating 79 false >15% single-day price jumps.
      </div>
      <div class="audit-fixes">
        <strong>V3 Regex & Text Parser Sanitization:</strong>
        Filtered strictly to 413 daily market analysis dispatches, parsed multi-product "respectively" clauses across 6 streams. Zero false jumps in CN APT, Concentrate, or FeW.
      </div>
    </div>
  `;
}

function renderFactorModel() {
  const fm = MODELS.factor_model || {};
  const factors = fm.factors_detail || [];

  // Bar Chart
  const pairs = factors.map(f => [f.name.split(' (')[0], f.monthly_corr_eu_apt || 0]);
  drawCorrBars($('#corrChart'), pairs);

  // Table
  $('#factorDetailTable tbody').innerHTML = factors.map(f => `
    <tr>
      <td style="color:var(--txt);font-weight:600">${f.name}</td>
      <td style="text-align:left;color:var(--dim2)">${f.role}</td>
      <td style="color:var(--c-obs)">${f.latest_native}</td>
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
    { id: 'few', name: 'EU FeW vs EU APT (90d)', color: C.western, width: 2.2, data: S.rolling_corr_tio_apt || [] },
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
    { id: 'idx_west', name: 'Western Producers Index (EQR/GMET/TUN/ALM/FWZ)', color: C.western, width: 1.6, data: S.eq_west_index || [], dash: [2, 2] },
    { id: 'idx_cn', name: 'Chinese Majors Index (Zhangyuan/Xiamen/CTHT)', color: C.china, width: 1.6, data: S.eq_cn_index || [], dash: [4, 2] },
    { id: 'idx_tool', name: 'Hardmetal Tooling Index (KMT/SAND.ST)', color: C.factor, width: 1.6, data: S.eq_tool_index || [], dash: [5, 3] }
  ];

  const ec = makeChart($('#equityChart'), {
    series: eqSeries,
    yFmt: v => fmt(v, 0)
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

  // Table of 11 Equities
  const constituents = em.constituent_details || [];
  $('#equityConstituentsTable tbody').innerHTML = constituents.map(c => {
    const badgeCls = c.group === 'Western Producer' || c.group === 'Western Developer' ? 'badge-west' : (c.group === 'CN Producer' ? 'badge-cn' : 'badge-tool');
    const ret = c.return_since_2025_pct || 0;
    const retCls = ret > 0 ? 'pos' : (ret < 0 ? 'neg' : 'zero');

    return `
      <tr>
        <td><b>${c.symbol}</b></td>
        <td style="text-align:left;color:var(--txt)">${c.name}</td>
        <td><span class="badge-group ${badgeCls}">${c.group}</span></td>
        <td>${((c.weight || 0) * 100).toFixed(1)}%</td>
        <td style="color:var(--txt);font-weight:600">${fmt(c.latest_price, 2)}</td>
        <td class="${retCls}">+${fmt(ret, 1)}%</td>
        <td class="${(c.monthly_corr_cn_apt || 0) >= 0 ? 'pos' : 'neg'}">${(c.monthly_corr_cn_apt || 0).toFixed(3)}</td>
        <td class="${(c.monthly_corr_eu_apt || 0) >= 0 ? 'pos' : 'neg'}">${(c.monthly_corr_eu_apt || 0).toFixed(3)}</td>
        <td class="${(c.lead_4w_corr_eu_apt || 0) >= 0 ? 'pos' : 'neg'}" style="font-weight:700;color:var(--c-kal)">+${(c.lead_4w_corr_eu_apt || 0).toFixed(3)}</td>
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
        <td>${p.value != null ? fmt(p.value, 2) : '—'}</td>
        ${cell(v.observed)}
        ${cell(v.shanghai)}
        ${cell(v.kalman)}
      </tr>
    `;
  }).join('');

  $('#metalCorrNote').innerHTML = `
    Monthly log-return correlations across <b>${mc.n_obs} monthly observations</b>.
    Intermediate tungsten value-chain products (FeW +0.75, Concentrate +0.52, Powder +0.52) exhibit high cointegration with European APT,
    whereas base metals like Copper (−0.09) and industrial equities (^GSPC −0.28) have negative co-movement.
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
        '<b>Physical Decoupling:</b> Domestic Chinese APT traded at RMB 165k–175k/t (~$280/mtu), while European spot held firm above $420/mtu as Chinese export shipments stalled.',
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
        '<b>Domestic Chinese Surge:</b> In August 2025, Chinese domestic APT breached RMB 300,000/t for the first time in modern history as secondary scrap availability tightened.',
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
        '<b>China Domestic Spike:</b> China 65% concentrate breached RMB 1.0M/t and domestic APT reached RMB 1.52M/t ($2,570/mtu).',
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
        '<b>Decoupling Spread Exceeds $1,900/mtu:</b> Domestic Chinese APT stabilized at RMB 595k–600k/t (~$1,005/mtu), creating a physical arbitrage gap exceeding $1,900/mtu.',
        '<b>IMARC Carbide Print:</b> Tungsten carbide powder reached $131/kg in China.'
      ]
    },
    {
      quarter: 'Q4 2026: Institutional Futures & Supply Re-Wiring',
      dates: 'Oct 2026 (Current)',
      price: 'Rotterdam Spot: $2,700 /mtu | Domestic RMB 480k/t',
      future: true,
      points: [
        '<b>CME Futures Announcement (Oct 20, 2026):</b> CME Group officially announced plans for the first-ever cash-settled Tungsten APT Futures contract, indexed to Fastmarkets Rotterdam/Baltimore.',
        '<b>Domestic Chinese Floor Defense:</b> Concentrate dipped to RMB 300k/t in early October, triggering centralized state purchasing that prompted an immediate 12% rebound back above RMB 300k/t.',
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
      dev: 'Secured revised environmental permits and £4M convertible loan facility; completing updated engineering studies for Hemerdon processing plant restart to supply European and UK defense manufacturing.'
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
      dev: 'Enforced centralized long-term floor price contract guidance across domestic concentrates (RMB 300k/t) and APT (RMB 480k–500k/t) throughout the late-2026 consolidation cycle.'
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
  const hist = usgs.filter(r => r.usd_t).map(r => [r.year + '-07-01', r.usd_t]);

  const usgsByYear = {};
  usgs.forEach(r => { if (r.usd_t != null) usgsByYear[r.year] = r.usd_t; });

  const warOverlay = WARS.map(w => ({
    ...w,
    date: String(w.start) + '-07-01',
    value: usgsByYear[w.start] != null ? usgsByYear[w.start] : null,
    color: w.kind === 'world' ? '#ef4444' : '#38bdf8',
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

function tagFor(item) {
  const t = (item.title + ' ' + (item.source || '')).toLowerCase();
  if (/\$|price|mtu|apt|carbide|surge|soar|rally|futures|cme/.test(t)) return 'price';
  if (/export|quota|policy|china|supply|control|ban|mining|mofcom|dfars/.test(t)) return 'policy';
  return 'company';
}

function renderNews(filter) {
  const box = $('#newsScroll');
  if (!box) return;
  const items = (NEWS || []).filter(n => filter === 'all' || tagFor(n) === filter);

  box.innerHTML = items.map(n => {
    const tag = tagFor(n);
    const d = n.date ? new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: '2-digit' }) : '';
    return `
      <a class="news-item" href="${n.link}" target="_blank" rel="noopener">
        <span class="n-tag tag-${tag}">${tag.toUpperCase()}</span>
        <span class="n-date">${d}</span>
        <span>
          <div class="n-title">${n.title}</div>
          <div class="n-src">${n.source}</div>
        </span>
      </a>
    `;
  }).join('') || '<div class="panel-note" style="padding:20px">No news items found under this filter.</div>';
}

$$('.nbtn').forEach(b => {
  b.onclick = () => {
    $$('.nbtn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderNews(b.dataset.f);
  };
});

/* ============================================================
   Tab 5: Methodology & Audit
   ============================================================ */
function renderMethodology() {
  const D = MODELS;
  const fm = D.factor_model || {};
  const em = D.equity_model || {};
  const sd = D.supply_demand || {};

  const models = [
    {
      id: 'M0',
      color: C.observed,
      title: 'Observed Physical Benchmark Suite (6 Verified Streams)',
      wide: true,
      body: 'Synthesizes 1,750 verified physical observations from Fastmarkets, ISBP/Dornhofer, CTIA (China Tungsten Industry Association), SMM, and Jiangxi smelters. Tracks European APT CIF Rotterdam, European Ferrotungsten 75%, China Domestic APT, China 65% Concentrate, China Powder ≥99.7%, and China Ferrotungsten. Key verified anchors include $330 open-2025 baseline, $3,050 July 17 2026, Fastmarkets $3,139.50 record print on July 24 2026, and $2,700 October 2026 stabilization.',
      formula: 'P_reported(t) = { Fastmarkets CIF Rotterdam ⊕ ISBP Dornhofer ⊕ CTIA Daily Spot Quotes }',
      meta: 'Tier-1 Anchors · 1,750 verified points · 1 t APT (88.5% WO₃) = 88.5 mtu WO₃',
      refs: ['Fastmarkets "Markets Fragmenting" (2025)', 'USGS Mineral Commodity Summaries (2026)']
    },
    {
      id: 'M1',
      color: C.china,
      title: 'Physical Smelting & Rotterdam Landed Export Parity Model',
      body: 'Calculates ex-works concentrate conversion into domestic APT via empirical formula $P_{smelt} = 1.418 \\cdot P_{conc65} + \\text{RMB 22,000/t}$ conversion cost ($r = 0.992$). Landed export parity adds 13% cancelled export tax rebate, export license compliance, and ocean transit carry: $P_{export} = P_{CN\\_APT} \\cdot 1.192$. The export fragmentation wedge measures the direct quote premium: $\\text{Wedge} = (P_{obs} / P_{export} - 1) \\cdot 100\\% = +178.9\\%$.',
      formula: 'P_smelt = 1.418·P_conc + 22,000 RMB/t ;  P_export = P_CN_APT · 1.192 ;  Wedge = (P_obs/P_export − 1)·100%',
      meta: 'Domestic ex-works RMB 480k/t ($812/mtu) → Rotterdam landed parity $968/mtu · Wedge +178.9%',
      refs: ['CTIA Smelting Cost Benchmarks', 'Engle & Granger (1987) Cointegration']
    },
    {
      id: 'M2',
      color: C.equity,
      title: 'Pure-Play Tungsten Equity Valuation & Lead Model (Rehabilitated)',
      body: 'Replaces contaminated real-estate/copper tickers with 11 verified pure-play tungsten producers, developers, and tooling majors across 3 sub-baskets (Western Producers, Chinese Integrated Majors, and Downstream Hardmetal Tooling). Uses non-negative constrained Ridge regression to extract fundamental implied APT ($1,518/mtu, R² = 0.944$). Empirically leads European APT spot by 21 trading days (4 weeks) with $r = +0.626$.',
      formula: 'ln(P_APT) = β₀ + β_west·ln(I_west) + β_cn·ln(I_cn) + β_tool·ln(I_tool) ,  R² = 0.944 ,  Lead(21d) = +0.626',
      meta: '11 pure-play constituents · 21-day forward lead r = +0.626 · Level R² = 0.944',
      refs: ['Fama & French (1993) Factor Construction', 'MacKinlay (1997) Event-Study Econometrics']
    },
    {
      id: 'M3',
      color: C.factor,
      title: 'Value-Chain & Industrial Cointegrated Factor Model (Rehabilitated)',
      body: 'Eliminates macro intercept drift ($7,739/mtu flaw) by utilizing intermediate physical value-chain products: European Ferrotungsten ($/mtu-eq, r = +0.75, 4W lead = +0.80), China 65% Concentrate ($/mtu, 4W lead = +0.59), China Tungsten Powder ($/mtu-eq, 4W lead = +0.62), and Hardmetal Tooling/REMX (r = +0.38). Achieves Return R² = 0.551 and Level R² = 0.878 with zero circularity.',
      formula: 'Δln(P) = β_few·Δln(FeW) + β_conc·Δln(Conc) + β_pwd·Δln(Pwd) + β_tool·Δln(Tool) + β_cu·Δln(Cu_ctrl)',
      meta: 'Monthly return R² = 0.551 · Level R² = 0.878 · FeW +0.80 lead · Tooling/REMX included',
      refs: ['Pindyck & Rotemberg (1990) Co-Movement', 'Stock & Watson (2002) Diffusion Forecasting']
    },
    {
      id: 'M4',
      color: C.kalman,
      title: 'Kalman State-Space Fair Value & Synthetic Forward Curve (1M–24M)',
      body: 'Bayesian dual state-space filter that fuses M0 (observed spot), M1 (China landed parity), M2 (pure-play equity valuation), and M3 (value-chain factor model) weighted by dynamic inverse observation noise. Simultaneously outputs Global Fundamental Fair Value ($1,539/mtu, 90% band $1,292–$1,833) and Western Executable Clearing Spot ($2,109/mtu). Synthesizes forward term structures (Spot to 24M) by coupling leading indicator impulses with Ornstein-Uhlenbeck convergence to M5 equilibrium.',
      formula: 'xₜ = F·xₜ₋₁ + wₜ ;  zₜ = H·xₜ + vₜ ;  Forward(t) = P_M5 + (P_nowcast − P_M5)·e^{−κ t} + Impulse(t)',
      meta: 'Inverse-variance weighting · Global Fair $1,539/mtu · Western Executable $2,109/mtu · 1M to 24M Curve',
      refs: ['Hamilton (1994) State-Space Models', 'Kalman (1960) Filtering', 'Schwartz (1997) Commodity Mean-Reversion']
    },
    {
      id: 'M5',
      color: C.forward,
      title: 'Long-Term Supply-Demand Stock-to-Use Equilibrium (2025–2035)',
      body: 'Long-term structural equilibrium model based on global production vs consumption balances. Calibrated on Almonty Sangdong NI 43-101 deficit projections (5,570 t in 2025, 2,330 t in 2026), 2.0% baseline demand CAGR, and USGS historical price bands ($282–$641/mtu WO₃). Provides the long-term anchor toward which Western spot premiums rationalize as new allied supply comes online.',
      formula: 'Stockₜ = Stockₜ₋₁ + Supplyₜ − Demandₜ ;  Coverage = Stock / Demand ;  P_eq = f(Coverage, Floor)',
      meta: 'Horizon 2025–2035 · Base / Bull / Bear scenarios · Stock-to-use coverage in months',
      refs: ['Almonty Sangdong NI 43-101 Deck', 'ITIA Global Tungsten End-Use Distribution', 'USGS MCS (2026)']
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
    ['CIF Rotterdam Benchmark Anchors ($330 baseline, $3,050 Jul 17, $3,139.50 Jul 24, $2,700 Oct 23)', 'TIER-1', 'ISBP / Fastmarkets via company filings & industry newsletters', 'VERIFIED'],
    ['China Dual-Use Export Controls (25 products restricted)', 'TIER-1', 'MOFCOM / General Administration of Customs Notice No. 3 / 2025', 'VERIFIED'],
    ['China Domestic APT, Concentrate 65%, FeW 70%, Powder (1,750 observations)', 'TIER-1', 'CTIA daily dispatches, SMM, and Jiangxi smelter contract floor guides', 'VERIFIED'],
    ['Pure-Play Equities (11 tickers: ALM, GMET, EQR, TUN, FWZ, Zhangyuan, Xiamen, CTHT, KMT, Sandvik)', 'TIER-2', 'Yahoo Finance / Official Stock Exchange Daily Closes', 'MARKET DATA'],
    ['Supply-Demand Balance (5,570 t deficit 2025, 2,330 t 2026, ~85 kt supply)', 'TIER-2', 'Sangdong NI 43-101 Technical Report via Almonty filings', 'COMPANY FILING'],
    ['Synthetic Forward Curve (Spot, 1M, 2M, 3M, 6M, 9M, 12M, 24M)', 'TIER-3', 'Tungsten Desk Econometric Engine V3 (Leading Impulses + OU Convergence)', 'NOWCAST / MODEL'],
    ['Kalman Global Fair Value ($1,539/mtu) & Western Executable ($2,109/mtu)', 'TIER-3', 'Bayesian state-space inverse-variance fusion', 'NOWCAST / MODEL'],
    ['USGS Tungsten Unit Value 1900–2026', 'TIER-2', 'USGS ds140 Historical Statistics + Mineral Commodity Summaries (Argus)', 'PUBLIC DATA'],
    ['Verified News & Regulatory Wire', 'TIER-2', 'Google News RSS & publisher-verified press releases', 'AGGREGATED']
  ];

  $('#provTable tbody').innerHTML = prov.map(r => `
    <tr>
      <td>${r[0]}</td>
      <td><span class="tier tier-${r[1].slice(-1)}">${r[1]}</span></td>
      <td>${r[2]}</td>
      <td><span class="chip ${r[3] === 'VERIFIED' ? 'chip-verified' : 'chip-est'}">${r[3]}</span></td>
    </tr>
  `).join('');

  // Academic References
  const refs = [
    ['Hamilton, J.D. (1994)', 'Time Series Analysis, Princeton University Press', 'State-space representation and Kalman filtering for latent commodity valuation.', 'M4 · KALMAN FAIR VALUE'],
    ['Kalman, R.E. (1960)', 'A New Approach to Linear Filtering and Prediction Problems, J. Basic Eng.', 'Recursive minimum mean-square error estimator fusing multi-source observations.', 'M4 · BAYESIAN FUSION'],
    ['Schwartz, E. (1997)', 'The Stochastic Behavior of Commodity Prices, Journal of Finance', 'Mean-reverting convenience-yield framework for forward curve term structure.', 'M4/M5 · FORWARD CURVE'],
    ['Pindyck, R. & Rotemberg, J. (1990)', 'The Excess Co-Movement of Commodity Prices, Journal of Political Economy', 'Cross-commodity linkages and empirical factor model exposure.', 'M3 · FACTOR MODEL'],
    ['Stock, J. & Watson, M. (2002)', 'Macroeconomic Forecasting Using Diffusion Indexes, JBES', 'Dimension reduction and leading indicator impulse modeling for physical commodities.', 'M3 · LEADING INDICATORS'],
    ['Fama, E. & French, K. (1993)', 'Common Risk Factors in Stock and Bond Returns, Journal of Financial Economics', 'Pure-play factor construction and sub-basket portfolio log-indexing.', 'M2 · EQUITY MODEL'],
    ['Engle, R. & Granger, C. (1987)', 'Co-integration and Error Correction, Econometrica', 'Testing physical arbitrage cointegration between European CIF and Chinese domestic prices.', 'M1 · SMELTING ARBITRAGE'],
    ['MacKinlay, A.C. (1997)', 'Event Studies in Economics and Finance, Journal of Economic Literature', 'Econometric event-study methodology applied to the Feb 4, 2025 export controls shock.', 'M2 · LEAD-LAG BACKTEST']
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
      renderStreamTable();
      renderForwardCurve();
      renderSupplyDemand();
      renderEquityModel();

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
    const [modelsData, newsData] = await Promise.all([
      fetch('data/models_output.json').then(r => r.json()),
      fetch('data/news.json').then(r => r.json())
    ]);

    MODELS = modelsData;
    NEWS = newsData;

    $('#genStamp').textContent = 'GENERATED ' + MODELS.generated_utc;
    $('#footerGenerated').textContent = 'LAST ENGINE RUN: ' + MODELS.generated_utc;

    initTabs();
    initUnitToggle();

    // Render Tab 1: Overview & Nowcast
    renderTicker();
    renderRegimeBanner();
    renderHeadlineCards();
    renderMainChart();
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

    // Render Tab 4: Quarterly Brief & Live Wire
    renderQuarterlyTimeline();
    renderProducerTracker();
    renderHistoryChart();
    renderNews('all');

    // Render Tab 5: Methodology & Audit
    renderMethodology();

    // Trigger initial redraw across any rendered canvases
    setTimeout(redrawAllVisibleCharts, 50);

  } catch (e) {
    console.error('Fatal initialization error:', e);
    document.body.innerHTML = `
      <div style="padding:40px;font-family:monospace;color:#ef4444;background:#07090e;min-height:100vh">
        <h2>Failed to load Tungsten Desk terminal data</h2>
        <p>${e.message}</p>
        <p>Please serve the site over HTTP rather than opening via local file:// URI.</p>
      </div>
    `;
  }
}

boot();
