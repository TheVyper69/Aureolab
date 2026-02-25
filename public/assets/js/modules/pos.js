// public/assets/js/pages/pos.js (FULL - UPDATED)
// - Recarga products + inventory después de una venta (cards + tabla) ✅
// - OPTICA: NO muestra input cliente, usa customer_id = users.optica_id (desde /me) y customer_name = users.name ✅
// - ADMIN/EMPLOYEE: 2 inputs (hidden id + visible name) + autocomplete robusto ✅
// - DEBUG: console.logs para detectar por qué no autocompleta ✅
// - Mantiene payload nuevo (payment_method_id, items[].product_id, unit_price, etc.) ✅
// - Refresh inventory table: DataTables destroy -> render -> init ✅
//
// ✅ CAMBIO OPCIÓN 1:
// - En lugar de POST /sales, ahora la óptica crea pedidos: POST /orders
// - Se mantiene TODO el resto del código (UI, descuentos, detalles, etc.)
// - El payload enviado es el de orders: { payment_method_id, notes, items[] }

import { api } from '../services/api.js';
import { money } from '../utils/helpers.js';
import { authService } from '../services/authService.js';

let cart = [];

// cache: productId -> objectURL o placeholder
const imageUrlCache = new Map();

export async function renderPOS(outlet){
  // ✅ DEBUG helper
  const DBG = (...args)=> console.log('%cPOS_DEBUG', 'color:#7E57C2;font-weight:bold', ...args);

  const role = authService.getRole();
  const token = authService.getToken();
  const isOptica = role === 'optica';

  DBG('renderPOS start', { role, isOptica, hasToken: !!token });

  const CRITICAL_STOCK = 3;

  /* ===================== Helpers ===================== */
  const safe = (v)=> String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');

  const clampPct = (n)=> Math.min(100, Math.max(0, Number(n || 0)));

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

  const fmtGrad = (g)=>{
    if(!g) return '—';
    const sph = (g.sph ?? '').toString().trim();
    const cyl = (g.cyl ?? '').toString().trim();
    if(!sph && !cyl) return '—';
    return `SPH: <b>${safe(sph || '—')}</b> · CYL: <b>${safe(cyl || '—')}</b>`;
  };

  const fmtBisel = (b)=>{
    if(!b) return '—';
    const axis = (b.axis ?? '').toString().trim();
    const notes = (b.notes ?? '').toString().trim();
    if(!axis && !notes) return '—';
    return `Eje: <b>${safe(axis || '—')}</b>${notes ? `<br/>Notas: <b>${safe(notes)}</b>` : ''}`;
  };

  /* ===================== payment_methods mapping ===================== */
  // ⚠️ AJUSTA estos IDs a los reales de tu tabla payment_methods
  const PAYMENT_METHOD_ID = { cash: 1, card: 2, transfer: 3 };

  const resolvePaymentMethodId = (methodKey)=>{
    const id = PAYMENT_METHOD_ID[String(methodKey || '').toLowerCase()];
    return Number(id || 0);
  };

  /* ===================== Estado recargable ===================== */
  let products = [];
  let inventory = [];
  let stockById = new Map();

  // customers (autocomplete) solo admin/employee (son users con role_id=3)
  let customers = [];
  let selectedCustomer = null; // {id, name}

  // ✅ optica context (para rol optica)
  let opticaUserContext = { id: null, name: null, optica_id: null };

  const buildStockMap = ()=>{
    stockById = new Map(
      (inventory || []).map(r=>{
        const pid = Number(r?.product?.id ?? r?.id);
        const st = Number(r?.stock ?? 0);
        return [pid, st];
      })
    );
  };

  const getStock = (productId) => Number(stockById.get(Number(productId)) ?? 0);

  const getCartQty = (productId) =>
    Number(cart.find(x => Number(x.id) === Number(productId))?.qty ?? 0);

  /* ===================== Load API ===================== */
  async function loadCore(){
    DBG('loadCore -> /products + /inventory');
    const res = await Promise.all([
      api.get('/products'),
      api.get('/inventory'),
    ]);
    products = res[0].data || [];
    inventory = res[1].data || [];
    buildStockMap();
    DBG('loadCore done', { productsCount: products.length, inventoryCount: inventory.length });
  }

  async function loadCustomersIfNeeded(){
    if(isOptica) return;
    // Este endpoint debe regresar users role_id=3 con {id,name,email,phone}
    try{
      DBG('loadCustomersIfNeeded -> /opticas');
      const { data } = await api.get('/opticas');
      customers = Array.isArray(data) ? data : [];
      DBG('loadCustomersIfNeeded ok', {
        customersCount: customers.length,
        sample: customers?.[0] ?? null,
        keys: customers?.[0] ? Object.keys(customers[0]) : []
      });
    }catch(e){
      customers = [];
      DBG('loadCustomersIfNeeded ERROR', { message: e?.message, status: e?.response?.status, data: e?.response?.data });
    }
  }

  async function loadOpticaUserContextIfNeeded(){
    if(!isOptica) return;

    try{
      DBG('loadOpticaUserContextIfNeeded -> /me');
      const { data: me } = await api.get('/me');

      // ✅ /me devuelve { ok, user, role }
      const u = me?.user || null;

      opticaUserContext = {
        id: Number(u?.id || 0) || null,                  // users.id (solo referencia)
        name: String(u?.name || '').trim() || null,
        optica_id: Number(u?.optica_id || 0) || null     // (para orders: opticas.id)
      };

      DBG('opticaUserContext', opticaUserContext);

      // ✅ Actualiza el UI si ya está pintado
      const box = outlet.querySelector('#opticaCustomerBox');
      if(box) box.textContent = opticaUserContext.name || 'Óptica';

    }catch(e){
      opticaUserContext = { id: null, name: null, optica_id: null };
      DBG('loadOpticaUserContextIfNeeded ERROR', {
        message: e?.message,
        status: e?.response?.status,
        data: e?.response?.data
      });
    }
  }

  await loadCore();
  await Promise.all([loadCustomersIfNeeded(), loadOpticaUserContextIfNeeded()]);

  /* ===================== Images (protected) ===================== */
  async function getProtectedImageUrl(productId){
    const pid = Number(productId);

    if(imageUrlCache.has(pid)) return imageUrlCache.get(pid);

    if(!token){
      imageUrlCache.set(pid, PLACEHOLDER_IMG);
      return PLACEHOLDER_IMG;
    }

    try{
      const blob = await api.getBlob(`/products/${pid}/image`);
      const url = URL.createObjectURL(blob);
      imageUrlCache.set(pid, url);
      return url;
    }catch(e){
      imageUrlCache.set(pid, PLACEHOLDER_IMG);
      return PLACEHOLDER_IMG;
    }
  }

  async function hydrateImages(container){
    const imgs = container.querySelectorAll('img[data-imgpid]');
    const tasks = [];
    for(const img of imgs){
      const pid = img.dataset.imgpid;
      tasks.push((async ()=>{
        const url = await getProtectedImageUrl(pid);
        img.src = url || PLACEHOLDER_IMG;
      })());
    }
    await Promise.allSettled(tasks);
  }

  /* ===================== Filters / Discounts ===================== */
  const categories = Array.from(new Set((products || []).map(p => p.category).filter(Boolean))).sort();
  let selectedCategory = 'ALL';
  let searchQuery = '';

  let discountMode = 'order'; // 'order' | 'item'
  let orderDiscountPct = 0;

  /* ===================== UI ===================== */
  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h4 class="mb-0">Catálogo</h4>
    </div>

    <div class="card p-3 mb-3">
      <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between">
        <div class="d-flex flex-wrap gap-2 align-items-center" id="posCategories">
          <button class="btn btn-sm btn-brand" data-cat="ALL">Todos</button>
          ${categories.map(c=>`<button class="btn btn-sm btn-outline-brand" data-cat="${safe(c)}">${safe(c)}</button>`).join('')}
        </div>

        <div class="input-group" style="max-width:420px;">
          <span class="input-group-text">🔎</span>
          <input id="posSearch" class="form-control" placeholder="Buscar por SKU o nombre..." />
        </div>
      </div>

      <div class="d-flex flex-wrap gap-3 align-items-center mt-3">
        ${
          isOptica
            ? `<div class="small text-muted">Modo Óptica: sin descuentos</div>`
            : `
              <div class="d-flex flex-wrap gap-2 align-items-center">
                <label class="small text-muted m-0">Descuento</label>

                <select id="discountMode" class="form-select form-select-sm" style="max-width:170px;">
                  <option value="order" selected>Por pedido total</option>
                  <option value="item">Por producto</option>
                </select>

                <input id="orderDiscount" type="number" min="0" max="100" value="0"
                       class="form-control form-control-sm" style="max-width:110px;"
                       placeholder="%"
                />
                <span class="small text-muted" id="orderDiscountHint">Aplica a todo el pedido.</span>
              </div>
            `
        }
        <div class="small text-muted">Stock crítico = ≤ ${CRITICAL_STOCK}</div>
        ${!token ? `<div class="small text-warning">⚠️ Sin token: no se cargarán imágenes protegidas.</div>` : ``}
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
              <tbody id="posStockTbody"></tbody>
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

          ${ isOptica ? '' : `
            <div class="d-flex justify-content-between">
              <div>Descuento</div>
              <div class="fw-bold" id="cartDiscount">$0</div>
            </div>
          `}

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
            <div class="small text-muted mt-1">*Si falla, revisa PAYMENT_METHOD_ID en pos.js</div>
          </div>

          ${
            isOptica
              ? `
                <div class="mt-3">
                  <label class="form-label">Cliente</label>
                  <div class="form-control bg-light" id="opticaCustomerBox">
                    ${safe(opticaUserContext.name || 'Óptica')}
                  </div>
                  <div class="small text-muted mt-1">Se registrará automáticamente como cliente.</div>
                </div>
              `
              : `
                <div class="mt-3 position-relative">
                  <label class="form-label">Cliente</label>
                  <!-- ✅ hidden input para id -->
                  <input type="hidden" id="customerId" value="" />
                  <!-- ✅ visible input para nombre -->
                  <input id="customerName" class="form-control" placeholder="Buscar óptica..." autocomplete="off">
                  <div id="customerSuggest" class="list-group position-absolute w-100"
                       style="z-index:2000; display:none; max-height:240px; overflow:auto;">
                  </div>
                  <div class="small text-muted mt-1">Empieza a escribir para ver sugerencias.</div>
                </div>
              `
          }

          <button id="btnCheckout" type="button" class="btn btn-brand w-100 mt-3" disabled>
            Crear pedido
          </button>

          <div class="small text-muted mt-2" id="checkoutHint">
            Agrega productos al carrito para habilitar el cobro.
          </div>
        </div>
      </div>
    </div>
  `;

  const grid = outlet.querySelector('#productsGrid');
  const countEl = outlet.querySelector('#posCount');
  const btnCheckout = outlet.querySelector('#btnCheckout');
  const checkoutHint = outlet.querySelector('#checkoutHint');

  const discountModeSel = isOptica ? null : outlet.querySelector('#discountMode');
  const orderDiscountInp = isOptica ? null : outlet.querySelector('#orderDiscount');
  const orderDiscountHint = isOptica ? null : outlet.querySelector('#orderDiscountHint');

  DBG('DOM refs', {
    grid: !!grid,
    countEl: !!countEl,
    btnCheckout: !!btnCheckout,
    customerName: !!outlet.querySelector('#customerName'),
    customerId: !!outlet.querySelector('#customerId'),
    customerSuggest: !!outlet.querySelector('#customerSuggest')
  });

  const setCheckoutState = ()=>{
    const empty = cart.length === 0;
    btnCheckout.disabled = empty;
    checkoutHint.style.display = empty ? 'block' : 'none';
  };

  const matchesFilter = (p)=>{
    const catOk = (selectedCategory === 'ALL') || (String(p.category) === String(selectedCategory));
    const q = searchQuery.trim().toLowerCase();
    const qOk = !q || String(p.sku||'').toLowerCase().includes(q) || String(p.name||'').toLowerCase().includes(q);
    return catOk && qOk;
  };

  function renderStockTableBody(){
    const tbody = outlet.querySelector('#posStockTbody');
    tbody.innerHTML = (inventory || []).map(r=>{
      const p = r.product || r;
      const st = Number(r.stock ?? p.stock ?? 0);
      return `
        <tr class="${st<=CRITICAL_STOCK ? 'table-warning' : ''}">
          <td>${safe(p.sku||'')}</td>
          <td>${safe(p.name||'')}</td>
          <td class="small text-muted">${safe(p.category||'')}</td>
          <td class="small text-muted">${safe(p.type||'')}</td>
          <td class="fw-semibold">${st}</td>
          <td>${stockBadge(st)}</td>
          <td>${money(p.salePrice ?? p.sale_price ?? 0)}</td>
        </tr>
      `;
    }).join('');
  }

  function ensureDataTable(){
    if(!(window.$ && $.fn.dataTable)) return;

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

  function refreshInventoryTable(){
    DBG('refreshInventoryTable()');
    if(window.$ && $.fn.datatable && $.fn.DataTable.isDataTable('#tblPosStock')){
      DBG('refreshInventoryTable: destroying DT');
      $('#tblPosStock').DataTable().destroy();
    }
    renderStockTableBody();
    ensureDataTable();
  }

  const renderCards = async ()=>{
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

      return `
        <div class="col-12 col-sm-6 col-xl-4">
          <div class="card h-100 ${critical ? 'border-warning' : ''}">
            <div style="width:100%; aspect-ratio: 16/10; overflow:hidden; background:#f8f9fa;">
              <img
                src="${PLACEHOLDER_IMG}"
                data-imgpid="${p.id}"
                alt="${safe(p.name||'Producto')}"
                style="width:100%; height:100%; object-fit:cover; display:block;"
                loading="lazy"
              />
            </div>

            <div class="card-body d-flex flex-column">
              <div class="d-flex align-items-start justify-content-between gap-2">
                <div class="fw-semibold" style="white-space: normal; overflow: visible;">
                  ${safe(p.name)}
                </div>
                <div class="text-end">
                  <div class="small text-muted">${safe(p.sku)}</div>
                  <div>${stockBadge(st)}</div>
                </div>
              </div>

              <div class="small text-muted mt-1">
                ${p.category ? `<span class="me-2"><b>${safe(p.category)}</b></span>` : ''}
                ${p.type ? `<span>${safe(p.type)}</span>` : ''}
              </div>

              <div class="mt-2 d-flex align-items-center justify-content-between">
                <div class="fw-bold">${money(p.salePrice ?? p.sale_price ?? 0)}</div>
                <div class="small ${critical ? 'text-danger' : 'text-muted'}">
                  Stock: <b>${st}</b>
                </div>
              </div>

              <div class="mt-3 d-flex gap-2">
                <button type="button" class="btn btn-brand flex-grow-1" data-add="${p.id}" ${disabled}>Agregar</button>
                <button type="button" class="btn btn-outline-brand btn-sm" data-details="${p.id}" title="Ver detalles">
                  Detalles
                </button>
              </div>

              ${
                st <= 0
                  ? `<div class="small text-muted mt-2">Sin stock</div>`
                  : (critical ? `<div class="small text-danger mt-2">Stock crítico</div>` : ``)
              }
            </div>
          </div>
        </div>
      `;
    }).join('');

    await hydrateImages(grid);
  };

  const showProductDetails = async (p)=>{
    const st = getStock(p.id);
    const desc = (p.description ?? '').toString().trim();
    const g = p.graduation || null;
    const b = p.bisel || null;
    const cat = (p.category || '').toString();

    const graduacionHtml =
      (cat === 'MICAS' || cat === 'LENTES_CONTACTO')
        ? `<div class="mt-3"><div class="fw-semibold">Graduación</div><div class="small text-muted">${fmtGrad(g)}</div></div>`
        : `<div class="mt-3"><div class="fw-semibold">Graduación</div><div class="small text-muted">—</div></div>`;

    const biselHtml =
      (cat === 'BISEL')
        ? `<div class="mt-3"><div class="fw-semibold">Bisel</div><div class="small text-muted">${fmtBisel(b)}</div></div>`
        : `<div class="mt-3"><div class="fw-semibold">Bisel</div><div class="small text-muted">—</div></div>`;

    const buyPriceHtml = isOptica ? '' : `
      <div class="col-6">
        <div class="small text-muted">Precio compra</div>
        <div class="fw-semibold">${money(p.buyPrice ?? p.buy_price ?? 0)}</div>
      </div>
    `;

    const imgUrl = imageUrlCache.get(Number(p.id)) || PLACEHOLDER_IMG;

    const html = `
      <div class="text-start">
        <div class="d-flex gap-3 align-items-start">
          <img
            src="${imgUrl}"
            alt="${safe(p.name)}"
            style="width:120px;height:120px;object-fit:cover;border-radius:12px;border:1px solid #e9ecef;"
          />
          <div style="min-width:0;">
            <div class="fw-bold">${safe(p.name)}</div>
            <div class="small text-muted">${safe(p.sku)}</div>
            <div class="mt-1">${stockBadge(st)} <span class="small text-muted ms-2">Stock: <b>${st}</b></span></div>
            <div class="mt-2 fw-bold">${money(p.salePrice ?? p.sale_price ?? 0)}</div>
          </div>
        </div>

        <hr class="my-3"/>

        <div class="row g-2">
          <div class="col-6">
            <div class="small text-muted">Categoría</div>
            <div class="fw-semibold">${safe(p.category || '—')}</div>
          </div>
          <div class="col-6">
            <div class="small text-muted">Tipo</div>
            <div class="fw-semibold">${safe(p.type || '—')}</div>
          </div>

          ${buyPriceHtml}

          <div class="col-6">
            <div class="small text-muted">Proveedor</div>
            <div class="fw-semibold">${safe(p.supplier || '—')}</div>
          </div>
        </div>

        <div class="mt-3">
          <div class="fw-semibold">Descripción</div>
          <div class="small text-muted">${desc ? safe(desc) : '—'}</div>
        </div>

        ${graduacionHtml}
        ${biselHtml}
      </div>
    `;

    const r = await Swal.fire({
      title: 'Detalle del producto',
      html,
      width: 720,
      showCancelButton: true,
      confirmButtonText: 'Agregar al carrito',
      cancelButtonText: 'Cerrar',
      focusConfirm: false
    });

    if(r.isConfirmed) addToCart(p);
  };

  /* ===================== Totals / Cart ===================== */
  const calcTotals = ()=>{
    const subtotal = cart.reduce((a,i)=> a + (Number(i.salePrice||i.sale_price||0) * Number(i.qty||0)), 0);

    if(isOptica){
      return { subtotal, discountAmount: 0, total: subtotal, orderDiscountPct: 0 };
    }

    if(discountMode === 'order'){
      const pct = clampPct(orderDiscountPct);
      const discountAmount = subtotal * (pct/100);
      const total = subtotal - discountAmount;
      return { subtotal, discountAmount, total, orderDiscountPct: pct };
    }

    // item
    let discountAmount = 0;
    for(const it of cart){
      const pct = clampPct(it.itemDiscountPct || 0);
      discountAmount += (Number(it.salePrice||it.sale_price||0) * Number(it.qty||0)) * (pct/100);
    }
    const total = subtotal - discountAmount;
    return { subtotal, discountAmount, total, orderDiscountPct: 0 };
  };

  const renderCart = ()=>{
    const box = outlet.querySelector('#cartBox');

    if(cart.length === 0){
      box.innerHTML = `<div class="text-muted">Carrito vacío</div>`;
      outlet.querySelector('#cartSubtotal').textContent = money(0);
      if(!isOptica) outlet.querySelector('#cartDiscount').textContent = money(0);
      outlet.querySelector('#cartTotal').textContent = money(0);
      setCheckoutState();
      return;
    }

    box.innerHTML = cart.map(it=>{
      const st = getStock(it.id);
      const atLimit = it.qty >= st;

      const itemDisc = isOptica ? '' : `
        <div class="mt-1 ${discountMode==='item' ? '' : 'd-none'}" data-itemdiscbox="${it.id}">
          <div class="d-flex align-items-center gap-2">
            <span class="small text-muted">Desc %</span>
            <input type="number" min="0" max="100"
              class="form-control form-control-sm"
              style="max-width:90px;"
              value="${clampPct(it.itemDiscountPct || 0)}"
              data-itemdisc="${it.id}"
              ${discountMode==='item' ? '' : 'disabled'}
            />
          </div>
        </div>
      `;

      return `
        <div class="d-flex justify-content-between border rounded p-2 mb-2">
          <div style="min-width:0;">
            <div class="fw-semibold">${safe(it.name)}</div>
            <div class="small text-muted">${safe(it.sku)} · ${money(it.salePrice ?? it.sale_price ?? 0)} · Stock: ${st}</div>
            ${st<=CRITICAL_STOCK && st>0 ? `<div class="small text-danger">Stock crítico</div>` : ``}
            ${itemDisc}
          </div>

          <div class="d-flex gap-2 align-items-center">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-dec="${it.id}">-</button>
            <div class="fw-bold">${it.qty}</div>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-inc="${it.id}" ${atLimit?'disabled':''}>+</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-del="${it.id}">x</button>
          </div>
        </div>
      `;
    }).join('');

    const t = calcTotals();
    outlet.querySelector('#cartSubtotal').textContent = money(t.subtotal);
    if(!isOptica) outlet.querySelector('#cartDiscount').textContent = money(t.discountAmount);
    outlet.querySelector('#cartTotal').textContent = money(t.total);

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
    if(found){
      found.qty++;
    }else{
      cart.push({
        ...p,
        salePrice: p.salePrice ?? p.sale_price ?? 0,
        buyPrice: p.buyPrice ?? p.buy_price ?? 0,
        qty: 1,
        itemDiscountPct: 0
      });
    }

    renderCart();
    return true;
  };

  /* ===================== Autocomplete (admin/employee) ===================== */
  function mountCustomerAutocomplete(){
    if(isOptica) return;

    const input = outlet.querySelector('#customerName');
    const hidden = outlet.querySelector('#customerId'); // ✅ hidden id
    const box = outlet.querySelector('#customerSuggest');

    DBG('mountCustomerAutocomplete()', {
      hasInput: !!input,
      hasHidden: !!hidden,
      hasBox: !!box,
      customersCount: customers.length,
      customersSample: customers?.[0] ?? null,
      customersKeys: customers?.[0] ? Object.keys(customers[0]) : []
    });

    if(!input || !hidden || !box) return;

    const getId = (c)=>{
      const n = Number(c?.user_id || 0);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const getName = (c)=> String(c?.customer_name || c?.name || '').trim();

    const getMeta = (c)=>{
      const email = c?.email ? `· ${c.email}` : '';
      const phone = c?.phone ? `· ${c.phone}` : '';
      return `${email} ${phone}`.trim();
    };

    const hide = ()=>{ box.style.display = 'none'; box.innerHTML = ''; };
    const show = ()=>{ box.style.display = 'block'; };

    const pick = (c)=>{
      const id = getId(c);
      const name = getName(c);

      DBG('pick() attempt', { resolvedId: id, resolvedName: name, raw: c });

      if(!id){
        DBG('pick() BLOCKED -> id inválido', { raw: c });
        return;
      }

      selectedCustomer = { id, name };
      hidden.value = String(id);
      input.value = name;

      DBG('pick() OK', { hiddenNow: hidden.value, visibleNow: input.value, selectedCustomer });

      hide();
    };

    const renderList = (matches)=>{
      box.innerHTML = matches.map((c, idx)=>{
        const id = getId(c);
        const name = getName(c);
        const meta = getMeta(c);

        return `
        <button type="button"
                class="list-group-item list-group-item-action"
                data-custid="${id ?? ''}"
                data-idx="${idx}">
          <div class="fw-semibold">${safe(name || '(Sin nombre)')}</div>
          ${meta ? `<div class="small text-muted">${safe(meta)}</div>` : ''}
        </button>
      `;
      }).join('');
      show();
    };

    const filterMatches = ()=>{
      selectedCustomer = null;
      hidden.value = '';

      const q = String(input.value || '').trim().toLowerCase();
      DBG('autocomplete input', { q });

      if(!q || customers.length === 0){
        hide();
        return [];
      }

      const matches = customers
        .filter(c=>{
          const name = getName(c).toLowerCase();
          const email = String(c?.email || '').toLowerCase();
          const phone = String(c?.phone || '').toLowerCase();
          return name.includes(q) || email.includes(q) || phone.includes(q);
        })
        .slice(0, 10);

      DBG('autocomplete matches', {
        matchesCount: matches.length,
        sample: matches?.[0] ?? null,
        sampleResolvedId: matches?.[0] ? getId(matches[0]) : null
      });

      if(matches.length === 0){
        hide();
        return [];
      }

      renderList(matches);
      return matches;
    };

    input.addEventListener('input', filterMatches);

    input.addEventListener('focus', ()=>{
      if(String(input.value || '').trim().length > 0) filterMatches();
    });

    const handlePickFromEvent = (e, kind)=>{
      const btn = e.target?.closest('[data-custid]');
      if(!btn) return;

      e.preventDefault();

      const datasetId = btn.dataset.custid;
      const id = Number(datasetId);

      DBG(`suggest ${kind}`, { datasetId, id });

      if(!Number.isFinite(id) || id <= 0){
        const idx = Number(btn.dataset.idx);
        const c = customers?.[idx];
        DBG(`suggest ${kind} fallback idx`, { idx, found: !!c, resolvedId: c ? getId(c) : null });
        if(c) pick(c);
        return;
      }

      const c = customers.find(x => getId(x) === id);
      DBG(`suggest ${kind} find by id`, { id, found: !!c });
      if(c) pick(c);
    };

    box.addEventListener('mousedown', (e)=> handlePickFromEvent(e, 'mousedown'));
    box.addEventListener('click', (e)=> handlePickFromEvent(e, 'click'));

    input.addEventListener('blur', ()=>{
      setTimeout(()=> hide(), 150);
    });

    input.addEventListener('keydown', (e)=>{
      if(box.style.display === 'none') return;

      const items = Array.from(box.querySelectorAll('[data-idx]'));
      if(items.length === 0) return;

      const active = box.querySelector('.active');
      let idx = active ? Number(active.dataset.idx) : -1;

      if(e.key === 'ArrowDown'){
        e.preventDefault();
        idx = Math.min(items.length - 1, idx + 1);
        items.forEach(x=>x.classList.remove('active'));
        items[idx].classList.add('active');
        items[idx].scrollIntoView({ block: 'nearest' });
      }

      if(e.key === 'ArrowUp'){
        e.preventDefault();
        idx = Math.max(0, idx - 1);
        items.forEach(x=>x.classList.remove('active'));
        items[idx].classList.add('active');
        items[idx].scrollIntoView({ block: 'nearest' });
      }

      if(e.key === 'Enter'){
        if(idx >= 0){
          e.preventDefault();
          const id = Number(items[idx].dataset.custid);
          const c = customers.find(x => getId(x) === id);
          DBG('keyboard enter', { idx, id, found: !!c });
          if(c) pick(c);
        }
      }

      if(e.key === 'Escape'){
        hide();
      }
    });

    if(customers.length === 0){
      console.warn('[POS] customers vacío. Revisa /opticas.');
    }
  }

  /* ===================== Events ===================== */
  outlet.addEventListener('click', (e)=>{
    const addId = e.target?.dataset?.add;
    const detailsId = e.target?.dataset?.details;
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

    if(detailsId){
      const p = products.find(x=>String(x.id)===String(detailsId));
      if(p) showProductDetails(p);
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
        if(st <= 0 || it.qty + 1 > st){ warnNoStock(it.name); return; }
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

  outlet.querySelector('#posSearch')?.addEventListener('input', (e)=>{
    searchQuery = String(e.target.value || '');
    renderCards();
  });

  // descuentos
  if(!isOptica){
    discountModeSel.addEventListener('change', ()=>{
      discountMode = discountModeSel.value === 'item' ? 'item' : 'order';

      if(discountMode === 'order'){
        orderDiscountHint.textContent = 'Aplica a todo el pedido.';
        orderDiscountInp.disabled = false;
      }else{
        orderDiscountHint.textContent = 'Define descuento por cada producto en el carrito.';
        orderDiscountInp.disabled = true;
      }

      outlet.querySelectorAll('[data-itemdiscbox]').forEach(box=>{
        box.classList.toggle('d-none', discountMode !== 'item');
      });
      outlet.querySelectorAll('[data-itemdisc]').forEach(inp=>{
        inp.disabled = discountMode !== 'item';
      });

      renderCart();
    });

    orderDiscountInp.addEventListener('input', ()=>{
      orderDiscountPct = clampPct(orderDiscountInp.value);
      renderCart();
    });

    outlet.addEventListener('input', (e)=>{
      const pid = e.target?.dataset?.itemdisc;
      if(!pid) return;
      if(discountMode !== 'item') return;

      const it = cart.find(x=>String(x.id)===String(pid));
      if(!it) return;
      it.itemDiscountPct = clampPct(e.target.value);
      renderCart();
    });
  }

  /* ===================== CHECKOUT (pedido) ===================== */
  outlet.querySelector('#btnCheckout')?.addEventListener('click', async (e)=>{
    e.preventDefault();
    if(cart.length === 0) return;

    for(const it of cart){
      if(it.qty > getStock(it.id)){
        warnNoStock(it.name);
        return;
      }
    }

    const methodKey = outlet.querySelector('#payMethod').value;
    const payment_method_id = resolvePaymentMethodId(methodKey);
    if(!payment_method_id){
      Swal.fire('Método inválido','Configura PAYMENT_METHOD_ID en pos.js con los IDs reales.','warning');
      return;
    }

    // ===== (se mantiene tu lógica vieja, aunque para orders no se usa) =====
    let customer_id = null;
    let customer_name = 'Mostrador';

    if(isOptica){
      customer_id = Number(opticaUserContext.optica_id || 0) || null;
      customer_name = String(opticaUserContext.name || 'Óptica').trim();

      DBG('checkout optica mapping (legacy sales)', {
        user_id: opticaUserContext.id,
        optica_id: opticaUserContext.optica_id,
        customer_id,
        customer_name
      });

      if(!customer_id){
        Swal.fire('Falta optica_id','No se pudo obtener optica_id desde /me.','warning');
        return;
      }
    }else{
      const input = outlet.querySelector('#customerName');
      const hidden = outlet.querySelector('#customerId');
      const typed = String(input?.value || '').trim();
      const hid = Number(hidden?.value || 0);

      DBG('checkout customer (admin)', { typed, hiddenValue: hidden?.value, selectedCustomer });

      if(hid){
        customer_id = hid;
        customer_name = typed || 'Mostrador';
      }else if(selectedCustomer?.id){
        customer_id = Number(selectedCustomer.id);
        customer_name = String(selectedCustomer.name || typed || 'Mostrador').trim();
      }else{
        customer_id = null;
        customer_name = typed || 'Mostrador';
      }
    }

    const t = calcTotals();

    // (se mantiene tu lógica de descuentos, aunque orders no la usa)
    let discount_type = 'none';
    let discount_value = 0;

    if(!isOptica && discountMode === 'order'){
      const pct = clampPct(orderDiscountPct);
      discount_type = pct > 0 ? 'order_pct' : 'none';
      discount_value = pct > 0 ? pct : 0;
    }

    // items (se mantiene tu cálculo original)
    const items = cart.map(it=>{
      const qty = Number(it.qty || 0);
      const unit_price = Number(it.salePrice ?? it.sale_price ?? 0);
      const line_subtotal = qty * unit_price;

      let item_discount_type = 'none';
      let item_discount_value = 0;
      let item_discount_amount = 0;

      if(!isOptica && discountMode === 'item'){
        const pct = clampPct(it.itemDiscountPct || 0);
        if(pct > 0){
          item_discount_type = 'pct';
          item_discount_value = pct;
          item_discount_amount = line_subtotal * (pct/100);
        }
      }

      const line_total = line_subtotal - item_discount_amount;

      return {
        product_id: Number(it.id),
        variant_id: it.variant_id ? Number(it.variant_id) : null,
        qty,
        unit_price,
        line_subtotal,
        item_discount_type,
        item_discount_value,
        item_discount_amount,
        line_total,
        axis: it.axis ?? null,
        item_notes: it.item_notes ?? null
      };
    });

    // ✅ NUEVO: payload para /orders (mínimo necesario)
    const orderPayload = {
      payment_method_id,
      notes: null,
      items: items.map(it => ({
        product_id: it.product_id,
        variant_id: it.variant_id ?? null,
        qty: it.qty,
        unit_price: it.unit_price,
        axis: it.axis ?? null,
        item_notes: it.item_notes ?? null
      }))
    };

    const discTxt = isOptica
      ? '—'
      : (discountMode === 'order'
          ? `${discount_value}% (pedido)`
          : 'Por producto');

    const ok = await Swal.fire({
      title:'Confirmar pedido',
      html:`Óptica: <b>${safe(isOptica ? (opticaUserContext.name || 'Óptica') : customer_name)}</b><br>Total: <b>${money(t.total)}</b><br>Descuento: <b>${safe(discTxt)}</b><br>Pago: <b>${safe(methodKey)}</b>`,
      icon:'question',
      showCancelButton:true,
      confirmButtonText:'Crear'
    });

    if(!ok.isConfirmed) return;

    try{
      // ✅ CAMBIO CLAVE: crear pedido
      await api.post('/orders', orderPayload);

      // limpiar carrito
      cart = [];
      selectedCustomer = null;
      const hid = outlet.querySelector('#customerId');
      if(hid) hid.value = '';
      renderCart();

      // recarga products+inventory (aunque el pedido no descuente stock, recargar no estorba)
      await loadCore();
      refreshInventoryTable();
      await renderCards();

      Swal.fire('Pedido registrado','Proceso completado.','success');
    }catch(err){
      console.log(orderPayload);

      const msg = err?.response?.data?.message || err?.message || 'Error al registrar el pedido';
      const details = err?.response?.data?.errors
        ? Object.values(err.response.data.errors).flat().map(x=>`• ${x}`).join('<br>')
        : '';
      Swal.fire('Error', details || msg, 'error');
    }
  });

  /* ===================== Init ===================== */
  renderStockTableBody();
  ensureDataTable();
  await renderCards();
  renderCart();
  setCheckoutState();

  if(!isOptica){
    discountModeSel.dispatchEvent(new Event('change'));
    mountCustomerAutocomplete();
  }

  DBG('renderPOS end');
}