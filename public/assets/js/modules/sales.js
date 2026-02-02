import { api } from '../services/api.js';
import { money, formatDateTime } from '../utils/helpers.js';

export async function renderSales(outlet){
  const [{ data: sales }, { data: products }] = await Promise.all([
    api.get('/sales'),
    api.get('/products')
  ]);

  // Mapa: productId -> producto
  const productById = new Map((products || []).map(p => [Number(p.id), p]));
  const pmLabel = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h4 class="mb-0">Ventas / Reportes</h4>
      <button class="btn btn-outline-brand" id="btnLowStock">Ver stock bajo</button>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-md-4">
        <div class="card card-kpi p-3">
          <div class="text-muted small">Ventas (mock)</div>
          <div class="fs-4 fw-bold" id="kpiSales">${sales.length}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card card-kpi p-3">
          <div class="text-muted small">Ingresos (mock)</div>
          <div class="fs-4 fw-bold" id="kpiIncome">${money(sales.reduce((a,s)=>a+Number(s.total||0),0))}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card card-kpi p-3">
          <div class="text-muted small">Promedio por venta</div>
          <div class="fs-4 fw-bold" id="kpiAvg">${money(sales.length ? sales.reduce((a,s)=>a+Number(s.total||0),0)/sales.length : 0)}</div>
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
              <th>Método</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sales.map(s=>`
              <tr>
                <td>${s.id}</td>
                <td>${formatDateTime(s.date)}</td>
                <td>${pmLabel[s.method] || s.method}</td>
                <td>${money(s.total)}</td>
                <td><button class="btn btn-sm btn-outline-brand" data-view="${s.id}">Detalle</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if(window.$ && $.fn.dataTable){
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

  outlet.addEventListener('click', async (e)=>{
    const id = e.target?.dataset?.view;
    if(!id) return;

    const sale = sales.find(x=>String(x.id)===String(id));
    if(!sale) return;

    const items = (sale.items || []).map(it=>{
      const p = productById.get(Number(it.productId)) || {};
      const name = p.name || `Producto ${it.productId}`;
      const sku = p.sku ? ` (${p.sku})` : '';
      const qty = Number(it.qty || 0);
      const price = Number(it.price || 0);
      const line = qty * price;

      return `
        <tr>
          <td class="fw-semibold">${name}${sku}</td>
          <td class="text-center">${qty}</td>
          <td class="text-end">${money(price)}</td>
          <td class="text-end fw-semibold">${money(line)}</td>
        </tr>
      `;
    }).join('') || `
      <tr><td colspan="4" class="text-muted">Sin productos (mock).</td></tr>
    `;

    const subtotal = (sale.items || []).reduce((a,it)=>a+(Number(it.qty||0)*Number(it.price||0)),0);
    const discount = Number(sale.discountAmount || 0);
    const total = Number(sale.total || 0);

    Swal.fire({
      title: `Venta #${sale.id}`,
      width: 850,
      html: `
        <div class="text-start">
          <div>Fecha: <b>${formatDateTime(sale.date)}</b></div>
          <div>Pago: <b>${pmLabel[sale.method] || sale.method}</b></div>
          ${sale.customerName ? `<div>Cliente: <b>${sale.customerName}</b></div>` : ''}

          <hr class="my-2"/>

          <div class="table-responsive">
            <table class="table table-sm align-middle">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th class="text-center" style="width:90px;">Cant.</th>
                  <th class="text-end" style="width:120px;">Precio</th>
                  <th class="text-end" style="width:140px;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${items}
              </tbody>
            </table>
          </div>

          <div class="d-flex justify-content-end">
            <div style="min-width:280px;">
              <div class="d-flex justify-content-between">
                <span class="text-muted">Subtotal</span>
                <span class="fw-semibold">${money(subtotal)}</span>
              </div>
              <div class="d-flex justify-content-between">
                <span class="text-muted">Descuento</span>
                <span class="fw-semibold">${money(discount)}</span>
              </div>
              <div class="d-flex justify-content-between">
                <span class="text-muted">Total</span>
                <span class="fw-bold">${money(total)}</span>
              </div>
            </div>
          </div>
        </div>
      `,
      icon: 'info',
      confirmButtonText: 'Cerrar'
    });
  });

  outlet.querySelector('#btnLowStock').addEventListener('click', async ()=>{
    const { data: low } = await api.get('/inventory/low-stock');
    if(low.length === 0){
      Swal.fire('Todo bien','No hay productos en stock bajo (mock).','success');
      return;
    }
    const html = low.map(r=>{
      const p = r.product || {};
      return `• <b>${p.sku}</b> — ${p.name} (stock: <b>${r.stock}</b>, mín: ${p.minStock})`;
    }).join('<br/>');
    Swal.fire({ title: 'Stock bajo', html, icon: 'warning' });
  });
}