const API={token:localStorage.getItem('n10_token')||'',
 async call(m,u,b){const r=await fetch('/api'+u,{method:m,headers:{'Content-Type':'application/json',...(this.token&&{Authorization:'Bearer '+this.token})},body:b?JSON.stringify(b):undefined});
  if(r.status===204)return null;const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Lỗi '+r.status);return d},
 get:(u)=>API.call('GET',u),post:(u,b)=>API.call('POST',u,b),put:(u,b)=>API.call('PUT',u,b),del:(u)=>API.call('DELETE',u)};
const vnd=n=>n.toLocaleString('vi-VN')+'₫';
const toast=t=>{const e=document.createElement('div');e.className='toast';e.textContent=t;document.body.append(e);setTimeout(()=>e.remove(),2500)};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ORDER_ST={pending:'Chờ xác nhận',processing:'Đang xử lý',shipping:'Đang giao',delivered:'Đã giao thành công',cancelled:'Đã hủy'};
const para=t=>esc(t).split('\n\n').map(x=>`<p>${x}</p>`).join('');