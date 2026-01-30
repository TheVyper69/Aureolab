import { inventoryService } from '../services/inventoryService.js';
import { authService } from '../services/authService.js';
import { money } from '../utils/helpers.js';

export async function renderInventory(outlet){
  const role = authService.getRole();
  const rows = await inventoryService.list();

  const canEdit = role === 'admin';

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h4 class="mb-0">Inventario</h4>
      ${canEdit ? `<button class="btn btn-brand" id="btnNew">Nuevo producto</button>` : ''}
    </div>

    <div class="card p-3">
      <div class="table-responsive">
        <table id="tblInventory" class="table table-striped align-middle" style="width:100%">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Stock</th>
              <th>Mín</th>
              <th>Máx</th>
              <th>Venta</th>
              <th>Proveedor</th>
              ${canEdit ? '<th>Acciones</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>{
              const p = r.product || {};
              const low = (r.stock <= (p.minStock ?? 0));
              return `
                <tr>
                  <td>${p.sku ?? ''}</td>
                  <td>${p.name ?? ''} ${low ? '<span class="badge text-bg-warning ms-2">Bajo</span>' : ''}</td>
                  <td>${p.category ?? ''}</td>
                  <td>${r.stock ?? 0}</td>
                  <td>${p.minStock ?? ''}</td>
                  <td>${p.maxStock ?? ''}</td>
                  <td>${money(p.salePrice ?? 0)}</td>
                  <td>${p.supplier ?? ''}</td>
                  ${canEdit ? `
                    <td>
                      <button class="btn btn-sm btn-outline-brand" data-edit="${p.id}">Editar</button>
                      <button class="btn btn-sm btn-outline-danger" data-del="${p.id}">Borrar</button>
                    </td>` : ''}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="small text-muted mt-2">
        Nota: en modo mock, el CRUD no persiste; queda listo para conectar backend.
      </div>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="productModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalTitle">Producto</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <form id="productForm">
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label">SKU</label>
                  <input class="form-control" id="sku" required>
                </div>
                <div class="col-md-8">
                  <label class="form-label">Nombre</label>
                  <input class="form-control" id="name" required>
                </div>

                <div class="col-md-4">
                  <label class="form-label">Categoría</label>
                  <select class="form-select" id="category">
                    <option>MICAS</option>
                    <option>LENTES_CONTACTO</option>
                    <option>ARMAZONES</option>
                    <option>ACCESORIOS</option>
                  </select>
                </div>

                <div class="col-md-4">
                  <label class="form-label">Precio compra</label>
                  <input type="number" class="form-control" id="buyPrice" min="0" step="0.01">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Precio venta</label>
                  <input type="number" class="form-control" id="salePrice" min="0" step="0.01">
                </div>

                <div class="col-md-4">
                  <label class="form-label">Stock mín</label>
                  <input type="number" class="form-control" id="minStock" min="0">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Stock máx</label>
                  <input type="number" class="form-control" id="maxStock" min="0">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Proveedor</label>
                  <input class="form-control" id="supplier">
                </div>

                <div class="col-12">
                  <div class="alert alert-light border mb-0">
                    Campos específicos (fase 1): se guardarán en backend cuando se conecte.
                    <div class="small text-muted">Ej: graduación (esférico/cilíndrico/eje), material, marca, tamaño…</div>
                  </div>
                </div>
              </div>

              <input type="hidden" id="productId">
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-brand" id="btnSave">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // DataTable
  if(window.$ && $.fn.dataTable){
    $('#tblInventory').DataTable({
      pageLength: 10,
      language: {
        search: "Buscar:",
        lengthMenu: "Mostrar _MENU_",
        info: "Mostrando _START_ a _END_ de _TOTAL_",
        paginate: { previous: "Anterior", next: "Siguiente" },
        zeroRecords: "No hay registros"
      }
    });
  }

  if(!canEdit) return;

  const modalEl = document.getElementById('productModal');
  const modal = new bootstrap.Modal(modalEl);

  const openModal = (p=null)=>{
    document.getElementById('modalTitle').textContent = p ? 'Editar producto' : 'Nuevo producto';
    document.getElementById('productId').value = p?.id ?? '';
    document.getElementById('sku').value = p?.sku ?? '';
    document.getElementById('name').value = p?.name ?? '';
    document.getElementById('category').value = p?.category ?? 'MICAS';
    document.getElementById('buyPrice').value = p?.buyPrice ?? '';
    document.getElementById('salePrice').value = p?.salePrice ?? '';
    document.getElementById('minStock').value = p?.minStock ?? '';
    document.getElementById('maxStock').value = p?.maxStock ?? '';
    document.getElementById('supplier').value = p?.supplier ?? '';
    modal.show();
  };

  outlet.querySelector('#btnNew')?.addEventListener('click', ()=> openModal(null));

  outlet.addEventListener('click', async (e)=>{
    const editId = e.target?.dataset?.edit;
    const delId = e.target?.dataset?.del;

    if(editId){
      const p = rows.map(r=>r.product).find(x=>String(x?.id)===String(editId));
      openModal(p);
    }

    if(delId){
      const r = await Swal.fire({
        title: '¿Eliminar producto?',
        text: 'Esta acción se confirmará (mock no persistente).',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, borrar'
      });
      if(!r.isConfirmed) return;
      await inventoryService.deleteProduct(delId);
      Swal.fire('Listo','Producto eliminado (mock). Recarga para ver cambios reales en backend.','success');
    }
  });

  document.getElementById('btnSave').addEventListener('click', async ()=>{
    const payload = {
      sku: document.getElementById('sku').value.trim(),
      name: document.getElementById('name').value.trim(),
      category: document.getElementById('category').value,
      buyPrice: Number(document.getElementById('buyPrice').value || 0),
      salePrice: Number(document.getElementById('salePrice').value || 0),
      minStock: Number(document.getElementById('minStock').value || 0),
      maxStock: Number(document.getElementById('maxStock').value || 0),
      supplier: document.getElementById('supplier').value.trim()
    };

    if(!payload.sku || !payload.name){
      Swal.fire('Faltan datos','SKU y Nombre son obligatorios.','info');
      return;
    }

    const id = document.getElementById('productId').value;
    if(id) await inventoryService.updateProduct(id, payload);
    else await inventoryService.createProduct(payload);

    modal.hide();
    Swal.fire('Guardado','(Mock) Listo. Con backend, se reflejará en tabla.','success');
  });
}
