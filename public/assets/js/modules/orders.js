/* Ruta: public/assets/js/modules/orders.js */

import { api } from '../services/api.js';
import { ordersService } from '../services/ordersService.js';
import { money, formatDateTime } from '../utils/helpers.js';
import { authService } from '../services/authService.js';

const PM_LABEL = { cash: 'Efectivo', transfer: 'Transferencia' };

const STATUS_LABEL = {
  en_proceso: 'En proceso',
  pagado: 'Pagado',
  completado: 'Completado'
};

const STATUS_BADGE = {
  en_proceso: 'text-bg-warning',
  pagado: 'text-bg-info',
  completado: 'text-bg-success'
};

function unique(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

export async function renderOrders(outlet) {
  const { data: products } = await api.get('/products');
  const { data: inventory } = await api.get('/inventory');
  const allOrders = await ordersService.list();

  // Mock: óptica por email (backend: opticaId desde token)
  const me = authService.getUser();
  const email = (me?.email || '').toLowerCase();
  const db = await (await fetch('../api/mock-data.json', { cache: 'no-store' })).json();
  const optica =
    (db.opticas || []).find(o => String(o.email || '').toLowerCase() === email) ||
    (db.opticas || [])[0];
  const opticaId = optica?.id || 1;

  const myOrders = (allOrders || [])
    .filter(o => Number(o.opticaId) === Number(opticaId))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const allowed = optica?.paymentMethods || ['cash', 'transfer'];

  const categories = unique(products.map(p => p.category));
  const types = unique(products.map(p => p.type));

  // Mapa para resolver producto por id al mostrar detalle
  const productById = new Map((products || []).map(p => [Number(p.id), p]));

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <h4 class="mb-0">Óptica: ${optica?.nombre || 'Óptica'}</h4>
        <div class="text-muted small">Solo lectura de stock + pedidos</div>
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
                ${inventory.map(r => {
                  const p = r.product || {};
                  return `<tr>
                    <td>${p.sku || ''}</td>
                    <td>${p.name || ''}</td>
                    <td>${r.stock ?? 0}</td>
                    <td>${money(p.salePrice ?? 0)}</td>
                    <td>${p.category || ''}</td>
                    <td>${p.type || ''}</td>
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
              <select class="form-select form-select-sm" id="orderStatus">
                <option value="">Estatus (todos)</option>
                <option value="en_proceso">En proceso</option>
                <option value="pagado">Pagado</option>
                <option value="completado">Completado</option>
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
                  <th>Estatus</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                ${myOrders.map(o => `
                  <tr data-status="${o.status || ''}">
                    <td class="fw-semibold">#${o.id}</td>
                    <td class="small">${formatDateTime(o.date)}</td>
                    <td>${money(o.total)}</td>
                    <td class="small">${PM_LABEL[o.paymentMethod] || o.paymentMethod}</td>
                    <td class="small">
                      <span class="badge ${STATUS_BADGE[o.status] || 'text-bg-secondary'}">
                        ${STATUS_LABEL[o.status] || o.status || 'En proceso'}
                      </span>
                    </td>
                    <td>
                      <button class="btn btn-sm btn-outline-brand btnViewOrder" data-oid="${o.id}">
                        Ver
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="small text-muted">Tip: usa el buscador o filtra por estatus.</div>
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

    <!-- Modal detalle pedido -->
    <div class="modal fade" id="orderDetailModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="orderDetailTitle">Detalle del pedido</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body" id="orderDetailBody"></div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // ✅ DataTables para stock
  if (window.$ && $.fn.dataTable) {
    $('#tblStockOptica').DataTable({
      pageLength: 10,
      order: [[2, 'asc']], // stock
      language: {
        search: "Buscar:",
        lengthMenu: "Mostrar _MENU_",
        info: "Mostrando _START_ a _END_ de _TOTAL_",
        paginate: { previous: "Anterior", next: "Siguiente" },
        zeroRecords: "No hay registros"
      }
    });
  }

  // ---- filtros pedidos anteriores (buscador + estatus) ----
  const applyOrderFilter = () => {
    const q = (document.getElementById('orderSearch').value || '').toLowerCase().trim();
    const st = document.getElementById('orderStatus').value;
    const rows = Array.from(document.querySelectorAll('#tblMyOrders tbody tr'));

    rows.forEach(r => {
      const txt = r.innerText.toLowerCase();
      const okQ = !q || txt.includes(q);
      const okS = !st || (r.dataset.status === st);
      r.style.display = (okQ && okS) ? '' : 'none';
    });
  };

  document.getElementById('orderSearch').addEventListener('input', applyOrderFilter);
  document.getElementById('orderStatus').addEventListener('change', applyOrderFilter);

  // ---- modal: filtros productos + total ----
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
      html: `Óptica: <b>${optica?.nombre || 'Óptica'}</b><br/>
             Pago: <b>${PM_LABEL[paymentMethod] || paymentMethod}</b><br/>
             Estatus inicial: <b>En proceso</b><br/>
             Total: <b>${money(total)}</b>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar'
    });

    if (!confirm.isConfirmed) return;

    await ordersService.create({
      opticaId,
      date: new Date().toISOString(),
      items,
      total,
      paymentMethod,
      status: 'en_proceso',
      notes
    });

    modal.hide();
    Swal.fire('Enviado', 'Pedido registrado (mock).', 'success');
  });

  // ---- Detalle de pedido (modal) ----
  const detailModal = new bootstrap.Modal(document.getElementById('orderDetailModal'));
  const detailTitle = document.getElementById('orderDetailTitle');
  const detailBody = document.getElementById('orderDetailBody');

  const renderOrderDetail = (order) => {
    const status = order.status || 'en_proceso';
    const items = order.items || [];

    const rows = items.map(it => {
      const p = productById.get(Number(it.productId)) || {};
      const qty = Number(it.qty || 0);
      const price = Number(it.price || 0);
      const lineTotal = qty * price;

      return `
        <tr>
          <td class="small">${p.sku || ''}</td>
          <td>${p.name || 'Producto'}</td>
          <td class="text-end">${qty}</td>
          <td class="text-end">${money(price)}</td>
          <td class="text-end fw-semibold">${money(lineTotal)}</td>
        </tr>
      `;
    }).join('');

    detailTitle.textContent = `Pedido #${order.id}`;

    detailBody.innerHTML = `
      <div class="row g-2 mb-3">
        <div class="col-md-6">
          <div class="small text-muted">Fecha</div>
          <div class="fw-semibold">${formatDateTime(order.date)}</div>
        </div>
        <div class="col-md-3">
          <div class="small text-muted">Pago</div>
          <div class="fw-semibold">${PM_LABEL[order.paymentMethod] || order.paymentMethod}</div>
        </div>
        <div class="col-md-3">
          <div class="small text-muted">Estatus</div>
          <div>
            <span class="badge ${STATUS_BADGE[status] || 'text-bg-secondary'}">
              ${STATUS_LABEL[status] || status}
            </span>
          </div>
        </div>

        <div class="col-12">
          <div class="small text-muted">Notas</div>
          <div>${order.notes ? order.notes : '<span class="text-muted">—</span>'}</div>
        </div>
      </div>

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
          <tbody>
            ${rows || `<tr><td colspan="5" class="text-muted">Sin items</td></tr>`}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="text-end fw-semibold">Total</td>
              <td class="text-end fw-bold">${money(order.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  };

  // Delegación de click al botón "Ver"
  document.getElementById('tblMyOrders')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btnViewOrder');
    if (!btn) return;

    const id = Number(btn.dataset.oid);
    const order = (myOrders || []).find(o => Number(o.id) === id);

    if (!order) {
      Swal.fire('No encontrado', 'No se encontró el pedido.', 'info');
      return;
    }

    renderOrderDetail(order);
    detailModal.show();
  });

  // init
  calcTotal();
  applyProductFilter();
  applyOrderFilter();
}
