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
  equity:'#a78bfa', factor:'#5aa9e6', arb:'#4dd0c4',
  copper:'#f28c38', grid:'#1e2633', axis:'#5c6a7d'
};

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
    hover.active=true;

    // tooltip DOM
    let tip=$('#chartTip');
    if(!tip){tip=document.createElement('div');tip.id='chartTip';document.body.appendChild(tip);}
    const spanY=(X1-X0)/(365*864e5);
    const dt=new Date(tMouse);
    const dateLabel=spanY>=1? String(dt.getFullYear())
      : dt.toLocaleString('en-US',{month:'short',year:'numeric'})+(spanY<0.5? ' '+String(dt.getDate()):'');
    let html=`<div class="tip-x">${dateLabel}</div>`;
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
    ['KALMAN FAIR VALUE', fmtMtu(L.kalman.value)+'/mtu', 'up'],
    ['EQUITY-IMPLIED', fmtMtu(L.equity_implied.value)+'/mtu', 'dn'],
    ['COPPER', '$'+fmt(L.copper.value,2)+'/lb', 'up'],
    ['USD/CNY', fmt(L.usdcny.value,3), ''],
    ['CARBIDE CHINA', '$131/kg', 'up'],
    ['CN EXPORT CONTROLS', 'ACTIVE · 4 FEB 2025', 'dn'],
  ];
  const half=tkItems.map(([k,v,cls])=>`<span class="tk-item"><b>${k}</b> ${v} ${cls?`<span class="${cls}">${cls==='up'?'▲':'▼'}</span>`:''}</span>`).join('');
  $('#tickerTrack').innerHTML=`<div class="ticker-inner">${half}${half}</div>`;

  /* ---- headline cards ---- */
  const cards=[
    {label:'Reported APT · Rotterdam',value:fmtMtu(L.reported_rotterdam.value),unit:'$/mtu WO₃ · 88.5%',cls:'hero',cc:C.observed,
     sub:`≈ <b>${fmtMtu(L.reported_rotterdam_t.value)}/t</b> APT · ${L.reported_rotterdam.date}`},
    {label:'Kalman fair value',value:fmtMtu(L.kalman.value),unit:'$/mtu WO₃ · fused estimate',cc:C.kalman,
     sub:`band ${fmtMtu(L.kalman_band[0])} – ${fmtMtu(L.kalman_band[1])}`},
    {label:'Equity-implied',value:fmtMtu(L.equity_implied.value),unit:'$/mtu · from tungsten stocks',cc:C.equity,
     sub:`discount <b>${fmt((1-L.equity_implied.value/L.reported_rotterdam.value)*100,1)}%</b> vs reported`},
    {label:'Factor-model implied',value:fmtMtu(L.factor_implied.value),unit:'$/mtu · proxy metals',cc:C.factor,
     sub:`premium <b>+${fmt((L.factor_implied.value/L.reported_rotterdam.value-1)*100,1)}%</b> vs reported`},
    {label:'Shanghai-implied domestic',value:fmtMtu(L.shanghai_implied.value),unit:'$/mtu · fragmentation discount',cc:C.shanghai,
     sub:`gap <b>${fmt((1-L.shanghai_implied.value/L.reported_rotterdam.value)*100,1)}%</b> vs Rotterdam`},
    {label:'Copper (proxy)',value:'$'+fmt(L.copper.value,2),unit:'USD/lb · COMEX',cc:C.copper,
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
      markers:[[ '2025-01-02',330],['2026-07-17',3050]]},
    {id:'kal',name:'Kalman fair value',color:C.kalman,width:1.8,data:S.kalman_mtu},
    {id:'eq',name:'Equity-implied',color:C.equity,width:1.6,data:S.equity_implied_mtu,dash:[5,4]},
    {id:'fac',name:'Factor-implied',color:C.factor,width:1.6,data:S.factor_implied_mtu,dash:[2,3]},
    {id:'sh',name:'Shanghai-implied domestic',color:C.shanghai,width:1.6,data:S.shanghai_implied_mtu,dash:[7,4]},
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
      {id:'eqr',name:'Cu vs equity-implied (60d)',color:C.equity,width:1.6,data:S.rolling_corr_cu_eq,dash:[5,4]},
      {id:'facr',name:'Cu vs factor-implied (60d)',color:C.factor,width:1.6,data:S.rolling_corr_cu_fac,dash:[2,3]},
      {id:'obsr',name:'Cu vs observed APT (12M monthly)',color:C.observed,width:2.0,data:S.rolling_corr_cu_obs_m},
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

  /* ---- signal box ---- */
  const bt=D.backtest, fm=D.factor_model, em=D.equity_model;
  $('#signalBox').innerHTML=`
    <h3>Signal diagnostics</h3>
    <div class="row"><span>Equity excess-return β (elasticity)</span><span class="v gold">${em.beta_elasticity}</span></div>
    <div class="row"><span>Cum. excess return, Jan25→Jul26</span><span class="v up">${fmt(em.cum_excess_return_calibration*100,1)}%</span></div>
    <div class="row"><span>Lead corr: equities → APT (21d)</span><span class="v dn">${bt.lead_corr_equity_vs_apt_21d}</span></div>
    <div class="row"><span>Factor model R² (monthly)</span><span class="v">${fm.r2}</span></div>
    <div class="row"><span>Factor β · copper</span><span class="v">${fm.betas.cu}</span></div>
    <div class="row"><span>Factor β · China ETF</span><span class="v">${fm.betas.fxi}</span></div>
    <div class="row"><span>Factor β · USD/CNY</span><span class="v">${fm.betas.cny}</span></div>
    <div class="verdict"><b style="color:var(--accent)">READ:</b> The naive "stocks lead spot" alpha is <b style="color:var(--red)">rejected</b> (lead corr ${bt.lead_corr_equity_vs_apt_21d}). Equities carry tungsten <em>direction</em> information contemporaneously but lag physical benchmarks. Factor R² ${fm.r2} confirms tungsten is policy-driven, not copper-driven.</div>`;

  /* ---- 125y history ---- */
  const hist=D.usgs_history.filter(r=>r.usd_t).map(r=>[r.year+'-07-01',r.usd_t]);
  makeChart($('#historyChart'),{
    series:[{id:'h',name:'USGS unit value',color:C.observed,width:1.6,data:hist}],
    log:true,yFmt:v=>v>=1000?'$'+fmt(v/1000)+'k':'$'+fmt(v),
  });

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

/* ---------------- methodology ---------------- */
function renderMethodology(){
  const D=MODELS,fm=D.factor_model,em=D.equity_model;
  const models=[
    {id:'M0',color:C.observed,title:'Observed — reported benchmark chain',wide:true,
     body:'Two independently verified ISBP/Dornhofer anchors (APT opened 2025 at ~$330/mtu WO₃; stood above $3,000/mtu on 17-Jul-2026), plus the IMARC carbide figure ($131/kg China). The daily path between anchors is a documented analyst reconstruction (monthly shape, time-interpolated). This is the reference series every other model is judged against.',
     formula:'P_reported(t) = verified anchors ⊕ analyst reconstruction',
     meta:'Tier-1 anchors · Tier-3 path · 1 t APT(88.5%) = 88.5 mtu WO₃',refs:['Fastmarkets fragmentation framing','USGS for unit conventions']},
    {id:'M1',color:C.shanghai,title:'Arbitrage — Shanghai-implied fair value',
     body:'Structural carry model. Before China\u2019s export controls, Rotterdam ≈ Shanghai + freight + normal basis (~6%). After 4-Feb-2025 the physical arbitrage died: domestic material is trapped, so Shanghai trades at a ~38% fragmentation discount. The Rotterdam-vs-Shanghai spread is itself the signal.',
     formula:'P_rot ≈ P_sha × (1+freight) ÷ (1 − fragmentation_discount)',
     meta:'freight+insurance ≈ 1.5% · pre-control discount 6% · post-control 38%',refs:['Interest-rate-parity / covered-arbitrage logic']},
    {id:'M2',color:C.equity,title:'Equity-implied price (the alpha hypothesis)',
     body:'The user\u2019s core idea: map tungsten-equity excess returns to an implied spot. We strip each stock\u2019s local benchmark (ASX/China/US), build an equal-weight basket, and raise cumulative excess return to an elasticity β calibrated on the Jan25→Jul26 window. Result: equities imply a LOWER price than reported — they are noisy contemporaneous sensors, and the lead-lag test rejects them as a leading indicator.',
     formula:'P_eq(t) = 330 × [ ∏(1+r_excess) ]^β ,  β = '+em.beta_elasticity,
     meta:'β calibrated on one 18-mo window · lead corr(21d) = '+D.backtest.lead_corr_equity_vs_apt_21d+' → REJECTED as leading',refs:['Fama-French equity factors','Event-study methodology']},
    {id:'M3',color:C.factor,title:'Proxy-metal factor model',
     body:'Monthly ridge regression of log-APT changes on copper, China ETF, USD/CNY, S&P 500 and a moly equity basket. R² ≈ '+fm.r2+' — deliberately published to show tungsten is NOT copper-driven; China policy dominates. The factor path is a sanity band, not a forecast.',
     formula:'ΔlnP = '+fm.alpha_monthly.toFixed(4)+' + '+fm.betas.cu+'·ΔlnCu + '+fm.betas.fxi+'·ΔlnFXI + '+fm.betas.cny+'·ΔlnCNY + '+fm.betas.spx+'·ΔlnSPX + '+fm.betas.moly+'·ΔlnMoly',
     meta:'R² = '+fm.r2+' (low by design · policy-driven market)',refs:['Pindyck & Rotemberg co-movement','Stock & Watson factor forecasting']},
    {id:'M4',color:C.kalman,title:'Kalman latent-price fusion (headline estimate)',
     body:'State-space model fusing all three signals into a single latent log-price with drift. Reported anchors get tight measurement noise, the factor path medium, equities loose. The output is our headline "fair value" with a ±1.96σ confidence band — the most defensible single number.',
     formula:'xₜ = F·xₜ₋₁ + w ;  zₜ = H·xₜ + v ,  R = diag(0.002, 0.05, 0.02)',
     meta:'hand-rolled Kalman (numpy) · last σ(log) = '+D.kalman_model.last_se_log.toFixed(4),refs:['Hamilton state-space','Kalman (1960) filtering']},
  ];
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
    ['APT Rotterdam anchors ($330 / $3,000+)','TIER-1','ISBP (M. Dornhofer) via Almonty newsletter, 19 Jul 2026','VERIFIED'],
    ['China dual-use export controls date','TIER-1','Multiple; effective 4 Feb 2025','VERIFIED'],
    ['Tungsten carbide $131/kg China','TIER-1','IMARC Group via openPR, 3 Aug 2026','VERIFIED'],
    ['Daily APT path between anchors','TIER-3','Analyst reconstruction (this dashboard)','ESTIMATED'],
    ['Shanghai-implied domestic','TIER-3','M1 structural carry model','ESTIMATED'],
    ['Copper, FX, equity indices','TIER-2','Yahoo Finance daily closes','MARKET DATA'],
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
