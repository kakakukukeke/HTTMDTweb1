const $=s=>document.querySelector(s);let cats=[],brands=[],cur='',items=[];
// Cấu hình từng mục quản lý: fields = [khóa, nhãn, kiểu, tùy chọn]
const R={
 products:{t:'Sản phẩm',cols:['sku','name','brand','price','stock'],f:[['name','Tên sản phẩm','text'],['sku','Mã sản phẩm (SKU)','text'],['brand','Thương hiệu','select',()=>brands.map(b=>[b.name,b.name])],['category','Danh mục','select',()=>cats.map(c=>[c.slug,c.name])],
  ['price','Giá bán (₫)','number'],['oldPrice','Giá gốc (₫, 0 nếu không giảm)','number'],['stock','Tồn kho','number'],['colors','Màu sắc (cách nhau dấu phẩy)','csv'],['specs','Thông số kỹ thuật (mỗi dòng "Tên: giá trị")','lines'],
  ['origin','Nguồn gốc','text'],['warranty','Bảo hành','text'],['image','Ảnh (URL, có thể bỏ trống)','text'],['desc','Mô tả','textarea'],['featured','Hiển thị ở mục nổi bật','check']]},
 categories:{t:'Danh mục',cols:['name','slug'],f:[['name','Tên danh mục','text'],['slug','Mã (VD: phone)','text']]},
 brands:{t:'Thương hiệu',cols:['name'],f:[['name','Tên thương hiệu','text']]},
 promos:{t:'Khuyến mãi',cols:['code','name','percent','minTotal','end','active'],f:[['name','Tên chương trình','text'],['code','Mã giảm giá','text'],['percent','Giảm (%)','number'],['minTotal','Đơn tối thiểu (₫)','number'],['start','Bắt đầu','date'],['end','Kết thúc','date'],['active','Đang áp dụng','check']]},
 posts:{t:'Tin tức & trang',cols:['type','title','slug','date'],f:[['type','Loại','select',()=>[['news','Tin tức'],['page','Trang tĩnh']]],['title','Tiêu đề','text'],['slug','Đường dẫn (VD: bao-hanh)','text'],['date','Ngày đăng','date'],['body','Nội dung (cách đoạn bằng dòng trống)','textarea']]}};
const L={sku:'Mã',name:'Tên',brand:'Hãng',price:'Giá',stock:'Kho',slug:'Mã',code:'Mã giảm',percent:'%',minTotal:'Tối thiểu',end:'Hết hạn',active:'Áp dụng',type:'Loại',title:'Tiêu đề',date:'Ngày'};
const money=['price','minTotal'];
const cell=(k,v)=>money.includes(k)?vnd(v||0):typeof v==='boolean'?(v?'✓':'—'):esc(v);
function gate(){const ok=!!API.token;$('#login').hidden=ok;$('#app').hidden=!ok;if(ok)start()}
async function start(){try{[cats,brands]=await Promise.all([API.get('/categories'),API.get('/brands')])}catch(e){}
 const TI={dash:'📊',products:'📦',categories:'🗂️',brands:'🏷️',promos:'🎟️',posts:'📰',orders:'🧾',contacts:'✉️'};
 const tabs=[['dash','Tổng quan'],...Object.entries(R).map(([k,v])=>[k,v.t]),['orders','Đơn hàng'],['contacts','Liên hệ']];window.TN=Object.fromEntries(tabs);
 $('#tabs').innerHTML=tabs.map(([k,v])=>`<button data-t="${k}">${TI[k]} ${v}</button>`).join('');
 $('#today').textContent=new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'numeric',year:'numeric'});tab('dash')}
$('#lf').onsubmit=async e=>{e.preventDefault();try{const r=await API.post('/admin/login',Object.fromEntries(new FormData(e.target)));API.token=r.token;localStorage.setItem('n10_token',r.token);gate()}catch(x){toast(x.message)}};
$('#out').onclick=()=>{localStorage.removeItem('n10_token');API.token='';gate()};
$('#tabs').onclick=e=>e.target.dataset.t&&tab(e.target.dataset.t);
async function tab(t){cur=t;$('#ttl').textContent=t==='dash'?'Tổng quan cửa hàng':(window.TN||{})[t]||'';document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
 try{if(t==='dash'){const[s,o]=await Promise.all([API.get('/admin/stats'),API.get('/admin/orders')]);
  const days=[...Array(7)].map((_,i)=>{const d=new Date(Date.now()-(6-i)*864e5),k=d.toISOString().slice(0,10);return{l:['CN','T2','T3','T4','T5','T6','T7'][d.getDay()],v:o.filter(x=>x.status!=='cancelled'&&(x.createdAt||'').slice(0,10)===k).reduce((a,x)=>a+x.total,0)}});
  const mx=Math.max(...days.map(d=>d.v),1);
  $('#view').innerHTML=`<div class="greet"><div><h2>Xin chào, Quản trị viên!</h2><p>Đây là tình hình hoạt động của TAQstore.</p></div><button class="btn" data-addp="1">+ Thêm sản phẩm</button></div>
  <div class="stats">${[['📦','Sản phẩm',s.products],['🧾','Đơn hàng',s.orders],['⏳','Chờ xác nhận',s.pending],['💰','Doanh thu mẫu',vnd(s.revenue)],['✉️','Liên hệ chưa trả lời',s.contacts],['🎟️','Khuyến mãi đang chạy',s.promos]].map(([i,a,b])=>`<div class="stat"><div class="ic">${i}</div><p>${a}</p><b>${b}</b></div>`).join('')}</div>
  <div class="cols"><div class="panel2"><h3>Doanh thu 7 ngày qua</h3><p class="sub">Không tính đơn đã hủy</p><div class="chart">${days.map(d=>`<div class="bar2 ${d.v===mx&&d.v>0?'hi':''}" title="${vnd(d.v)}"><i style="height:${Math.max(4,d.v/mx*85)}%"></i>${d.l}</div>`).join('')}</div></div>
  <div class="panel2"><h3>Đơn hàng gần đây</h3>${o.length?o.slice(0,4).map(x=>`<div class="rec"><div class="ic">🛍️</div><div><b>${esc(x.code)}</b><small>${esc(x.customer.name)}</small></div><div class="r"><b>${vnd(x.total)}</b><small class="st-${x.status}">${ORDER_ST[x.status]}</small></div></div>`).join(''):'<p class="sub" style="margin-top:1rem">Chưa có đơn hàng nào.</p>'}</div></div>`}
 else if(R[t]){items=await API.get('/admin/'+t);const r=R[t];$('#view').innerHTML=`<p><button class="btn" data-add="1">Thêm ${r.t.toLowerCase()}</button></p><div class="tw"><table><tr>${r.cols.map(c=>`<th>${L[c]}</th>`).join('')}<th></th></tr>${items.map(x=>`<tr>${r.cols.map(c=>`<td>${cell(c,x[c])}</td>`).join('')}<td><button class="btn ghost sm" data-e="${x.id}">Sửa</button> <button class="btn red sm" data-d="${x.id}">Xóa</button></td></tr>`).join('')}</table></div>`}
 else if(t==='orders'){const o=await API.get('/admin/orders');$('#view').innerHTML=o.length?`<div class="tw"><table><tr><th>Mã đơn</th><th>Khách hàng</th><th>Sản phẩm</th><th>Thanh toán</th><th>Trạng thái</th></tr>${o.map(x=>`<tr><td>${esc(x.code)}<br><small>${esc((x.createdAt||'').slice(0,16).replace('T',' '))}</small></td><td>${esc(x.customer.name)}<br><small>${esc(x.customer.phone)}<br>${esc(x.customer.address)}</small></td><td>${x.items.map(i=>esc(i.name)+' ×'+i.qty).join('<br>')}</td>
  <td>Tạm tính ${vnd(x.subtotal)}<br>Giảm ${vnd(x.discount)} ${x.promo?'('+esc(x.promo)+')':''}<br>Phí giao ${vnd(x.shippingFee)}<br><b>Tổng ${vnd(x.total)}</b><br><small>${esc(x.payment)}</small></td>
  <td><select data-o="${esc(x.code)}" aria-label="Trạng thái">${Object.entries(ORDER_ST).map(([k,v])=>`<option value="${k}" ${k===x.status?'selected':''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</table></div>`:'<p>Chưa có đơn hàng. Đơn đặt từ cửa hàng sẽ hiện ở đây.</p>'}
 else if(t==='contacts'){const c=await API.get('/admin/contacts');$('#view').innerHTML=c.length?`<div class="tw"><table><tr><th>Người gửi</th><th>Nội dung</th><th>Phản hồi</th></tr>${c.map(x=>`<tr><td>${esc(x.name)}<br><small>${esc(x.email)}</small></td><td>${esc(x.message)}</td><td><div class="row2"><input id="rp${x.id}" value="${esc(x.reply)}" placeholder="Nhập phản hồi" aria-label="Phản hồi"><button class="btn sm" data-r="${x.id}">Lưu</button></div></td></tr>`).join('')}</table></div>`:'<p>Chưa có yêu cầu liên hệ nào.</p>'}
 }catch(x){if(/đăng nhập/i.test(x.message))$('#out').click();else toast(x.message)}}
$('#view').onclick=async e=>{const d=e.target.dataset;if(d.addp){await tab('products');edit();return}if(d.add)edit();if(d.e)edit(items.find(x=>x.id==d.e));
 if(d.d&&confirm('Xóa mục này?')){await API.del(`/admin/${cur}/${d.d}`);toast('Đã xóa');tab(cur)}
 if(d.r){await API.put('/admin/contacts/'+d.r,{reply:$('#rp'+d.r).value});toast('Đã lưu phản hồi')}};
$('#view').onchange=async e=>{if(e.target.dataset.o){await API.put('/admin/orders/'+e.target.dataset.o,{status:e.target.value});toast('Đã cập nhật trạng thái')}};
let editing=null;
function edit(x={}){editing=x;const r=R[cur];$('#dt').textContent=(x.id?'Sửa ':'Thêm ')+r.t.toLowerCase();
 $('#fields').innerHTML=r.f.map(([k,l,t,o])=>{let v=x[k];const n=`name="${k}"`;
  if(t==='check')return`<label><input type="checkbox" ${n} ${v?'checked':''} style="width:auto"> ${l}</label>`;
  if(t==='select')return`<label>${l}<select ${n}>${o().map(([a,b])=>`<option value="${esc(a)}" ${a===v?'selected':''}>${esc(b)}</option>`).join('')}</select></label>`;
  if(t==='textarea')return`<label>${l}<textarea ${n} rows="4">${esc(v)}</textarea></label>`;
  if(t==='lines')v=Object.entries(v||{}).map(([a,b])=>a+': '+b).join('\n'),t='textarea';
  if(t==='csv')v=(v||[]).join(', '),t='text';
  return t==='textarea'?`<label>${l}<textarea ${n} rows="4">${esc(v)}</textarea></label>`:`<label>${l}<input ${n} type="${t}" value="${esc(v)}" ${t==='number'?'min="0"':''}></label>`}).join('');
 $('#dlg').showModal()}
$('#cl').onclick=()=>$('#dlg').close();
$('#pf').onsubmit=async e=>{const f=e.target.elements,b={};
 for(const[k,,t]of R[cur].f){const v=f[k].type==='checkbox'?f[k].checked:f[k].value;
  b[k]=t==='csv'?v.split(',').map(s=>s.trim()).filter(Boolean):t==='lines'?Object.fromEntries(v.split('\n').filter(l=>l.includes(':')).map(l=>[l.split(':')[0].trim(),l.slice(l.indexOf(':')+1).trim()])):v}
 if(cur==='products'){b.icon={phone:'📱',laptop:'💻'}[b.category]||'🎧'}
 try{editing.id?await API.put(`/admin/${cur}/${editing.id}`,b):await API.post('/admin/'+cur,b);toast('Đã lưu');await start0()}catch(x){toast(x.message)}};
async function start0(){[cats,brands]=await Promise.all([API.get('/categories'),API.get('/brands')]);tab(cur)}
gate();