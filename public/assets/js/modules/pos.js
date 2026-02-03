import { api } from '../services/api.js';
import { money } from '../utils/helpers.js';

let cart = [];

export async function renderPOS(outlet){
  const CRITICAL_STOCK = 3;

  const { data: products } = await api.get('/products');
  const { data: inventory } = await api.get('/inventory');

  const stockById = new Map(
    (inventory || []).map(r => [Number(r?.product?.id), Number(r?.stock ?? 0)])
  );

  const getStock = (productId) => Number(stockById.get(Number(productId)) ?? 0);
  const getCartQty = (productId) =>
    Number(cart.find(x => Number(x.id) === Number(productId))?.qty ?? 0);

  const warnNoStock = (name='Producto')=>{
    Swal.fire({
      icon: 'warning',
      title: 'Ya no hay en inventario',
      text: `${name} no tiene stock suficiente.`,
      confirmButtonText: 'Entendido'
    });
  };

  const stockBadge = (st)=>{
    if(st <= 0) return `<span class="badge text-bg-secondary">Sin stock</span>`;
    if(st <= CRITICAL_STOCK) return `<span class="badge text-bg-danger">Crítico</span>`;
    return `<span class="badge text-bg-success">OK</span>`;
  };

  // ✅ Placeholder SVG (sin archivo)
  const PLACEHOLDER_IMG =
    `data:image/svg+xml;utf8,` +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#B39DDB"/>
            <stop offset="1" stop-color="#7E57C2"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
        <circle cx="320" cy="170" r="90" fill="rgba(255,255,255,0.25)"/>
        <path d="M235 170c28-44 142-44 170 0" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="14" stroke-linecap="round"/>
        <circle cx="275" cy="170" r="18" fill="rgba(255,255,255,0.9)"/>
        <circle cx="365" cy="170" r="18" fill="rgba(255,255,255,0.9)"/>
        <text x="50%" y="86%" dominant-baseline="middle" text-anchor="middle"
              font-family="Arial" font-size="22" fill="rgba(255,255,255,0.9)">
          Sin imagen
        </text>
      </svg>
    `);

  // ✅ SOLO FRONT: usa imageUrl si existe en el JSON mock; si no, placeholder
  const getImageUrl = (p)=> (p.imageUrl || p.image_url || PLACEHOLDER_IMG);

  const categories = Array.from(new Set((products || []).map(p => p.category).filter(Boolean))).sort();
  let selectedCategory = 'ALL';
  let searchQuery = '';

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h4 class="mb-0">Punto de Venta</h4>
    </div>

    <div class="card p-3 mb-3">
      <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between">
        <div class="d-flex flex-wrap gap-2 align-items-center" id="posCategories">
          <button class="btn btn-sm btn-brand" data-cat="ALL">Todos</button>
          ${categories.map(c=>`<button class="btn btn-sm btn-outline-brand" data-cat="${c}">${c}</button>`).join('')}
        </div>

        <div class="input-group" style="max-width:420px;">
          <span class="input-group-text">🔎</span>
          <input id="posSearch" class="form-control" placeholder="Buscar por SKU o nombre..." />
        </div>
      </div>

      <div class="d-flex flex-wrap gap-3 align-items-center mt-3">
        <div class="d-flex gap-2 align-items-center">
          <label class="small text-muted m-0">Descuento (%)</label>
          <input id="discount" type="number" min="0" max="100" value="0"
                 class="form-control form-control-sm" style="max-width:110px;">
        </div>
        <div class="small text-muted">Stock crítico = ≤ ${CRITICAL_STOCK}</div>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-lg-7">

        <div class="card p-3">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <h6 class="mb-0">Productos</h6>
            <div class="small text-muted" id="posCount"></div>
          </div>

          <div id="productsGrid" class="row g-3"></div>
        </div>

        <div class="card p-3 mt-3">
          <h6 class="mb-0">Stock disponible</h6>
          <div class="table-responsive mt-2">
            <table class="table table-sm align-middle" id="tblPosStock" style="width:100%">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Tipo</th>
                  <th>Stock</th>
                  <th>Estatus</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                ${inventory.map(r=>{
                  const p = r.product || {};
                  const st = Number(r.stock ?? 0);
                  return `
                    <tr class="${st<=CRITICAL_STOCK ? 'table-warning' : ''}">
                      <td>${p.sku||''}</td>
                      <td>${p.name||''}</td>
                      <td class="small text-muted">${p.category||''}</td>
                      <td class="small text-muted">${p.type||''}</td>
                      <td class="fw-semibold">${st}</td>
                      <td>${stockBadge(st)}</td>
                      <td>${money(p.salePrice ?? 0)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <div class="col-lg-5">
        <div class="card p-3">
          <h6>Carrito</h6>
          <div id="cartBox" class="mt-2"></div>
          <hr/>

          <div class="d-flex justify-content-between">
            <div>Subtotal</div>
            <div class="fw-bold" id="cartSubtotal">$0</div>
          </div>
          <div class="d-flex justify-content-between">
            <div>Descuento</div>
            <div class="fw-bold" id="cartDiscount">$0</div>
          </div>
          <div class="d-flex justify-content-between">
            <div>Total</div>
            <div class="fw-bold" id="cartTotal">$0</div>
          </div>

          <div class="mt-3">
            <label class="form-label">Método de pago</label>
            <select id="payMethod" class="form-select">
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
            </select>
          </div>

          <div class="mt-3">
            <label class="form-label">Cliente</label>
            <input id="customerName" class="form-control" placeholder="Nombre del cliente">
          </div>

          <button id="btnCheckout" class="btn btn-brand w-100 mt-3" disabled>
            Cobrar
          </button>

          <div class="small text-muted mt-2" id="checkoutHint">
            Agrega productos al carrito para habilitar el cobro.
          </div>
        </div>
      </div>
    </div>
  `;

  // ✅ DataTables SOLO stock
  if(window.$ && $.fn.dataTable){
    if($.fn.DataTable.isDataTable('#tblPosStock')){
      $('#tblPosStock').DataTable().destroy();
    }
    $('#tblPosStock').DataTable({
      pageLength: 8,
      order: [[4,'asc']],
      language: {
        search: "Buscar:",
        lengthMenu: "Mostrar _MENU_",
        info: "Mostrando _START_ a _END_ de _TOTAL_",
        paginate: { previous: "Anterior", next: "Siguiente" },
        zeroRecords: "No hay registros"
      }
    });
  }

  const grid = outlet.querySelector('#productsGrid');
  const countEl = outlet.querySelector('#posCount');

  const matchesFilter = (p)=>{
    const catOk = (selectedCategory === 'ALL') || (String(p.category) === String(selectedCategory));
    const q = searchQuery.trim().toLowerCase();
    const qOk = !q || String(p.sku||'').toLowerCase().includes(q) || String(p.name||'').toLowerCase().includes(q);
    return catOk && qOk;
  };

  const renderCards = ()=>{
    const filtered = (products || []).filter(matchesFilter);
    countEl.textContent = `${filtered.length} producto(s)`;

    if(filtered.length === 0){
      grid.innerHTML = `
        <div class="col-12">
          <div class="alert alert-light border mb-0">No hay productos con ese filtro.</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(p=>{
      const st = getStock(p.id);
      const disabled = st <= 0 ? 'disabled' : '';
      const critical = st > 0 && st <= CRITICAL_STOCK;

      const img = getImageUrl(p);

      return `
        <div class="col-12 col-sm-6 col-xl-4">
          <div class="card h-100 ${critical ? 'border-warning' : ''}">
            <img
              src="${img}"
              alt="${String(p.name||'Producto').replaceAll('"','&quot;')}"
              class="card-img-top"
              style="height:140px; object-fit:cover;"
              loading="lazy"
              onerror="this.onerror=null; this.src='${PLACEHOLDER_IMG}';"
            />
            <div class="card-body d-flex flex-column">
              <div class="d-flex align-items-start justify-content-between gap-2">
                <div class="fw-semibold">${p.name}</div>
                <div class="text-end">
                  <div class="small text-muted">${p.sku}</div>
                  <div>${stockBadge(st)}</div>
                </div>
              </div>

              <div class="small text-muted mt-1">
                ${p.category ? `<span class="me-2"><b>${p.category}</b></span>` : ''}
                ${p.type ? `<span>${p.type}</span>` : ''}
              </div>

              <div class="mt-2 d-flex align-items-center justify-content-between">
                <div class="fw-bold">${money(p.salePrice ?? 0)}</div>
                <div class="small ${critical ? 'text-danger' : 'text-muted'}">
                  Stock: <b>${st}</b>
                </div>
              </div>

              <div class="mt-3 d-grid">
                <button class="btn btn-brand" data-add="${p.id}" ${disabled}>Agregar</button>
              </div>

              ${st <= 0
                ? `<div class="small text-muted mt-2">Sin stock</div>`
                : (critical ? `<div class="small text-danger mt-2">Stock crítico</div>` : ``)
              }
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  const discountInput = outlet.querySelector('#discount');
  const btnCheckout = outlet.querySelector('#btnCheckout');
  const checkoutHint = outlet.querySelector('#checkoutHint');

  const setCheckoutState = ()=>{
    const empty = cart.length === 0;
    btnCheckout.disabled = empty;
    checkoutHint.style.display = empty ? 'block' : 'none';
  };

  const renderCart = ()=>{
    const box = outlet.querySelector('#cartBox');
    if(cart.length === 0){
      box.innerHTML = `<div class="text-muted">Carrito vacío</div>`;
      outlet.querySelector('#cartSubtotal').textContent = money(0);
      outlet.querySelector('#cartDiscount').textContent = money(0);
      outlet.querySelector('#cartTotal').textContent = money(0);
      setCheckoutState();
      return;
    }

    box.innerHTML = cart.map(it=>{
      const st = getStock(it.id);
      const atLimit = it.qty >= st;

      return `
        <div class="d-flex justify-content-between border rounded p-2 mb-2">
          <div>
            <div class="fw-semibold">${it.name}</div>
            <div class="small text-muted">${it.sku} · ${money(it.salePrice)} · Stock: ${st}</div>
            ${st<=CRITICAL_STOCK && st>0 ? `<div class="small text-danger">Stock crítico</div>` : ``}
          </div>
          <div class="d-flex gap-2 align-items-center">
            <button class="btn btn-sm btn-outline-secondary" data-dec="${it.id}">-</button>
            <div class="fw-bold">${it.qty}</div>
            <button class="btn btn-sm btn-outline-secondary" data-inc="${it.id}" ${atLimit?'disabled':''}>+</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${it.id}">x</button>
          </div>
        </div>
      `;
    }).join('');

    const subtotal = cart.reduce((a,i)=>a+i.salePrice*i.qty,0);
    const pct = Math.min(100, Math.max(0, Number(discountInput.value||0)));
    const disc = subtotal*(pct/100);
    const total = subtotal-disc;

    outlet.querySelector('#cartSubtotal').textContent = money(subtotal);
    outlet.querySelector('#cartDiscount').textContent = money(disc);
    outlet.querySelector('#cartTotal').textContent = money(total);

    setCheckoutState();
  };

  const addToCart = (p)=>{
    const st = getStock(p.id);
    const inCart = getCartQty(p.id);

    if(st <= 0 || inCart + 1 > st){
      warnNoStock(p.name);
      return false;
    }

    const found = cart.find(i=>Number(i.id)===Number(p.id));
    found ? found.qty++ : cart.push({ ...p, qty: 1 });

    renderCart();
    return true;
  };

  // Eventos (categorías + agregar + carrito)
  outlet.addEventListener('click', (e)=>{
    const addId = e.target?.dataset?.add;
    const incId = e.target?.dataset?.inc;
    const decId = e.target?.dataset?.dec;
    const delId = e.target?.dataset?.del;
    const catBtn = e.target?.closest('[data-cat]');

    if(catBtn){
      selectedCategory = String(catBtn.dataset.cat || 'ALL');

      outlet.querySelectorAll('#posCategories [data-cat]').forEach(b=>{
        const isActive = String(b.dataset.cat) === selectedCategory;
        b.classList.toggle('btn-brand', isActive);
        b.classList.toggle('btn-outline-brand', !isActive);
      });

      renderCards();
      return;
    }

    if(addId){
      const p = products.find(x=>String(x.id)===String(addId));
      if(p) addToCart(p);
      return;
    }

    if(incId){
      const it = cart.find(x=>String(x.id)===String(incId));
      if(it){
        const st = getStock(it.id);
        if(st <= 0 || it.qty + 1 > st){
          warnNoStock(it.name);
          return;
        }
        it.qty++;
        renderCart();
      }
      return;
    }

    if(decId){
      const it = cart.find(x=>String(x.id)===String(decId));
      if(it){
        it.qty = Math.max(1, it.qty-1);
        renderCart();
      }
      return;
    }

    if(delId){
      cart = cart.filter(x=>String(x.id)!==String(delId));
      renderCart();
      return;
    }
  });

  // Búsqueda
  outlet.querySelector('#posSearch').addEventListener('input', (e)=>{
    searchQuery = String(e.target.value || '');
    renderCards();
  });

  // Descuento
  discountInput.addEventListener('input', renderCart);

  // Cobrar
  btnCheckout.addEventListener('click', async ()=>{
    if(cart.length === 0) return;

    for(const it of cart){
      if(it.qty > getStock(it.id)){
        warnNoStock(it.name);
        return;
      }
    }

    const method = outlet.querySelector('#payMethod').value;
    const customerName = outlet.querySelector('#customerName').value || 'Mostrador';

    const subtotal = cart.reduce((a,i)=>a+i.salePrice*i.qty,0);
    const pct = Math.min(100, Math.max(0, Number(discountInput.value||0)));
    const disc = subtotal*(pct/100);
    const total = subtotal-disc;

    const ok = await Swal.fire({
      title:'Confirmar venta',
      html:`Cliente: <b>${customerName}</b><br>Total: <b>${money(total)}</b><br>Pago: <b>${method}</b>`,
      icon:'question',
      showCancelButton:true,
      confirmButtonText:'Procesar'
    });

    if(!ok.isConfirmed) return;

    await api.post('/sales',{
      items: cart,
      method,
      customerName,
      subtotal,
      discountPct: pct,
      discountAmount: disc,
      total
    });

    cart = [];
    renderCart();
    Swal.fire('Venta registrada','Proceso completado.','success');
  });

  // init
  renderCards();
  renderCart();
  setCheckoutState();
}