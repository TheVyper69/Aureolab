
import { api } from '../services/api.js';
import { money } from '../utils/helpers.js';

let cart = [];

export async function renderPOS(outlet){
  const { data: products } = await api.get('/products');
  const { data: inventory } = await api.get('/inventory');

  // Mapa: productId -> stock
  const stockById = new Map(
    (inventory || []).map(r => [Number(r?.product?.id), Number(r?.stock ?? 0)])
  );

  // Helpers stock
  const getStock = (productId) => Number(stockById.get(Number(productId)) ?? 0);
  const getCartQty = (productId) => Number(cart.find(x => Number(x.id) === Number(productId))?.qty ?? 0);

  const warnNoStock = (name='Producto') => {
    Swal.fire({
      icon: 'warning',
      title: 'Ya no hay en inventario',
      text: `${name} no tiene stock suficiente.`,
      confirmButtonText: 'Entendido'
    });
  };

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h4 class="mb-0">Punto de Venta</h4>
      <button id="btnCheckout" class="btn btn-brand">Cobrar</button>
    </div>

    <div class="row g-3">
      <div class="col-lg-7">
        <div class="card p-3">
          <div class="input-group mb-2">
            <input id="searchProd" class="form-control" placeholder="Buscar por SKU / nombre..." />
            <button id="btnAddFirst" class="btn btn-outline-secondary">Agregar</button>
          </div>
          <div class="d-flex gap-2 align-items-center">
            <label class="small text-muted m-0">Descuento (%)</label>
            <input id="discount" type="number" min="0" max="100" value="0"
                   class="form-control form-control-sm" style="max-width:110px;">
          </div>
        </div>

        <!-- ✅ PRODUCTOS (DataTable) -->
        <div class="card p-3 mt-3">
          <h6>Productos</h6>
          <div class="table-responsive">
            <table class="table table-sm align-middle" id="tblPosProducts" style="width:100%">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${products.map(p=>{
                  const st = getStock(p.id);
                  const disabled = st <= 0 ? 'disabled' : '';
                  return `
                    <tr>
                      <td>${p.sku}</td>
                      <td>${p.name}</td>
                      <td>${money(p.salePrice)}</td>
                      <td>${st}</td>
                      <td>
                        <button class="btn btn-sm btn-brand" data-add="${p.id}" ${disabled}>+</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="small text-muted mt-2">No permite agregar si supera el stock.</div>
        </div>

        <!-- ✅ STOCK EN POS -->
        <div class="card p-3 mt-3">
          <div class="d-flex align-items-center justify-content-between">
            <h6 class="mb-0">Stock disponible</h6>
            <span class="small text-muted">Solo lectura</span>
          </div>

          <div class="table-responsive mt-2">
            <table class="table table-sm align-middle" id="tblPosStock" style="width:100%">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Tipo</th>
                  <th>Stock</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                ${inventory.map(r => {
                  const p = r.product || {};
                  return `
                    <tr>
                      <td>${p.sku || ''}</td>
                      <td>${p.name || ''}</td>
                      <td class="small text-muted">${p.category || ''}</td>
                      <td class="small text-muted">${p.type || ''}</td>
                      <td>${r.stock ?? 0}</td>
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
          <div id="cartBox"></div>
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
            <label class="form-label">Cliente (rápido)</label>
            <input id="customerName" class="form-control"
                   placeholder="Nombre del cliente (opcional)">
          </div>
        </div>
      </div>
    </div>
  `;

  /* ================= DataTables ================= */
  if (window.$ && $.fn.dataTable) {
    // Productos
    if ($.fn.DataTable.isDataTable('#tblPosProducts')) {
      $('#tblPosProducts').DataTable().destroy();
    }
    const productsDT = $('#tblPosProducts').DataTable({
      pageLength: 8,
      language: {
        search: "Buscar:",
        lengthMenu: "Mostrar _MENU_",
        info: "Mostrando _START_ a _END_ de _TOTAL_",
        paginate: { previous: "Anterior", next: "Siguiente" },
        zeroRecords: "No hay productos"
      }
    });

    // Vincula buscador externo
    $('#searchProd').on('input', function () {
      productsDT.search(this.value).draw();
    });

    // Stock
    if ($.fn.DataTable.isDataTable('#tblPosStock')) {
      $('#tblPosStock').DataTable().destroy();
    }
    $('#tblPosStock').DataTable({
      pageLength: 8,
      order: [[4, 'asc']],
      language: {
        search: "Buscar:",
        lengthMenu: "Mostrar _MENU_",
        info: "Mostrando _START_ a _END_ de _TOTAL_",
        paginate: { previous: "Anterior", next: "Siguiente" },
        zeroRecords: "No hay registros"
      }
    });
  }

  /* ================= CARRITO ================= */
  const discountInput = outlet.querySelector('#discount');

  const renderCart = ()=>{
    const box = outlet.querySelector('#cartBox');
    if(cart.length === 0){
      box.innerHTML = `<div class="text-muted">Carrito vacío</div>`;
      outlet.querySelector('#cartSubtotal').textContent = money(0);
      outlet.querySelector('#cartDiscount').textContent = money(0);
      outlet.querySelector('#cartTotal').textContent = money(0);
      return;
    }

    box.innerHTML = cart.map(item=>{
      const st = getStock(item.id);
      const atLimit = item.qty >= st && st > 0;
      const out = st <= 0;

      return `
        <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2">
          <div>
            <div class="fw-semibold">${item.name}</div>
            <div class="small text-muted">${item.sku} · ${money(item.salePrice)} · Stock: ${st}</div>
            ${out ? `<div class="small text-danger">Sin stock</div>` : (atLimit ? `<div class="small text-warning">Límite de stock</div>` : ``)}
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-secondary" data-dec="${item.id}">-</button>
            <div class="fw-bold">${item.qty}</div>
            <button class="btn btn-sm btn-outline-secondary" data-inc="${item.id}" ${atLimit || out ? 'disabled' : ''}>+</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${item.id}">x</button>
          </div>
        </div>
      `;
    }).join('');

    const subtotal = cart.reduce((a,i)=> a + (i.salePrice*i.qty), 0);
    const pct = Math.min(100, Math.max(0, Number(discountInput.value || 0)));
    const disc = subtotal * (pct/100);
    const total = subtotal - disc;

    outlet.querySelector('#cartSubtotal').textContent = money(subtotal);
    outlet.querySelector('#cartDiscount').textContent = money(disc);
    outlet.querySelector('#cartTotal').textContent = money(total);
  };

  const canAddOneMore = (p) => {
    const st = getStock(p.id);
    const current = getCartQty(p.id);
    return current + 1 <= st;
  };

  const addToCart = (p)=>{
    const st = getStock(p.id);
    if (st <= 0) {
      warnNoStock(p.name);
      return false;
    }
    if (!canAddOneMore(p)) {
      warnNoStock(p.name);
      return false;
    }

    const found = cart.find(i=>Number(i.id)===Number(p.id));
    if(found) found.qty++;
    else cart.push({ ...p, qty: 1 });

    renderCart();
    return true;
  };

  outlet.addEventListener('click', (e)=>{
    const addId = e.target?.dataset?.add;
    const incId = e.target?.dataset?.inc;
    const decId = e.target?.dataset?.dec;
    const delId = e.target?.dataset?.del;

    if(addId){
      const p = products.find(x=>String(x.id)===String(addId));
      if(p) addToCart(p);
    }

    if(incId){
      const it = cart.find(x=>String(x.id)===String(incId));
      if(!it) return;

      const st = getStock(it.id);
      if (st <= 0 || it.qty + 1 > st) {
        warnNoStock(it.name);
        return;
      }
      it.qty++;
      renderCart();
    }

    if(decId){
      const it = cart.find(x=>String(x.id)===String(decId));
      if(it){ it.qty = Math.max(1, it.qty-1); renderCart(); }
    }

    if(delId){
      cart = cart.filter(x=>String(x.id)!==String(delId));
      renderCart();
    }
  });

  discountInput.addEventListener('input', renderCart);

  outlet.querySelector('#btnAddFirst').addEventListener('click', ()=>{
    const q = String(outlet.querySelector('#searchProd').value || '').toLowerCase().trim();
    if(!q){
      Swal.fire('Buscar', 'Escribe SKU o nombre para agregar.', 'info');
      return;
    }

    const p = products.find(x => x.sku.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
    if(!p){
      Swal.fire('Sin resultados','No se encontró producto con ese criterio.','info');
      return;
    }

    addToCart(p);
  });

  outlet.querySelector('#btnCheckout').addEventListener('click', async ()=>{
    if(cart.length === 0){
      Swal.fire('Carrito vacío','Agrega productos antes de cobrar.','info');
      return;
    }

    // ✅ Validación final de stock antes de cobrar
    for (const it of cart) {
      const st = getStock(it.id);
      if (st <= 0 || it.qty > st) {
        warnNoStock(it.name);
        return;
      }
    }

    const method = outlet.querySelector('#payMethod').value;
    const customerName = outlet.querySelector('#customerName').value || 'Mostrador';
    const subtotal = cart.reduce((acc,i)=> acc + (i.salePrice*i.qty), 0);
    const pct = Math.min(100, Math.max(0, Number(discountInput.value || 0)));
    const disc = subtotal * (pct/100);
    const total = subtotal - disc;

    const confirm = await Swal.fire({
      title: 'Confirmar venta',
      html: `Cliente: <b>${customerName}</b><br/>Total: <b>${money(total)}</b><br/>Pago: <b>${method}</b>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Procesar'
    });

    if(!confirm.isConfirmed) return;

    await api.post('/sales', {
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
    Swal.fire('Venta registrada','Ticket/impresión se integra en fase 2.','success');
  });

  renderCart();
}