(function(){
  'use strict';
  var CFG = window.CARTEIRA_CONFIG || {};
  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && String(CFG.SUPABASE_URL).indexOf('COLOCA')<0 && window.supabase);
  var sb = null, session = null;
  var rawPos = [], divisions = [], snaps = [], quotes = {}, fxRate = null;
  var demo = false, panelMode = null, editingId = null, confirmId = null, confirmDiv = null, sel = 'all', loaded = false, timer = null;

  var DEMO_DIVS = [ { id:'etf', name:'ETFs (plano FIRE)', order:1 }, { id:'acoes', name:'Ações top1', order:2 }, { id:'reits', name:'REITS', order:3 } ];
  var DEMO_POS = [
    { id:'d1', ticker:'VWCE', name:'Vanguard FTSE All-World (acc)', qty:42, avgCost:104.2, currency:'EUR', price:121.5, prevClose:118.9, at:0, division:'etf', manual:false },
    { id:'d2', ticker:'AAPL', name:'Apple', qty:15, avgCost:168, currency:'USD', price:231, prevClose:226, at:0, division:'acoes', manual:false },
    { id:'d3', ticker:'ASML', name:'ASML Holding', qty:4, avgCost:690, currency:'EUR', price:742, prevClose:751, at:0, division:'acoes', manual:false },
    { id:'d4', ticker:'O', name:'Realty Income', qty:30, avgCost:58, currency:'USD', price:54, prevClose:53.6, at:0, division:'reits', manual:false },
    { id:'d5', ticker:'MSFT', name:'Microsoft', qty:6, avgCost:380, currency:'USD', price:452, prevClose:447, at:0, division:'acoes', manual:false }
  ];
  var DEMO_SNAPS = [
    { id:'2026-05', value:11800, invested:11200 },{ id:'2026-06', value:12150, invested:11200 },
    { id:'2026-07', value:12900, invested:11900 },{ id:'2026-08', value:12700, invested:11900 },
    { id:'2026-09', value:13650, invested:12400 },{ id:'2026-10', value:14100, invested:12400 }
  ];
  var DEMO_FX = 0.9;

  var eur = new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'});
  var eurC = new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR',notation:'compact',maximumFractionDigits:1});
  var qtyF = new Intl.NumberFormat('pt-PT',{maximumFractionDigits:6});
  function money(v){ return eur.format(v); }
  function sgn(v){ return v>0?'+':(v<0?'−':''); }
  function sMoney(v){ return sgn(v)+eur.format(Math.abs(v)); }
  function sPct(v){ return sgn(v)+(Math.abs(v)*100).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})+'%'; }
  function pct1(v){ return (v*100).toLocaleString('pt-PT',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'; }
  function cls(v){ return v>0?'gain':(v<0?'loss':''); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function parseNum(s){ var t = String(s).trim().replace(/\s/g,''); if(t==='') return NaN; var n = Number(t.replace(',','.')); return isFinite(n)?n:NaN; }
  function fmtIn(n){ return String(n).replace('.',','); }
  function $(id){ return document.getElementById(id); }

  /* ───────── dados normalizados ───────── */
  function normalize(r){
    var price = null, prev = 0, at = 0;
    if(r.manual){
      if(r.manual_price!=null) price = Number(r.manual_price);
      at = r.manual_price_at ? Date.parse(r.manual_price_at) : 0;
    } else {
      var q = quotes[r.symbol];
      if(q && (!q.currency || String(q.currency).toUpperCase()===r.currency)){
        price = Number(q.price); prev = q.prev_close!=null ? Number(q.prev_close) : 0; at = Date.parse(q.as_of) || 0;
      }
    }
    return { id:r.id, ticker:r.ticker, name:r.name||'', qty:Number(r.qty), avgCost:Number(r.avg_cost), currency:r.currency,
             division:r.division_id||'', manual:!!r.manual, manualPrice:r.manual_price, symbol:r.symbol||'', override:r.symbol_override||'',
             price:price, prevClose:prev, at:at };
  }
  function active(){ return demo ? DEMO_POS : rawPos.map(normalize); }
  function activeSnaps(){ return demo ? DEMO_SNAPS : snaps; }
  function divList(){ return (demo ? DEMO_DIVS : divisions).slice().sort(function(a,b){ return (a.order||0)-(b.order||0); }); }
  function divName(id){ if(id==='_none') return 'Sem divisão'; var d = divList().filter(function(x){return x.id===id;})[0]; return d ? d.name : 'Sem divisão'; }
  function dkey(p){ var ok = p.division && divList().some(function(d){ return d.id===p.division; }); return ok ? p.division : '_none'; }
  function divColor(id){
    if(id==='_none') return 'var(--muted)';
    var i = divList().map(function(d){return d.id;}).indexOf(id);
    return 'var(--c'+((i<0?0:i)%8+1)+')';
  }
  function fx(){ return demo ? DEMO_FX : fxRate; }
  function rate(p){ return p.currency==='USD' ? fx() : 1; }

  function totals(rows){
    var t = { value:0, cost:0, dEur:0 };
    rows.forEach(function(x){ if(x.missing) return; t.value+=x.value; t.cost+=x.cost; t.dEur+=x.dEur; });
    t.pl = t.value-t.cost; t.plPct = t.cost? t.pl/t.cost : 0;
    t.dPct = (t.value-t.dEur)>0 ? t.dEur/(t.value-t.dEur) : 0;
    return t;
  }

  function compute(){
    if(sel!=='all' && sel!=='_none' && !divList().some(function(d){return d.id===sel;})) sel = 'all';
    var all = active().map(function(p){
      var r = rate(p), missing = (p.price==null || r==null);
      if(missing) return { p:p, key:dkey(p), missing:true, value:0, cost:0, pl:0, plPct:0, dPct:0, dEur:0 };
      var value = p.qty*p.price*r, cost = p.qty*p.avgCost*r, pl = value-cost;
      return { p:p, key:dkey(p), missing:false, value:value, cost:cost, pl:pl, plPct: cost?pl/cost:0,
               dPct: p.prevClose>0 ? p.price/p.prevClose-1 : 0,
               dEur: p.prevClose>0 ? p.qty*(p.price-p.prevClose)*r : 0 };
    }).sort(function(a,b){ return (a.missing-b.missing) || (b.value-a.value); });
    var rows = sel==='all' ? all : all.filter(function(x){ return x.key===sel; });
    var groups = divList().map(function(d){ return { id:d.id, name:d.name, rows:all.filter(function(x){return x.key===d.id;}) }; });
    var none = all.filter(function(x){return x.key==='_none';});
    if(none.length) groups.push({ id:'_none', name:'Sem divisão', rows:none });
    groups.forEach(function(g){ g.t = totals(g.rows); });
    return { all:all, rows:rows, groups:groups, t:totals(rows), tAll:totals(all), missing:all.filter(function(x){return x.missing;}) };
  }

  function lastStamp(){
    var latest = 0;
    active().forEach(function(p){ if(p.at>latest) latest=p.at; });
    if(!latest) return demo ? 'Exemplo' : '';
    return new Date(latest).toLocaleString('pt-PT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  }

  /* ───────── desenho ───────── */
  function renderCtx(){
    var el = $('ctx');
    if(sel==='all'){ el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<span>A ver a divisão <b>'+esc(divName(sel))+'</b></span><button class="link" data-action="sel" data-id="all" type="button">Ver toda a carteira</button>';
  }

  function renderWarn(c){
    var el = $('warn'), msgs = [];
    if(!demo && c.missing.length){
      msgs.push(c.missing.length+(c.missing.length===1?' posição está':' posições estão')+' sem preço e '+(c.missing.length===1?'ficou':'ficaram')+' de fora dos totais ('+c.missing.slice(0,6).map(function(x){return esc(x.p.ticker);}).join(', ')+(c.missing.length>6?'…':'')+'). Corrige o símbolo, ou marca a posição como «preço manual».');
    }
    if(!demo && c.all.some(function(x){return x.p.currency==='USD';}) && fxRate==null) msgs.push('Falta a taxa de câmbio; as posições em dólares ficam de fora até a tarefa de preços correr.');
    el.hidden = !msgs.length; el.innerHTML = msgs.map(function(m){return '<span>'+m+'</span>';}).join('');
  }

  function renderSummary(c){
    var el = $('summary'), t = c.t;
    var priced = c.rows.filter(function(x){return !x.missing;}).length;
    var sub1 = priced+(priced===1?' posição':' posições');
    if(sel!=='all' && c.tAll.value>0) sub1 += ' · '+pct1(t.value/c.tAll.value)+' da carteira';
    el.innerHTML =
      '<div><div class="lbl">Valor atual</div><div class="big num">'+money(t.value)+'</div><div class="sub hint">'+sub1+'</div></div>'+
      '<div><div class="lbl">Total investido</div><div class="big num">'+money(t.cost)+'</div><div class="sub hint">custo médio de compra</div></div>'+
      '<div><div class="lbl">Ganho / perda</div><div class="big num '+cls(t.pl)+'">'+sMoney(t.pl)+'</div><div class="sub num '+cls(t.pl)+'">'+(t.cost?sPct(t.plPct):'–')+'</div></div>'+
      '<div><div class="lbl">Variação do dia</div><div class="big num '+cls(t.dEur)+'">'+sMoney(t.dEur)+'</div><div class="sub num '+cls(t.dEur)+'">'+(t.value&&t.dEur?sPct(t.dPct):'–')+'</div></div>';
  }

  function renderDivTable(c){
    var el = $('divtable');
    if(!c.groups.length){ el.innerHTML = '<p class="hint">Ainda não há divisões. Usa «Gerir divisões» para criar a primeira.</p>'; return; }
    var h = '<table class="divs"><thead><tr><th>Divisão</th><th>Posições</th><th>Valor</th><th>Investido</th><th>Ganho / perda</th><th>Peso</th></tr></thead><tbody>';
    var T = c.tAll;
    h += '<tr class="pick'+(sel==='all'?' sel':'')+'" data-action="sel" data-id="all"><td><button class="name" data-action="sel" data-id="all" type="button" aria-pressed="'+(sel==='all')+'"><i class="dot" style="background:var(--ink)"></i>Toda a carteira</button></td>'+
         '<td class="num">'+c.all.length+'</td><td class="num"><b>'+money(T.value)+'</b></td><td class="num">'+money(T.cost)+'</td>'+
         '<td class="num '+cls(T.pl)+'">'+sMoney(T.pl)+' <span style="font-size:12px">'+(T.cost?sPct(T.plPct):'')+'</span></td><td class="num">100%</td></tr>';
    c.groups.forEach(function(g){
      var has = g.rows.length>0, w = T.value>0 ? g.t.value/T.value : 0;
      h += '<tr class="pick'+(sel===g.id?' sel':'')+'" data-action="sel" data-id="'+esc(g.id)+'"><td><button class="name" data-action="sel" data-id="'+esc(g.id)+'" type="button" aria-pressed="'+(sel===g.id)+'"><i class="dot" style="background:'+divColor(g.id)+'"></i>'+esc(g.name)+'</button></td>'+
        '<td class="num">'+(has?g.rows.length:'–')+'</td>'+
        '<td class="num">'+(has?'<b>'+money(g.t.value)+'</b>':'–')+'</td>'+
        '<td class="num">'+(has?money(g.t.cost):'–')+'</td>'+
        '<td class="num '+cls(g.t.pl)+'">'+(has?sMoney(g.t.pl)+' <span style="font-size:12px">'+sPct(g.t.plPct)+'</span>':'–')+'</td>'+
        '<td class="num"><span class="wcell">'+(has?pct1(w):'–')+'<span class="wbar"><i style="width:'+Math.min(100,w*100).toFixed(1)+'%"></i></span></span></td></tr>';
    });
    el.innerHTML = h+'</tbody></table>';
  }

  function niceTicks(min,max,n){
    var span = max-min || 1, step = Math.pow(10,Math.floor(Math.log10(span/n))), err = span/n/step;
    step *= err>=7.5?10:err>=3.5?5:err>=1.5?2:1;
    var lo = Math.floor(min/step)*step, hi = Math.ceil(max/step)*step, out = [];
    for(var v=lo; v<=hi+step/2; v+=step) out.push(v);
    return out;
  }
  function monthLabel(id){
    var p = id.split('-'); var d = new Date(Number(p[0]), Number(p[1])-1, 1);
    return d.toLocaleDateString('pt-PT',{month:'short'}).replace('.','')+' '+String(p[0]).slice(2);
  }

  function renderChart(){
    var el = $('chart');
    var s = activeSnaps().slice().sort(function(a,b){return a.id<b.id?-1:1;}).map(function(x){
      if(sel==='all') return { id:x.id, value:Number(x.value), invested:Number(x.invested) };
      var d = x.divisions && x.divisions[sel]; return d ? { id:x.id, value:Number(d.value), invested:Number(d.invested) } : null;
    }).filter(Boolean);
    if(!s.length){
      el.innerHTML = sel==='all'
        ? '<p class="hint">Ainda não há registos mensais. O primeiro aparece assim que houver preços; depois o gráfico mostra a evolução mês a mês.</p>'
        : '<p class="hint">Ainda não há registos mensais desta divisão. O próximo registo mensal já a inclui.</p>';
      return;
    }
    var W=640,H=240,L=54,R=14,T=14,B=28;
    var vals = []; s.forEach(function(x){ vals.push(x.value,x.invested); });
    var ticks = niceTicks(Math.min.apply(null,vals)*0.97, Math.max.apply(null,vals)*1.03, 4);
    var y0 = ticks[0], y1 = ticks[ticks.length-1];
    function X(i){ return s.length===1 ? (L+(W-L-R)/2) : L+(W-L-R)*i/(s.length-1); }
    function Y(v){ return T+(H-T-B)*(1-(v-y0)/((y1-y0)||1)); }
    var svg = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Evolução do valor e do total investido">';
    ticks.forEach(function(v){
      svg += '<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v)+'" y2="'+Y(v)+'"/><text class="axis" x="'+(L-8)+'" y="'+(Y(v)+4)+'" text-anchor="end">'+eurC.format(v)+'</text>';
    });
    var step = Math.ceil(s.length/7);
    s.forEach(function(x,i){ if(i%step===0 || i===s.length-1) svg += '<text class="axis" x="'+X(i)+'" y="'+(H-8)+'" text-anchor="middle">'+monthLabel(x.id)+'</text>'; });
    function path(key){ return s.map(function(x,i){return (i?'L':'M')+X(i).toFixed(1)+' '+Y(x[key]).toFixed(1);}).join(' '); }
    if(s.length>1){
      svg += '<path d="'+path('value')+' L'+X(s.length-1)+' '+Y(y0)+' L'+X(0)+' '+Y(y0)+' Z" fill="var(--accent)" fill-opacity=".10" stroke="none"/>';
      svg += '<path d="'+path('invested')+'" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 4"/>';
      svg += '<path d="'+path('value')+'" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>';
    } else {
      svg += '<circle cx="'+X(0)+'" cy="'+Y(s[0].invested)+'" r="4" fill="var(--muted)"/>';
    }
    var li = s.length-1;
    svg += '<circle cx="'+X(li)+'" cy="'+Y(s[li].value)+'" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>';
    svg += '<text class="axis" x="'+Math.min(X(li),W-R)+'" y="'+(Y(s[li].value)-10)+'" text-anchor="end" style="fill:var(--ink);font-weight:600">'+money(s[li].value)+'</text>';
    svg += '</svg>';
    el.innerHTML = svg + (s.length<2 ? '<p class="hint">Falta mais um registo mensal para desenhar a linha.</p>' : '');
  }

  function renderAlloc(c){
    var el = $('alloc'), title = $('h-alloc');
    var items, mono = false;
    if(sel==='all'){
      title.textContent = 'Distribuição por divisão';
      items = c.groups.filter(function(g){return g.t.value>0;}).sort(function(a,b){return b.t.value-a.t.value;}).map(function(g){ return { n:g.name, v:g.t.value, col:divColor(g.id) }; });
    } else {
      title.textContent = 'Distribuição em '+divName(sel); mono = true;
      var priced = c.rows.filter(function(x){return !x.missing;});
      var top = priced.slice(0,7), rest = priced.slice(7);
      items = top.map(function(x,i){ return { n:x.p.ticker, v:x.value, col:'var(--c'+(i+1)+')' }; });
      if(rest.length) items.push({ n:'Outras ('+rest.length+')', v:rest.reduce(function(a,x){return a+x.value;},0), col:'var(--c8)' });
    }
    var total = items.reduce(function(a,i){return a+i.v;},0);
    if(!items.length || total<=0){ el.innerHTML = '<p class="hint">A distribuição aparece quando houver posições com preço.</p>'; return; }
    var bar = '<div class="alloc" role="img" aria-label="Distribuição">', list = '<ul class="alloclist">';
    items.forEach(function(it){
      bar += '<span style="flex:'+it.v+';background:'+it.col+'" title="'+esc(it.n)+'"></span>';
      list += '<li><i style="background:'+it.col+'"></i><b'+(mono?' class="mono"':'')+'>'+esc(it.n)+'</b><span class="num">'+pct1(it.v/total)+'</span></li>';
    });
    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:14px">'+bar+'</div>'+list+'</ul></div>';
  }

  function renderPositions(c){
    var el = $('positions');
    $('pos-note').textContent = c.rows.length ? 'Ordenadas por valor' : '';
    if(!c.all.length){
      el.innerHTML = '<div class="empty"><h2>Ainda não tens posições</h2><p>Adiciona cada ativo com a quantidade e o preço médio a que o compraste. Os preços atualizam-se sozinhos. Para um PPR ou obrigações fora da corretora, usa uma posição com preço manual.</p><div class="actions"><button class="primary" data-action="open-add" type="button">Adicionar a primeira posição</button></div></div>';
      return;
    }
    if(!c.rows.length){
      el.innerHTML = '<div class="empty"><h2>Esta divisão ainda não tem posições</h2><p>Escolhe a divisão na coluna «Divisão» de uma posição existente, ou adiciona uma nova.</p><div class="actions"><button class="primary" data-action="open-add" type="button">Adicionar posição</button></div></div>';
      return;
    }
    var opts = function(cur){
      var o = '<option value=""'+(cur==='_none'?' selected':'')+'>Sem divisão</option>';
      divList().forEach(function(d){ o += '<option value="'+esc(d.id)+'"'+(cur===d.id?' selected':'')+'>'+esc(d.name)+'</option>'; });
      return o;
    };
    var h = '<table class="pos"><thead><tr><th>Ativo</th><th>Divisão</th><th>Qtd.</th><th>Preço médio</th><th>Preço atual</th><th>Valor</th><th>Ganho / perda</th><th>Var. dia</th><th><span style="position:absolute;left:-9999px">Ações</span></th></tr></thead><tbody>';
    c.rows.forEach(function(x){
      var p = x.p, cur = p.currency==='USD' ? 'USD' : 'EUR';
      var px = function(v){ return v.toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:4})+' '+(cur==='USD'?'$':'€'); };
      h += '<tr><td><span class="tk">'+esc(p.ticker)+'</span><span class="nm">'+esc(p.name)+(p.manual?' · preço manual':'')+'</span></td>'+
        '<td style="text-align:left"><select class="sel" data-div-for="'+esc(p.id)+'" aria-label="Divisão de '+esc(p.ticker)+'"'+(demo?' disabled':'')+'>'+opts(x.key)+'</select></td>'+
        '<td class="num">'+qtyF.format(p.qty)+'</td><td class="num">'+px(p.avgCost)+'</td>';
      if(x.missing){
        h += '<td class="num nop" colspan="4" style="text-align:right">sem preço</td>';
      } else {
        h += '<td class="num">'+px(p.price)+'</td>'+
        '<td class="num"><b>'+money(x.value)+'</b></td>'+
        '<td class="num '+cls(x.pl)+'">'+sMoney(x.pl)+'<br><span style="font-size:12px">'+sPct(x.plPct)+'</span></td>'+
        '<td class="num '+(p.prevClose>0?cls(x.dPct):'')+'">'+(p.prevClose>0?sPct(x.dPct):'–')+'</td>';
      }
      h += '<td><div class="row-actions"><button class="link" data-action="edit" data-id="'+esc(p.id)+'" type="button">Editar</button>'+
        '<button class="link danger" data-action="del" data-id="'+esc(p.id)+'" type="button">'+(confirmId===p.id?'Confirmar remoção':'Remover')+'</button></div></td></tr>';
    });
    el.innerHTML = h+'</tbody></table>';
  }

  function renderPanel(){
    var el = $('panel');
    if(!panelMode){ el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    if(panelMode==='edit'){
      var p = editingId ? (active().filter(function(x){return x.id===editingId;})[0]||{}) : {};
      var curDiv = editingId ? dkey(p) : (sel!=='all' ? sel : '_none');
      var dopts = '<option value=""'+(curDiv==='_none'?' selected':'')+'>Sem divisão</option>'+divList().map(function(d){ return '<option value="'+esc(d.id)+'"'+(curDiv===d.id?' selected':'')+'>'+esc(d.name)+'</option>'; }).join('');
      var man = !!p.manual;
      el.innerHTML = '<form class="panel" id="f-pos" autocomplete="off"><h2>'+(editingId?'Editar posição':'Nova posição')+'</h2>'+
        '<div class="fields">'+
        '<label>Símbolo<input id="f-ticker" required maxlength="20" placeholder="ex.: VWCE.DE ou MSFT" value="'+esc(p.ticker||'')+'"></label>'+
        '<label>Nome<input id="f-name" maxlength="80" placeholder="ex.: Vanguard FTSE All-World" value="'+esc(p.name||'')+'"></label>'+
        '<label>Divisão<select id="f-div">'+dopts+'</select></label>'+
        '<label>Quantidade<input id="f-qty" required inputmode="decimal" placeholder="0" value="'+(p.qty!=null?fmtIn(p.qty):'')+'"></label>'+
        '<label>Preço médio de compra<input id="f-avg" required inputmode="decimal" placeholder="0,00" value="'+(p.avgCost!=null?fmtIn(p.avgCost):'')+'"></label>'+
        '<label>Moeda do ativo<select id="f-cur"><option value="EUR"'+(p.currency!=='USD'?' selected':'')+'>Euro (€)</option><option value="USD"'+(p.currency==='USD'?' selected':'')+'>Dólar ($)</option></select></label>'+
        '<label>Símbolo para o preço <span class="hint">(opcional)</span><input id="f-over" maxlength="20" placeholder="só se o automático falhar" value="'+esc(p.override||'')+'"></label>'+
        '</div>'+
        '<label class="check"><input type="checkbox" id="f-man"'+(man?' checked':'')+'> Preço manual (PPR, obrigações fora da corretora…)</label>'+
        '<div class="fields"><label>Preço atual (só no modo manual)<input id="f-mp" inputmode="decimal" placeholder="0,00" value="'+(man&&p.manualPrice!=null?fmtIn(p.manualPrice):'')+'"'+(man?'':' disabled')+'></label></div>'+
        '<div class="actions"><button class="primary" type="submit">Guardar</button><button type="button" data-action="close">Cancelar</button></div></form>';
      setTimeout(function(){ var f=$('f-ticker'); if(f) f.focus(); },0);
    } else if(panelMode==='divs'){
      var list = divList().map(function(d){
        return '<div class="drow"><input id="dn-'+esc(d.id)+'" aria-label="Nome da divisão" maxlength="40" value="'+esc(d.name)+'"><div class="row-actions"><button class="link" data-action="div-rename" data-id="'+esc(d.id)+'" type="button">Guardar nome</button><button class="link danger" data-action="div-del" data-id="'+esc(d.id)+'" type="button">'+(confirmDiv===d.id?'Confirmar remoção':'Remover')+'</button></div></div>';
      }).join('');
      el.innerHTML = '<div class="panel"><h2>Gerir divisões</h2><p class="hint" style="margin:0">Uma divisão agrupa posições, por exemplo ETFs, REITS ou Dividendos. A divisão de cada posição escolhe-se na tabela de posições. Ao remover uma divisão, as suas posições ficam sem divisão.</p>'+
        '<div class="uplist">'+list+'<div class="drow"><input id="dn-new" aria-label="Nova divisão" maxlength="40" placeholder="Nova divisão"><button class="primary" data-action="div-add" type="button">Adicionar</button></div></div>'+
        '<div class="actions"><button type="button" data-action="close">Fechar</button></div></div>';
    }
  }

  function render(){
    if(!demo && !session) return;
    var c = compute();
    $('banner').hidden = !demo;
    $('btn-update').hidden = demo; $('btn-divs').hidden = demo; $('btn-add').hidden = demo;
    $('btn-out').hidden = demo;
    $('who').textContent = (!demo && session && session.user) ? 'Sessão: '+session.user.email : '';
    var st = lastStamp();
    $('stamp').textContent = demo ? 'Dados de exemplo' : (!loaded ? 'A carregar…' : (st ? 'Preços de '+st+' · com atraso de 15–20 min' : 'Valores em euros'));
    renderWarn(c); renderCtx(); renderSummary(c); renderDivTable(c); renderChart(); renderAlloc(c); renderPositions(c);
  }

  function toast(msg){
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function(){ t.hidden = true; }, 3500);
  }
  function needDb(){
    if(demo){ toast('Estás no modo exemplo.'); return false; }
    if(!sb || !session){ toast('Sem sessão iniciada.'); return false; }
    return true;
  }
  function fail(e){
    var m = e && e.message ? String(e.message) : '';
    if(m.indexOf('Limite de')>=0) toast(m); else toast('Não foi possível guardar. Tenta outra vez.');
  }

  /* ───────── acesso à base de dados ───────── */
  async function loadQuotes(){
    var syms = [];
    rawPos.forEach(function(r){ if(r.symbol && syms.indexOf(r.symbol)<0) syms.push(r.symbol); });
    var q = {};
    for(var i=0;i<syms.length;i+=100){
      var res = await sb.from('quotes').select('*').in('symbol', syms.slice(i,i+100));
      if(res.error) throw res.error;
      (res.data||[]).forEach(function(x){ q[x.symbol] = x; });
    }
    quotes = q;
    var f = await sb.from('fx_rates').select('*');
    if(f.error) throw f.error;
    var u = (f.data||[]).filter(function(x){return x.pair==='USD_EUR';})[0];
    fxRate = u ? Number(u.rate) : null;
  }
  async function loadSnaps(){
    var r = await sb.from('snapshots').select('*').order('month');
    if(r.error) throw r.error;
    snaps = (r.data||[]).map(function(x){ return { id:String(x.month).slice(0,7), value:x.value, invested:x.invested, divisions:x.by_division||{} }; });
  }
  async function loadAll(){
    try{
      var d = await sb.from('divisions').select('*').order('sort_order'); if(d.error) throw d.error;
      var p = await sb.from('positions').select('*'); if(p.error) throw p.error;
      divisions = (d.data||[]).map(function(x){ return { id:x.id, name:x.name, order:x.sort_order }; });
      rawPos = p.data||[];
      await loadQuotes(); await loadSnaps();
    }catch(e){ toast('Não foi possível carregar os dados.'); }
    loaded = true; render();
  }
  async function afterChange(){
    try{ await sb.rpc('take_my_snapshot'); }catch(e){}
    await loadAll();
  }
  async function refreshNow(){
    if(!needDb()) return;
    try{ await loadQuotes(); await sb.rpc('take_my_snapshot'); await loadSnaps(); render(); toast('Preços atualizados.'); }
    catch(e){ toast('Não foi possível atualizar.'); }
  }

  async function savePosition(e){
    e.preventDefault();
    if(!needDb()) return;
    var ticker = $('f-ticker').value.trim().toUpperCase(), qty = parseNum($('f-qty').value), avg = parseNum($('f-avg').value);
    var man = $('f-man').checked, mp = man ? parseNum($('f-mp').value) : null;
    if(!ticker || !(qty>=0) || !(avg>=0) || (man && !(mp>=0))){ toast('Confirma o símbolo, a quantidade e os preços.'); return; }
    var data = { ticker:ticker, name:$('f-name').value.trim(), division_id:$('f-div').value||null, qty:qty, avg_cost:avg, currency:$('f-cur').value,
                 manual:man, manual_price: man?mp:null, manual_price_at: man?new Date().toISOString():null,
                 symbol_override: $('f-over').value.trim().toUpperCase()||null };
    try{
      var r = editingId ? await sb.from('positions').update(data).eq('id',editingId) : await sb.from('positions').insert(data);
      if(r.error) throw r.error;
      panelMode = null; editingId = null; renderPanel(); toast('Posição guardada.'); await afterChange();
    }catch(err){ fail(err); }
  }

  async function addDivision(){
    if(!needDb()) return;
    var name = $('dn-new').value.trim(); if(!name){ toast('Escreve o nome da nova divisão.'); return; }
    var order = divisions.reduce(function(m,d){ return Math.max(m,d.order||0); },0)+1;
    try{ var r = await sb.from('divisions').insert({ name:name, sort_order:order }); if(r.error) throw r.error; await loadAll(); renderPanel(); toast('Divisão adicionada.'); }
    catch(err){ fail(err); }
  }
  async function renameDivision(id){
    if(!needDb()) return;
    var name = $('dn-'+id).value.trim(); if(!name){ toast('O nome não pode ficar vazio.'); return; }
    try{ var r = await sb.from('divisions').update({ name:name }).eq('id',id); if(r.error) throw r.error; await loadAll(); toast('Nome guardado.'); }catch(err){ fail(err); }
  }
  async function removeDivision(id){
    if(!needDb()) return;
    try{
      var r = await sb.from('divisions').delete().eq('id',id); if(r.error) throw r.error;
      if(sel===id) sel = 'all';
      confirmDiv = null; await afterChange(); renderPanel(); toast('Divisão removida.');
    }catch(err){ fail(err); }
  }
  async function moveToDivision(posId, divId){
    if(!needDb()) return;
    try{ var r = await sb.from('positions').update({ division_id: divId||null }).eq('id',posId); if(r.error) throw r.error; await afterChange(); toast('Divisão atualizada.'); }
    catch(err){ fail(err); }
  }
  async function deletePosition(id){
    if(!needDb()) return;
    try{ var r = await sb.from('positions').delete().eq('id',id); if(r.error) throw r.error; toast('Posição removida.'); await afterChange(); }
    catch(err){ fail(err); }
  }

  /* ───────── sessão ───────── */
  function showAuth(){
    $('auth').hidden = false; $('app').hidden = true;
    $('auth-setup').hidden = configured;
  }
  function showApp(){ $('auth').hidden = true; $('app').hidden = false; }
  function authMsg(text, err){ var m = $('auth-msg'); m.hidden = !text; m.textContent = text||''; m.className = 'msg'+(err?' err':''); }

  async function onAuthSubmit(ev){
    ev.preventDefault();
    if(!configured){ authMsg('A base de dados ainda não está ligada (config.js).', true); return; }
    var mode = (ev.submitter && ev.submitter.getAttribute('data-mode')) || 'in';
    var email = $('a-email').value.trim(), password = $('a-pass').value;
    authMsg('', false);
    try{
      if(mode==='up'){
        var r = await sb.auth.signUp({ email:email, password:password });
        if(r.error) throw r.error;
        if(!r.data.session) authMsg('Conta criada. Abre o email que enviámos para confirmar e depois entra.', false);
      } else {
        var s = await sb.auth.signInWithPassword({ email:email, password:password });
        if(s.error) throw s.error;
      }
    }catch(err){
      var m = String(err && err.message || '');
      authMsg(/invalid login/i.test(m) ? 'Email ou palavra-passe incorretos.' : /already|registered/i.test(m) ? 'Este email já tem conta. Usa «Entrar».' : /password/i.test(m) ? 'A palavra-passe tem de ter pelo menos 8 caracteres.' : 'Não foi possível concluir. Tenta outra vez.', true);
    }
  }

  function startSession(s){
    if(session) return;
    session = s; demo = false; showApp(); loaded = false; sel = 'all'; render(); setTimeout(loadAll,0);
    clearInterval(timer);
    timer = setInterval(function(){ if(session && !demo && !document.hidden && !panelMode) loadQuotes().then(function(){ return loadSnaps(); }).then(render).catch(function(){}); }, 60000);
  }
  function endSession(){
    clearInterval(timer); session = null; rawPos = []; divisions = []; snaps = []; quotes = {}; fxRate = null; panelMode = null; editingId = null;
    renderPanel(); showAuth();
  }

  document.addEventListener('click', async function(ev){
    var b = ev.target.closest('[data-action]'); if(!b) return;
    var a = b.getAttribute('data-action'), id = b.getAttribute('data-id');
    if(a==='open-add'){ editingId=null; panelMode='edit'; renderPanel(); }
    else if(a==='refresh'){ refreshNow(); }
    else if(a==='open-divs'){ panelMode='divs'; confirmDiv=null; renderPanel(); }
    else if(a==='close'){ panelMode=null; editingId=null; confirmDiv=null; renderPanel(); }
    else if(a==='edit'){ editingId=id; panelMode='edit'; renderPanel(); $('panel').scrollIntoView({block:'nearest'}); }
    else if(a==='demo'){ demo=true; sel='all'; showApp(); render(); }
    else if(a==='leave-demo'){ demo=false; sel='all'; panelMode=null; renderPanel(); showAuth(); }
    else if(a==='signout'){ if(sb) { try{ await sb.auth.signOut(); }catch(e){} } endSession(); }
    else if(a==='sel'){ sel = (sel===id && id!=='all') ? 'all' : id; render(); }
    else if(a==='div-add'){ addDivision(); }
    else if(a==='div-rename'){ renameDivision(id); }
    else if(a==='div-del'){
      if(confirmDiv!==id){ confirmDiv=id; renderPanel(); return; }
      removeDivision(id);
    }
    else if(a==='del'){
      if(demo){ toast('Estás no modo exemplo.'); return; }
      if(confirmId!==id){ confirmId=id; renderPositions(compute()); clearTimeout(document._ct); document._ct=setTimeout(function(){ confirmId=null; renderPositions(compute()); },4000); return; }
      confirmId=null; deletePosition(id);
    }
  });
  document.addEventListener('change', function(ev){
    var s = ev.target;
    if(s.id==='f-man'){ var mp = $('f-mp'); mp.disabled = !s.checked; if(s.checked) mp.focus(); return; }
    if(!s.matches || !s.matches('select[data-div-for]')) return;
    moveToDivision(s.getAttribute('data-div-for'), s.value);
  });
  document.addEventListener('submit', function(ev){
    if(ev.target.id==='f-pos') savePosition(ev);
    else if(ev.target.id==='f-auth') onAuthSubmit(ev);
    else ev.preventDefault();
  });

  function start(){
    if(!configured){ showAuth(); return; }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    sb.auth.onAuthStateChange(function(event, s){
      if(s && !session) { startSession(s); }
      else if(s && session) { session = s; }
      else if(!s && session) { endSession(); }
    });
    sb.auth.getSession().then(function(r){
      var s = r && r.data && r.data.session;
      if(s){ if(!session) startSession(s); } else if(!demo) showAuth();
    }).catch(function(){ showAuth(); });
  }
  start();
})();
