(async function(){
const $=s=>document.querySelector(s), money=n=>'\u20B9'+Number(n||0).toFixed(2), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
let remoteApplying=false, lastRemote='', lastLocalWrite=0, writeQueue=Promise.resolve(), remoteVersion=0;
let db=blankDb();
try{
 const r=await fetch('/api/shared-data',{headers:authHeaders});
 if(r.status===401){sessionStorage.removeItem('nitroPosPassword');location.reload();return}
 if(!r.ok)throw new Error('Shared server unavailable');
 const payload=await r.json();
 if(payload.data){db=payload.data;remoteVersion=Number(payload.version)||1;lastRemote=JSON.stringify(db)}
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
 const snapshot=JSON.stringify(db);localStorage.nitrocafepos=snapshot;
 if(remoteApplying)return;
 lastLocalWrite=Date.now();
 writeQueue=writeQueue.then(async()=>{
  const r=await fetch('/api/shared-data',{method:'PUT',headers:authHeaders,body:JSON.stringify({data:JSON.parse(snapshot),expectedVersion:remoteVersion})});
  if(r.status===401){sessionStorage.removeItem('nitroPosPassword');location.reload();return}
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(r.status===409?'Another device changed the POS data. Refresh this device before saving again.':(result.error||'Server sync failed.'));
  remoteVersion=Number(result.version)||remoteVersion;
  lastRemote=JSON.stringify(result.data||JSON.parse(snapshot));
 }).catch(e=>{if(typeof toast==='function')toast(e.message||'Server sync failed. Check internet connection.')});
}function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2800)}function go(p){page=p;document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));$('#pageTitle').textContent=({dashboard:'Dashboard',pos:'POS / Billing',kitchen:'Kitchen Order Management',menu:'Menu Management',inventory:'Inventory & Stock',customers:'Customer Management',reports:'Sales Reports',sales:'Sales Management',expenses:'Expense Management',staff:'Staff & Roles',settings:'Restaurant Settings'})[p];render()};$('#nav').addEventListener('click',e=>{let b=e.target.closest('[data-page]');if(b)go(b.dataset.page)});
function localDateKey(value){const d=new Date(value);if(isNaN(d.getTime()))return '';const year=d.getFullYear();const month=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${year}-${month}-${day}`}
function today(){return localDateKey(new Date())}
function todayOrders(){return db.orders.filter(o=>localDateKey(o.date)===today()&&(o.status||'').toLowerCase()!=='cancelled'&&!o.cancelledAt)}
function sum(a){return a.reduce((s,x)=>s+Number(x.total||0),0)}function table(headers,rows){return `<div class="tablewrap"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty">No records yet</td></tr>`}</tbody></table></div>`}
function dashboard(){let t=todayOrders(),pending=db.orders.filter(o=>o.status!=='Completed').length;return `<div class="grid stats"><div class="card stat"><label>Today's Net Sales</label><strong>${money(sum(t))}</strong><em>${t.length} orders today</em></div><div class="card stat"><label>Total Orders</label><strong>${db.orders.length}</strong><em>All recorded orders</em></div><div class="card stat"><label>Kitchen Pending</label><strong>${pending}</strong><em>Needs preparation / pickup</em></div><div class="card stat"><label>Menu Items</label><strong>${db.menu.length}</strong><em>${db.menu.filter(i=>i.stock<=5).length} low-stock items</em></div></div><div class="grid cols"><section class="panel"><div class="section-head"><h2>Recent Orders</h2><button class="btn" onclick="go('reports')">View reports →</button></div>${table(['Order / Bill','Customer','Type','Status','Total'],db.orders.slice(-8).reverse().map(o=>`<tr><td><b>${esc(o.bill)}</b><br><small>${esc(o.time)}</small></td><td>${esc(o.customer||'Walk-in')}</td><td>${esc(o.type)}</td><td><span class="badge ${o.status==='Food Ready'||o.status==='Completed'?'green':''}">${esc(o.status)}</span></td><td><b>${money(o.total)}</b></td></tr>`).join(''))}</section><section class="panel"><div class="section-head"><h2>Quick Actions</h2></div><div class="grid"><button class="primary wide" onclick="go('pos')">＋ Create new order</button><button class="btn wide" onclick="go('kitchen')">♨ Open kitchen board</button><button class="btn wide" onclick="go('menu')">☷ Manage menu items</button><button class="btn wide" onclick="go('inventory')">▤ Check inventory</button></div><div class="notice" style="margin-top:16px">WhatsApp sending requires your own Meta Cloud API credentials, approved templates, and a hosted HTTPS backend. Keep tokens private.</div></section></div>`}
function pos(){return `<div class="pos-layout"><section class="panel"><div class="section-head"><h2>Menu</h2><input id="menuSearch" style="max-width:220px" placeholder="Search items…" oninput="renderMenuCards()"></div><div class="pillnav"><button onclick="setCat('All')">All</button>${[...new Set(db.menu.map(x=>x.category))].map(c=>`<button onclick="setCat('${esc(c)}')">${esc(c)}</button>`).join('')}</div><div class="menu-grid" id="menuCards"></div></section><section class="panel"><div class="section-head"><h2>Current Order</h2><button class="btn" onclick="cart=[];render()">Clear</button></div><div class="formgrid"><div class="field"><label>Customer name</label><input id="custName" placeholder="Walk-in customer"></div><div class="field"><label>WhatsApp / Mobile</label><input id="custPhone" placeholder="10-digit number"></div><div class="field"><label>Order type</label><select id="orderType"><option>Takeaway</option><option>Dine-in</option><option>Delivery</option></select></div><div class="field"><label>Table (if dine-in)</label><input id="tableNo" placeholder="Table 1"></div></div><div id="cartLines" style="margin-top:12px"></div><div class="field"><label>Discount (₹)</label><input id="discount" type="number" min="0" value="0" oninput="updateCart()"></div><div class="field"><label>Tax % (set in Settings)</label><input disabled value="${Number(db.settings.tax)||0}%"></div><div class="total"><span>Total</span><span id="cartTotal">₹0.00</span></div><div class="field"><label>Payment method</label><select id="payMethod"><option>Cash</option><option>UPI</option><option>Card</option><option>Online</option><option>Unpaid</option></select></div><button class="primary wide" style="margin-top:14px" onclick="checkout()">Complete Payment & Save Order</button><small>After saving, use the order in Kitchen to mark it Food Ready.</small></section></div>`}
let category='All';function setCat(c){category=c;renderMenuCards()}function photoFor(name,category){const n=(name+' '+category).toLowerCase();if(n.includes('burger'))return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=85';if(n.includes('coffee')||n.includes('drink'))return 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=700&q=85';if(n.includes('fries'))return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=700&q=85';if(n.includes('momo'))return 'https://images.unsplash.com/photo-1625220194771-7eb9753b6b3f?auto=format&fit=crop&w=700&q=85';if(n.includes('roll'))return 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=700&q=85';return 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=85'}function renderMenuCards() {
  let q = ($('#menuSearch')?.value || '').toLowerCase();
  $('#menuCards').innerHTML = db.menu
    .filter(m => (category === 'All' || m.category === category) && m.name.toLowerCase().includes(q))
    .map(m => {
      const soldOut = Number(m.stock) <= 0;
      return `<button class="food" ${soldOut ? 'disabled' : ''} onclick="addCart(${m.id})">
        <img class="food-photo" src="${esc(m.photo || photoFor(m.name, m.category))}" alt="${esc(m.name)}" loading="lazy" onerror="this.onerror=null;this.src='food-placeholder.svg'">
        <b>${esc(m.name)}</b><small>${esc(m.category)}</small>
        <p><span>${money(m.price)}</span>　${soldOut ? 'SOLD OUT' : '＋'}</p>
      </button>`;
    }).join('') || '<p class="empty">No menu items</p>';
  updateCart();
}
function updateCart() {
  const root = $('#cartLines');
  if (!root) return;

  root.innerHTML = cart.map(i => `
    <div class="cart-line">
      <span>${esc(i.name)} × ${i.qty}</span>
      <div>
        <button onclick="changeQty(${i.id},-1)">−</button>
        <b>${i.qty}</b>
        <button onclick="changeQty(${i.id},1)">+</button>
        <strong>${money(i.price * i.qty)}</strong>
      </div>
    </div>
  `).join('') || '<p class="empty">Cart is empty</p>';

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = Math.min(subtotal, Math.max(0, Number($('#discount')?.value) || 0));
  const tax = (subtotal - discount) * (Number(db.settings.tax) || 0) / 100;

  $('#cartTotal').textContent = money(subtotal - discount + tax);
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;

  const menuItem = db.menu.find(i => i.id === id);
  const nextQty = item.qty + delta;

  if (nextQty > 0 && (!menuItem || nextQty > Number(menuItem.stock || 0))) {
    return toast(`Only ${menuItem?.stock || 0} available`);
  }

  item.qty = nextQty;
  cart = cart.filter(i => i.qty > 0);
  updateCart();
}
function renderMenuCards() {
  let q = ($('#menuSearch')?.value || '').toLowerCase();

  $('#menuCards').innerHTML = db.menu
    .filter(m =>
      (category === 'All' || m.category === category) &&
      m.name.toLowerCase().includes(q)
    )
    .map(m => {
      const soldOut = Number(m.stock) <= 0;

      return `
        <button
          class="food"
          ${soldOut ? 'disabled' : `onclick="addCart(${m.id})"`}
          style="${soldOut ? 'opacity:.55;cursor:not-allowed' : ''}"
        >
          <img class="food-photo"
            src="${esc(m.photo || photoFor(m.name, m.category))}"
            alt="${esc(m.name)}"
            loading="lazy"
            onerror="this.onerror=null;this.src='food-placeholder.svg'">
          <b>${esc(m.name)}</b>
          <small>${esc(m.category)}</small>
          <p>
            <span>${money(m.price)}</span>
            ${soldOut
              ? '<strong style="color:#dc2626">SOLD OUT</strong>'
              : '　＋'}
          </p>
        </button>`;
    }).join('') || '<p class="empty">No menu items</p>';

  updateCart();
}
function addCart(id) {
  const m = db.menu.find(x => x.id === id);
  if (!m) return;

  const f = cart.find(x => x.id === id);
  const alreadyInCart = f ? f.qty : 0;
  const available = Number(m.stock) || 0;

  if (available <= 0) {
    return toast(`${m.name} is SOLD OUT`);
  }

  if (alreadyInCart + 1 > available) {
    return toast(`Only ${available} ${m.name} available`);
  }

  if (f) f.qty++;
  else cart.push({ ...m, qty: 1 });

  updateCart();
}
async function checkout() {
  if (!cart.length) {
    return toast('Add at least one menu item.');
  }

  const name = $('#custName').value.trim();
  const phone = $('#custPhone').value.replace(/\D/g, '');
  const type = $('#orderType').value;
  const tableNo = $('#tableNo').value.trim();
  const pay = $('#payMethod').value;

  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = Math.min(
    sub,
    Math.max(0, Number($('#discount').value) || 0)
  );
  const tax = (sub - discount) *
    (Number(db.settings.tax) || 0) / 100;

  const o = {
    id: Date.now(),
    bill: `NITRO-${db.next}`,
    date: new Date().toISOString(),
    time: new Date().toLocaleTimeString(),
    customer: name,
    phone,
    type,
    tableNo,
    payment: pay,
    items: cart.map(i => ({ ...i })),
    subtotal: sub,
    discount,
    tax,
    total: sub - discount + tax,
    status: 'New',
    whatsappConsent: false
  };

  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ order: o })
    });

    const result = await response.json();

    if (!response.ok || !result.ok || !result.data) {
      return alert(
        result.error || 'Order could not be saved. Please try again.'
      );
    }

    db = result.data;
    remoteVersion = Number(result.version) || remoteVersion;

    const snapshot = JSON.stringify(db);
    localStorage.nitrocafepos = snapshot;
    lastRemote = snapshot;

    cart = [];
    render();
    toast(`Order ${o.bill} saved`);

    if (confirm(`Order ${o.bill} saved. Print receipt now?`)) {
      printBill(o.id);
    }

    if (
      o.phone &&
      o.payment !== 'Unpaid' &&
      confirm('Payment recorded. Has the customer agreed to receive the bill on WhatsApp? Send bill now?')
    ) {
      sendBill(o.id);
    }
  } catch (error) {
    console.error(error);
    alert('Connection error. Please check your internet and try again.');
  }
}
function kitchen(){let active=db.orders.filter(o=>o.status!=='Completed').slice().reverse();return `<div class="notice">Use “Food Ready + WhatsApp” when the kitchen finishes an order. WhatsApp delivery needs configured Meta credentials and an approved food-ready template.</div><div class="grid kitchen-grid">${active.map(o=>`<article class="panel order-card"><div class="section-head"><div><h3>${esc(o.bill)}</h3><small>${esc(o.time)} · ${esc(o.type)} ${o.tableNo?'· '+esc(o.tableNo):''}</small></div><span class="badge ${o.status==='Food Ready'?'green':''}">${esc(o.status)}</span></div><p><b>${esc(o.customer||'Walk-in')}</b> ${o.phone?'· '+esc(o.phone):''}</p><ul>${o.items.map(i=>`<li>${i.qty} × ${esc(i.name)}</li>`).join('')}</ul><div class="total"><span>Total</span><span>${money(o.total)}</span></div><div class="actions">${o.status==='New'?`<button class="btn" onclick="setStatus(${o.id},'Preparing')">Start preparing</button>`:''}${o.status==='Preparing'?`<button class="primary" onclick="foodReady(${o.id})">Food Ready + WhatsApp</button>`:''}${o.status==='Food Ready'?`<button class="btn" onclick="setStatus(${o.id},'Completed')">Mark picked up</button>`:''}<button class="btn" onclick="printBill(${o.id})">Receipt</button></div></article>`).join('')||'<div class="panel empty">No active kitchen orders.</div>'}</div>`}
function setStatus(id,s){let o=db.orders.find(x=>x.id===id);if(o){o.status=s;save();render()}}async function sendBill(id){let o=db.orders.find(x=>x.id===id);if(!o||!o.phone)return toast('Customer mobile number is missing.');if(!confirm('Confirm customer consent to receive this bill on WhatsApp?'))return;try{let r=await fetch('/api/whatsapp/send-bill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:o.phone,customerName:o.customer||'Customer',billNo:o.bill,total:o.total,shopName:db.settings.name,consent:true})});let d=await r.json();if(!r.ok)throw Error(d.error||'WhatsApp not configured');toast('Bill message accepted by WhatsApp API.')}catch(e){toast('Bill not sent by API: '+e.message);if(confirm('Open WhatsApp with bill summary instead?'))window.open('https://wa.me/'+o.phone.replace(/\D/g,'')+'?text='+encodeURIComponent(`Bill ${o.bill} from ${db.settings.name}. Total ${money(o.total)}. Payment: ${o.payment}. Thank you!`),'_blank')}}async function foodReady(id){let o=db.orders.find(x=>x.id===id);if(!o)return;o.status='Food Ready';save();render();if(!o.phone){toast('Food marked ready. No customer phone number saved.');return}if(!confirm('Send Food Ready WhatsApp message to '+o.phone+'?'))return;try{let r=await fetch('/api/whatsapp/food-ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:o.phone,customerName:o.customer||'Customer',billNo:o.bill,shopName:db.settings.name,consent:true})});let d=await r.json();if(!r.ok)throw Error(d.error||'WhatsApp not configured');toast('Food Ready message accepted by WhatsApp API.')}catch(e){toast('Food marked ready; WhatsApp not sent: '+e.message);if(confirm('API unavailable. Open WhatsApp with a pre-filled message?'))window.open('https://wa.me/'+o.phone.replace(/\D/g,'')+'?text='+encodeURIComponent(`Hi ${o.customer||'Customer'}, your order ${o.bill} from ${db.settings.name} is ready! Please collect it. Thank you.`),'_blank')}}
function menuPage(){return `<section class="panel"><div class="section-head"><div><h2>Menu Items (${db.menu.length})</h2><small>Add, edit, upload photos or remove menu items</small></div><button class="primary" onclick="openMenuEditor()">＋ Add item</button></div><div class="row menu-tools"><input id="manageMenuSearch" placeholder="Search menu items…" oninput="filterManageMenu()" style="max-width:320px"><select id="manageMenuCategory" onchange="filterManageMenu()" style="max-width:220px"><option value="All">All categories</option>${[...new Set(db.menu.map(m=>m.category))].map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div id="manageMenuTable">${menuTable()}</div></section><div id="menuEditorRoot"></div>`}
function menuTable(list=db.menu){return table(['Photo','Item','Category','Price','Stock','Actions'],list.map(m=>`<tr><td><img class="mini-food-photo" src="${esc(m.photo||'food-placeholder.svg')}" alt="${esc(m.name)}" onerror="this.onerror=null;this.src='food-placeholder.svg'"></td><td><b>${esc(m.name)}</b></td><td>${esc(m.category)}</td><td>${money(m.price)}</td><td>${Number(m.stock)||0}</td><td><div class="actions"><button class="btn" onclick="editMenu(${m.id})">Edit</button><button class="btn danger" onclick="deleteMenu(${m.id})">Delete</button></div></td></tr>`).join(''))}
function filterManageMenu(){let q=($('#manageMenuSearch')?.value||'').toLowerCase(),c=$('#manageMenuCategory')?.value||'All';$('#manageMenuTable').innerHTML=menuTable(db.menu.filter(m=>(c==='All'||m.category===c)&&m.name.toLowerCase().includes(q)))}
function openMenuEditor(existing){let m=existing||null;$('#menuEditorRoot').innerHTML=`<div class="editor-backdrop" onclick="if(event.target===this)closeMenuEditor()"><section class="editor-panel"><div class="section-head"><div><h2>${m?'Edit menu item':'Add new menu item'}</h2><small>Update item details and food photo</small></div><button class="btn" onclick="closeMenuEditor()">✕</button></div><form id="menuEditorForm" onsubmit="saveMenuEditor(event,${m?m.id:'null'})"><div class="formgrid"><div class="field"><label>Item name *</label><input id="edName" required maxlength="90" value="${esc(m?.name||'')}"></div><div class="field"><label>Price (₹) *</label><input id="edPrice" type="number" required min="0" step=".01" value="${m?.price??''}"></div><div class="field"><label>Category *</label><input id="edCategory" list="menuCategories" required value="${esc(m?.category||'Hotdogs')}"><datalist id="menuCategories">${[...new Set([...db.menu.map(x=>x.category),'Hotdogs','Fries','Wings','Burgers','Juices','Ice Tea','Boba','Hot Drinks','Momos','Combo Offers','Sides'])].map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div><div class="field"><label>Stock quantity</label><input id="edStock" type="number" min="0" step="1" value="${m?.stock??50}"></div></div><div class="field" style="margin-top:12px"><label>Photo URL (paste a direct image URL)</label><input id="edPhotoUrl" type="url" placeholder="https://…" value="${esc(m?.photo||'')}" oninput="previewMenuPhoto(this.value)"></div><div class="field" style="margin-top:12px"><label>Or upload photo from your device</label><input id="edPhotoFile" type="file" accept="image/*" onchange="uploadMenuPhoto(this)"><small>Image will be resized and saved in this browser.</small></div><img id="edPhotoPreview" class="editor-preview" src="${esc(m?.photo||'food-placeholder.svg')}" alt="Food photo preview" onerror="this.src='food-placeholder.svg'"><input type="hidden" id="edPhotoData" value=""><div class="actions" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn" onclick="closeMenuEditor()">Cancel</button><button type="submit" class="primary">Save menu item</button></div></form></section></div>`}
function previewMenuPhoto(url){if(url&&/^https?:\/\//i.test(url)){$('#edPhotoPreview').src=url;$('#edPhotoData').value=''}}
function uploadMenuPhoto(input){let file=input.files?.[0];if(!file)return;if(!file.type.startsWith('image/'))return toast('Please choose an image file.');let reader=new FileReader();reader.onload=()=>{let img=new Image();img.onload=()=>{let scale=Math.min(1,1100/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);let data=canvas.toDataURL('image/jpeg',.78);$('#edPhotoData').value=data;$('#edPhotoPreview').src=data;$('#edPhotoUrl').value=''};img.onerror=()=>toast('Could not read this image.');img.src=reader.result};reader.readAsDataURL(file)}
function saveMenuEditor(e,id){e.preventDefault();let name=$('#edName').value.trim(),price=Number($('#edPrice').value),category=$('#edCategory').value.trim(),stock=Math.max(0,Number($('#edStock').value)||0),photo=$('#edPhotoData').value||$('#edPhotoUrl').value.trim();if(!name||!category||!Number.isFinite(price)||price<0)return toast('Please enter a valid name, category and price.');if(!photo)photo=photoFor(name,category);let old=id===null?null:db.menu.find(x=>x.id===id);if(old)Object.assign(old,{name,price,category,stock,photo});else db.menu.push({id:Date.now(),name,price,category,stock,photo,emoji:''});try{save();closeMenuEditor();render();toast(old?'Menu item updated':'Menu item added')}catch(err){toast('Could not save. Photo may be too large; upload a smaller image.')}}
function closeMenuEditor(){$('#menuEditorRoot').innerHTML=''}
function addMenu(existing){openMenuEditor(existing||null)}function editMenu(id){addMenu(db.menu.find(m=>m.id===id))}function deleteMenu(id){let m=db.menu.find(x=>x.id===id);if(confirm(`Delete "${m?.name}" from the menu? Existing bills will remain unchanged.`)){db.menu=db.menu.filter(x=>x.id!==id);save();render();toast('Menu item deleted')}}
function inventory(){return `<section class="panel"><div class="section-head"><h2>Stock & Reorder</h2><button class="primary" onclick="addStock()">＋ Add stock item</button></div><div class="notice">Simple stock tracking is included. Ingredient-level recipe deduction and supplier purchase workflows can be added after the required stock units and recipes are defined.</div>${table(['Item','Category','On hand','Status','Update'],db.menu.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.category)}</td><td>${m.stock}</td><td><span class="badge ${m.stock<=5?'':'green'}">${m.stock<=5?'Low stock':'In stock'}</span></td><td><button class="btn" onclick="stockChange(${m.id})">Adjust</button></td></tr>`).join(''))}</section>`}function stockChange(id){let m=db.menu.find(x=>x.id===id),n=prompt('New stock quantity for '+m.name,m.stock);if(n!==null&&Number(n)>=0){m.stock=Number(n);save();render()}}function addStock(){let id=Number(prompt('Enter menu item ID to adjust: '+db.menu.map(m=>`${m.id}=${m.name}`).join(', ')));if(db.menu.some(m=>m.id===id))stockChange(id)}
function customers(){return `<section class="panel"><div class="section-head"><h2>Customer Directory</h2><button class="btn" onclick="exportCsv('customers')">Export CSV</button></div>${table(['Customer','Mobile','Visits','Sales total'],db.customers.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${c.visits}</td><td>${money(c.total)}</td></tr>`).join(''))}</section>`}function reports(){let t=todayOrders(),byPay=['Cash','UPI','Card','Online','Unpaid'].map(p=>`<tr><td>${p}</td><td>${money(sum(t.filter(o=>o.payment===p)))}</td></tr>`).join(''),items={};t.forEach(o=>o.items.forEach(i=>{items[i.name]=(items[i.name]||0)+i.qty}));return `<div class="grid stats"><div class="card stat"><label>Today's Sales</label><strong>${money(sum(t))}</strong></div><div class="card stat"><label>Orders Today</label><strong>${t.length}</strong></div><div class="card stat"><label>All-time Sales</label><strong>${money(sum(db.orders))}</strong></div><div class="card stat"><label>Recorded Expenses</label><strong>${money(sum(db.expenses))}</strong></div></div><div class="grid cols"><section class="panel"><div class="section-head"><h2>Payment Summary · Today</h2><button class="btn" onclick="exportCsv('orders')">Export orders CSV</button></div>${table(['Method','Amount'],byPay)}</section><section class="panel"><h2>Popular Items · Today</h2>${table(['Item','Qty sold'],Object.entries(items).sort((a,b)=>b[1]-a[1]).map(([n,q])=>`<tr><td>${esc(n)}</td><td>${q}</td></tr>`).join(''))}</section></div><section class="panel" style="margin-top:16px"><div class="section-head"><h2>Order History</h2><button class="btn" onclick="exportCsv('orders')">Download CSV</button></div>${table(['Bill','Date','Customer','Type','Payment','Status','Total','Receipt'],db.orders.slice().reverse().map(o=>`<tr><td>${esc(o.bill)}</td><td>${esc(new Date(o.date).toLocaleString())}</td><td>${esc(o.customer||'Walk-in')}<br><small>${esc(o.phone||'')}</small></td><td>${esc(o.type)}</td><td>${esc(o.payment)}</td><td>${esc(o.status)}</td><td>${money(o.total)}</td><td><button class="btn" onclick="printBill(${o.id})">Print</button> <button class="btn" onclick="sendBill(${o.id})">WhatsApp bill</button></td></tr>`).join(''))}</section>`}function sales(){return `<section class="panel"><div class="section-head"><div><h2>Sales Management</h2><small>Bill edits and deletions are kept separate from normal billing.</small></div><button class="btn" onclick="go('reports')">Back to reports</button></div>${table(['Bill','Date','Customer','Payment','Total','Actions'],db.orders.slice().reverse().map(o=>`<tr><td><b>${esc(o.bill)}</b></td><td>${esc(new Date(o.date).toLocaleString())}</td><td>${esc(o.customer||'Walk-in')}</td><td>${esc(o.payment)}</td><td>${money(o.total)}</td><td>${(o.status === 'Cancelled' || o.cancelledAt) ? '<span class="muted">Cancelled</span>' : '<div class="actions"><button class="btn" onclick="editSale(' + o.id + ')">Edit sale</button><button class="btn danger" onclick="deleteSale(' + o.id + ')">Delete sale</button></div>'}</td></tr>`).join(''))}</section>`}
function editSale(id){
 const o=db.orders.find(x=>x.id===id);if(!o)return;
 const customer=prompt('Customer name',o.customer||'');if(customer===null)return;
 const total=Number(prompt('Correct bill total (₹)',String(o.total)));if(!Number.isFinite(total)||total<0)return toast('Enter a valid total.');
 const payment=prompt('Payment method: Cash / UPI / Card / Online / Unpaid',o.payment||'Cash');if(payment===null)return;
 if(!confirm(`Save changes to ${o.bill}? This changes the recorded bill total and payment method.`))return;
 o.customer=customer.trim();o.total=total;o.payment=payment.trim()||o.payment;o.editedAt=new Date().toISOString();save();render();toast('Sale updated and synced.');
}
async function deleteSale(id) {
  const o = db.orders.find(x => x.id === id);
  if (!o) return;

  if (o.status === 'Cancelled' || o.cancelledAt) {
    return toast('This bill is already cancelled.');
  }

  if (!confirm(`Cancel bill ${o.bill} for ${money(o.total)}? Owner email OTP is required.`)) {
    return;
  }

  try {
    const request = await fetch('/api/delete/request-otp', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ billId: String(o.bill) })
    });

    const requestData = await request.json();

    if (!request.ok) {
      return alert(requestData.error || 'Could not send OTP.');
    }

    alert('OTP sent to the owner email.');

    const otp = prompt('Enter the 6-digit OTP sent to the owner email:');
    if (!otp) return;

    const verify = await fetch('/api/delete/verify-otp', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        billId: String(o.bill),
        otp: otp.trim()
      })
    });

    const result = await verify.json();

    if (!verify.ok) {
      return alert(result.error || 'OTP verification failed.');
    }

    const latest = await fetch('/api/shared-data', {
      headers: authHeaders
    });

    const latestData = await latest.json();

    if (latest.ok && latestData.data) {
      db = latestData.data;
      remoteVersion = Number(latestData.version) || remoteVersion;
      lastRemote = JSON.stringify(db);
      localStorage.nitrocafepos = lastRemote;
    }

    render();
    toast('Bill cancelled. Stock restoration completed.');
  } catch (error) {
    console.error(error);
    alert('Could not complete cancellation. Please check your connection.');
  }
}
function expenses(){return `<section class="panel"><div class="section-head"><h2>Expenses</h2><button class="primary" onclick="addExpense()">＋ Record expense</button></div>${table(['Date','Expense','Category','Amount'],db.expenses.slice().reverse().map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.name)}</td><td>${esc(e.category)}</td><td>${money(e.total)}</td></tr>`).join(''))}</section>`}function addExpense(){let name=prompt('Expense description');if(!name)return;let total=Number(prompt('Amount ₹','0'));if(!Number.isFinite(total)||total<=0)return toast('Enter a valid amount');db.expenses.push({name,total,category:prompt('Category','General')||'General',date:new Date().toLocaleDateString()});save();render()}function staff(){return `<section class="panel"><div class="section-head"><h2>Staff & Roles</h2><button class="primary" onclick="addStaff()">＋ Add staff</button></div><div class="notice">Role list is for local record keeping; secure multi-user login and permission enforcement require server-side authentication before production use.</div>${table(['Name','Role','Phone','Actions'],db.staff.map((s,i)=>`<tr><td>${esc(s.name)}</td><td>${esc(s.role)}</td><td>${esc(s.phone)}</td><td><button class="btn danger" onclick="removeStaff(${i})">Remove</button></td></tr>`).join(''))}</section>`}function addStaff(){let name=prompt('Staff name');if(!name)return;db.staff.push({name,role:prompt('Role','Cashier')||'Cashier',phone:prompt('Phone (optional)','')||''});save();render()}function removeStaff(i){if(confirm('Remove this staff entry?')){db.staff.splice(i,1);save();render()}}
function settings(){return `<section class="panel"><h2>Restaurant Settings</h2><p class="muted">Shop details print on receipts. Tax is set to 0 by default; configure only as applicable to your business.</p><div class="formgrid" style="margin-top:18px"><div class="field"><label>Restaurant / Shop name</label><input id="setName" value="${esc(db.settings.name)}"></div><div class="field"><label>Phone</label><input id="setPhone" value="${esc(db.settings.phone)}"></div><div class="field"><label>Tax rate %</label><input id="setTax" type="number" min="0" max="100" value="${Number(db.settings.tax)||0}"></div><div class="field" style="grid-column:1/-1"><label>Address</label><input id="setAddress" value="${esc(db.settings.address)}"></div></div><div class="actions" style="margin-top:16px"><button class="primary" onclick="saveSettings()">Save settings</button><button class="btn" onclick="exportCsv('backup')">Export backup JSON</button><button class="btn danger" onclick="resetData()">Reset demo data</button></div><hr style="border:0;border-top:1px solid var(--line);margin:22px 0"><h2>WhatsApp Integration Status</h2><p class="muted">Bill and Food Ready endpoints use Meta WhatsApp Cloud API when configured in the server .env file. The server does not expose tokens to the browser.</p><button class="btn" onclick="checkApi()">Check API configuration</button><div id="apiStatus" class="muted" style="margin-top:10px"></div></section>`}function saveSettings(){db.settings={...db.settings,name:$('#setName').value.trim()||'NITRO CAFÉ',phone:$('#setPhone').value.trim(),address:$('#setAddress').value.trim(),tax:Math.max(0,Math.min(100,Number($('#setTax').value)||0))};save();$('#shopBrand').textContent=db.settings.name.toUpperCase();toast('Settings saved');render()}async function checkApi(){try{let r=await fetch('/api/health'),d=await r.json();$('#apiStatus').textContent=d.whatsappConfigured?'WhatsApp API configuration looks complete.':'Not configured yet. Missing: '+(d.missingConfiguration||[]).join(', ')}catch(e){$('#apiStatus').textContent='Cannot reach backend. Start the app with npm start.'}}function exportCsv(kind){let rows;if(kind==='customers')rows=[['Name','Phone','Visits','Total'],...db.customers.map(c=>[c.name,c.phone,c.visits,c.total])];else if(kind==='orders')rows=[['Bill','Date','Customer','Phone','Type','Payment','Status','Total'],...db.orders.map(o=>[o.bill,o.date,o.customer,o.phone,o.type,o.payment,o.status,o.total])];else{let blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});download(blob,'nitro-cafe-backup.json');return}let csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');download(new Blob([csv],{type:'text/csv'}),`nitro-cafe-${kind}.csv`)}function download(blob,name){let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}function printBill(id){let o=db.orders.find(x=>x.id===id);if(!o)return;let w=window.open('','_blank','width=480,height=700');if(!w)return toast('Allow popups to print receipt');w.document.write(`<html><head><title>${o.bill}</title><style>body{font:14px Arial;padding:20px;max-width:380px;margin:auto}h2,p{text-align:center}table{width:100%;border-collapse:collapse}td{padding:7px 0;border-bottom:1px dashed #bbb}.right{text-align:right}.total{font-weight:bold;font-size:18px}</style></head><body><h2>${esc(db.settings.name)}</h2><p>${esc(db.settings.address)}<br>${esc(db.settings.phone)}</p><hr><p>Bill: ${esc(o.bill)}<br>${esc(new Date(o.date).toLocaleString())}<br>Customer: ${esc(o.customer||'Walk-in')}</p><table>${o.items.map(i=>`<tr><td>${esc(i.name)} × ${i.qty}</td><td class="right">${money(i.price*i.qty)}</td></tr>`).join('')}<tr><td>Subtotal</td><td class="right">${money(o.subtotal)}</td></tr><tr><td>Discount</td><td class="right">-${money(o.discount)}</td></tr><tr><td>Tax</td><td class="right">${money(o.tax)}</td></tr><tr class="total"><td>Total</td><td class="right">${money(o.total)}</td></tr><tr><td>Payment</td><td class="right">${esc(o.payment)}</td></tr></table><p>Thank you! Visit again.</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}function render(){let html=({dashboard,pos,kitchen,menu:menuPage,inventory,customers,reports,sales,expenses,staff,settings})[page]();$('#content').innerHTML=html;if(page==='pos')renderMenuCards();$('#shopBrand').textContent=db.settings.name.toUpperCase()}function resetData(){
 if(!confirm('Clear all recorded sales, expenses and customer history? Menu items, prices, settings and staff will be kept. Export a backup first.'))return;
 db.orders=[];db.expenses=[];db.customers=[];db.next=1001;save();render();toast('Sales, expenses and customer history cleared.');
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
  const p=await r.json();if(!p.data)return;remoteVersion=Number(p.version)||remoteVersion;
  const snap=JSON.stringify(p.data);
  if(snap!==lastRemote){
   remoteApplying=true;db=p.data;lastRemote=snap;localStorage.nitrocafepos=snap;render();remoteApplying=false;
  }
 }catch(e){remoteApplying=false}
},2000);
})();
