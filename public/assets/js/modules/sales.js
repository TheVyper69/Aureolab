import { api } from '../services/api.js';
import { money, formatDateTime } from '../utils/helpers.js';

export async function renderSales(outlet){
  const { data: sales } = await api.get('/sales');

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
                <td>${s.method}</td>
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

    const items = (sale.items || []).map(it => `• Producto ${it.productId} x${it.qty} — ${money(it.price)}`).join('<br/>') || 'Sin items (mock)';
    Swal.fire({
      title: `Venta #${sale.id}`,
      html: `Fecha: <b>${formatDateTime(sale.date)}</b><br/>Pago: <b>${sale.method}</b><br/><br/>${items}<br/><br/>Total: <b>${money(sale.total)}</b>`,
      icon: 'info'
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
