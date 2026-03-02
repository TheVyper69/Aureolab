// public/assets/js/pages/orders.js (FULL - PAGINATED + DATATABLE + MODAL SKU FIX)
// - Soporta /api/orders paginado: { data: [], current_page, last_page, ... }
// - Óptica: solo sus pedidos
// - Admin/Employee: todos los pedidos
// - Paginación simple (prev/next + info)
// - Mantiene modal de detalle + cambios de estatus
// - FIX: Modal muestra SKU y nombre aunque productsMap falle (usa items[].product si viene)

import { api } from '../services/api.js';
import { ordersService } from '../services/ordersService.js';
import { money, formatDateTime } from '../utils/helpers.js';
import { authService } from '../services/authService.js';

// Si tu backend manda payment_method_id (1,2,3) y NO manda code,
// aquí puedes mapearlo a texto (ajusta a tus IDs reales).
const PM_ID_LABEL = {
  1: 'Efectivo',
  2: 'Tarjeta',
  3: 'Transferencia'
};

// Si en algún punto mandas code (cash/card/transfer), también lo soporta
const PM_CODE_LABEL = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta' };

/* ====== ESTATUS ====== */
const PAYMENT_LABEL = { pendiente: 'Pendiente', pagado: 'Pagado' };
const PAYMENT_BADGE = { pendiente: 'text-bg-warning', pagado: 'text-bg-success' };

const PROCESS_LABEL = {
  en_proceso: 'En proceso',
  listo_para_entregar: 'Listo para entregar',
  entregado: 'Entregado',
  revision: 'Revisión'
};
const PROCESS_BADGE = {
  en_proceso: 'text-bg-info',
  listo_para_entregar: 'text-bg-primary',
  entregado: 'text-bg-success',
  revision: 'text-bg-danger'
};

function safe(v){
  return String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

function buildProductMap(products){
  // ✅ Robust: soporta array de productos o array tipo inventory [{product:{...}}]
  const m = new Map();
  (products || []).forEach(row => {
    const p = row?.product ?? row;
    if(!p?.id) return;
    m.set(String(p.id), p);
  });
  return m;
}

/* ====== update helper (real API / mock-friendly) ====== */
async function updateOrderPatch(orderId, patch){
  if (typeof ordersService?.update === 'function') return await ordersService.update(orderId, patch);
  if (typeof ordersService?.patch === 'function') return await ordersService.patch(orderId, patch);
  if (typeof ordersService?.updateStatus === 'function') return await ordersService.updateStatus(orderId, patch);

  // Fallback directo si no existe service
  try{
    return await api.patch(`/orders/${orderId}`, patch);
  }catch(_e){
    console.warn('ordersService no tiene update/patch/updateStatus y fallback PATCH falló.');
    throw _e;
  }
}

/* =========================
   NORMALIZACIÓN (backend-friendly)
   Soporta:
   - snake_case (payment_status, process_status, optica_id, created_at, items[])
   - camelCase (compat)
   ✅ FIX: guarda sku/name si vienen en item.product
   ========================= */
function normalizeOrder(o){
  if(!o) return o;

  const paymentStatus = o.paymentStatus ?? o.payment_status ?? 'pendiente';
  const processStatus = o.processStatus ?? o.process_status ?? 'en_proceso';

  const date = o.date ?? o.created_at ?? o.createdAt ?? null;
  const opticaId = o.opticaId ?? o.optica_id ?? null;

  // Tu API actual trae payment_method_id
  const paymentMethod =
    o.paymentMethod ??
    o.payment_method ??
    o.payment_method_code ??
    o.payment_method_id ??
    null;

  const subtotal = Number(o.subtotal ?? o.sub_total ?? 0);
  const total = Number(o.total ?? 0);

  const rawItems = o.items ?? o.order_items ?? [];
  const items = Array.isArray(rawItems) ? rawItems.map(it=>{
    const prod = it.product ?? null;

    const productId = it.productId ?? it.product_id ?? prod?.id ?? null;

    // ✅ FIX: si viene el producto en el item, guarda sku/name aquí
    const productSku = it.productSku ?? it.sku ?? prod?.sku ?? null;
    const productName = it.productName ?? it.name ?? prod?.name ?? null;

    return {
      productId,
      productSku,
      productName,
      qty: Number(it.qty ?? it.quantity ?? 0),
      price: Number(it.price ?? it.unit_price ?? it.unitPrice ?? 0),
      variantId: it.variantId ?? it.variant_id ?? null,
      axis: it.axis ?? null,
      itemNotes: it.itemNotes ?? it.item_notes ?? null,
    };
  }) : [];

  return {
    ...o,
    id: o.id,
    date,
    opticaId,
    paymentMethod,
    paymentStatus,
    processStatus,
    subtotal,
    total,
    items,
    notes: o.notes ?? o.note ?? null
  };
}

function badgeHtml(type, value){
  if(type === 'payment'){
    const v = value || 'pendiente';
    return `<span class="badge ${PAYMENT_BADGE[v] || 'text-bg-secondary'}">${safe(PAYMENT_LABEL[v] || v)}</span>`;
  }
  const v = value || 'en_proceso';
  return `<span class="badge ${PROCESS_BADGE[v] || 'text-bg-secondary'}">${safe(PROCESS_LABEL[v] || v)}</span>`;
}

/* =========================
   OPTICAS MAP (real API)
   /opticas suele devolver:
   { optica_id, customer_id, customer_name, email, phone, user_id }
   ========================= */
async function loadOpticasIndex(){
  try{
    const { data } = await api.get('/opticas');
    const arr = Array.isArray(data) ? data : [];

    const byId = new Map(
      arr.map(o => [
        String(o.optica_id ?? o.id),
        {
          optica_id: o.optica_id ?? o.id,
          customer_id: o.customer_id ?? null,
          nombre: o.customer_name ?? o.nombre ?? o.name ?? 'Óptica',
          email: o.email ?? null,
          phone: o.phone ?? null,
          user_id: o.user_id ?? null
        }
      ])
    );

    return { list: arr, byId };
  }catch(e){
    console.warn('[orders] /opticas falló:', e?.response?.status || e?.message);
    return { list: [], byId: new Map() };
  }
}

/* =========================
   FETCH paginado robusto
   ========================= */
function unwrapPaginated(resp){
  if(Array.isArray(resp)) return { rows: resp, meta: null };

  const root = resp?.data ?? resp;

  if(Array.isArray(root)) return { rows: root, meta: null };

  const rows = Array.isArray(root?.data) ? root.data : [];
  const meta = (root && typeof root === 'object') ? root : null;

  return { rows, meta };
}

async function fetchOrdersPage(page=1){
  try{
    if(typeof ordersService?.list === 'function'){
      const maybe = await ordersService.list(page);
      const un = unwrapPaginated(maybe);
      if(un.rows.length || un.meta) return un;
    }
  }catch(_e){}

  const { data } = await api.get(`/orders?page=${encodeURIComponent(page)}`);
  return unwrapPaginated(data);
}

/* =========================
   DETAIL MODAL
   ✅ FIX: usa sku/name del item si productsMap no lo tiene
   ========================= */
async function showOrderDetail(order, productsMap, opticasById, ctx){
  const role = ctx?.role || authService.getRole();
  const o = normalizeOrder(order);

  const opticaName =
    opticasById.get(String(o.opticaId))?.nombre ||
    o.opticaName ||
    `Óptica #${o.opticaId || '—'}`;

  const paySt = o.paymentStatus || 'pendiente';
  const procSt = o.processStatus || 'en_proceso';

  const canAdminEditPayment = role === 'admin';
  const canEditProcess = (role === 'admin' || role === 'employee');
  const employeeLocked = (role === 'employee' && procSt === 'entregado');

  const procOptionsEmployee = ['en_proceso','listo_para_entregar','entregado'];
  const procOptionsAdmin = ['en_proceso','listo_para_entregar','entregado','revision'];
  const procOptions = (role === 'admin') ? procOptionsAdmin : procOptionsEmployee;

  const itemsHtml = (o.items || []).map(it=>{
    const p = productsMap.get(String(it.productId)) || {};

    // ✅ FIX: SKU/Nombre robustos
    const sku = p.sku || it.productSku || (it.productId ?? '—');
    const name = p.name || it.productName || 'Producto';

    const unit = Number(it.price || 0);
    const qty = Number(it.qty || 0);
    const line = qty * unit;

    return `
      <tr>
        <td>${safe(sku)}</td>
        <td>${safe(name)}</td>
        <td class="text-end">${qty}</td>
        <td class="text-end">${money(unit)}</td>
        <td class="text-end fw-semibold">${money(line)}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="5" class="text-muted">Sin items</td></tr>`;

  // Método pago: id o code
  let pmLabel = '—';
  if(typeof o.paymentMethod === 'number' || String(o.paymentMethod).match(/^\d+$/)){
    pmLabel = PM_ID_LABEL[Number(o.paymentMethod)] || `ID ${o.paymentMethod}`;
  }else{
    const key = String(o.paymentMethod || '').toLowerCase();
    pmLabel = PM_CODE_LABEL[key] || o.paymentMethod || '—';
  }

  const controlsHtml = (role === 'optica')
    ? ''
    : `
      <div class="mt-3 p-3 border rounded bg-light">
        <div class="fw-semibold mb-2">Cambios de estatus</div>

        <div class="row g-2">
          <div class="col-md-6">
            <div class="small text-muted">Estatus de pago</div>
            ${
              canAdminEditPayment
                ? `
                  <select class="form-select form-select-sm" id="selPaymentStatus">
                    ${['pendiente','pagado'].map(v=>`
                      <option value="${v}" ${v===paySt?'selected':''}>${PAYMENT_LABEL[v]}</option>
                    `).join('')}
                  </select>
                `
                : `<div>${badgeHtml('payment', paySt)} <span class="small text-muted ms-2">(solo admin)</span></div>`
            }
          </div>

          <div class="col-md-6">
            <div class="small text-muted">Estatus de proceso</div>
            ${
              canEditProcess
                ? `
                  <select class="form-select form-select-sm" id="selProcessStatus" ${employeeLocked?'disabled':''}>
                    ${procOptions.map(v=>`
                      <option value="${v}" ${v===procSt?'selected':''}>${PROCESS_LABEL[v]}</option>
                    `).join('')}
                  </select>
                  ${
                    employeeLocked
                      ? `<div class="small text-muted mt-1">Entregado: solo admin puede moverlo a <b>Revisión</b>.</div>`
                      : (role==='employee'
                          ? `<div class="small text-muted mt-1">Si lo cambias a <b>Entregado</b>, ya no podrás modificarlo.</div>`
                          : `<div class="small text-muted mt-1">Admin puede usar <b>Revisión</b> para inconformidades.</div>`
                        )
                  }
                `
                : `<div>${badgeHtml('process', procSt)}</div>`
            }
          </div>
        </div>

        <div class="d-flex justify-content-end mt-3">
          <button class="btn btn-sm btn-brand" id="btnSaveStatus">Guardar cambios</button>
        </div>
      </div>
    `;

  const html = `
    <div class="text-start">
      <div class="row g-2">
        <div class="col-6">
          <div class="small text-muted">Pedido</div>
          <div class="fw-semibold">#${safe(o.id)}</div>
        </div>
        <div class="col-6">
          <div class="small text-muted">Fecha</div>
          <div class="fw-semibold">${safe(formatDateTime(o.date))}</div>
        </div>

        <div class="col-6">
          <div class="small text-muted">Óptica</div>
          <div class="fw-semibold">${safe(opticaName)}</div>
        </div>
        <div class="col-6">
          <div class="small text-muted">Pago (método)</div>
          <div class="fw-semibold">${safe(pmLabel)}</div>
        </div>

        <div class="col-6">
          <div class="small text-muted">Estatus de pago</div>
          <div class="fw-semibold">${badgeHtml('payment', paySt)}</div>
        </div>
        <div class="col-6">
          <div class="small text-muted">Estatus de proceso</div>
          <div class="fw-semibold">${badgeHtml('process', procSt)}</div>
        </div>
      </div>

      ${o.notes ? `
        <div class="mt-3">
          <div class="small text-muted">Notas</div>
          <div class="fw-semibold">${safe(o.notes)}</div>
        </div>
      ` : ''}

      ${controlsHtml}

      <hr class="my-3"/>

      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th class="text-end">Cant.</th>
              <th class="text-end">Precio</th>
              <th class="text-end">Importe</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>

      <div class="d-flex justify-content-end mt-2">
        <div class="fw-bold fs-5">Total: ${money(o.total || 0)}</div>
      </div>
    </div>
  `;

  await Swal.fire({
    title: `Detalle del pedido #${o.id}`,
    html,
    width: 900,
    icon: 'info',
    confirmButtonText: 'Cerrar',
    didOpen: () => {
      if(role === 'optica') return;

      const btn = Swal.getHtmlContainer()?.querySelector('#btnSaveStatus');
      if(!btn) return;

      btn.addEventListener('click', async () => {
        const selPay = Swal.getHtmlContainer()?.querySelector('#selPaymentStatus');
        const selProc = Swal.getHtmlContainer()?.querySelector('#selProcessStatus');

        const nextPay = selPay ? selPay.value : paySt;
        const nextProc = selProc ? selProc.value : procSt;

        if(nextPay !== paySt && role !== 'admin'){
          Swal.fire('No permitido', 'Solo admin puede cambiar el estatus de pago.', 'warning');
          return;
        }

        if(nextProc !== procSt){
          if(!(role === 'admin' || role === 'employee')){
            Swal.fire('No permitido', 'Tu rol no puede cambiar el estatus de proceso.', 'warning');
            return;
          }
          if(role === 'employee' && procSt === 'entregado'){
            Swal.fire('Bloqueado', 'Entregado: solo admin puede moverlo a Revisión.', 'warning');
            return;
          }
          if(role !== 'admin' && nextProc === 'revision'){
            Swal.fire('No permitido', 'Solo admin puede poner el pedido en Revisión.', 'warning');
            return;
          }
        }

        if(nextPay === paySt && nextProc === procSt){
          Swal.fire('Sin cambios', 'No hiciste modificaciones.', 'info');
          return;
        }

        const confirm = await Swal.fire({
          title: 'Confirmar cambios',
          html: `Pago: ${badgeHtml('payment', nextPay)}<br/>Proceso: ${badgeHtml('process', nextProc)}`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Guardar'
        });
        if(!confirm.isConfirmed) return;

        const patch = {};
        if(nextPay !== paySt) patch.payment_status = nextPay;
        if(nextProc !== procSt) patch.process_status = nextProc;

        try{
          await updateOrderPatch(o.id, patch);
          if(typeof ctx?.onLocalUpdate === 'function') ctx.onLocalUpdate(o.id, patch);
          Swal.fire('Listo', 'Estatus actualizado.', 'success');
        }catch(err){
          console.error(err);
          Swal.fire('Error', 'No se pudo actualizar el estatus.', 'error');
        }
      });
    }
  });
}

/* =========================
   PAGINATION UI helper
   ========================= */
function paginationHtml(meta){
  if(!meta || !meta.current_page || !meta.last_page) return '';
  const cur = Number(meta.current_page);
  const last = Number(meta.last_page);

  const prevDisabled = cur <= 1 ? 'disabled' : '';
  const nextDisabled = cur >= last ? 'disabled' : '';

  return `
    <div class="d-flex align-items-center justify-content-between mt-3">
      <div class="small text-muted">Página <b>${cur}</b> de <b>${last}</b> · Total: <b>${meta.total ?? '—'}</b></div>
      <div class="btn-group">
        <button class="btn btn-sm btn-outline-secondary" data-page="prev" ${prevDisabled}>Anterior</button>
        <button class="btn btn-sm btn-outline-secondary" data-page="next" ${nextDisabled}>Siguiente</button>
      </div>
    </div>
  `;
}

/* =========================
   VISTA ÓPTICA
   ========================= */
async function renderOpticaOrders(outlet){
  const role = authService.getRole();

  const [{ data: products }, { data: inventory }, meRes, optRes] = await Promise.all([
    api.get('/products'),
    api.get('/inventory'),
    api.get('/me'),
    loadOpticasIndex()
  ]);

  const productsMap = buildProductMap(products);
  const opticasById = optRes.byId;

  const me = meRes?.data?.user || null;
  const myOpticaId = Number(me?.optica_id || 0) || null;

  let page = 1;
  let rows = [];
  let meta = null;

  async function loadPage(p){
    const res = await fetchOrdersPage(p);
    rows = (res.rows || []).map(normalizeOrder);

    if(myOpticaId){
      rows = rows.filter(o => Number(o.opticaId) === Number(myOpticaId));
    }

    meta = res.meta;
    page = meta?.current_page ? Number(meta.current_page) : p;
  }

  await loadPage(1);

  const opticaName =
    opticasById.get(String(myOpticaId))?.nombre ||
    me?.name ||
    'Óptica';

  const renderMyOrdersTbody = ()=>{
    const tbody = outlet.querySelector('#tblMyOrders tbody');
    if(!tbody) return;

    tbody.innerHTML = rows.map(o=>{
      const paySt = o.paymentStatus || 'pendiente';
      const procSt = o.processStatus || 'en_proceso';

      let pmLabel = '—';
      if(typeof o.paymentMethod === 'number' || String(o.paymentMethod).match(/^\d+$/)){
        pmLabel = PM_ID_LABEL[Number(o.paymentMethod)] || `ID ${o.paymentMethod}`;
      }else{
        const key = String(o.paymentMethod || '').toLowerCase();
        pmLabel = PM_CODE_LABEL[key] || o.paymentMethod || '—';
      }

      return `
        <tr data-process="${procSt}">
          <td class="fw-semibold">#${o.id}</td>
          <td class="small">${formatDateTime(o.date)}</td>
          <td>${money(o.total || 0)}</td>
          <td class="small">${safe(pmLabel)}</td>
          <td>${badgeHtml('payment', paySt)}</td>
          <td>${badgeHtml('process', procSt)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-brand" data-view-order="${o.id}">Ver</button>
          </td>
        </tr>
      `;
    }).join('') || `
      <tr>
        <td colspan="7" class="text-muted">Aún no tienes pedidos.</td>
      </tr>
    `;

    const pager = outlet.querySelector('#ordersPager');
    if(pager) pager.innerHTML = paginationHtml(meta);
  };

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <h4 class="mb-0">Óptica: ${safe(opticaName)}</h4>
        <div class="text-muted small">Stock (solo lectura) + pedidos</div>
      </div>
      <button class="btn btn-brand" id="btnGoPOS">Ir a POS</button>
    </div>

    <div class="row g-3">
      <div class="col-lg-7">
        <div class="card p-3">
          <h6 class="mb-0">Stock disponible (solo lectura)</h6>
          <div class="table-responsive mt-2">
            <table class="table table-sm" id="tblStockOptica">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Disponible</th>
                  <th>Precio</th>
                  <th>Categoría</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                ${(inventory || []).map(r=>{
                  const p = r.product || {};
                  const available = Number(r.available ?? r.stock ?? 0);
                  return `<tr>
                    <td>${safe(p.sku||'')}</td>
                    <td>${safe(p.name||'')}</td>
                    <td>${available}</td>
                    <td>${money(p.salePrice ?? p.sale_price ?? 0)}</td>
                    <td>${safe(p.category||'')}</td>
                    <td>${safe(p.type||'')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="small text-muted">Tip: usa el buscador del navegador o filtra desde tu UI si lo agregas.</div>
        </div>
      </div>

      <div class="col-lg-5">
        <div class="card p-3">
          <h6 class="mb-0">Mis pedidos</h6>

          <div class="row g-2 mt-2">
            <div class="col-7">
              <input class="form-control form-control-sm" id="orderSearch" placeholder="Buscar #, pago, estatus...">
            </div>
            <div class="col-5">
              <select class="form-select form-select-sm" id="orderProcess">
                <option value="">Proceso (todos)</option>
                <option value="en_proceso">En proceso</option>
                <option value="listo_para_entregar">Listo para entregar</option>
                <option value="entregado">Entregado</option>
                <option value="revision">Revisión</option>
              </select>
            </div>
          </div>

          <div class="table-responsive mt-2">
            <table class="table table-sm align-middle" id="tblMyOrders">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Pago est.</th>
                  <th>Proceso</th>
                  <th></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>

          <div id="ordersPager"></div>

          <div class="small text-muted">Tip: usa el buscador o filtra por proceso.</div>
        </div>
      </div>
    </div>
  `;

  outlet.querySelector('#btnGoPOS')?.addEventListener('click', ()=>{ location.hash = '#/pos'; });

  renderMyOrdersTbody();

  const applyOrderFilter = () => {
    const q = (outlet.querySelector('#orderSearch')?.value || '').toLowerCase().trim();
    const proc = outlet.querySelector('#orderProcess')?.value || '';
    const trs = Array.from(outlet.querySelectorAll('#tblMyOrders tbody tr'));

    trs.forEach(r => {
      const txt = r.innerText.toLowerCase();
      const okQ = !q || txt.includes(q);
      const okP = !proc || (r.dataset.process === proc);
      r.style.display = (okQ && okP) ? '' : 'none';
    });
  };

  outlet.querySelector('#orderSearch')?.addEventListener('input', applyOrderFilter);
  outlet.querySelector('#orderProcess')?.addEventListener('change', applyOrderFilter);

  outlet.addEventListener('click', async (e)=>{
    const id = e.target?.dataset?.viewOrder;
    if(!id) return;

    const o = rows.find(x=>String(x.id)===String(id));
    if(!o) return;

    await showOrderDetail(o, productsMap, opticasById, { role: 'optica' });
  });

  outlet.addEventListener('click', async (e)=>{
    const btn = e.target?.closest('[data-page]');
    if(!btn) return;

    const dir = btn.dataset.page;
    const cur = Number(meta?.current_page || page);
    const last = Number(meta?.last_page || cur);

    let next = cur;
    if(dir === 'prev') next = Math.max(1, cur - 1);
    if(dir === 'next') next = Math.min(last, cur + 1);

    if(next === cur) return;

    await loadPage(next);
    renderMyOrdersTbody();
    applyOrderFilter();
  });

  applyOrderFilter();
}

/* =========================
   VISTA EMPLEADO/ADMIN
   ========================= */
async function renderEmployeeOrders(outlet){
  const role = authService.getRole();

  const [{ data: products }, optRes] = await Promise.all([
    api.get('/products'),
    loadOpticasIndex()
  ]);

  const productsMap = buildProductMap(products);
  const opticasById = optRes.byId;

  let page = 1;
  let rows = [];
  let meta = null;

  async function loadPage(p){
    const res = await fetchOrdersPage(p);
    rows = (res.rows || []).map(normalizeOrder).sort((a,b)=> new Date(b.date) - new Date(a.date));
    meta = res.meta;
    page = meta?.current_page ? Number(meta.current_page) : p;
  }

  await loadPage(1);

  const onLocalUpdate = (orderId, patch)=>{
    const idx = rows.findIndex(x=>String(x.id)===String(orderId));
    if(idx >= 0){
      rows[idx] = normalizeOrder({ ...rows[idx], ...patch });
    }
    renderTbody();
  };

  function pmLabelFrom(o){
    if(typeof o.paymentMethod === 'number' || String(o.paymentMethod).match(/^\d+$/)){
      return PM_ID_LABEL[Number(o.paymentMethod)] || `ID ${o.paymentMethod}`;
    }
    const key = String(o.paymentMethod || '').toLowerCase();
    return PM_CODE_LABEL[key] || o.paymentMethod || '—';
  }

  function renderTbody(){
    const tbody = outlet.querySelector('#tblAllOrders tbody');
    if(!tbody) return;

    tbody.innerHTML = rows.map(o=>{
      const optName = opticasById.get(String(o.opticaId))?.nombre || `Óptica #${o.opticaId || '—'}`;
      const paySt = o.paymentStatus || 'pendiente';
      const procSt = o.processStatus || 'en_proceso';

      return `
        <tr>
          <td class="fw-semibold">#${safe(o.id)}</td>
          <td class="small">${safe(formatDateTime(o.date))}</td>
          <td>${safe(optName)}</td>
          <td class="small">${safe(pmLabelFrom(o))}</td>
          <td>${badgeHtml('payment', paySt)}</td>
          <td>${badgeHtml('process', procSt)}</td>
          <td class="fw-bold">${money(o.total || 0)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-brand" data-view-order="${o.id}">Detalle</button>
          </td>
        </tr>
      `;
    }).join('') || `
      <tr>
        <td colspan="8" class="text-muted">No hay pedidos.</td>
      </tr>
    `;

    const pager = outlet.querySelector('#ordersPagerAll');
    if(pager) pager.innerHTML = paginationHtml(meta);
  }

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <h4 class="mb-0">Pedidos</h4>
        <div class="text-muted small">Ver pedidos de todas las ópticas</div>
      </div>
    </div>

    <div class="card p-3">
      <div class="table-responsive">
        <table id="tblAllOrders" class="table table-striped align-middle" style="width:100%">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Óptica</th>
              <th>Pago</th>
              <th>Pago est.</th>
              <th>Proceso</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div id="ordersPagerAll"></div>

      <div class="small text-muted mt-2">
        Tip: usa Ctrl+F o agrega un buscador si quieres filtro por texto.
      </div>
    </div>
  `;

  renderTbody();

  outlet.addEventListener('click', async (e)=>{
    const id = e.target?.dataset?.viewOrder;
    if(id){
      const o = rows.find(x=>String(x.id)===String(id));
      if(!o) return;
      await showOrderDetail(o, productsMap, opticasById, { role, onLocalUpdate });
      return;
    }

    const btn = e.target?.closest('[data-page]');
    if(!btn) return;

    const dir = btn.dataset.page;
    const cur = Number(meta?.current_page || page);
    const last = Number(meta?.last_page || cur);

    let next = cur;
    if(dir === 'prev') next = Math.max(1, cur - 1);
    if(dir === 'next') next = Math.min(last, cur + 1);

    if(next === cur) return;

    await loadPage(next);
    renderTbody();
  });
}

/* =========================
   ENTRY
   ========================= */
export async function renderOrders(outlet) {
  const role = authService.getRole();
  if(role === 'optica'){
    await renderOpticaOrders(outlet);
  } else {
    await renderEmployeeOrders(outlet);
  }
}