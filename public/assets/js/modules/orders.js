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

function unique(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function safe(v){
  return String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

async function loadOpticasDb(){
  const db = await (await fetch('../api/mock-data.json', { cache: 'no-store' })).json();
  return db?.opticas || [];
}

function buildProductMap(products){
  const m = new Map();
  (products || []).forEach(p => m.set(String(p.id), p));
  return m;
}

/* ====== update helper (mock-friendly) ====== */
async function updateOrderPatch(orderId, patch){
  // Intenta varios nombres para no romperte si cambia tu service
  if (typeof ordersService.update === 'function') {
    return await ordersService.update(orderId, patch);
  }
  if (typeof ordersService.patch === 'function') {
    return await ordersService.patch(orderId, patch);
  }
  if (typeof ordersService.updateStatus === 'function') {
    return await ordersService.updateStatus(orderId, patch);
  }
  // fallback: no persistente
  console.warn('ordersService no tiene update/patch/updateStatus. Update será solo visual en esta sesión.');
  return null;
}

function normalizeOrder(o){
  return {
    ...o,
    paymentStatus: o.paymentStatus || 'pendiente',
    processStatus: o.processStatus || 'en_proceso'
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

async function showOrderDetail(order, productsMap, opticasById, ctx){
  // ctx: { role, onLocalUpdate(orderId, patch) }
  const role = ctx?.role || authService.getRole();

  const o = normalizeOrder(order);
  const opticaName = opticasById.get(String(o.opticaId))?.nombre || `Óptica #${o.opticaId || '—'}`;

  const items = (o.items || []).map(it=>{
    const p = productsMap.get(String(it.productId)) || {};
    const line = (Number(it.qty||0) * Number(it.price||0));
    return `
      <tr>
        <td>${safe(p.sku || it.productId)}</td>
        <td>${safe(p.name || 'Producto')}</td>
        <td class="text-end">${Number(it.qty||0)}</td>
        <td class="text-end">${money(it.price||0)}</td>
        <td class="text-end fw-semibold">${money(line)}</td>
      </tr>
    `;
  }).join('') || `
    <tr><td colspan="5" class="text-muted">Sin items</td></tr>
  `;

  const createdBy = o.createdByName || o.createdByEmail || '—';
  const createdRole = o.createdByRole || '—';

  const paySt = o.paymentStatus || 'pendiente';
  const procSt = o.processStatus || 'en_proceso';

  // Reglas UI:
  const canAdminEditPayment = role === 'admin';
  const canEditProcess = (role === 'admin' || role === 'employee');
  const employeeLocked = (role === 'employee' && procSt === 'entregado');

  // Opciones proceso:
  const procOptionsEmployee = ['en_proceso','listo_para_entregar','entregado'];
  const procOptionsAdmin = ['en_proceso','listo_para_entregar','entregado','revision'];

  const procOptions = (role === 'admin') ? procOptionsAdmin : procOptionsEmployee;

  const controlsHtml = `
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
              : `
                <div>${badgeHtml('payment', paySt)} <span class="small text-muted ms-2">(solo admin)</span></div>
              `
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
                    ? `<div class="small text-muted mt-1">El pedido está <b>Entregado</b>. Solo admin puede moverlo a <b>Revisión</b>.</div>`
                    : (role==='employee'
                        ? `<div class="small text-muted mt-1">Nota: si lo cambias a <b>Entregado</b>, ya no podrás modificarlo.</div>`
                        : `<div class="small text-muted mt-1">Admin puede usar <b>Revisión</b> para inconformidades.</div>`
                      )
                }
              `
              : `
                <div>${badgeHtml('process', procSt)}</div>
              `
          }
        </div>
      </div>

      <div class="d-flex justify-content-end mt-3">
        <button class="btn btn-sm btn-brand" id="btnSaveStatus" ${(!canAdminEditPayment && !canEditProcess) ? 'disabled' : ''}>
          Guardar cambios
        </button>
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
          <div class="fw-semibold">${safe(PM_LABEL[o.paymentMethod] || o.paymentMethod || '—')}</div>
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

  // SweetAlert con hook didOpen para bind
  await Swal.fire({
    title: `Detalle del pedido #${o.id}`,
    html,
    width: 900,
    icon: 'info',
    confirmButtonText: 'Cerrar',
    didOpen: () => {
      const btn = Swal.getHtmlContainer()?.querySelector('#btnSaveStatus');
      if(!btn) return;

      btn.addEventListener('click', async () => {
        // lee selects si existen
        const selPay = Swal.getHtmlContainer()?.querySelector('#selPaymentStatus');
        const selProc = Swal.getHtmlContainer()?.querySelector('#selProcessStatus');

        const nextPay = selPay ? selPay.value : paySt;
        const nextProc = selProc ? selProc.value : procSt;

        // ===== Reglas hard (seguridad en UI) =====
        // 1) paymentStatus SOLO admin
        if(nextPay !== paySt && role !== 'admin'){
          Swal.fire('No permitido', 'Solo admin puede cambiar el estatus de pago.', 'warning');
          return;
        }

        // 2) processStatus: admin/employee
        if(nextProc !== procSt){
          if(!(role === 'admin' || role === 'employee')){
            Swal.fire('No permitido', 'Tu rol no puede cambiar el estatus de proceso.', 'warning');
            return;
          }
          // 3) employee NO puede tocar si está entregado
          if(role === 'employee' && procSt === 'entregado'){
            Swal.fire('Bloqueado', 'El pedido está Entregado. Solo admin puede moverlo a Revisión.', 'warning');
            return;
          }
          // 4) revision solo admin
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
          html: `
            Pago: ${badgeHtml('payment', nextPay)}<br/>
            Proceso: ${badgeHtml('process', nextProc)}
          `,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Guardar'
        });
        if(!confirm.isConfirmed) return;

        const patch = {};
        if(nextPay !== paySt) patch.paymentStatus = nextPay;
        if(nextProc !== procSt) patch.processStatus = nextProc;

        try{
          await updateOrderPatch(o.id, patch);
          // actualiza local (tabla) para esta vista
          if(typeof ctx?.onLocalUpdate === 'function') ctx.onLocalUpdate(o.id, patch);

          Swal.fire('Listo', 'Estatus actualizado (mock).', 'success');
        }catch(err){
          console.error(err);
          Swal.fire('Error', 'No se pudo actualizar el estatus.', 'error');
        }
      });
    }
  });
}

/* =========================
   VISTA ÓPTICA
   ========================= */
async function renderOpticaOrders(outlet){
  const { data: products } = await api.get('/products');
  const { data: inventory } = await api.get('/inventory');
  const allOrdersRaw = await ordersService.list();

  const me = authService.getUser();
  const email = (me?.email || '').toLowerCase();
  const opticas = await loadOpticasDb();

  const optica =
    (opticas || []).find(o => String(o.email || '').toLowerCase() === email) ||
    (opticas || [])[0];

  const opticaId = optica?.id || 1;
  const allowed = optica?.paymentMethods || ['cash', 'transfer'];

  const allOrders = (allOrdersRaw || []).map(normalizeOrder);

  const myOrders = allOrders
    .filter(o => Number(o.opticaId) === Number(opticaId))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const categories = unique(products.map(p => p.category));
  const types = unique(products.map(p => p.type));

  const productsMap = buildProductMap(products);
  const opticasById = new Map((opticas || []).map(o => [String(o.id), o]));

  // helper: update local array (para que cambie en tabla sin recargar)
  const onLocalUpdate = (orderId, patch)=>{
    const idx = myOrders.findIndex(x=>String(x.id)===String(orderId));
    if(idx >= 0) myOrders[idx] = normalizeOrder({ ...myOrders[idx], ...patch });
    const idxAll = allOrders.findIndex(x=>String(x.id)===String(orderId));
    if(idxAll >= 0) allOrders[idxAll] = normalizeOrder({ ...allOrders[idxAll], ...patch });

    // refresca la tabla simple (sin DataTables) re-render rápido
    // (mis pedidos aquí NO usa DataTables)
    const tbody = outlet.querySelector('#tblMyOrders tbody');
    if(!tbody) return;

    tbody.innerHTML = myOrders.map(o => {
      const paySt = o.paymentStatus || 'pendiente';
      const procSt = o.processStatus || 'en_proceso';
      return `
        <tr data-process="${procSt}">
          <td class="fw-semibold">#${o.id}</td>
          <td class="small">${formatDateTime(o.date)}</td>
          <td>${money(o.total)}</td>
          <td class="small">${PM_LABEL[o.paymentMethod] || o.paymentMethod}</td>
          <td>${badgeHtml('payment', paySt)}</td>
          <td>${badgeHtml('process', procSt)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-brand" data-view-order="${o.id}">Ver</button>
          </td>
        </tr>
      `;
    }).join('');
  };

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <h4 class="mb-0">Óptica: ${optica?.nombre || 'Óptica'}</h4>
        <div class="text-muted small">Stock (solo lectura) + pedidos</div>
      </div>
      <button class="btn btn-brand" id="btnNewOrder">Nuevo pedido</button>
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
                ${inventory.map(r=>{
                  const p = r.product || {};
                  return `<tr>
                    <td>${p.sku||''}</td>
                    <td>${p.name||''}</td>
                    <td>${r.stock ?? 0}</td>
                    <td>${money(p.salePrice ?? 0)}</td>
                    <td>${p.category||''}</td>
                    <td>${p.type||''}</td>
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
          <h6 class="mb-0">Mis pedidos anteriores</h6>

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
              <tbody>
                ${myOrders.map(o => {
                  const paySt = o.paymentStatus || 'pendiente';
                  const procSt = o.processStatus || 'en_proceso';
                  return `
                    <tr data-process="${procSt}">
                      <td class="fw-semibold">#${o.id}</td>
                      <td class="small">${formatDateTime(o.date)}</td>
                      <td>${money(o.total)}</td>
                      <td class="small">${PM_LABEL[o.paymentMethod] || o.paymentMethod}</td>
                      <td>${badgeHtml('payment', paySt)}</td>
                      <td>${badgeHtml('process', procSt)}</td>
                      <td class="text-end">
                        <button class="btn btn-sm btn-outline-brand" data-view-order="${o.id}">Ver</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="small text-muted">Tip: usa el buscador o filtra por proceso.</div>
        </div>
      </div>
    </div>

    <div class="modal fade" id="orderModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Nuevo pedido</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>

          <div class="modal-body">
            <div class="row g-3">
              <div class="col-md-3">
                <label class="form-label">Método de pago</label>
                <select class="form-select" id="payMethod">
                  ${allowed.includes('cash') ? `<option value="cash">Efectivo</option>` : ''}
                  ${allowed.includes('transfer') ? `<option value="transfer">Transferencia</option>` : ''}
                </select>
                <div class="form-text">Configurado por el admin.</div>
              </div>

              <div class="col-md-5">
                <label class="form-label">Notas</label>
                <input class="form-control" id="notes" placeholder="Indicaciones (opcional)">
              </div>

              <div class="col-md-4">
                <label class="form-label">Buscar producto</label>
                <input class="form-control" id="prodSearch" placeholder="Nombre o SKU...">
              </div>

              <div class="col-md-4">
                <label class="form-label">Filtrar por categoría</label>
                <select class="form-select" id="filterCategory">
                  <option value="">Todas</option>
                  ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
              </div>

              <div class="col-md-4">
                <label class="form-label">Filtrar por tipo</label>
                <select class="form-select" id="filterType">
                  <option value="">Todos</option>
                  ${types.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
              </div>

              <div class="col-md-4 d-flex align-items-end justify-content-end">
                <div class="fw-semibold me-2">Total:</div>
                <div class="fw-bold" id="orderTotal">${money(0)}</div>
              </div>

              <div class="col-12">
                <div class="table-responsive">
                  <table class="table table-sm align-middle" id="orderProducts">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th>Tipo</th>
                        <th>Precio</th>
                        <th style="width:140px;">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${products.map(p => `
                        <tr class="prod-row"
                            data-sku="${(p.sku || '').toLowerCase()}"
                            data-name="${(p.name || '').toLowerCase()}"
                            data-category="${p.category || ''}"
                            data-type="${p.type || ''}">
                          <td>${p.sku}</td>
                          <td>${p.name}</td>
                          <td class="small text-muted">${p.category || ''}</td>
                          <td class="small text-muted">${p.type || ''}</td>
                          <td>${money(p.salePrice)}</td>
                          <td>
                            <input class="form-control form-control-sm qty"
                                   type="number" min="0" value="0"
                                   data-pid="${p.id}" data-price="${p.salePrice}">
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
                <div class="small text-muted">Puedes buscar por nombre o SKU, y filtrar por categoría/tipo.</div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-brand" id="btnSendOrder">Enviar pedido</button>
          </div>
        </div>
      </div>
    </div>
  `;

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

  // filtros pedidos anteriores
  const applyOrderFilter = () => {
    const q = (document.getElementById('orderSearch').value || '').toLowerCase().trim();
    const proc = document.getElementById('orderProcess').value;
    const rows = Array.from(document.querySelectorAll('#tblMyOrders tbody tr'));

    rows.forEach(r => {
      const txt = r.innerText.toLowerCase();
      const okQ = !q || txt.includes(q);
      const okP = !proc || (r.dataset.process === proc);
      r.style.display = (okQ && okP) ? '' : 'none';
    });
  };

  document.getElementById('orderSearch').addEventListener('input', applyOrderFilter);
  document.getElementById('orderProcess').addEventListener('change', applyOrderFilter);

  // modal
  const modal = new bootstrap.Modal(document.getElementById('orderModal'));

  outlet.querySelector('#btnNewOrder').addEventListener('click', () => {
    modal.show();
    applyProductFilter();
  });

  const calcTotal = () => {
    const qtyInputs = Array.from(document.querySelectorAll('#orderProducts .qty'));
    let total = 0;

    for (const inp of qtyInputs) {
      const q = Number(inp.value || 0);
      const price = Number(inp.dataset.price || 0);
      total += q * price;
    }

    document.getElementById('orderTotal').textContent = money(total);
    return total;
  };

  const applyProductFilter = () => {
    const s = (document.getElementById('prodSearch').value || '').toLowerCase().trim();
    const c = document.getElementById('filterCategory').value;
    const t = document.getElementById('filterType').value;

    const rows = Array.from(document.querySelectorAll('#orderProducts tbody tr.prod-row'));
    rows.forEach(r => {
      const sku = r.dataset.sku || '';
      const name = r.dataset.name || '';
      const rc = r.dataset.category || '';
      const rt = r.dataset.type || '';
      const okS = !s || sku.includes(s) || name.includes(s);
      const okC = !c || rc === c;
      const okT = !t || rt === t;
      r.style.display = (okS && okC && okT) ? '' : 'none';
    });
  };

  document.getElementById('prodSearch').addEventListener('input', applyProductFilter);
  document.getElementById('filterCategory').addEventListener('change', applyProductFilter);
  document.getElementById('filterType').addEventListener('change', applyProductFilter);

  document.addEventListener('input', (e) => {
    if (e.target && e.target.matches('#orderProducts .qty')) calcTotal();
  });

  // crear pedido
  document.getElementById('btnSendOrder').addEventListener('click', async () => {
    const qtyInputs = Array.from(document.querySelectorAll('#orderProducts .qty'));
    const items = qtyInputs
      .map(inp => ({
        productId: Number(inp.dataset.pid),
        qty: Number(inp.value || 0),
        price: Number(inp.dataset.price || 0)
      }))
      .filter(it => it.qty > 0);

    if (items.length === 0) {
      Swal.fire('Sin productos', 'Agrega al menos un producto.', 'info');
      return;
    }

    const total = items.reduce((a, it) => a + it.qty * it.price, 0);
    const paymentMethod = document.getElementById('payMethod').value;
    const notes = document.getElementById('notes').value;

    const confirm = await Swal.fire({
      title: 'Confirmar pedido',
      html: `Óptica: <b>${safe(optica?.nombre || 'Óptica')}</b><br/>
             Pago (método): <b>${safe(PM_LABEL[paymentMethod] || paymentMethod)}</b><br/>
             Estatus pago: <b>Pendiente</b><br/>
             Estatus proceso: <b>En proceso</b><br/>
             Total: <b>${money(total)}</b>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar'
    });

    if (!confirm.isConfirmed) return;

    const u = authService.getUser() || {};
    await ordersService.create({
      opticaId,
      date: new Date().toISOString(),
      items,
      total,
      paymentMethod,

      paymentStatus: 'pendiente',
      processStatus: 'en_proceso',

      notes,
      createdByRole: authService.getRole(),
      createdByName: u.name || u.nombre || '',
      createdByEmail: u.email || ''
    });

    modal.hide();
    Swal.fire('Enviado', 'Pedido registrado (mock).', 'success');
  });

  // ver detalle (óptica solo ve, no cambia)
  outlet.addEventListener('click', async (e)=>{
    const id = e.target?.dataset?.viewOrder;
    if(!id) return;
    const o = myOrders.find(x=>String(x.id)===String(id));
    if(!o) return;
    await showOrderDetail(o, productsMap, opticasById, { role: 'optica', onLocalUpdate });
  });

  calcTotal();
  applyProductFilter();
  applyOrderFilter();
}

/* =========================
   VISTA EMPLEADO/ADMIN: TODOS los pedidos
   ========================= */
async function renderEmployeeOrders(outlet){
  const role = authService.getRole();

  const { data: products } = await api.get('/products');
  const productsMap = buildProductMap(products);

  const allOrdersRaw = (await ordersService.list()) || [];
  const allOrders = allOrdersRaw.map(normalizeOrder);

  const opticas = await loadOpticasDb();
  const opticasById = new Map((opticas || []).map(o => [String(o.id), o]));

  const rows = allOrders.slice().sort((a,b)=> new Date(b.date) - new Date(a.date));

  const onLocalUpdate = (orderId, patch)=>{
    const idx = rows.findIndex(x=>String(x.id)===String(orderId));
    if(idx >= 0) rows[idx] = normalizeOrder({ ...rows[idx], ...patch });

    // refresca SOLO la fila visualmente: aquí hacemos re-render completo del tbody (simple y seguro)
    const tbody = outlet.querySelector('#tblAllOrders tbody');
    if(!tbody) return;

    tbody.innerHTML = rows.map(o=>{
      const optName = opticasById.get(String(o.opticaId))?.nombre || `Óptica #${o.opticaId || '—'}`;
      const created = (o.createdByName || o.createdByEmail || '—');
      const createdRole = (o.createdByRole || '—');

      const paySt = o.paymentStatus || 'pendiente';
      const procSt = o.processStatus || 'en_proceso';

      return `
        <tr>
          <td class="fw-semibold">#${safe(o.id)}</td>
          <td class="small">${safe(formatDateTime(o.date))}</td>
          <td>${safe(optName)}</td>
          <td class="small">${safe(created)} <span class="text-muted">(${safe(createdRole)})</span></td>
          <td class="small">${safe(PM_LABEL[o.paymentMethod] || o.paymentMethod || '—')}</td>
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

              return `
                <tr>
                  <td class="fw-semibold">#${safe(o.id)}</td>
                  <td class="small">${safe(formatDateTime(o.date))}</td>
                  <td>${safe(optName)}</td>
                  <td class="small">${safe(created)} <span class="text-muted">(${safe(createdRole)})</span></td>
                  <td class="small">${safe(PM_LABEL[o.paymentMethod] || o.paymentMethod || '—')}</td>
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

  // DataTables
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

  // Detalle + edición controlada
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