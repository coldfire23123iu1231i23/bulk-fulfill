/* ---------- carrier detect (ban sao client de hien tuc thi) ---------- */
const UPU_COUNTRY = {US:'USPS',CN:'China Post',GB:'Royal Mail',AU:'Australia Post',JP:'Japan Post',
  CA:'Canada Post',SG:'Singapore Post',NL:'PostNL',FR:'La Poste',BR:'Correios',ES:'Correos',
  NZ:'NZ Post',DE:'DHL Express',SE:'PostNord',DK:'PostNord',IN:'Delhivery',HK:'4PX'};
const RULES = [
  ['UPS',/^1Z[0-9A-Z]{16}$/],['UPS',/^(T\d{10}|\d{9}|\d{26})$/],
  ['FedEx',/^96\d{20}$/],['FedEx',/^61\d{18}$/],
  ['USPS',/^(94|93|92|95|82)\d{20}$/],['USPS',/^(94|93|92|95)\d{24}$/],
  ['USPS',/^(70|71|91|92|93|94|95|82|03|23|14)\d{18}$/],
  ['USPS',/^(70|14|23|03|71|91)\d{14}$/],['USPS',/^82\d{8}$/],
  ['FedEx',/^\d{12}$/],['FedEx',/^\d{15}$/],['FedEx',/^\d{20}$/],
  ['YunExpress',/^YT\d{13,18}$/],
  ['4PX',/^4PX[0-9A-Z]+$/],['4PX',/^RF\d{9}(SG|HK)$/],
  ['DHL eCommerce',/^(GM|LX|RX|CN|SG|TH|MY|IN)\d{8,}$/],['DHL eCommerce',/^JD\d{18}$/],['DHL eCommerce',/^JVGL\d{10,}$/],
  ['DHL Express',/^\d{10}$/],['DHL Express',/^\d{11}$/],
  ['SF Express',/^SF\d{12,15}$/],['Sendle',/^S[0-9A-Z]{9,}$/],['Canada Post',/^\d{16}$/],
  ['Chukou1',/^CK1[0-9A-Z]+$/],['SFC Fulfillment',/^SFC[0-9A-Z]+$/],
  ['__UPU__',/^[A-Z]{2}\d{9}[A-Z]{2}$/],
];
function detect(raw){
  if(!raw) return {company:null,confident:false};
  const t = String(raw).trim().toUpperCase().replace(/[\s-]/g,'');
  if(!t) return {company:null,confident:false};
  for(const [c,re] of RULES){
    if(!re.test(t)) continue;
    if(c==='__UPU__'){ const cc=t.slice(-2); return {company:UPU_COUNTRY[cc]||'Other',confident:!!UPU_COUNTRY[cc]}; }
    return {company:c,confident:true};
  }
  return {company:'Other',confident:false};
}

/* ---------- state ---------- */
const $ = (s)=>document.querySelector(s);
const state = { orders:[], cursor:null, hasNext:false, carriers:[], rows:new Map(), done:new Set() };
let lastUrl = '';
try{ lastUrl = localStorage.getItem('bf-last-url') || ''; }catch{}
const esc = (s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- che do chay: nhung trong Shopify Admin hay mo truc tiep ---------- */
const EMBEDDED = (() => {
  try { return window.top !== window.self && typeof window.shopify?.idToken === 'function'; }
  catch { return typeof window.shopify?.idToken === 'function'; }
})();

async function idToken(){
  try { return await window.shopify.idToken(); }
  catch(e){ throw new Error('Không lấy được session token từ Shopify Admin: '+e.message); }
}

async function api(url, opts={}, _retried=false){
  const headers = {'Content-Type':'application/json', ...(opts.headers||{})};
  if(EMBEDDED) headers.Authorization = 'Bearer ' + await idToken();

  const r = await fetch(url, {credentials:'same-origin', ...opts, headers});

  // Session token het han giua chung -> App Bridge cap token moi, thu lai 1 lan
  if(r.status===401 && EMBEDDED && !_retried && r.headers.get('X-Shopify-Retry-Invalid-Session-Request')){
    return api(url, opts, true);
  }
  const d = await r.json().catch(()=>({error:'Phản hồi không hợp lệ'}));
  if(!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}
function showMsg(text, kind='err'){
  const m=$('#msg'); m.className='msg '+kind; m.textContent=text; m.classList.remove('hidden');
  if(kind==='ok') setTimeout(()=>m.classList.add('hidden'),5000);
}

/* ---------- boot ---------- */
(async function boot(){
  const s = await api('/api/session');
  state.carriers = s.carriers || [];
  $('#notify').checked = !!s.defaultNotify;
  const sel = $('#bulkCarrier');
  state.carriers.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});

  // Nhung trong Shopify Admin: Shopify da xac thuc san, khong hoi mat khau nua
  if(!EMBEDDED && !s.authed){ $('#login').classList.remove('hidden'); return; }

  document.body.classList.toggle('embedded', EMBEDDED);
  $('#app').classList.remove('hidden');
  $('#embedPill').classList.toggle('hidden', !EMBEDDED);

  const shopFromUrl = new URLSearchParams(location.search).get('shop');
  $('#shopPill').textContent = shopFromUrl || s.shop || 'chưa cấu hình Shopify';
  if(!EMBEDDED && !s.shopifyConfigured){
    showMsg('Chưa cấu hình SHOPIFY_SHOP / SHOPIFY_ACCESS_TOKEN trong biến môi trường Railway.');
  }
  const d=new Date(); d.setDate(d.getDate()-30);
  $('#from').value = d.toISOString().slice(0,10);

  // Tu tai don luon khi mo tu Shopify Admin
  if(EMBEDDED) load(false);
})();

$('#loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  try{
    await api('/api/login',{method:'POST',body:JSON.stringify({password:$('#pw').value})});
    location.reload();
  }catch(err){ const el=$('#loginErr'); el.textContent=err.message; el.classList.remove('hidden'); }
});
$('#logoutBtn').addEventListener('click', async ()=>{ await api('/api/logout',{method:'POST'}); location.reload(); });

/* ---------- tai don ---------- */
async function load(append=false){
  const btn = append ? $('#moreBtn') : $('#loadBtn');
  btn.disabled = true; btn.textContent = 'Đang tải…';
  try{
    const p = new URLSearchParams({limit:$('#limit').value, paidOnly:$('#paidOnly').checked});
    if($('#from').value) p.set('from',$('#from').value);
    if($('#to').value) p.set('to',$('#to').value);
    if($('#search').value.trim()) p.set('search',$('#search').value.trim());
    if(append && state.cursor) p.set('cursor',state.cursor);

    const d = await api('/api/orders?'+p);
    state.orders = append ? state.orders.concat(d.orders) : d.orders;
    if(!append){ state.rows.clear(); state.done.clear(); }
    state.cursor = d.pageInfo?.endCursor || null;
    state.hasNext = !!d.pageInfo?.hasNextPage;
    render();
    $('#msg').classList.add('hidden');
  }catch(e){ showMsg(e.message); }
  finally{
    btn.disabled=false;
    $('#loadBtn').textContent='Tải đơn';
    $('#moreBtn').textContent='Tải thêm đơn';
  }
}
$('#loadBtn').addEventListener('click',()=>load(false));
$('#moreBtn').addEventListener('click',()=>load(true));
$('#search').addEventListener('keydown',e=>{if(e.key==='Enter')load(false);});

/* ---------- render ---------- */
function render(){
  const tb = $('#tb'); tb.innerHTML='';
  if(!state.orders.length){
    $('#tbl').classList.add('hidden');
    $('#empty').classList.remove('hidden');
    $('#empty').textContent='Không có đơn nào chưa fulfill trong khoảng lọc này.';
    $('#moreBtn').classList.add('hidden');
    updateBar(); return;
  }
  $('#tbl').classList.remove('hidden');
  $('#empty').classList.add('hidden');
  $('#moreBtn').classList.toggle('hidden', !state.hasNext);

  for(const o of state.orders){
    if(!state.rows.has(o.id)) state.rows.set(o.id,{checked:false,tracking:'',company:'',url:''});
    const r = state.rows.get(o.id);
    const tr = document.createElement('tr');
    tr.dataset.id = o.id;
    if(r.checked) tr.classList.add('sel');
    const isDone = state.done.has(o.id);
    if(isDone) tr.classList.add('done');

    const a = o.address;
    const items = o.items.map(i=>`
      <div class="item">
        ${i.image?`<img src="${esc(i.image)}" alt="" loading="lazy">`:'<div class="ph"></div>'}
        <div>
          <div><span class="qty">${i.qty}×</span> ${esc(i.title)}${i.variantTitle?` <span class="sub" style="display:inline">— ${esc(i.variantTitle)}</span>`:''}</div>
          ${i.sku?`<div class="sku">${esc(i.sku)}</div>`:''}
        </div>
      </div>`).join('');

    const partial = o.fulfillmentStatus==='PARTIALLY_FULFILLED';
    tr.innerHTML = `
      <td><input type="checkbox" class="rowchk" ${r.checked?'checked':''}></td>
      <td>
        <a class="ord" href="${esc(o.adminUrl)}" target="_blank" rel="noopener">${esc(o.name)}</a>
        <div class="sub">${new Date(o.createdAt).toLocaleDateString('vi-VN')}</div>
        ${partial?'<div style="margin-top:4px"><span class="tag partial">Fulfill 1 phần</span></div>':''}
      </td>
      <td>
        <div>${esc(o.customer||a.name)}</div>
        <div class="sub">${esc([a.city,a.province,a.country].filter(Boolean).join(', '))} ${esc(a.zip)}</div>
        ${o.location?`<div class="sub">📍 ${esc(o.location)}</div>`:''}
      </td>
      <td><div class="items">${items}</div></td>
      <td><div style="font-size:12.5px">${esc(o.shippingMethod||'—')}</div></td>
      <td>
        <input class="trk${r.tracking?' filled':''}" value="${esc(r.tracking)}" placeholder="Dán mã tracking"
               spellcheck="false" autocomplete="off">
        <div class="guess"></div>
      </td>
      <td>
        <div class="carcell">
          <select class="car">
            <option value="">— tự động —</option>
            ${state.carriers.map(c=>`<option value="${esc(c)}"${r.company===c?' selected':''}>${esc(c)}</option>`).join('')}
          </select>
          <input class="trkurl hidden" value="${esc(r.url)}" spellcheck="false" autocomplete="off"
                 placeholder="https://hang-van-chuyen.com/track?no={tracking}">
          <div class="urlhint hidden"></div>
        </div>
      </td>
      <td class="resultCell">${isDone?'<span class="tag ok">\u2713 \u0110\u00e3 fulfill</span>':''}</td>`;
    if(isDone){
      tr.querySelectorAll('input,select').forEach(el=>{el.disabled=true;});
    }
    tb.appendChild(tr);
    paintGuess(tr);
  }
  updateBar();
}

function paintGuess(tr){
  const id = tr.dataset.id, r = state.rows.get(id);
  const g = tr.querySelector('.guess'), sel = tr.querySelector('.car');
  if(!r.tracking){ g.textContent=''; g.className='guess'; }
  else if(r.company){ g.textContent='chọn thủ công'; g.className='guess'; }
  else {
    const d = detect(r.tracking);
    g.textContent = d.confident ? `tự nhận: ${d.company}` : `không chắc → ${d.company}`;
    g.className = 'guess ' + (d.confident?'auto':'unsure');
    if(!sel.value) sel.title = 'Tự động: ' + d.company;
  }
  paintUrlField(tr);
}

/* Kiểm tra link tracking tự nhập. Cho phép {tracking} để app tự thay mã vào. */
function checkUrl(raw){
  const t = String(raw||'').trim();
  if(!t) return {ok:true, empty:true};
  if(t.length>500) return {ok:false, msg:'Link dài quá'};
  let u;
  try{ u = new URL(t.replaceAll('{tracking}','SAMPLE123')); }
  catch{ return {ok:false, msg:'Link chưa hợp lệ — thiếu https:// ?'}; }
  if(u.protocol!=='https:' && u.protocol!=='http:') return {ok:false, msg:'Link phải bắt đầu bằng https://'};
  return {ok:true, hasVar:t.includes('{tracking}')};
}

/* Ô link chỉ hiện khi carrier là Other (chọn tay hoặc app đoán ra Other) */
function paintUrlField(tr){
  const r = state.rows.get(tr.dataset.id);
  const box = tr.querySelector('.trkurl'), hint = tr.querySelector('.urlhint');
  if(!box) return;
  const company = r.company || (r.tracking ? detect(r.tracking).company : '');
  const show = company === 'Other';

  box.classList.toggle('hidden', !show);
  hint.classList.toggle('hidden', !show);
  if(!show) return;

  const v = checkUrl(r.url);
  box.classList.toggle('bad', !v.ok);
  hint.classList.toggle('bad', !v.ok);
  if(!v.ok) hint.textContent = v.msg;
  else if(v.empty) hint.innerHTML = 'Shopify không biết hãng này — dán link tra cứu để khách bấm được. Bỏ trống thì khách chỉ thấy mã.';
  else if(v.hasVar) hint.innerHTML = '<code>{tracking}</code> sẽ được thay bằng mã của từng đơn.';
  else hint.textContent = 'Dùng đúng link này cho đơn.';
}

function effectiveCompany(o){
  const r = state.rows.get(o.id);
  return r.company || (r.tracking ? detect(r.tracking).company : null);
}

/** Dòng sẵn sàng fulfill: có tracking, và nếu có nhập link thì link phải hợp lệ */
function rowReady(o){
  const r = state.rows.get(o.id);
  if(!r || !r.tracking.trim()) return false;
  const company = r.company || detect(r.tracking).company;
  if(company === 'Other' && r.url.trim() && !checkUrl(r.url).ok) return false;
  return true;
}

function updateBar(){
  const sel = state.orders.filter(o=>state.rows.get(o.id)?.checked && !state.done.has(o.id));
  const ready = sel.filter(rowReady);
  $('#selCount').textContent = sel.length;
  $('#readyCount').textContent = ready.length + ' đơn sẵn sàng';
  $('#fulfillBtn').disabled = ready.length===0;
  $('#fulfillBtn').textContent = ready.length ? `Fulfill ${ready.length} đơn` : 'Fulfill đơn đã chọn';
}

/* ---------- tuong tac bang ---------- */
$('#tb').addEventListener('input',(e)=>{
  const tr = e.target.closest('tr'); if(!tr) return;
  const r = state.rows.get(tr.dataset.id);
  if(e.target.classList.contains('trk')){
    r.tracking = e.target.value;
    e.target.classList.toggle('filled', !!r.tracking.trim());
    if(r.tracking.trim() && !r.checked){
      r.checked = true; tr.querySelector('.rowchk').checked = true; tr.classList.add('sel');
    }
    paintGuess(tr); updateBar();
  }
  if(e.target.classList.contains('car')){ r.company = e.target.value; paintGuess(tr); }
  if(e.target.classList.contains('trkurl')){
    r.url = e.target.value;
    try{ localStorage.setItem('bf-last-url', r.url.trim()); }catch{}
    paintUrlField(tr);
    updateBar();
  }
});
$('#tb').addEventListener('change',(e)=>{
  if(!e.target.classList.contains('rowchk')) return;
  const tr = e.target.closest('tr');
  state.rows.get(tr.dataset.id).checked = e.target.checked;
  tr.classList.toggle('sel', e.target.checked);
  updateBar();
});
// Enter -> nhay xuong o tracking dong duoi (nhap lien tay)
$('#tb').addEventListener('keydown',(e)=>{
  if(e.key!=='Enter' || !e.target.classList.contains('trk')) return;
  e.preventDefault();
  const inputs = [...document.querySelectorAll('#tb input.trk')];
  const i = inputs.indexOf(e.target);
  if(i>-1 && inputs[i+1]){ inputs[i+1].focus(); inputs[i+1].select(); }
  else e.target.blur();
});
$('#all').addEventListener('change',(e)=>{
  document.querySelectorAll('#tb tr').forEach(tr=>{
    if(state.done.has(tr.dataset.id)) return;
    state.rows.get(tr.dataset.id).checked = e.target.checked;
    tr.querySelector('.rowchk').checked = e.target.checked;
    tr.classList.toggle('sel', e.target.checked);
  });
  updateBar();
});
$('#bulkCarrier').addEventListener('change',(e)=>{
  const v = e.target.value;
  document.querySelectorAll('#tb tr').forEach(tr=>{
    const r = state.rows.get(tr.dataset.id);
    if(!r.checked) return;
    r.company = v; tr.querySelector('.car').value = v;
    if(v==='Other' && !r.url && lastUrl){ r.url = lastUrl; tr.querySelector('.trkurl').value = lastUrl; }
    paintGuess(tr);
  });
  updateBar();
});
$('#fillDown').addEventListener('click',()=>{
  const first = state.orders.find(o=>state.rows.get(o.id)?.checked);
  if(!first) return;
  const c = effectiveCompany(first); if(!c) return;
  const url = state.rows.get(first.id).url;
  document.querySelectorAll('#tb tr').forEach(tr=>{
    const r = state.rows.get(tr.dataset.id);
    if(!r.checked) return;
    r.company = c; tr.querySelector('.car').value = c;
    if(c==='Other' && url){ r.url = url; tr.querySelector('.trkurl').value = url; }
    paintGuess(tr);
  });
  updateBar();
  showMsg(`Đã đặt carrier "${c}"${c==='Other'&&url?' kèm link tracking':''} cho mọi đơn đã chọn.`,'ok');
});

/* Hop xac nhan tu lam - window.confirm co the bi chan trong iframe Shopify Admin */
function askConfirm(count, notify){
  return new Promise((resolve)=>{
    const d = $('#confirmDlg');
    $('#confirmB').innerHTML = `
      <p style="margin:0 0 8px">Sắp fulfill <b>${count}</b> đơn.</p>
      <p style="margin:0;color:var(--muted)">${notify
        ? 'Khách <b>SẼ</b> nhận email báo vận chuyển kèm mã tracking.'
        : 'Khách <b>KHÔNG</b> nhận email báo vận chuyển.'}</p>`;
    const done = (v)=>{ d.close(); $('#confirmYes').onclick=null; $('#confirmNo').onclick=null; resolve(v); };
    $('#confirmYes').onclick = ()=>done(true);
    $('#confirmNo').onclick  = ()=>done(false);
    d.addEventListener('cancel', ()=>done(false), {once:true});
    d.showModal();
  });
}

/* ---------- fulfill ---------- */
$('#fulfillBtn').addEventListener('click', async ()=>{
  const picked = state.orders.filter(o=>
    state.rows.get(o.id)?.checked && !state.done.has(o.id) && rowReady(o));
  if(!picked.length) return;
  const notify = $('#notify').checked;
  const okToGo = await askConfirm(picked.length, notify);
  if(!okToGo) return;

  const rows = picked.map(o=>({
    orderName:o.name, orderId:o.id,
    fulfillmentOrderIds:o.fulfillmentOrderIds,
    tracking:state.rows.get(o.id).tracking,
    company:effectiveCompany(o),
    trackingUrl:effectiveCompany(o)==='Other' ? state.rows.get(o.id).url.trim() : '',
    notifyCustomer:notify,
  }));

  const dlg=$('#dlg');
  $('#dlgH').textContent = `Đang fulfill ${rows.length} đơn…`;
  $('#dlgB').innerHTML = `<div style="display:flex;align-items:center;gap:10px">
    <div class="bar-prog"><i style="width:15%"></i></div><span class="sub">Đang gửi lên Shopify…</span></div>`;
  $('#dlgClose').disabled = true;
  dlg.showModal();
  $('#fulfillBtn').disabled = true;

  try{
    const d = await api('/api/fulfill',{method:'POST',body:JSON.stringify({rows})});
    const byName = new Map(d.results.map(r=>[r.orderName,r]));
    for(const o of picked){
      const res = byName.get(o.name);
      const tr = document.querySelector(`#tb tr[data-id="${CSS.escape(o.id)}"]`);
      if(!tr || !res) continue;
      const cell = tr.querySelector('.resultCell');
      if(res.ok){
        state.done.add(o.id);
        state.rows.get(o.id).checked = false;
        tr.classList.add('done'); tr.classList.remove('sel');
        tr.querySelector('.rowchk').checked=false; tr.querySelector('.rowchk').disabled=true;
        tr.querySelector('.trk').disabled=true; tr.querySelector('.car').disabled=true;
        cell.innerHTML = `<span class="tag ok">✓ Đã fulfill</span>${res.trackingUrl?`<div class="sub" style="margin-top:4px"><a href="${esc(res.trackingUrl)}" target="_blank" rel="noopener">Xem tracking</a></div>`:''}`;
      }else{
        cell.innerHTML = `<span class="tag err">Lỗi</span><div class="sub" style="margin-top:4px">${esc(res.error)}</div>`;
      }
    }
    $('#dlgH').textContent = `Xong: ${d.summary.success} thành công, ${d.summary.failed} lỗi`;
    $('#dlgB').innerHTML = d.results.map(r=>`
      <div class="res">
        <span class="tag ${r.ok?'ok':'err'}" style="flex:0 0 auto">${r.ok?'OK':'Lỗi'}</span>
        <div><b>${esc(r.orderName)}</b>${r.company?` · ${esc(r.company)}`:''}
        <div class="sub">${esc(r.ok ? (r.tracking||'') : r.error)}</div></div>
      </div>`).join('');
    updateBar();
  }catch(e){
    $('#dlgH').textContent='Không gửi được';
    $('#dlgB').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }finally{
    $('#dlgClose').disabled=false;
    updateBar();
  }
});
$('#dlgClose').addEventListener('click',()=>$('#dlg').close());
