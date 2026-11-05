(async function(){
const $=s=>document.querySelector(s), money=n=>'₹'+Number(n||0).toFixed(2), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const menuSeed=[
['Classic hotdog',99,'Hotdogs','assets/menu/01.jpg'],
['BBQ hotdog',110,'Hotdogs','assets/menu/02.jpg'],
['Spicy hotdog',110,'Hotdogs','assets/menu/03.jpg'],
['Peri peri hotdog',110,'Hotdogs','assets/menu/04.jpg'],
['Ghost hotdog',110,'Hotdogs','assets/menu/05.jpg'],
['Sweet and spicy hotdog',110,'Hotdogs','assets/menu/06.jpg'],
['Normal fries',70,'Fries','assets/menu/07.jpg'],
['Peri fries',99,'Fries','assets/menu/08.jpg'],
['Loaded fries',150,'Fries','assets/menu/09.jpg'],
['Cheese fries',99,'Fries','assets/menu/10.jpg'],
['Peri peri wings (4 nos)',150,'Wings','assets/menu/11.jpg'],
['BBQ wings (4 nos)',150,'Wings','assets/menu/12.jpg'],
['Sweet chilli wings (4 nos)',150,'Wings','assets/menu/35.jpg'],
['Hot honey wings (4 nos)',150,'Wings','assets/menu/34.jpg'],
['Cutlet burger',49,'Burgers','assets/menu/37.jpg'],
['Big burger',120,'Burgers','assets/menu/13.jpg'],
['Double burger',140,'Burgers','assets/menu/14.jpg'],
['Watermelon juice',69,'Juices','assets/menu/16.jpg'],
['Orange juice',69,'Juices','assets/menu/17.jpg'],
['Pineapple juice',69,'Juices','assets/menu/18.jpg'],
['Apple juice',69,'Juices','assets/menu/19.jpg'],
['Onion rings (10 nos)',130,'Sides','assets/menu/20.jpg'],
['Lemon ice tea',89,'Ice Tea','assets/menu/21.jpg'],
['Peach ice tea',89,'Ice Tea','assets/menu/22.jpg'],
['Passion ice tea',89,'Ice Tea','assets/menu/23.jpg'],
['Ice tea coffee',89,'Ice Tea','assets/menu/24.jpg'],
['Boba',99,'Boba','assets/menu/27.jpg'],
['Coffee',20,'Hot Drinks','assets/menu/28.jpg'],
['Boost',20,'Hot Drinks','assets/menu/29.jpg'],
['Horlicks',20,'Hot Drinks','assets/menu/30.jpg'],
['Momos (6 nos)',99,'Momos','assets/menu/25.jpg'],
['Sweet chilli momos (6 nos)',110,'Momos','assets/menu/26.jpg'],
['3 pcs wings + 3 chicken strips + 2 portions fries',349,'Combo Offers','assets/menu/38.jpg'],
['Hotdog + ice tea',150,'Combo Offers','assets/menu/31.jpg'],
['2 burgers + 1 portion fries + 2 lemon juices',399,'Combo Offers','assets/menu/32.jpg'],
['2 juices (pineapple + watermelon)',120,'Combo Offers','assets/menu/33.jpg'],
['Lemon juice',30,'Juices','assets/menu/36.jpg']
];
const sharedPassword=sessionStorage.getItem('nitroPosPassword')||'';
const authHeaders={'Content-Type':'application/json','x-pos-password':sharedPassword};
const blankDb=()=>({settings:{name:'NITRO CAFÉ',address:'',phone:'',tax:0},menu:[],orders:[],expenses:[],customers:[],staff:[{name:'Owner',role:'Administrator',phone:''}],next:1001});
let remoteApplying=false, lastRemote='', lastLocalWrite=0, writeQueue=Promise.resolve(), remoteVersion=1, syncBlocked=false;
let db=blankDb();
try{
 const r=await fetch('/api/shared-data',{headers:authHeaders});
 if(r.status===401){sessionStorage.removeItem('nitroPosPassword');location.reload();return}
 if(!r.ok)throw new Error('Shared server unavailable');
 const payload=await r.json();
if(payload.data){
 db=payload.data;
 lastRemote=JSON.stringify(db);
 remoteVersion=Number(payload.version)||1;
}
 else {db=JSON.parse(localStorage.nitrocafepos||localStorage.jprpos||'null')||blankDb()}
}catch(e){document.body.innerHTML='<main style="padding:30px;font:16px Arial">Cannot connect to the shared POS server. Check your internet connection and hosting setup, then reload.</main>';return}

if(!db.settings)db.settings={name:'NITRO CAFÉ',address:'',phone:'',tax:0};
if(/jpr|food cart/i.test(db.settings.name||''))db.settings.name='NITRO CAFÉ';
if((Number(db.menuVersion)||0)<3){
 const oldMenu=db.menu||[];
 db.menu=menuSeed.map((x,i)=>{const old=oldMenu.find(m=>String(m.name).toLowerCase()===x[0].toLowerCase());return {id:old?.id||i+1,name:x[0],price:x[1],category:x[2],emoji:'',photo:x[3],stock:old?.stock??50}});
 db.menuVersion=3;
}
db.menu.forEach(m=>{m.emoji='';if(!m.photo)m.photo=photoFor(m.name,m.category)});
localStorage.nitrocafepos=JSON.stringify(db);
if(lastRemote && JSON.stringify(db)!==lastRemote)save();
let cart=[],payment='Cash',orderType='Takeaway',page='dashboard';function save(){
 const revision=save.revision=(save.revision||0)+1;
 const snapshot=JSON.stringify(db);
 localStorage.nitrocafepos=snapshot;

 if(!remoteApplying && !syncBlocked){
  lastLocalWrite=Date.now();

  writeQueue=writeQueue.then(async()=>{
   if(syncBlocked || revision!==save.revision)return;

   const r=await fetch('/api/shared-data',{
    method:'PUT',
    headers:authHeaders,
    body:JSON.stringify({
     data:JSON.parse(snapshot),
     expectedVersion:remoteVersion
    })
   });

   if(r.status===401){
    sessionStorage.removeItem('nitroPosPassword');
    location.reload();
    return;
   }

   const result=await r.json();

   if(r.status===409 || result.conflict){
    syncBlocked=true;
    remoteVersion=Number(result.version)||remoteVersion;

    remoteApplying=true;
    db=result.data;
    lastRemote=JSON.stringify(db);
    localStorage.nitrocafepos=lastRemote;
    render();
    remoteApplying=false;

    toast('Another device updated POS. Latest data loaded. Please check your changes.');
    return;
   }

   if(!r.ok || !result.ok){
    throw new Error('sync failed');
   }

   remoteVersion=Number(result.version)||remoteVersion;
   lastRemote = snapshot;
    remoteVersion = Number(result.version) || remoteVersion;

  }).catch(()=>{
   if(typeof toast==='function'){
    toast('Server sync failed. Check internet connection.');
   }
  });
 }
}
function inventory(){return `<section class="panel"><div class="section-head"><h2>Stock & Reorder</h2><button class="primary" onclick="addStock()">＋ Add stock item</button></div><div class="notice">Simple stock tracking is included. Ingredient-level recipe deduction and supplier purchase workflows can be added after the required stock units and recipes are defined.</div>${table(['Item','Category','On hand','Status','Update'],db.menu.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.category)}</td><td>${m.stock}</td><td><span class="badge ${m.stock<=5?'':'green'}">${m.stock<=5?'Low stock':'In stock'}</span></td><td><button class="btn" onclick="stockChange(${m.id})">Adjust</button></td></tr>`).join(''))}</section>`}function stockChange(id){let m=db.menu.find(x=>x.id===id),n=prompt('New stock quantity for '+m.name,m.stock);if(n!==null&&Number(n)>=0){m.stock=Number(n);save();render()}}function addStock(){let id=Number(prompt('Enter menu item ID to adjust: '+db.menu.map(m=>`${m.id}=${m.name}`).join(', ')));if(db.menu.some(m=>m.id===id))stockChange(id)}
function customers(){return `<section class="panel"><div class="section-head"><h2>Customer Directory</h2><button class="btn" onclick="exportCsv('customers')">Export CSV</button></div>${table(['Customer','Mobile','Visits','Sales total'],db.customers.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${c.visits}</td><td>${money(c.total)}</td></tr>`).join(''))}</section>`}function reports(){let t=todayOrders(),byPay=['Cash','UPI','Card','Online','Unpaid'].map(p=>`<tr><td>${p}</td><td>${money(sum(t.filter(o=>o.payment===p)))}</td></tr>`).join(''),items={};t.forEach(o=>o.items.forEach(i=>{items[i.name]=(items[i.name]||0)+i.qty}));return `<div class="grid stats"><div class="card stat"><label>Today's Sales</label><strong>${money(sum(t))}</strong></div><div class="card stat"><label>Orders Today</label><strong>${t.length}</strong></div><div class="card stat"><label>All-time Sales</label><strong>${money(sum(db.orders))}</strong></div><div class="card stat"><label>Recorded Expenses</label><strong>${money(sum(db.expenses))}</strong></div></div><div class="grid cols"><section class="panel"><div class="section-head"><h2>Payment Summary · Today</h2><button class="btn" onclick="exportCsv('orders')">Export orders CSV</button></div>${table(['Method','Amount'],byPay)}</section><section class="panel"><h2>Popular Items · Today</h2>${table(['Item','Qty sold'],Object.entries(items).sort((a,b)=>b[1]-a[1]).map(([n,q])=>`<tr><td>${esc(n)}</td><td>${q}</td></tr>`).join(''))}</section></div><section class="panel" style="margin-top:16px"><div class="section-head"><h2>Order History</h2><button class="btn" onclick="exportCsv('orders')">Download CSV</button></div>${table(['Bill','Date','Customer','Type','Payment','Status','Total','Receipt'],db.orders.slice().reverse().map(o=>`<tr><td>${esc(o.bill)}</td><td>${esc(new Date(o.date).toLocaleString())}</td><td>${esc(o.customer||'Walk-in')}<br><small>${esc(o.phone||'')}</small></td><td>${esc(o.type)}</td><td>${esc(o.payment)}</td><td>${esc(o.status)}</td><td>${money(o.total)}</td><td><button class="btn" onclick="printBill(${o.id})">Print</button> <button class="btn" onclick="sendBill(${o.id})">WhatsApp bill</button></td></tr>`).join(''))}</section>`}function sales(){return `<section class="panel"><div class="section-head"><div><h2>Sales Management</h2><small>Bill edits and deletions are kept separate from normal billing.</small></div><button class="btn" onclick="go('reports')">Back to reports</button></div>${table(['Bill','Date','Customer','Payment','Total','Actions'],db.orders.slice().reverse().map(o=>`<tr><td><b>${esc(o.bill)}</b></td><td>${esc(new Date(o.date).toLocaleString())}</td><td>${esc(o.customer||'Walk-in')}</td><td>${esc(o.payment)}</td><td>${money(o.total)}</td><td><div class="actions"><button class="btn" onclick="editSale(${o.id})">Edit sale</button><button class="btn danger" onclick="deleteSale(${o.id})">Delete sale</button></div></td></tr>`).join(''))}</section>`}
function editSale(id){
 const o=db.orders.find(x=>x.id===id);if(!o)return;
 const customer=prompt('Customer name',o.customer||'');if(customer===null)return;
 const total=Number(prompt('Correct bill total (₹)',String(o.total)));if(!Number.isFinite(total)||total<0)return toast('Enter a valid total.');
 const payment=prompt('Payment method: Cash / UPI / Card / Online / Unpaid',o.payment||'Cash');if(payment===null)return;
 if(!confirm(`Save changes to ${o.bill}? This changes the recorded bill total and payment method.`))return;
 o.customer=customer.trim();o.total=total;o.payment=payment.trim()||o.payment;o.editedAt=new Date().toISOString();save();render();toast('Sale updated and synced.');
}
async function deleteSale(id){
 const o=db.orders.find(x=>x.id===id);
 if(!o)return;
 if(!confirm(`Cancel bill ${o.bill} for ${money(o.total)}? Owner email OTP verification is required.`))return;

 try {
  const request=await fetch('/api/delete/request-otp',{
   method:'POST',
   headers:authHeaders,
   body:JSON.stringify({billId:String(o.bill)})
  });
  const requested=await request.json();
  if(!request.ok||!requested.ok)throw new Error(requested.error||'OTP request failed.');

  const otp=prompt(`Enter the 6-digit OTP sent to the owner email for bill ${o.bill}:`);
  if(otp===null)return;
  if(!/^\d{6}$/.test(otp.trim()))return toast('Enter a valid 6-digit OTP.');

  const response=await fetch('/api/delete/verify-otp',{
   method:'POST',
   headers:authHeaders,
   body:JSON.stringify({billId:String(o.bill),otp:otp.trim()})
  });
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error(result.error||'OTP verification failed.');

  const latest=await fetch('/api/shared-data',{headers:authHeaders});
  const latestData=await latest.json();
  if(!latest.ok||!latestData.data)throw new Error('Cancellation succeeded, but latest POS data could not be loaded. Reload POS.');

  db=latestData.data;
  remoteVersion=Number(latestData.version)||remoteVersion;
  lastRemote=JSON.stringify(db);
  localStorage.nitrocafepos=lastRemote;
  render();
  toast(`Bill ${o.bill} cancelled. Stock restored.`);
 } catch(error) {
  alert(error.message||'Bill cancellation failed.');
 }
}function expenses(){return `<section class="panel"><div class="section-head"><h2>Expenses</h2><button class="primary" onclick="addExpense()">＋ Record expense</button></div>${table(['Date','Expense','Category','Amount'],db.expenses.slice().reverse().map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.name)}</td><td>${esc(e.category)}</td><td>${money(e.total)}</td></tr>`).join(''))}</section>`}function addExpense(){let name=prompt('Expense description');if(!name)return;let total=Number(prompt('Amount ₹','0'));if(!Number.isFinite(total)||total<=0)return toast('Enter a valid amount');db.expenses.push({name,total,category:prompt('Category','General')||'General',date:new Date().toLocaleDateString()});save();render()}function staff(){return `<section class="panel"><div class="section-head"><h2>Staff & Roles</h2><button class="primary" onclick="addStaff()">＋ Add staff</button></div><div class="notice">Role list is for local record keeping; secure multi-user login and permission enforcement require server-side authentication before production use.</div>${table(['Name','Role','Phone','Actions'],db.staff.map((s,i)=>`<tr><td>${esc(s.name)}</td><td>${esc(s.role)}</td><td>${esc(s.phone)}</td><td><button class="btn danger" onclick="removeStaff(${i})">Remove</button></td></tr>`).join(''))}</section>`}function addStaff(){let name=prompt('Staff name');if(!name)return;db.staff.push({name,role:prompt('Role','Cashier')||'Cashier',phone:prompt('Phone (optional)','')||''});save();render()}function removeStaff(i){if(confirm('Remove this staff entry?')){db.staff.splice(i,1);save();render()}}
function settings(){return `<section class="panel"><h2>Restaurant Settings</h2><p class="muted">Shop details print on receipts. Tax is set to 0 by default; configure only as applicable to your business.</p><div class="formgrid" style="margin-top:18px"><div class="field"><label>Restaurant / Shop name</label><input id="setName" value="${esc(db.settings.name)}"></div><div class="field"><label>Phone</label><input id="setPhone" value="${esc(db.settings.phone)}"></div><div class="field"><label>Tax rate %</label><input id="setTax" type="number" min="0" max="100" value="${Number(db.settings.tax)||0}"></div><div class="field" style="grid-column:1/-1"><label>Address</label><input id="setAddress" value="${esc(db.settings.address)}"></div></div><div class="actions" style="margin-top:16px"><button class="primary" onclick="saveSettings()">Save settings</button><button class="btn" onclick="exportCsv('backup')">Export backup JSON</button><button class="btn danger" onclick="resetData()">Reset demo data</button></div><hr style="border:0;border-top:1px solid var(--line);margin:22px 0"><h2>WhatsApp Integration Status</h2><p class="muted">Bill and Food Ready endpoints use Meta WhatsApp Cloud API when configured in the server .env file. The server does not expose tokens to the browser.</p><button class="btn" onclick="checkApi()">Check API configuration</button><div id="apiStatus" class="muted" style="margin-top:10px"></div></section>`}function saveSettings(){db.settings={...db.settings,name:$('#setName').value.trim()||'NITRO CAFÉ',phone:$('#setPhone').value.trim(),address:$('#setAddress').value.trim(),tax:Math.max(0,Math.min(100,Number($('#setTax').value)||0))};save();$('#shopBrand').textContent=db.settings.name.toUpperCase();toast('Settings saved');render()}async function checkApi(){try{let r=await fetch('/api/health'),d=await r.json();$('#apiStatus').textContent=d.whatsappConfigured?'WhatsApp API configuration looks complete.':'Not configured yet. Missing: '+(d.missingConfiguration||[]).join(', ')}catch(e){$('#apiStatus').textContent='Cannot reach backend. Start the app with npm start.'}}function exportCsv(kind){let rows;if(kind==='customers')rows=[['Name','Phone','Visits','Total'],...db.customers.map(c=>[c.name,c.phone,c.visits,c.total])];else if(kind==='orders')rows=[['Bill','Date','Customer','Phone','Type','Payment','Status','Total'],...db.orders.map(o=>[o.bill,o.date,o.customer,o.phone,o.type,o.payment,o.status,o.total])];else{let blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});download(blob,'nitro-cafe-backup.json');return}let csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');download(new Blob([csv],{type:'text/csv'}),`nitro-cafe-${kind}.csv`)}function download(blob,name){let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}function printBill(id){let o=db.orders.find(x=>x.id===id);if(!o)return;let w=window.open('','_blank','width=480,height=700');if(!w)return toast('Allow popups to print receipt');w.document.write(`<html><head><title>${o.bill}</title><style>body{font:14px Arial;padding:20px;max-width:380px;margin:auto}h2,p{text-align:center}table{width:100%;border-collapse:collapse}td{padding:7px 0;border-bottom:1px dashed #bbb}.right{text-align:right}.total{font-weight:bold;font-size:18px}</style></head><body><h2>${esc(db.settings.name)}</h2><p>${esc(db.settings.address)}<br>${esc(db.settings.phone)}</p><hr><p>Bill: ${esc(o.bill)}<br>${esc(new Date(o.date).toLocaleString())}<br>Customer: ${esc(o.customer||'Walk-in')}</p><table>${o.items.map(i=>`<tr><td>${esc(i.name)} × ${i.qty}</td><td class="right">${money(i.price*i.qty)}</td></tr>`).join('')}<tr><td>Subtotal</td><td class="right">${money(o.subtotal)}</td></tr><tr><td>Discount</td><td class="right">-${money(o.discount)}</td></tr><tr><td>Tax</td><td class="right">${money(o.tax)}</td></tr><tr class="total"><td>Total</td><td class="right">${money(o.total)}</td></tr><tr><td>Payment</td><td class="right">${esc(o.payment)}</td></tr></table><p>Thank you! Visit again.</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}function render(){let html=({dashboard,pos,kitchen,menu:menuPage,inventory,customers,reports,sales,expenses,staff,settings})[page]();$('#content').innerHTML=html;if(page==='pos')renderMenuCards();$('#shopBrand').textContent=db.settings.name.toUpperCase()}function resetData(){
 if(!confirm('Clear expenses and customer history only? All bills will be retained. Export a backup first.'))return;
 db.expenses=[];
 db.customers=[];
 save();
 render();
 toast('Expenses and customer history cleared. Bills retained.');
}

// Expose handlers used by inline HTML attributes (the app is wrapped in an async IIFE).
window.addCart=addCart;
window.addExpense=addExpense;
window.addMenu=addMenu;
window.addStaff=addStaff;
window.addStock=addStock;
window.changeQty=changeQty;
window.checkApi=checkApi;
window.checkout=checkout;
window.closeMenuEditor=closeMenuEditor;
window.customers=customers;
window.dashboard=dashboard;
window.deleteMenu=deleteMenu;
window.deleteSale=deleteSale;
window.download=download;
window.editMenu=editMenu;
window.editSale=editSale;
window.expenses=expenses;
window.exportCsv=exportCsv;
window.filterManageMenu=filterManageMenu;
window.foodReady=foodReady;
window.go=go;
window.inventory=inventory;
window.kitchen=kitchen;
window.menuPage=menuPage;
window.menuTable=menuTable;
window.openMenuEditor=openMenuEditor;
window.photoFor=photoFor;
window.pos=pos;
window.previewMenuPhoto=previewMenuPhoto;
window.printBill=printBill;
window.removeStaff=removeStaff;
window.render=render;
window.renderMenuCards=renderMenuCards;
window.reports=reports;
window.sales=sales;
window.save=save;
window.saveMenuEditor=saveMenuEditor;
window.saveSettings=saveSettings;
window.sendBill=sendBill;
window.setCat=setCat;
window.setStatus=setStatus;
window.settings=settings;
window.staff=staff;
window.stockChange=stockChange;
window.sum=sum;
window.table=table;
window.toast=toast;
window.today=today;
window.todayOrders=todayOrders;
window.debugTodaySales=()=>({
  today:today(),
  orders:db.orders.map(o=>({
    bill:o.bill,
    date:o.date,
    localDate:localDateKey(o.date)
  })),
  todayCount:todayOrders().length,
  todayTotal:sum(todayOrders())
});
window.updateCart=updateCart;
window.uploadMenuPhoto=uploadMenuPhoto;
window.resetData=resetData;
$('#clock').textContent=new Date().toLocaleDateString('en-IN',{dateStyle:'medium'});render();
if(!lastRemote){save()}
setInterval(async()=>{
 if(Date.now()-lastLocalWrite<2500)return;
 try{
  const r=await fetch('/api/shared-data',{headers:authHeaders});
  if(r.status===401){sessionStorage.removeItem('nitroPosPassword');location.reload();return}
  if(!r.ok)return;
const p=await r.json();if(!p.data)return;
remoteVersion=Number(p.version)||remoteVersion;
  const snap=JSON.stringify(p.data);
  if(snap!==lastRemote){
   remoteApplying=true;db=p.data;lastRemote=snap;localStorage.nitrocafepos=snap;render();remoteApplying=false;
  }
 }catch(e){remoteApplying=false}
},2000);
})();