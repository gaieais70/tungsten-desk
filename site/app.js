/* ============================================================
   Tungsten Desk — front-end logic
   Zero-dependency canvas charts (fedlock-style dark, minimal).
   ============================================================ */
'use strict';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=(n,d=0)=>n==null||!isFinite(n)?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtMtu=n=>'$'+fmt(n);

let MODELS=null, NEWS=null;

/* ---------------- palette ---------------- */
const C={
  observed:'#f0b429', kalman:'#e8edf4', shanghai:'#e05252',
  equity:'#a78bfa', factor:'#5aa9e6', arb:'#4dd0c4', fair:'#4dd0c4',
  iron:'#7bd88f', copper:'#f28c38', grid:'#1e2633', axis:'#5c6a7d'
};

/* ---------------- major wars (markers on the 125y history chart) ----------------
   Judgment call: wars significant enough to plausibly move strategic-metal
   demand/stockpiling. `kind` controls marker color — 'world' = global/industrial
   wars (the ones that historically spiked tungsten), 'regional' = major regional
   conflicts. The USGS series runs 1900–2017, so coverage stops there. */
const WARS=[
  {id:'russia-japan', name:'Russo-Japanese War',  short:'R-J',  start:1904, end:1905, kind:'regional'},
  {id:'ww1',          name:'World War I',         short:'WWI',  start:1914, end:1918, kind:'world'},
  {id:'spanish-civil',name:'Spanish Civil War',   short:'SPA',  start:1936, end:1939, kind:'regional'},
  {id:'sino-japan',   name:'Second Sino-Japanese War', short:'SJ', start:1937, end:1945, kind:'world'},
  {id:'ww2',          name:'World War II',        short:'WWII', start:1939, end:1945, kind:'world'},
  {id:'korea',        name:'Korean War',          short:'KOR',  start:1950, end:1953, kind:'world'},
  {id:'vietnam',      name:'Vietnam War',         short:'VIE',  start:1955, end:1975, kind:'regional'},
  {id:'sixday',       name:'Six-Day War',         short:'6D',   start:1967, end:1967, kind:'regional'},
  {id:'yomkippur',    name:'Yom Kippur War',      short:'YK',   start:1973, end:1973, kind:'regional'},
  {id:'afghan-79',    name:'Soviet–Afghan War',   short:'AFG',  start:1979, end:1989, kind:'regional'},
  {id:'iran-iraq',    name:'Iran–Iraq War',       short:'II',   start:1980, end:1988, kind:'regional'},
  {id:'falklands',    name:'Falklands War',       short:'FAL',  start:1982, end:1982, kind:'regional'},
  {id:'gulf-1',       name:'Gulf War',            short:'G1',   start:1990, end:1991, kind:'regional'},
  {id:'yugoslav',     name:'Yugoslav Wars',       short:'YUG',  start:1991, end:2001, kind:'regional'},
  {id:'afghan-01',    name:'War in Afghanistan',  short:'AF2',  start:2001, end:2021, kind:'regional'},
  {id:'iraq-03',      name:'Iraq War',            short:'IRQ',  start:2003, end:2011, kind:'regional'},
  {id:'ukraine-14',   name:'Russo-Ukrainian War', short:'UKR',  start:2014, end:null, kind:'regional'},
];

/* ============================================================
   Minimal canvas chart engine
   ============================================================ */
function makeChart(canvas, opts){
  const dpr=window.devicePixelRatio||1;
  const ctx=canvas.getContext('2d');
  const M={l:56,r:14,t:16,b:26};
  let w,h;
  function resize(){
    const r=canvas.parentElement.getBoundingClientRect();
    w=r.width; h=r.height;
    canvas.width=w*dpr; canvas.height=h*dpr;
    canvas.style.width=w+'px'; canvas.style.height=h+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  const api={canvas,opts,resize,redraw};

  function niceStep(range,target){
    const raw=range/target, mag=Math.pow(10,Math.floor(Math.log10(raw)));
    for(const m of [1,2,2.5,5,10]){ if(mag*m>=raw) return mag*m; }
    return mag*10;
  }

  /* Choose an integer label stride so labels never overlap given pixel budget. */
  function niceLabelStride(rawCount){
    for(const m of [1,2,5,10,20,25,50,100,200]){ if(m>=rawCount) return m; }
    return Math.ceil(rawCount/100)*100;
  }

  function redraw(){
    ctx.clearRect(0,0,w,h);
    const {series,xmin,xmax,ymin,ymax,log=false,yFmt=(v)=>fmt(v),bands}=opts;
    let X0=xmin,X1=xmax,Y0=ymin,Y1=ymax;
    if(X0==null||X1==null){ // auto
      let lo=Infinity,hi=-Infinity;
      for(const s of series){ if(s.hidden)continue; for(const p of s.data){ const t=+new Date(p[0]); if(t<lo)lo=t; if(t>hi)hi=t; } }
      X0=lo;X1=hi;
    }
    if(Y0==null||Y1==null){
      let lo=Infinity,hi=-Infinity;
      for(const s of series){ if(s.hidden)continue; for(const p of s.data){ let v=log?Math.log10(p[1]):p[1]; if(v<lo)lo=v; if(v>hi)hi=v; } }
      const pad=(hi-lo)*0.06||1; Y0=lo-pad; Y1=hi+pad;
    }
    const iw=w-M.l-M.r, ih=h-M.t-M.b;
    const sx=t=>M.l+( (t-X0)/(X1-X0||1) )*iw;
    const sy=v=>{ const lv=log?Math.log10(v):v; return M.t+ih-( (lv-Y0)/(Y1-Y0||1) )*ih; };

    // gridlines + y labels
    ctx.font='10px "IBM Plex Mono",monospace'; ctx.textAlign='right'; ctx.textBaseline='middle';
    const ystep=niceStep((Y1-Y0),5);
    for(let gy=Math.ceil(Y0/ystep)*ystep; gy<=Y1; gy+=ystep){
      const yy=sy(log?Math.pow(10,gy):gy);
      ctx.strokeStyle=C.grid; ctx.beginPath(); ctx.moveTo(M.l,yy); ctx.lineTo(w-M.r,yy); ctx.stroke();
      ctx.fillStyle=C.axis; ctx.fillText(yFmt(log?Math.pow(10,gy):gy), M.l-8, yy);
    }

    // x labels — stride is adapted to the pixel budget so labels NEVER overlap
    ctx.textAlign='center'; ctx.textBaseline='top';
    const spanY=(X1-X0)/(365*864e5);
    const labelW=58; // conservative px width per label incl. spacing
    const maxLabels=Math.max(1,Math.floor(iw/labelW));
    const minGap=48;  // hard floor: never draw labels closer than this
    let lastX=-Infinity;
    const drawLabel=(x,txt)=>{ if(x<M.l||x>w-M.r||x-lastX<minGap)return; ctx.fillStyle=C.axis; ctx.fillText(txt,x,h-M.b+8); lastX=x; };
    if(spanY>=1){
      // annual-or-coarser view: label every N years
      const stride=niceLabelStride(spanY/maxLabels);
      const y0=new Date(X0).getFullYear();
      for(let y=Math.ceil(y0/stride)*stride; y<=new Date(X1).getFullYear(); y+=stride){
        drawLabel(sx(+new Date(y,6,1)), String(y));
      }
    } else {
      // sub-annual view: label every N months
      const spanM=spanY*12;
      const stride=niceLabelStride(spanM/maxLabels);
      const d0=new Date(X0), d1=new Date(X1);
      const m0=d0.getFullYear()*12+d0.getMonth();
      const m1=d1.getFullYear()*12+d1.getMonth();
      for(let m=Math.ceil(m0/stride)*stride; m<=m1; m+=stride){
        const d=new Date(Math.floor(m/12), m%12, 1);
        drawLabel(sx(+d), d.toLocaleString('en-US',{month:'short'})+' '+String(d.getFullYear()).slice(2));
      }
    }

    // bands (confidence intervals)
    if(bands){ for(const b of bands){ if(b.hidden)continue;
      ctx.beginPath();
      const lo=b.lo.filter(p=>p[1]!=null), hi=b.hi.filter(p=>p[1]!=null);
      if(lo.length<2)continue;
      lo.forEach((p,i)=>{ const x=sx(+new Date(p[0])), y=sy(p[1]); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
      for(let i=hi.length-1;i>=0;i--){ const p=hi[i]; ctx.lineTo(sx(+new Date(p[0])), sy(p[1])); }
      ctx.closePath(); ctx.fillStyle=(b.color||'#888')+'18'; ctx.fill();
    }}

    // lines
    for(const s of series){ if(s.hidden||!s.data.length)continue;
      ctx.beginPath(); ctx.lineWidth=s.width||1.6; ctx.strokeStyle=s.color;
      if(s.dash)ctx.setLineDash(s.dash); else ctx.setLineDash([]);
      s.data.forEach((p,i)=>{ const x=sx(+new Date(p[0])), y=sy(p[1]); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
      ctx.stroke(); ctx.setLineDash([]);
      // markers on verified points
      if(s.markers){ ctx.fillStyle=s.color; for(const mk of s.markers){ ctx.beginPath(); ctx.arc(sx(+new Date(mk[0])),sy(mk[1]),3.2,0,7); ctx.fill(); } }
    }

    // war overlay: vertical hairline + dot pinned to the price line + label
    if(opts.warOverlay){
      const wars=opts.warOverlay.filter(w=>!w.hidden);
      ctx.font='600 9px "IBM Plex Mono",monospace'; ctx.textAlign='left'; ctx.textBaseline='top';
      let lastLabelX=-Infinity;
      for(const w of wars){
        const x=sx(+new Date(w.date));
        const y=sy(w.value);
        if(x<M.l||x>w-M.r)continue;
        ctx.strokeStyle=(w.color||'#e05252')+'55'; ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.moveTo(x,M.t); ctx.lineTo(x,M.t+ih); ctx.stroke(); ctx.setLineDash([]);
        // dot on the price line
        ctx.fillStyle=w.color||'#e05252';
        ctx.beginPath(); ctx.arc(x,y,3.6,0,7); ctx.fill();
        ctx.strokeStyle='#0d1117'; ctx.lineWidth=1; ctx.stroke();
        // label above (skip if too close to previous)
        if(x-lastLabelX>64){
          ctx.fillStyle=(w.color||'#e05252'); ctx.fillText(w.short,x+5,M.t+4);
          lastLabelX=x;
        }
      }
    }
    // frame
    ctx.strokeStyle=C.grid; ctx.strokeRect(M.l,M.t,iw,ih);
  }

  /* ============================================================
     Hover: crosshair + tooltip with x/y readout
     ============================================================ */
  const hover={active:false};
  function clearHover(){
    hover.active=false;
    ctx.clearRect(0,0,w,h);         // wipe overlay
    redraw();                        // restore base
    const tip=$('#chartTip');
    if(tip)tip.style.display='none';
  }
  function hoverAt(ev){
    const rect=canvas.getBoundingClientRect();
    const mx=ev.clientX-rect.left, my=ev.clientY-rect.top;
    const iw=w-M.l-M.r, ih=h-M.t-M.b;
    if(mx<M.l||mx>w-M.r||my<M.t||my>h-M.b){clearHover();return;}
    const {series,xmin,xmax,ymin,ymax,log=false,yFmt=(v)=>fmt(v),bands}=opts;
    let X0=xmin,X1=xmax,Y0=ymin,Y1=ymax;
    if(X0==null||X1==null){let lo=Infinity,hi=-Infinity;for(const s of series){if(s.hidden)continue;for(const p of s.data){const t=+new Date(p[0]);if(t<lo)lo=t;if(t>hi)hi=t;}}X0=lo;X1=hi;}
    if(Y0==null||Y1==null){let lo=Infinity,hi=-Infinity;for(const s of series){if(s.hidden)continue;for(const p of s.data){let v=log?Math.log10(p[1]):p[1];if(v<lo)lo=v;if(v>hi)hi=v;}}const pad=(hi-lo)*0.06||1;Y0=lo-pad;Y1=hi+pad;}
    const sx=t=>M.l+( (t-X0)/(X1-X0||1) )*iw;
    const sy=v=>{ const lv=log?Math.log10(v):v; return M.t+ih-( (lv-Y0)/(Y1-Y0||1) )*ih; };
    const tMouse=X0+(mx-M.l)/iw*(X1-X0);

    // war-marker hit: is the cursor on/near a visible war dot? (7px box)
    let hitWar=null;
    const wars=opts.warOverlay||[];
    for(const w of wars){
      if(w.hidden||w.value==null)continue;
      const wx=sx(+new Date(w.date)), wy=sy(w.value);
      if(Math.abs(mx-wx)<7 && Math.abs(my-wy)<7){hitWar=w;break;}
    }

    // nearest data point on each series (by time)
    function nearest(arr){
      if(!arr||!arr.length)return null;
      let best=arr[0],bd=Infinity;
      for(const p of arr){const d=Math.abs(+new Date(p[0])-tMouse);if(d<bd){bd=d;best=p;}}
      return best;
    }

    // build tooltip rows: date + each visible series value at hovered x
    const rows=[];
    for(const s of series){
      if(s.hidden||!s.data.length)continue;
      const p=nearest(s.data);
      if(!p)continue;
      rows.push({color:s.color,name:s.name,val:p[1]});
    }
    // band row (kalman ci) if present
    let bandRow=null;
    if(bands){for(const b of bands){if(b.hidden)continue;const lo=nearest(b.lo),hi=nearest(b.hi);if(lo&&hi)bandRow={lo:lo[1],hi:hi[1]};}}

    // redraw base + overlay crosshair + markers
    redraw();
    ctx.setLineDash([4,3]);
    ctx.strokeStyle='rgba(232,237,244,.35)';
    ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(mx,M.t);ctx.lineTo(mx,h-M.b);ctx.stroke();
    ctx.beginPath();ctx.moveTo(M.l,my);ctx.lineTo(w-M.r,my);ctx.stroke();
    ctx.setLineDash([]);
    // markers at nearest points
    for(const r of rows){
      const p=nearest(findSeriesData(series,r.name));
      if(!p)continue;
      const px=sx(+new Date(p[0])), py=sy(p[1]);
      ctx.beginPath();ctx.arc(px,py,3.4,0,7);ctx.fillStyle=r.color;ctx.fill();
    }
    // highlight the hovered war dot
    if(hitWar){
      const wx=sx(+new Date(hitWar.date)), wy=sy(hitWar.value);
      ctx.beginPath();ctx.arc(wx,wy,7,0,7);ctx.strokeStyle=hitWar.color;ctx.lineWidth=1.6;ctx.stroke();
    }
    hover.active=true;

    // tooltip DOM
    let tip=$('#chartTip');
    if(!tip){tip=document.createElement('div');tip.id='chartTip';document.body.appendChild(tip);}
    const spanY=(X1-X0)/(365*864e5);
    const dt=new Date(tMouse);
    const dateLabel=spanY>=1? String(dt.getFullYear())
      : dt.toLocaleString('en-US',{month:'short',year:'numeric'})+(spanY<0.5? ' '+String(dt.getDate()):'');
    let html=`<div class="tip-x">${dateLabel}</div>`;
    if(hitWar){
      const yrs=hitWar.end?hitWar.start+'–'+hitWar.end:String(hitWar.start)+'–';
      const kindTxt=hitWar.kind==='world'?'GLOBAL / INDUSTRIAL WAR':'REGIONAL WAR';
      html+=`<div class="tip-row tip-war"><span class="tip-dot" style="background:${hitWar.color}"></span><span class="tip-name" style="color:${hitWar.color}">⚔ ${hitWar.name}</span><span class="tip-val">${kindTxt}</span></div>
      <div class="tip-row"><span class="tip-name" style="color:var(--dim2)">years</span><span class="tip-val">${yrs}</span></div>
      <div class="tip-row"><span class="tip-name" style="color:var(--dim2)">unit value at start</span><span class="tip-val">${yFmt(hitWar.value)}</span></div>`;
    }
    for(const r of rows){
      html+=`<div class="tip-row"><span class="tip-dot" style="background:${r.color}"></span><span class="tip-name">${r.name}</span><span class="tip-val">${yFmt(r.val)}</span></div>`;
    }
    if(bandRow)html+=`<div class="tip-row"><span class="tip-dot" style="background:#8b98ab"></span><span class="tip-name">95% band</span><span class="tip-val">${yFmt(bandRow.lo)} – ${yFmt(bandRow.hi)}</span></div>`;
    if(html.indexOf('tip-row')<0)return;
    tip.innerHTML=html;
    tip.style.display='block';
    // position near cursor, flip at edges
    const tw=tip.offsetWidth, th=tip.offsetHeight;
    let tx=mx+16, ty=my-th-14;
    if(tx+tw>w-8)tx=mx-tw-16;
    if(ty<M.t+4)ty=my+16;
    tip.style.left=(rect.left+tx)+'px';
    tip.style.top=(rect.top+ty)+'px';
  }
  function findSeriesData(series,name){const s=series.find(x=>x.name===name);return s?s.data:null;}

  canvas.addEventListener('mousemove',hoverAt);
  canvas.addEventListener('mouseleave',clearHover);
  new ResizeObserver(()=>{resize();redraw();}).observe(canvas.parentElement);
  return api;
}

/* ============================================================
   Data prep helpers
   ============================================================ */
const toMs=arr=>arr.map(([d,v])=>[+new Date(d),v]);
function rangeOf(arr){ const ts=arr.map(p=>+new Date(p[0])); return [Math.min(...ts),Math.max(...ts)]; }

/* ============================================================
   RENDER
   ============================================================ */
function render(){
  const D=MODELS, S=D.series, L=D.latest;

  /* ---- generation stamp ---- */
  $('#genStamp').textContent='GENERATED '+D.generated_utc;

  /* ---- ticker ---- */
  const tkItems=[
    ['APT ROTTERDAM', fmtMtu(L.reported_rotterdam.value)+'/mtu', 'up'],
    ['SHANGHAI IMPLIED', fmtMtu(L.shanghai_implied.value)+'/mtu', 'dn'],
    ['ROTTERDAM FAIR (SHA+CARRY)', fmtMtu(L.rotterdam_fair_from_shanghai.value)+'/mtu', 'dn'],
    ['FRAGMENTATION PREMIUM', fmt(L.fragmentation_premium_pct.value,0)+'%', 'dn'],
    ['KALMAN FAIR VALUE', fmtMtu(L.kalman.value)+'/mtu', 'up'],
    ['EQUITY-IMPLIED (REJECTED)', fmtMtu(L.equity_implied.value)+'/mtu', 'dn'],
    ['COPPER (CONTROL)', '$'+fmt(L.copper.value,2)+'/lb', 'up'],
    ['IRON ORE (DEMAND PROXY)', '$'+fmt(L.iron_ore.value,1)+'/t', 'up'],
    ['USD/CNY', fmt(L.usdcny.value,3), ''],
    ['CN EXPORT CONTROLS', 'ACTIVE · 4 FEB 2025', 'dn'],
  ];
  const half=tkItems.map(([k,v,cls])=>`<span class="tk-item"><b>${k}</b> ${v} ${cls?`<span class="${cls}">${cls==='up'?'▲':'▼'}</span>`:''}</span>`).join('');
  $('#tickerTrack').innerHTML=`<div class="ticker-inner">${half}${half}</div>`;

  /* ---- headline cards ---- */
  const cards=[
    {label:'Reported APT · Rotterdam',value:fmtMtu(L.reported_rotterdam.value),unit:'$/mtu WO₃ · 88.5%',cls:'hero',cc:C.observed,
     sub:`≈ <b>${fmtMtu(L.reported_rotterdam_t.value)}/t</b> APT · ${L.reported_rotterdam.date}`},
    {label:'Kalman fair value',value:fmtMtu(L.kalman.value),unit:'$/mtu WO₃ · fused, Shanghai-anchored',cc:C.kalman,
     sub:`band ${fmtMtu(L.kalman_band[0])} – ${fmtMtu(L.kalman_band[1])}`},
    {label:'Rotterdam fair (Shanghai+carry)',value:fmtMtu(L.rotterdam_fair_from_shanghai.value),unit:'$/mtu · M1 cornerstone',cc:C.fair,
     sub:`premium <b>+${fmt(L.fragmentation_premium_pct.value,0)}%</b> observed vs fair`},
    {label:'Shanghai-implied domestic',value:fmtMtu(L.shanghai_implied.value),unit:'$/mtu · fragmentation discount',cc:C.shanghai,
     sub:`gap <b>${fmt((1-L.shanghai_implied.value/L.reported_rotterdam.value)*100,1)}%</b> vs Rotterdam`},
    {label:'Factor-model implied',value:fmtMtu(L.factor_implied.value),unit:'$/mtu · iron ore + moly + macro',cc:C.factor,
     sub:`R² <b>${MODELS.factor_model.r2}</b> · demand-driven`},
    {label:'Equity-implied — REJECTED',value:fmtMtu(L.equity_implied.value),unit:'$/mtu · diagnostic only',cc:C.equity,
     sub:`lead corr <b>${MODELS.backtest.lead_corr_equity_vs_apt_21d}</b> → not a leading indicator`},
    {label:'Iron ore (demand proxy)',value:'$'+fmt(L.iron_ore.value,1),unit:'USD/t · mining & construction',cc:C.iron,
     sub:`USD/CNY ${fmt(L.usdcny.value,3)}`},
  ];
  $('#headlineCards').innerHTML=cards.map(c=>`
    <div class="card ${c.cls||''}" style="--cc:${c.cc}">
      <div class="c-label">${c.label}</div>
      <div class="c-value">${c.value}</div>
      <div class="c-unit">${c.unit}</div>
      <div class="c-sub">${c.sub}</div>
    </div>`).join('');

  /* ---- main chart ---- */
  const obs=S.observed_rotterdam_mtu;
  const mainSeries=[
    {id:'obs',name:'Reported (anchors+recon)',color:C.observed,width:2.4,data:obs,
      markers:[['2025-01-02',330],['2026-07-17',3050],['2026-07-24',3139.5]]},
    {id:'kal',name:'Kalman fair value (Shanghai-anchored)',color:C.kalman,width:1.8,data:S.kalman_mtu},
    {id:'fair',name:'Rotterdam fair (Shanghai+carry)',color:C.fair,width:1.6,data:S.rotterdam_fair_from_shanghai_mtu,dash:[4,4]},
    {id:'sh',name:'Shanghai-implied domestic',color:C.shanghai,width:1.6,data:S.shanghai_implied_mtu,dash:[7,4]},
    {id:'fac',name:'Factor-implied',color:C.factor,width:1.6,data:S.factor_implied_mtu,dash:[2,3]},
    {id:'eq',name:'Equity-implied (REJECTED)',color:C.equity,width:1.2,data:S.equity_implied_mtu,dash:[5,4]},
  ];
  const mc=makeChart($('#mainChart'),{
    series:mainSeries,
    bands:[{lo:S.kalman_lo,hi:S.kalman_hi,color:C.kalman}],
  });
  // legend
  $('#mainLegend').innerHTML=mainSeries.map(s=>
    `<span class="lg" data-id="${s.id}"><span class="sw" style="background:${s.color}"></span>${s.name}</span>`).join('');
  $$('#mainLegend .lg').forEach(el=>el.onclick=()=>{
    const s=mainSeries.find(x=>x.id===el.dataset.id);
    s.hidden=!s.hidden; el.classList.toggle('off',s.hidden); mc.redraw();
  });

  /* ---- correlation bars ---- */
  const cm=D.correlation_matrix['Tungsten (observed/recon)'];
  const corrPairs=Object.entries(cm).filter(([k])=>k!=='Tungsten (observed/recon)')
    .sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
  drawCorrBars($('#corrChart'),corrPairs);

  /* ---- rolling corr ---- */
  makeChart($('#rollingChart'),{
    series:[
      {id:'tior',name:'Iron ore vs observed APT (12M monthly)',color:C.iron,width:2.0,data:S.rolling_corr_tio_obs_m},
      {id:'facr',name:'Cu vs factor-implied (60d)',color:C.factor,width:1.6,data:S.rolling_corr_cu_fac,dash:[2,3]},
      {id:'obsr',name:'Cu vs observed APT (12M monthly)',color:C.observed,width:1.6,data:S.rolling_corr_cu_obs_m,dash:[2,3]},
      {id:'eqr',name:'Cu vs equity-implied (60d)',color:C.equity,width:1.2,data:S.rolling_corr_cu_eq,dash:[5,4]},
    ],
    ymin:-1,ymax:1,yFmt:v=>v.toFixed(1),
  });

  /* ---- equity chart ---- */
  makeChart($('#equityChart'),{
    series:[
      {id:'eqi',name:'Tungsten equity excess-return index',color:C.equity,width:1.8,data:S.equity_excess_index},
    ],
    yFmt:v=>fmt(v),
  });

  /* ---- supply-demand chart (M5) ---- */
  const sd=D.supply_demand;
  if(sd && sd.scenarios){
    $('#supplyDemandPanel').style.display='';
    const sdSeries=[
      {id:'sdB',name:'Base',color:C.kalman,width:2.0,data:(sd.scenarios.base&&sd.scenarios.base.price_path_mtu||[]).map(p=>[String(p.year)+'-07-01',p.price_mtu])},
      {id:'sdBull',name:'Bull (3.0% demand CAGR)',color:C.iron,width:1.6,data:(sd.scenarios.bull&&sd.scenarios.bull.price_path_mtu||[]).map(p=>[String(p.year)+'-07-01',p.price_mtu]),dash:[2,3]},
      {id:'sdBear',name:'Bear (1.0% demand CAGR)',color:C.shanghai,width:1.6,data:(sd.scenarios.bear&&sd.scenarios.bear.price_path_mtu||[]).map(p=>[String(p.year)+'-07-01',p.price_mtu]),dash:[5,4]},
      {id:'sdObs',name:'Observed APT (today ≈ '+fmtMtu(L.reported_rotterdam.value)+')',color:C.observed,width:1.4,data:obs.slice(-1)},
    ];
    makeChart($('#sdChart'),{series:sdSeries,yFmt:v=>'$'+fmt(v)});
    $('#sdLegend').innerHTML=sdSeries.map(s=>
      `<span class="lg" data-id="${s.id}"><span class="sw" style="background:${s.color}"></span>${s.name}</span>`).join('');
    $$('#sdLegend .lg').forEach(el=>el.onclick=()=>{
      const s=sdSeries.find(x=>x.id===el.dataset.id);
      s.hidden=!s.hidden; el.classList.toggle('off',s.hidden);
      makeChart($('#sdChart'),{series:sdSeries,yFmt:v=>'$'+fmt(v)});
    });
    const sdCaveats=(sd.caveats||[]).slice(0,3).map(c=>'<li>'+c+'</li>').join('');
    $('#sdNote').innerHTML=`<b>M5 — supply-demand equilibrium.</b> ${sd.headline||''} <ul>${sdCaveats}</ul><i>Model built from the Almonty Jul-2026 investor deck (deficits 5,570 t 2025 / 2,330 t 2026, ~85 kt supply, 2.0% demand CAGR to 2050) + USGS history. Scenario tool, not a forecast.</i>`;

    /* ---- supply-demand balance table ---- */
    const bal=sd.balance||[];
    const scPx=(sc,y)=>{const p=(sd.scenarios[sc]&&sd.scenarios[sc].price_path_mtu)||[];const r=p.find(x=>x.year===y);return r?r.price_mtu:null;};
    const fnum=(v,d=0)=>v==null?'—':fmt(v,d);
    const sDisp=c=>c==null?'—':(c*100).toFixed(1)+'%';
    $('#sdTable tbody').innerHTML=bal.map(r=>{
      const def=r.deficit_t;
      const defCls=def>0?'neg':(def<0?'pos':'zero');
      const st=r.stock_to_use_months;
      return `<tr>
        <td>${r.year}</td>
        <td>${fnum(r.supply_t,0)}</td>
        <td>${fnum(r.demand_t,0)}</td>
        <td class="${defCls}">${def>0?'−':def<0?'+':''}${fnum(Math.abs(def),0)}</td>
        <td>${st==null?'—':st.toFixed(2)}</td>
        <td>${fnum(scPx('base',r.year),0)}</td>
        <td>${fnum(scPx('bull',r.year),0)}</td>
        <td>${fnum(scPx('bear',r.year),0)}</td>
      </tr>`;}).join('');
    $('#sdTableNote').innerHTML=`Balance = demand − supply. Negative deficit = surplus (stocks rebuild). Stock-to-use = modeled coverage in months of demand (inventory is NOT publicly reported — this is a modeled series). Scenario prices are the M5 calibration output; base demand CAGR ${sd.scenarios&&sd.scenarios.base?sDisp(sd.scenarios.base.demand_cagr):''}, bull ${sd.scenarios&&sd.scenarios.bull?sDisp(sd.scenarios.bull.demand_cagr):''}, bear ${sd.scenarios&&sd.scenarios.bear?sDisp(sd.scenarios.bear.demand_cagr):''}.`;

    /* ---- metal co-movement matrix ---- */
    const mc=D.metal_correlations;
    if(mc && mc.monthly_returns){
      const mp=D.metal_prices||{};
      const rows=Object.entries(mc.monthly_returns);
      const maxAbs=Math.max(0.05,...rows.map(([,v])=>Math.max(...['observed','shanghai','kalman'].map(k=>Math.abs(v[k]||0)))));
      // bar chart: corr vs observed (the reference the whole desk is judged against)
      const barData=rows.map(([name,v])=>[name,v.observed]).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
      drawCorrBars($('#metalCorrChart'),barData);
      const cell=(v)=>{
        if(v==null) return '<td class="zero">—</td>';
        const cls=Math.abs(v)>=0.5?'corr-pos':(Math.abs(v)>=0.3?'corr-wk':'corr-neg');
        return `<td class="${v>=0?'corr-pos':'corr-neg'}" style="background:${v>=0?`rgba(47,191,113,${(v/maxAbs)*0.28})`:`rgba(224,82,82,${(Math.abs(v)/maxAbs)*0.28})`}">${v>=0?'+':''}${v.toFixed(2)}</td>`;
      };
      $('#metalCorrTable tbody').innerHTML=rows.map(([name,v])=>{
        const p=mp[name]||{};
        return `<tr><td>${name}</td><td>${p.value!=null?fmt(p.value,2):'—'}</td>${cell(v.observed)}${cell(v.shanghai)}${cell(v.kalman)}</tr>`;
      }).join('');
      $('#metalCorrNote').innerHTML=`Monthly log-return correlations, ${mc.n_obs} monthly observations. Cell shading scales with |corr| (green = positive co-movement, red = negative). Tin/nickel/lead via FRED (World Bank, month-end); the rest daily-resampled to month-end. Iron ore &amp; moly are the demand-side factors used in M3; the matrix shows the whole metal complex for context. Correlation ≠ causation — and for tungsten, policy (export controls) dominates all of these.`;
    }
  }

  /* ---- signal box ---- */
  const bt=D.backtest, fm=D.factor_model, em=D.equity_model;
  $('#signalBox').innerHTML=`
    <h3>Signal diagnostics</h3>
    <div class="row"><span>Equity excess-return β (elasticity)</span><span class="v gold">${em.beta_elasticity}</span></div>
    <div class="row"><span>Lead corr: equities → APT (21d)</span><span class="v dn">${bt.lead_corr_equity_vs_apt_21d}</span></div>
    <div class="row"><span>Equity status</span><span class="v dn">REJECTED — diagnostic only</span></div>
    <div class="row"><span>Factor model R² (monthly)</span><span class="v">${fm.r2}</span></div>
    <div class="row"><span>Factor β · iron ore (demand)</span><span class="v up">${fm.betas.tio}</span></div>
    <div class="row"><span>Factor β · moly basket</span><span class="v up">${fm.betas.moly}</span></div>
    <div class="row"><span>Factor β · copper (control)</span><span class="v">${fm.betas.cu}</span></div>
    <div class="row"><span>Factor β · China ETF</span><span class="v">${fm.betas.fxi}</span></div>
    <div class="row"><span>Factor β · USD/CNY</span><span class="v">${fm.betas.cny}</span></div>
    <div class="row"><span>Factor β · S&P 500</span><span class="v">${fm.betas.spx}</span></div>
    <div class="verdict"><b style="color:var(--accent)">READ:</b> The equity-alpha idea is <b style="color:var(--red)">rejected</b> (lead corr ${bt.lead_corr_equity_vs_apt_21d}) — equities lag the physical market, so they are excluded from the fusion. The factor model now leads with the <em>demand-side</em> proxies (iron ore = mining &amp; construction, moly = sister metal under the same export controls); copper is demoted to a control. Tungsten is a policy- and demand-driven metal, not a copper story.</div>`;

  /* ---- 125y history ---- */
  const hist=D.usgs_history.filter(r=>r.usd_t).map(r=>[r.year+'-07-01',r.usd_t]);
  // build war overlay: dot pinned to the USGS unit value at the war start year
  const usgsByYear={}; D.usgs_history.forEach(r=>{ if(r.usd_t!=null) usgsByYear[r.year]=r.usd_t; });
  const warOverlay=WARS.map(w=>({
    ...w,
    date:String(w.start)+'-07-01',
    value:usgsByYear[w.start]!=null?usgsByYear[w.start]:null,
    color:w.kind==='world'?'#e05252':'#5aa9e6',
    hidden:false,
  })).filter(w=>w.value!=null);
  const hc=makeChart($('#historyChart'),{
    series:[{id:'h',name:'USGS unit value',color:C.observed,width:1.6,data:hist}],
    log:true,yFmt:v=>v>=1000?'$'+fmt(v/1000)+'k':'$'+fmt(v),
    warOverlay,
  });
  renderWarMenu(hc, warOverlay, hist);

  /* ---- news ---- */
  renderNews('all');

  /* ---- methodology ---- */
  renderMethodology();
}

/* ---------------- correlation bars (custom draw) ---------------- */
function drawCorrBars(canvas,pairs){
  const dpr=window.devicePixelRatio||1;
  const ctx=canvas.getContext('2d');
  function draw(){
    const r=canvas.parentElement.getBoundingClientRect();
    canvas.width=r.width*dpr;canvas.height=r.height*dpr;
    canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,r.width,r.height);
    const Ml=150,Mr=50,rowH=(r.height-20)/pairs.length;
    const mid=r.width/2+40;
    pairs.forEach(([name,val],i)=>{
      const y=12+i*rowH+rowH/2;
      ctx.font='11px "IBM Plex Mono",monospace';ctx.fillStyle='#8b98ab';ctx.textAlign='right';ctx.textBaseline='middle';
      ctx.fillText(name,Ml-12,y);
      const bw=(r.width-Ml-Mr)/2*Math.abs(val);
      ctx.fillStyle=val>=0?'rgba(47,191,113,.75)':'rgba(224,82,82,.75)';
      ctx.fillRect(val>=0?mid:mid-bw,y-6,bw,12);
      ctx.fillStyle='#e8edf4';ctx.textAlign=val>=0?'left':'right';
      ctx.fillText(val.toFixed(2),val>=0?mid+bw+8:mid-bw-8,y);
      ctx.strokeStyle='#1e2633';ctx.beginPath();ctx.moveTo(mid,4);ctx.lineTo(mid,r.height-4);ctx.stroke();
    });
  }
  draw();
  new ResizeObserver(draw).observe(canvas.parentElement);
}

/* ---------------- news ---------------- */
function tagFor(item){
  const t=(item.title+' '+item.source).toLowerCase();
  if(/\$|price|mtu|apt|carbide|surge|soar|rally/.test(t)) return 'price';
  if(/export|quota|policy|china|supply|control|mining/.test(t)) return 'policy';
  return 'company';
}
function renderNews(filter){
  const box=$('#newsScroll');
  const items=NEWS.filter(n=>filter==='all'||tagFor(n)===filter);
  box.innerHTML=items.map(n=>{
    const tag=tagFor(n);
    const d=n.date?new Date(n.date).toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'2-digit'}):'';
    return `<a class="news-item" href="${n.link}" target="_blank" rel="noopener">
      <span class="n-tag tag-${tag}">${tag.toUpperCase()}</span>
      <span class="n-date">${d}</span>
      <span><span class="n-title">${n.title}</span><div class="n-src">${n.source}</div></span>
    </a>`;
  }).join('')||'<div class="panel-note" style="padding:20px">No items match this filter.</div>';
}
$$('.nbtn').forEach(b=>b.onclick=()=>{ $$('.nbtn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderNews(b.dataset.f); });

/* ---------------- war dropdown ---------------- */
function renderWarMenu(chart, wars, hist){
  const wrap=$('#warMenu');
  if(!wrap)return;
  const kindLabel={world:'GLOBAL / INDUSTRIAL',regional:'REGIONAL'};
  const groups={world:[],regional:[]};
  wars.forEach(w=>groups[w.kind].push(w));
  const allOn=wars.filter(w=>!w.hidden).length===wars.length;
  wrap.innerHTML=`
    <button class="wm-toggle" id="wmToggle" aria-haspopup="true" aria-expanded="false">
      ⚔ WARS <span class="wm-count" id="wmCount">${wars.length - wars.filter(w=>w.hidden).length}</span> ▾
    </button>
    <div class="wm-drop" id="wmDrop" hidden>
      <div class="wm-actions">
        <button class="wm-act" data-act="all">ALL ON</button>
        <button class="wm-act" data-act="none">ALL OFF</button>
        <button class="wm-act" data-act="world">WORLD ONLY</button>
      </div>
      ${Object.entries(groups).map(([kind,list])=>`
        <div class="wm-group">${kindLabel[kind]}</div>
        ${list.map(w=>{
          const yrs=w.end?w.start+'–'+w.end:String(w.start)+'–';
          return `<label class="wm-item" data-id="${w.id}">
            <input type="checkbox" ${w.hidden?'':'checked'}>
            <span class="wm-dot" style="background:${w.color}"></span>
            <span class="wm-name">${w.name}</span>
            <span class="wm-years">${yrs}</span>
          </label>`;}).join('')}
      `).join('')}
      <div class="wm-note">Dots pinned to the USGS unit value in each war's start year · series ends 2017</div>
    </div>`;
  const drop=$('#wmDrop'), count=$('#wmCount');
  $('#wmToggle').onclick=(e)=>{ e.stopPropagation(); const open=drop.hidden; drop.hidden=!open; $('#wmToggle').setAttribute('aria-expanded',!open); };
  document.addEventListener('click',(e)=>{ if(!wrap.contains(e.target)) drop.hidden=true; });
  const refresh=()=>{
    const n=wars.filter(w=>!w.hidden).length;
    count.textContent=n;
    chart.redraw();
  };
  $$('#wmDrop .wm-item input').forEach(cb=>{
    cb.onchange=()=>{
      const w=wars.find(x=>x.id===cb.closest('.wm-item').dataset.id);
      w.hidden=!cb.checked;
      refresh();
    };
  });
  $$('#wmDrop .wm-act').forEach(btn=>{
    btn.onclick=()=>{
      const act=btn.dataset.act;
      wars.forEach(w=>{
        w.hidden = act==='all'?false : act==='none'?true : w.kind!=='world';
      });
      $$('#wmDrop .wm-item input').forEach(cb=>{
        const w=wars.find(x=>x.id===cb.closest('.wm-item').dataset.id);
        cb.checked=!w.hidden;
      });
      refresh();
    };
  });
}

/* ---------------- methodology ---------------- */
function renderMethodology(){
  const D=MODELS,fm=D.factor_model,em=D.equity_model;
  const sd=D.supply_demand;
  const models=[
    {id:'M0',color:C.observed,title:'Observed — reported benchmark chain',wide:true,
     body:'Independently verified anchors: ISBP/Dornhofer (APT opened 2025 at ~$330/mtu WO₃; stood above $3,000/mtu on 17-Jul-2026), Fastmarkets ($3,139.50/mtu on 24-Jul-2026, CIF Rotterdam/Baltimore duty-free, per the Almonty Jul-2026 deck), and the IMARC carbide figure ($131/kg China). The daily path between anchors is a documented analyst reconstruction (monthly shape, time-interpolated). This is the reference series every other model is judged against.',
     formula:'P_reported(t) = verified anchors ⊕ analyst reconstruction',
     meta:'Tier-1 anchors · Tier-3 path · 1 t APT(88.5%) = 88.5 mtu WO₃',refs:['Fastmarkets fragmentation framing','USGS for unit conventions']},
    {id:'M1',color:C.shanghai,title:'Shanghai-implied + cost of carry (cornerstone)',
     body:'The domestic Chinese APT price is the most legitimate anchor: it is set by real supply/demand in the 80%-of-production market. Rotterdam fair = Shanghai domestic × (1 + freight + insurance + financing + export premium). After the 4-Feb-2025 export controls the two markets fragmented (Fastmarkets: "fragmenting"); Shanghai trades at a ~38% discount and the observed Rotterdam price carries a ~40%+ fragmentation premium over its Shanghai+carry fair value. That premium is the signal — policy-driven, and it should compress as Western supply (Sangdong, Panasqueira L4, Gentung) ramps.',
     formula:'P_fair = P_shanghai × (1 + carry + export_premium) ;  premium = P_obs / P_fair − 1',
     meta:'freight+ins ≈ 1.5% · financing ≈ 0.3% · export premium 0→12% post-controls · discount 6%→38%',refs:['Fastmarkets "markets fragmenting"','Engle & Granger co-integration (pre/post controls)']},
    {id:'M2',color:C.equity,title:'Equity-implied price — REJECTED, kept as diagnostic',
     body:'Maps tungsten-equity excess returns (each stock stripped of its local benchmark) to an implied spot via an elasticity β calibrated on the Jan25→Jul26 window. Result: equities imply a far LOWER price (~$864) than the physical market — they are noisy, lag the physical benchmarks, and the lead-lag test rejects them as a leading indicator (corr ≈ −0.19). Kept on the dashboard as an honest diagnostic of why naive equity mapping fails; EXCLUDED from the Kalman fusion.',
     formula:'P_eq(t) = 330 × [ ∏(1+r_excess) ]^β ,  β = '+em.beta_elasticity,
     meta:'lead corr(21d) = '+D.backtest.lead_corr_equity_vs_apt_21d+' → REJECTED · not fused',refs:['Fama-French equity factors','Event-study methodology']},
    {id:'M3',color:C.factor,title:'Demand-side factor model (iron ore + moly + macro)',
     body:'Monthly ridge regression of log-APT changes on the factors that actually drive tungsten demand: iron ore (mining &amp; construction = 26% of end-use), a moly equity basket (sister metal, co-mined, same Chinese export controls), China ETF, USD/CNY and S&P 500. Copper is included ONLY as a control — the model exists to price tungsten, not to re-prove that copper is unrelated. The factor path is a sanity band, not a forecast.',
     formula:'ΔlnP = '+fm.alpha_monthly.toFixed(4)+' + '+fm.betas.tio+'·ΔlnIronOre + '+fm.betas.moly+'·ΔlnMoly + '+fm.betas.cu+'·ΔlnCu(control) + '+fm.betas.fxi+'·ΔlnFXI + '+fm.betas.cny+'·ΔlnCNY + '+fm.betas.spx+'·ΔlnSPX',
     meta:'R² = '+fm.r2+' · copper is a control, not a driver',refs:['Pindyck & Rotemberg co-movement','Stock & Watson factor forecasting']},
    {id:'M4',color:C.kalman,title:'Kalman latent-price fusion (headline estimate)',
     body:'State-space model fusing the reported chain (tight noise), the Shanghai-implied domestic (tight noise — the cornerstone) and the factor path (medium noise) into a single latent log-price with drift. The equity signal is excluded (rejected). Because Shanghai is now a tight observation, the headline fair value sits BELOW the reported Rotterdam price — reflecting the view that the export price carries a fragmentation premium that is not "true" value.',
     formula:'xₜ = F·xₜ₋₁ + w ;  zₜ = H·xₜ + v ,  R = diag(0.002, 0.002, 0.02)',
     meta:'hand-rolled Kalman (numpy) · last σ(log) = '+D.kalman_model.last_se_log.toFixed(4),refs:['Hamilton state-space','Kalman (1960) filtering']},
  ];
  if(sd){
    models.push({id:'M5',color:C.fair,title:'Supply-demand equilibrium (stock-to-use balance)',
     body:(sd.headline||'Balance-driven scenario model: global supply vs demand, mapped to price via a calibrated stock-to-use curve.')+' Scenarios: base / bull / bear on demand growth and supply ramp. Built from the Almonty Jul-2026 deck figures (5,570 t deficit 2025, 2,330 t 2026, ~85 kt production, 2.0% demand CAGR to 2050, defense only ~8% of end-use) + USGS history.',
     formula:'stock_to_use = stock / demand ;  P = f(stock_to_use, marginal cost floor)',
     meta:'3 scenarios · 2025-2035 horizon · stock levels modeled, not reported',refs:['Almonty Jul-2026 investor deck','USGS MCS 2026','ITIA Applications & Markets 2021']});
  }
  $('#methModels').innerHTML=models.map(m=>`
    <div class="meth-card ${m.wide?'wide':''}" style="--cc:${m.color}">
      <div class="m-id">MODEL ${m.id}</div>
      <h3>${m.title}</h3>
      <p>${m.body}</p>
      <div class="formula">${m.formula}</div>
      <div class="m-meta"><b>NOTES:</b> ${m.meta}</div>
      <div class="m-meta"><b>REFS:</b> ${m.refs.join(' · ')}</div>
    </div>`).join('');

  /* provenance table */
  const prov=[
    ['APT Rotterdam anchors ($330 / $3,000+ / $3,139.50)','TIER-1','ISBP (M. Dornhofer) via Almonty newsletter; Fastmarkets via Almonty Jul-2026 deck','VERIFIED'],
    ['China dual-use export controls date','TIER-1','Multiple; effective 4 Feb 2025','VERIFIED'],
    ['Tungsten carbide $131/kg China','TIER-1','IMARC Group via openPR, 3 Aug 2026','VERIFIED'],
    ['Daily APT path between anchors','TIER-3','Analyst reconstruction (this dashboard)','ESTIMATED'],
    ['Shanghai-implied domestic','TIER-3','M1 structural carry model','ESTIMATED'],
    ['Supply-demand balance (5,570 t deficit 2025, 2,330 t 2026, ~85 kt supply, 2.0% CAGR)','TIER-2','Sangdong NI 43-101 via Almonty Jul-2026 deck; Merchant Research & Consulting via deck','COMPANY-SOURCED'],
    ['End-use split (defense ~8%, transport 26%, mining/construction 26%)','TIER-2','ITIA Applications & Markets 2021, via Almonty Jul-2026 deck','THIRD-PARTY'],
    ['Copper, iron ore, FX, equity indices','TIER-2','Yahoo Finance daily closes','MARKET DATA'],
    ['USGS tungsten unit value 1900–2017','TIER-2','USGS ds140 historical statistics','PUBLIC DATA'],
    ['News feed','TIER-2','Google News RSS (publisher-linked)','AGGREGATED'],
  ];
  $('#provTable tbody').innerHTML=prov.map(r=>`<tr>
    <td>${r[0]}</td><td><span class="tier tier-${r[1].slice(-1)}">${r[1]}</span></td>
    <td>${r[2]}</td><td>${r[3]}</td></tr>`).join('');

  /* references */
  const refs=[
    ['Hamilton, J.D. (1994)','Time Series Analysis, Princeton UP','The state-space / Kalman framework behind M4 latent-price fusion.','M4 · KALMAN'],
    ['Kalman, R.E. (1960)','A New Approach to Linear Filtering & Prediction Problems, J. Basic Eng.','Optimal recursive estimation — how we fuse reported + factor + equity signals.','M4 · KALMAN'],
    ['Pindyck, R. & Rotemberg, J. (1990)','The Excess Co-Movement of Commodity Prices, JPE','Why metals move together beyond fundamentals — motivates proxy factors.','M3 · FACTOR'],
    ['Stock, J. & Watson, M. (2002)','Macroeconomic Forecasting Using Diffusion Indexes, JBES','Forecasting from many correlated indicators — factor-model basis.','M3 · FACTOR'],
    ['Fama, E. & French, K. (1993)','Common Risk Factors in Stock and Bond Returns, JFE','Stripping market/benchmark risk to isolate tungsten-equity excess returns.','M2 · EQUITY'],
    ['MacKinlay, A.C. (1997)','Event Studies in Economics and Finance, JEL','Event-study logic for the export-control shock and lead-lag tests.','M2 · BACKTEST'],
    ['Engle, R. & Granger, C. (1987)','Co-integration and Error Correction, Econometrica','Testing whether Rotterdam and Shanghai are one market (pre/post controls).','M1 · ARBITRAGE'],
    ['Schwartz, E. (1997)','The Stochastic Behavior of Commodity Prices, J. Finance','Commodity price dynamics / convenience-yield framing for latent price.','M4 · CONTEXT'],
  ];
  $('#refsBox').innerHTML=refs.map(r=>`<div class="ref">
    <div class="r-cite">${r[0]}</div><div class="r-where">${r[1]}</div>
    <div class="r-why">${r[2]}</div><div class="r-use">→ ${r[3]}</div></div>`).join('');
}

/* ---------------- tabs ---------------- */
$$('.tab').forEach(t=>t.onclick=()=>{
  $$('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  $$('.tab-panel').forEach(p=>p.classList.remove('active'));
  $('#tab-'+t.dataset.tab).classList.add('active');
});

/* ---------------- boot ---------------- */
async function boot(){
  try{
    [MODELS,NEWS]=await Promise.all([
      fetch('data/models_output.json').then(r=>r.json()),
      fetch('data/news.json').then(r=>r.json()),
    ]);
    render();
  }catch(e){
    document.body.innerHTML='<div style="padding:40px;font-family:monospace;color:#e05252">Failed to load data: '+e.message+'<br>Serve the site over HTTP (python -m http.server) rather than opening the file directly.</div>';
  }
}
boot();
