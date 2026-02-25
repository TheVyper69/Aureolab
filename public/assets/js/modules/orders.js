import { api } from '../services/api.js';
import { ordersService } from '../services/ordersService.js';
import { money, formatDateTime } from '../utils/helpers.js';
import { authService } from '../services/authService.js';

const PM_LABEL = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta' };

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
  const m = new Map();
  (products || []).forEach(p => m.set(String(p.id), p));
  return m;
}

/* ====== update helper (real API / mock-friendly) ====== */
async function updateOrderPatch(orderId, patch){
  if (typeof ordersService.update === 'function') return await ordersService.update(orderId, patch);
  if (typeof ordersService.patch === 'function') return await ordersService.patch(orderId, patch);
  if (typeof ordersService.updateStatus === 'function') return await ordersService.updateStatus(orderId, patch);
  console.warn('ordersService no tiene update/patch/updateStatus. Update será solo visual en esta sesión.');
  return null;
}

/* =========================
   NORMALIZACIÓN (backend-friendly)
   Soporta:
   - DTO camelCase: paymentStatus/processStatus/opticaId/date/items[]
   - DB snake_case: payment_status/process_status/optica_id/created_at/order_items[]
   ========================= */
function normalizeOrder(o){
  if(!o) return o;

  const paymentStatus = o.paymentStatus ?? o.payment_status ?? 'pendiente';
  const processStatus = o.processStatus ?? o.process_status ?? 'en_proceso';

  const date = o.date ?? o.created_at ?? o.createdAt ?? null;

  const opticaId = o.opticaId ?? o.optica_id ?? null;

  const paymentMethod =
    o.paymentMethod ??
    o.payment_method ??
    o.payment_method_code ??
    o.payment_method_id ??
    o.paymentMethodCode ??
    null;

  const createdByName = o.createdByName ?? o.created_by_name ?? o.createdBy?.name ?? null;
  const createdByEmail = o.createdByEmail ?? o.created_by_email ?? o.createdBy?.email ?? null;
  const createdByRole = o.createdByRole ?? o.created_by_role ?? o.createdBy?.role ?? o.createdBy?.role?.name ?? null;

  const subtotal = Number(o.subtotal ?? o.sub_total ?? 0);
  const total = Number(o.total ?? 0);

  const rawItems = o.items ?? o.order_items ?? o.items_list ?? [];
  const items = Array.isArray(rawItems) ? rawItems.map(it=>{
    return {
      productId: it.productId ?? it.product_id ?? it.product?.id ?? null,
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
    createdByName,
    createdByEmail,
    createdByRole,
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

    // key por optica_id (opticas.id) => coincide con orders.optica_id
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
    console.warn('[orders] /opticas no disponible o falló:', e?.response?.status || e?.message);
    return { list: [], byId: new Map() };
  }
}

/* =========================
   DETAIL MODAL
   ========================= */
async function showOrderDetail(order, productsMap, opticasById, ctx){
  const role = ctx?.role || authService.getRole();
  const o = normalizeOrder(order);

  const opticaName =
    opticasById.get(String(o.opticaId))?.nombre ||
    o.opticaName ||
    `Óptica #${o.opticaId || '—'}`;

  const createdBy = o.createdByName || o.createdByEmail || '—';
  const createdRole = o.createdByRole || '—';

  const paySt = o.paymentStatus || 'pendiente';
  const procSt = o.processStatus || 'en_proceso';

  const canAdminEditPayment = role === 'admin';
  const canEditProcess = (role === 'admin' || role === 'employee');
  const employeeLocked = (role === 'employee' && procSt === 'entregado');

  const procOptionsEmployee = ['en_proceso','listo_para_entregar','entregado'];
  const procOptionsAdmin = ['en_proceso','listo_para_entregar','entregado','revision'];
  const procOptions = (role === 'admin') ? procOptionsAdmin : procOptionsEmployee;

  const items = (o.items || []).map(it=>{
    const p = productsMap.get(String(it.productId)) || {};
    const unit = Number(it.price || 0);
    const qty = Number(it.qty || 0);
    const line = qty * unit;

    return `
      <tr>
        <td>${safe(p.sku || it.productId || '—')}</td>
        <td>${safe(p.name || 'Producto')}</td>
        <td class="text-end">${qty}</td>
        <td class="text-end">${money(unit)}</td>
        <td class="text-end fw-semibold">${money(line)}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="5" class="text-muted">Sin items</td></tr>`;

  // Método pago: si backend manda código (cash/card/transfer) se etiqueta; si manda id, se muestra tal cual
  const pmKey = (typeof o.paymentMethod === 'string') ? o.paymentMethod : String(o.paymentMethod || '');
  const pmLabel = PM_LABEL[pmKey] || pmKey || '—';

  const controlsHtml = (role === 'optica')
    ? '' // óptica solo ve detalle
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

        <div class="col-12">
          <div class="small text-muted">Creado por</div>
          <div class="fw-semibold">${safe(createdBy)} <span class="small text-muted">(${safe(createdRole)})</span></div>
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
          <tbody>${items}</tbody>
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

        // reglas
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

        // Backend-friendly patch (snake_case)
        const patch = {};
        if(nextPay !== paySt) patch.payment_status = nextPay;
        if(nextProc !== procSt) patch.process_status = nextProc;

        // También mandamos camelCase por compatibilidad (por si tu service lo espera)
        const patchCompat = {};
        if(nextPay !== paySt) patchCompat.paymentStatus = nextPay;
        if(nextProc !== procSt) patchCompat.processStatus = nextProc;

        try{
          await updateOrderPatch(o.id, { ...patch, ...patchCompat });

          if(typeof ctx?.onLocalUpdate === 'function') ctx.onLocalUpdate(o.id, { ...patchCompat });

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
   VISTA ÓPTICA (mis pedidos + stock lectura)
   ========================= */
async function renderOpticaOrders(outlet){
  const [{ data: products }, { data: inventory }, meRes, optRes] = await Promise.all([
    api.get('/products'),
    api.get('/inventory'),
    api.get('/me'),
    loadOpticasIndex()
  ]);

  const productsMap = buildProductMap(products);

  const me = meRes?.data?.user || null;
  const myOpticaId = Number(me?.optica_id || 0) || null;

  // Pedidos desde API (idealmente ya vienen filtrados por rol)
  const allOrdersRaw = await ordersService.list();
  const allOrders = (allOrdersRaw || []).map(normalizeOrder);

  // Filtro extra por seguridad (si backend no filtra)
  const myOrders = allOrders
    .filter(o => !myOpticaId || Number(o.opticaId) === Number(myOpticaId))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const opticasById = optRes.byId;

  const opticaName =
    opticasById.get(String(myOpticaId))?.nombre ||
    me?.name ||
    'Óptica';

  const renderMyOrdersTbody = ()=>{
    const tbody = outlet.querySelector('#tblMyOrders tbody');
    if(!tbody) return;

    tbody.innerHTML = myOrders.map(o=>{
      const paySt = o.paymentStatus || 'pendiente';
      const procSt = o.processStatus || 'en_proceso';

      const pmKey = (typeof o.paymentMethod === 'string') ? o.paymentMethod : String(o.paymentMethod || '');
      const pmLabel = PM_LABEL[pmKey] || pmKey || '—';

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
                  <th>Stock</th>
                  <th>Precio</th>
                  <th>Categoría</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                ${(inventory || []).map(r=>{
                  const p = r.product || {};
                  return `<tr>
                    <td>${safe(p.sku||'')}</td>
                    <td>${safe(p.name||'')}</td>
                    <td>${Number(r.stock ?? 0)}</td>
                    <td>${money(p.salePrice ?? p.sale_price ?? 0)}</td>
                    <td>${safe(p.category||'')}</td>
                    <td>${safe(p.type||'')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="small text-muted">Tip: usa el buscador/filtros de la tabla.</div>
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

          <div class="small text-muted">Tip: usa el buscador o filtra por proceso.</div>
        </div>
      </div>
    </div>
  `;

  outlet.querySelector('#btnGoPOS')?.addEventListener('click', ()=>{
    location.hash = '#/pos';
  });

  // DataTables stock
  if (window.$ && $.fn.dataTable) {
    if($.fn.DataTable.isDataTable('#tblStockOptica')){
      $('#tblStockOptica').DataTable().destroy();
    }
    $('#tblStockOptica').DataTable({
      pageLength: 10,
      order: [[2, 'asc']],
      language: {
        search: "Buscar:",
        lengthMenu: "Mostrar _MENU_",
        info: "Mostrando _START_ a _END_ de _TOTAL_",
        paginate: { previous: "Anterior", next: "Siguiente" },
        zeroRecords: "No hay registros"
      }
    });
  }

  renderMyOrdersTbody();

  // filtros pedidos
  const applyOrderFilter = () => {
    const q = (outlet.querySelector('#orderSearch')?.value || '').toLowerCase().trim();
    const proc = outlet.querySelector('#orderProcess')?.value || '';
    const rows = Array.from(outlet.querySelectorAll('#tblMyOrders tbody tr'));

    rows.forEach(r => {
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
    const o = myOrders.find(x=>String(x.id)===String(id));
    if(!o) return;
    await showOrderDetail(o, productsMap, opticasById, { role: 'optica' });
  });

  applyOrderFilter();
}

/* =========================
   VISTA EMPLEADO/ADMIN: TODOS los pedidos
   ========================= */
async function renderEmployeeOrders(outlet){
  const role = authService.getRole();

  const [{ data: products }, optRes] = await Promise.all([
    api.get('/products'),
    loadOpticasIndex()
  ]);

  const productsMap = buildProductMap(products);

  const allOrdersRaw = (await ordersService.list()) || [];
  const rows = allOrdersRaw.map(normalizeOrder).sort((a,b)=> new Date(b.date) - new Date(a.date));

  const opticasById = optRes.byId;

  const onLocalUpdate = (orderId, patch)=>{
    const idx = rows.findIndex(x=>String(x.id)===String(orderId));
    if(idx >= 0) rows[idx] = normalizeOrder({ ...rows[idx], ...patch });

    const tbody = outlet.querySelector('#tblAllOrders tbody');
    if(!tbody) return;

    tbody.innerHTML = rows.map(o=>{
      const optName = opticasById.get(String(o.opticaId))?.nombre || `Óptica #${o.opticaId || '—'}`;
      const created = (o.createdByName || o.createdByEmail || '—');
      const createdRole = (o.createdByRole || '—');
      const paySt = o.paymentStatus || 'pendiente';
      const procSt = o.processStatus || 'en_proceso';

      const pmKey = (typeof o.paymentMethod === 'string') ? o.paymentMethod : String(o.paymentMethod || '');
      const pmLabel = PM_LABEL[pmKey] || pmKey || '—';

      return `
        <tr>
          <td class="fw-semibold">#${safe(o.id)}</td>
          <td class="small">${safe(formatDateTime(o.date))}</td>
          <td>${safe(optName)}</td>
          <td class="small">${safe(created)} <span class="text-muted">(${safe(createdRole)})</span></td>
          <td class="small">${safe(pmLabel)}</td>
          <td>${badgeHtml('payment', paySt)}</td>
          <td>${badgeHtml('process', procSt)}</td>
          <td class="fw-bold">${money(o.total || 0)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-brand" data-view-order="${o.id}">Detalle</button>
          </td>
        </tr>
      `;
    }).join('');
  };

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <h4 class="mb-0">Pedidos</h4>
        <div class="text-muted small">Ver pedidos de ópticas y del sistema</div>
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
              <th>Creado por</th>
              <th>Pago (método)</th>
              <th>Pago est.</th>
              <th>Proceso</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(o=>{
              const optName = opticasById.get(String(o.opticaId))?.nombre || `Óptica #${o.opticaId || '—'}`;
              const created = (o.createdByName || o.createdByEmail || '—');
              const createdRole = (o.createdByRole || '—');
              const paySt = o.paymentStatus || 'pendiente';
              const procSt = o.processStatus || 'en_proceso';

              const pmKey = (typeof o.paymentMethod === 'string') ? o.paymentMethod : String(o.paymentMethod || '');
              const pmLabel = PM_LABEL[pmKey] || pmKey || '—';

              return `
                <tr>
                  <td class="fw-semibold">#${safe(o.id)}</td>
                  <td class="small">${safe(formatDateTime(o.date))}</td>
                  <td>${safe(optName)}</td>
                  <td class="small">${safe(created)} <span class="text-muted">(${safe(createdRole)})</span></td>
                  <td class="small">${safe(pmLabel)}</td>
                  <td>${badgeHtml('payment', paySt)}</td>
                  <td>${badgeHtml('process', procSt)}</td>
                  <td class="fw-bold">${money(o.total || 0)}</td>
                  <td class="text-end">
                    <button class="btn btn-sm btn-outline-brand" data-view-order="${o.id}">Detalle</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="small text-muted mt-2">
        Tip: usa búsqueda/filtrado de la tabla.
      </div>
    </div>
  `;

  if(window.$ && $.fn.dataTable){
    if($.fn.DataTable.isDataTable('#tblAllOrders')){
      $('#tblAllOrders').DataTable().destroy();
    }
    $('#tblAllOrders').DataTable({
      pageLength: 10,
      order: [[1,'desc']],
      language: {
        search: "Buscar:",
        lengthMenu: "Mostrar _MENU_",
        info: "Mostrando _START_ a _END_ de _TOTAL_",
        paginate: { previous: "Anterior", next: "Siguiente" },
        zeroRecords: "No hay registros"
      }
    });
  }

  outlet.addEventListener('click', async (e)=>{
    const id = e.target?.dataset?.viewOrder;
    if(!id) return;
    const o = rows.find(x=>String(x.id)===String(id));
    if(!o) return;
    await showOrderDetail(o, productsMap, opticasById, { role, onLocalUpdate });
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