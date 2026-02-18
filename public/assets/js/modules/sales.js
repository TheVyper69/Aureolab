import { api } from '../services/api.js';
import { money, formatDateTime } from '../utils/helpers.js';

export async function renderSales(outlet){
  // 1) Cargar ventas + productos (para SKU/nombre en fallback)
  // 2) (Opcional) cargar métodos de pago
  let sales = [];
  let products = [];
  let paymentMethods = [];

  const results = await Promise.allSettled([
    api.get('/sales'),
    api.get('/products'),
    api.get('/payment-methods') // si no existe, lo ignoramos
  ]);

  if(results[0].status === 'fulfilled') sales = results[0].value.data || [];
  if(results[1].status === 'fulfilled') products = results[1].value.data || [];
  if(results[2].status === 'fulfilled') paymentMethods = results[2].value.data || [];

  // Mapa: productId -> producto
  const productById = new Map((products || []).map(p => [Number(p.id), p]));

  // Mapa: payment_method_id -> label
  const pmById = new Map(
    (paymentMethods || []).map(pm => [
      Number(pm.id),
      (pm.name ?? pm.label ?? pm.title ?? `Método #${pm.id}`)
    ])
  );

  // fallback si no tienes /payment-methods
  const pmFallback = (id)=>{
    const n = Number(id);
    if(n === 1) return 'Efectivo';
    if(n === 2) return 'Tarjeta';
    if(n === 3) return 'Transferencia';
    return `Método #${n || ''}`.trim();
  };

  const safe = (v)=> String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');

  const pmLabel = (paymentMethodId)=>{
    const id = Number(paymentMethodId);
    return pmById.get(id) || pmFallback(id);
  };

  const sumTotal = (sales || []).reduce((a,s)=> a + Number(s.total || 0), 0);
  const avg = (sales || []).length ? (sumTotal / sales.length) : 0;

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h4 class="mb-0">Ventas / Reportes</h4>
      <button class="btn btn-outline-brand" id="btnLowStock">Ver stock bajo</button>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-md-4">
        <div class="card card-kpi p-3">
          <div class="text-muted small">Ventas</div>
          <div class="fs-4 fw-bold" id="kpiSales">${sales.length}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card card-kpi p-3">
          <div class="text-muted small">Ingresos</div>
          <div class="fs-4 fw-bold" id="kpiIncome">${money(sumTotal)}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card card-kpi p-3">
          <div class="text-muted small">Promedio por venta</div>
          <div class="fs-4 fw-bold" id="kpiAvg">${money(avg)}</div>
        </div>
      </div>
    </div>

    <div class="card p-3">
      <div class="table-responsive">
        <table id="tblSales" class="table table-striped align-middle" style="width:100%">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Método</th>
              <th class="text-end">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${(sales || []).map(s=>`
              <tr>
                <td class="fw-semibold">${safe(s.id)}</td>
                <td>${formatDateTime(s.created_at || s.date || s.createdAt)}</td>
                <td>${safe(s.customer_name || s.customerName || 'Mostrador')}</td>
                <td>${safe(pmLabel(s.payment_method_id || s.paymentMethodId))}</td>
                <td class="text-end fw-semibold">${money(s.total || 0)}</td>
                <td class="text-nowrap">
                  <button class="btn btn-sm btn-outline-brand" data-view="${safe(s.id)}">Detalle</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // DataTables
  if(window.$ && $.fn.dataTable){
    if($.fn.DataTable.isDataTable('#tblSales')){
      $('#tblSales').DataTable().destroy();
    }
    $('#tblSales').DataTable({
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

  // ====== DETALLE ======
  outlet.addEventListener('click', async (e)=>{
    const id = e.target?.dataset?.view;
    if(!id) return;

    try{
      // ✅ Detalle real desde API
      const { data: sale } = await api.get(`/sales/${id}`);

      const items = (sale.items || []).map(it=>{
        const name = it.name || (productById.get(Number(it.product_id))?.name) || `Producto ${it.product_id}`;
        const sku = it.sku || (productById.get(Number(it.product_id))?.sku) || '';
        const qty = Number(it.qty || 0);

        const unit = Number(it.unit_price || 0);
        const lineSubtotal = Number(it.line_subtotal ?? (unit * qty));
        const itemDisc = Number(it.item_discount_amount || 0);
        const lineTotal = Number(it.line_total ?? (lineSubtotal - itemDisc));

        const discTag = itemDisc > 0
          ? `<div class="small text-muted">Desc: <b>${money(itemDisc)}</b></div>`
          : '';

        return `
          <tr>
            <td class="fw-semibold">
              ${safe(name)} ${sku ? `<span class="small text-muted">(${safe(sku)})</span>` : ''}
              ${discTag}
            </td>
            <td class="text-center">${qty}</td>
            <td class="text-end">${money(unit)}</td>
            <td class="text-end">${money(lineSubtotal)}</td>
            <td class="text-end fw-semibold">${money(lineTotal)}</td>
          </tr>
        `;
      }).join('') || `
        <tr><td colspan="5" class="text-muted">Sin productos.</td></tr>
      `;

      Swal.fire({
        title: `Venta #${safe(sale.id)}`,
        width: 900,
        html: `
          <div class="text-start">
            <div>Fecha: <b>${formatDateTime(sale.created_at)}</b></div>
            <div>Pago: <b>${safe(pmLabel(sale.payment_method_id))}</b></div>
            ${sale.customer_name ? `<div>Cliente: <b>${safe(sale.customer_name)}</b></div>` : ''}

            <hr class="my-2"/>

            <div class="table-responsive">
              <table class="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th class="text-center" style="width:90px;">Cant.</th>
                    <th class="text-end" style="width:120px;">Precio</th>
                    <th class="text-end" style="width:140px;">Subtotal</th>
                    <th class="text-end" style="width:140px;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${items}
                </tbody>
              </table>
            </div>

            <div class="d-flex justify-content-end">
              <div style="min-width:320px;">
                <div class="d-flex justify-content-between">
                  <span class="text-muted">Subtotal</span>
                  <span class="fw-semibold">${money(sale.subtotal || 0)}</span>
                </div>
                <div class="d-flex justify-content-between">
                  <span class="text-muted">Descuento</span>
                  <span class="fw-semibold">${money(sale.discount_amount || 0)}</span>
                </div>
                <div class="d-flex justify-content-between">
                  <span class="text-muted">Total</span>
                  <span class="fw-bold">${money(sale.total || 0)}</span>
                </div>
              </div>
            </div>
          </div>
        `,
        icon: 'info',
        confirmButtonText: 'Cerrar'
      });

    }catch(err){
      console.error(err);
      Swal.fire('Error', err?.response?.data?.message || err.message || 'No se pudo cargar el detalle', 'error');
    }
  });

  // ====== STOCK BAJO ======
  outlet.querySelector('#btnLowStock').addEventListener('click', async ()=>{
    try{
      const { data: low } = await api.get('/inventory/low-stock');

      if(!Array.isArray(low) || low.length === 0){
        Swal.fire('Todo bien','No hay productos en stock bajo.','success');
        return;
      }

      const html = low.map(r=>{
        const p = r.product || r;
        const sku = p.sku || '';
        const name = p.name || '';
        const st = Number(r.stock ?? p.stock ?? 0);
        const min = Number(p.minStock ?? p.min_stock ?? 0);
        return `• <b>${safe(sku)}</b> — ${safe(name)} (stock: <b>${st}</b>, mín: ${min})`;
      }).join('<br>');

      Swal.fire({ title: 'Stock bajo', html, icon: 'warning' });

    }catch(err){
      // si aún no existe endpoint
      Swal.fire(
        'Falta endpoint',
        'Aún no existe /inventory/low-stock en tu API. Si quieres, lo armamos en InventoryController.',
        'info'
      );
    }
  });
}
