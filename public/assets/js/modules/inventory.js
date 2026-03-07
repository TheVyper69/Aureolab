// public/assets/js/pages/inventory.js
// INVENTORY (FULL)
// - Modal crea/edita productos con payload NUEVO (FKs + sphere/cylinder)
// - treatment NO se captura aquí (lo elige la óptica en el pedido y puede ser múltiple)
// - Muestra/oculta campos según categoría (MICAS / LENTES_CONTACTO / otros)
// - Guarda con JSON payload (NO FormData)
//
// Requiere:
// - inventoryService.js (list, listCategories, deleteProduct, addStock, etc.)
// - api.js (para POST/PUT productos con JSON)
// - authService.js
// - Swal, bootstrap.Modal, jQuery + DataTables

import { inventoryService } from '../services/inventoryService.js';
import { authService } from '../services/authService.js';
import { api } from '../services/api.js';
import { money } from '../utils/helpers.js';

/* =========================
 * Helpers
 * ========================= */
function safe(v){
  return String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

function pickCategoryName(c){
  return c?.name ?? c?.label ?? c?.title ?? '';
}

function pickCategoryCode(c){
  return String(c?.code ?? c?.slug ?? '').trim();
}

function mountDataTable(selector){
  if(!(window.$ && $.fn.dataTable)) return null;

  if($.fn.DataTable.isDataTable(selector)){
    $(selector).DataTable().destroy();
  }

  return $(selector).DataTable({
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

function extractAxiosErrorMessage(err){
  const status = err?.response?.status;
  const data = err?.response?.data;

  if(status === 422 && data?.errors){
    const lines = [];
    for(const k of Object.keys(data.errors)){
      const arr = data.errors[k] || [];
      for(const msg of arr){
        lines.push(`• ${msg}`);
      }
    }
    return lines.length ? lines.join('<br>') : (data.message || 'Error de validación');
  }
  return data?.message || err?.message || 'Ocurrió un error';
}

/* =========================
 * Normalización INVENTARIO
 * Soporta wrapper: [{ stock,reserved,available, product:{...}}]
 * ========================= */
function normalizeInventoryRows(rows){
  const arr = Array.isArray(rows) ? rows : [];
  const isWrapped = arr.length && arr[0] && typeof arr[0] === 'object'
    && Object.prototype.hasOwnProperty.call(arr[0], 'product');

  if(!isWrapped) return [];

  return arr.map(r=>{
    const p = r.product || {};
    return {
      stock: Number(r.stock ?? 0),
      reserved: Number(r.reserved ?? 0),
      available: Number(r.available ?? (Number(r.stock ?? 0) - Number(r.reserved ?? 0))),
      critical: Boolean(r.critical ?? false),
      product: {
        id: p.id,
        sku: p.sku ?? '',
        name: p.name ?? '',
        description: p.description ?? '',

        categoryCode: p.category ?? '',
        categoryLabel: p.category_label ?? p.categoryLabel ?? '',
        categoryId: p.category_id ?? p.categoryId ?? null,

        type: p.type ?? null,
        material: p.material ?? null,

        buyPrice: Number(p.buyPrice ?? p.buy_price ?? 0),
        salePrice: Number(p.salePrice ?? p.sale_price ?? 0),
        minStock: Number(p.minStock ?? p.min_stock ?? 0),
        maxStock: (p.maxStock ?? p.max_stock ?? null),

        supplier_id: p.supplier_id ?? null,
        box_id: p.box_id ?? null,
        lens_type_id: p.lens_type_id ?? null,
        material_id: p.material_id ?? null,

        // treatment_id existe en DB pero ya NO se captura en inventario
        // treatment_id: p.treatment_id ?? null,

        sphere: (p.sphere ?? null),
        cylinder: (p.cylinder ?? null),
      }
    };
  });
}

/* =========================
 * Main render
 * ========================= */
export async function renderInventory(outlet){
  const role = authService.getRole();
  const token = authService.getToken();
  const canEdit = (role === 'admin') && !!token;

  let view = outlet.dataset.invView || 'inventory';
  outlet.dataset.invView = view;

  let categories = [];
  let inventoryRows = [];

  let productModal = null;

  const renderShell = () => {
    outlet.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <div class="d-flex align-items-center gap-2">
          <h4 class="mb-0">Inventario</h4>
          <div class="btn-group ms-2" role="group" aria-label="tabs">
            <button class="btn ${view === 'inventory' ? 'btn-brand' : 'btn-outline-brand'}" id="tabInventory">Inventario</button>
            <button class="btn ${view === 'categories' ? 'btn-brand' : 'btn-outline-brand'}" id="tabCategories">Categorías</button>
          </div>
        </div>

        ${canEdit
          ? `<div class="d-flex gap-2" id="topActions"></div>`
          : `<div class="small text-muted">Solo admin logeado puede editar.</div>`
        }
      </div>

      <div id="invContent"></div>
    `;
  };

  const renderTopActions = () => {
    const box = outlet.querySelector('#topActions');
    if(!box) return;

    if(view === 'inventory'){
      box.innerHTML = `
        <button class="btn btn-outline-brand" id="btnRefresh">Actualizar</button>
        <button class="btn btn-brand" id="btnNewProduct">Nuevo producto</button>
      `;
    }else{
      box.innerHTML = `
        <button class="btn btn-outline-brand" id="btnRefresh">Actualizar</button>
        <button class="btn btn-brand" id="btnNewCategory">Nueva categoría</button>
      `;
    }
  };

  /* ---------- Product Modal HTML ---------- */
  const renderProductModalHtml = () => {
    const options = (categories || []).map(c=>{
      const id = c.id ?? '';
      const code = pickCategoryCode(c);
      const name = pickCategoryName(c) || `Categoría #${id}`;
      return `<option value="${safe(id)}">${safe(name)} (${safe(code)})</option>`;
    }).join('');

    return `
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

                  <div class="col-md-6">
                    <label class="form-label">Categoría</label>
                    <select class="form-select" id="category_id" required>
                      <option value="">-- Selecciona --</option>
                      ${options}
                    </select>
                    <div class="form-text">Manda <b>category_id</b>.</div>
                  </div>

                  <div class="col-md-6">
                    <label class="form-label">Descripción</label>
                    <input class="form-control" id="description" placeholder="Opcional">
                  </div>

                  <div class="col-md-6">
                    <label class="form-label">Precio compra</label>
                    <input type="number" class="form-control" id="buyPrice" min="0" step="0.01">
                  </div>

                  <div class="col-md-6">
                    <label class="form-label">Precio venta</label>
                    <input type="number" class="form-control" id="salePrice" min="0" step="0.01">
                  </div>

                  <div class="col-md-6">
                    <label class="form-label">Stock mín</label>
                    <input type="number" class="form-control" id="minStock" min="0">
                  </div>

                  <div class="col-md-6">
                    <label class="form-label">Stock máx</label>
                    <input type="number" class="form-control" id="maxStock" min="0">
                  </div>

                  <!-- LEGACY -->
                  <div class="col-md-6">
                    <label class="form-label">Type (legacy)</label>
                    <input class="form-control" id="type" placeholder="Ej: monofocal">
                  </div>

                  <div class="col-md-6">
                    <label class="form-label">Material (legacy)</label>
                    <input class="form-control" id="material" placeholder="Ej: legacy-cr39">
                  </div>

                  <hr class="my-2"/>

                  <!-- FKs base (siempre visibles) -->
                  <div class="col-md-6">
                    <label class="form-label">supplier_id</label>
                    <input type="number" class="form-control" id="supplier_id" min="1" placeholder="Ej: 1">
                  </div>

                  <div class="col-md-6">
                    <label class="form-label">box_id</label>
                    <input type="number" class="form-control" id="box_id" min="1" placeholder="Ej: 1">
                  </div>

                  <!-- Sección MICAS / LENTES_CONTACTO -->
                  <div id="lensSection" class="d-none">
                    <div class="row g-3 mt-0">
                      <div class="col-md-6">
                        <label class="form-label">lens_type_id</label>
                        <input type="number" class="form-control" id="lens_type_id" min="1" placeholder="Ej: 1">
                      </div>

                      <div class="col-md-6">
                        <label class="form-label">material_id</label>
                        <input type="number" class="form-control" id="material_id" min="1" placeholder="Ej: 1">
                      </div>

                      <!-- SOLO MICAS: esfera/cilindro -->
                      <div id="micasPowerSection" class="d-none">
                        <div class="row g-3 mt-0">
                          <div class="col-md-6">
                            <label class="form-label">sphere (SKU fijo)</label>
                            <input type="number" class="form-control" id="sphere" step="0.25" placeholder="Ej: -2.00">
                            <div class="form-text">Trigger controla rango (-40 a 40).</div>
                          </div>

                          <div class="col-md-6">
                            <label class="form-label">cylinder (≤ 0)</label>
                            <input type="number" class="form-control" id="cylinder" step="0.25" max="0" placeholder="Ej: -0.50">
                            <div class="form-text">Si pones positivo, el trigger revienta.</div>
                          </div>
                        </div>
                      </div>

                      <div class="col-12">
                        <div class="small text-muted">
                          Tratamientos: NO se capturan aquí. Los define la óptica en el pedido (y pueden ser varios).
                        </div>
                      </div>

                    </div>
                  </div>

                </div>

                <input type="hidden" id="productId">
              </form>
            </div>

            <div class="modal-footer">
              <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button class="btn btn-brand" id="btnSaveProduct">Guardar</button>
            </div>

          </div>
        </div>
      </div>
    `;
  };

  /* ---------- Tables Render ---------- */
  const renderInventoryTable = () => {
    const content = outlet.querySelector('#invContent');

    content.innerHTML = `
      <div class="card p-3">
        <div class="table-responsive">
          <table id="tblInventory" class="table table-striped align-middle" style="width:100%">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Disponible</th>
                <th>Mín</th>
                <th>Máx</th>
                <th>Venta</th>
                ${canEdit ? '<th>Acciones</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${inventoryRows.map(r=>{
                const p = r.product || {};
                const available = Number(r.available ?? 0);
                const min = Number(p.minStock ?? 0);
                const low = available <= min;

                return `
                  <tr class="${low ? 'table-warning' : ''}">
                    <td>${safe(p.sku)}</td>
                    <td>
                      ${safe(p.name)}
                      ${low ? '<span class="badge text-bg-danger ms-2">Crítico</span>' : ''}
                    </td>
                    <td>${safe(p.categoryLabel || p.categoryCode || '')}</td>
                    <td class="fw-semibold">${available}</td>
                    <td>${min}</td>
                    <td>${p.maxStock ?? ''}</td>
                    <td>${money(p.salePrice ?? 0)}</td>
                    ${canEdit ? `
                      <td class="text-nowrap">
                        <button class="btn btn-sm btn-outline-success me-1" data-addstock="${p.id}">+ Stock</button>
                        <button class="btn btn-sm btn-outline-brand me-1" data-edit="${p.id}">Editar</button>
                        <button class="btn btn-sm btn-outline-danger" data-del="${p.id}">Borrar</button>
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="small text-muted mt-2">
          ${canEdit ? 'Admin: CRUD + stock.' : 'Solo admin logeado puede editar.'}
        </div>
      </div>

      ${canEdit ? renderProductModalHtml() : ''}
    `;

    mountDataTable('#tblInventory');

    if(canEdit){
      productModal = new bootstrap.Modal(document.getElementById('productModal'));
      wireProductModalHandlers();
    }
  };

  const renderCategoriesTable = () => {
    const content = outlet.querySelector('#invContent');

    content.innerHTML = `
      <div class="card p-3">
        <div class="table-responsive">
          <table id="tblCategories" class="table table-striped align-middle" style="width:100%">
            <thead>
              <tr>
                <th>ID</th>
                <th>Code</th>
                <th>Nombre</th>
                <th>Descripción</th>
                ${canEdit ? '<th>Acciones</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${(categories || []).map(c=>{
                const id = c.id ?? '';
                const code = pickCategoryCode(c);
                const name = pickCategoryName(c);
                const desc = c.description ?? '';
                return `
                  <tr>
                    <td>${safe(id)}</td>
                    <td><code>${safe(code)}</code></td>
                    <td>${safe(name)}</td>
                    <td>${safe(desc)}</td>
                    ${canEdit ? `
                      <td class="text-nowrap">
                        <button class="btn btn-sm btn-outline-brand me-1" data-cat-edit="${id}">Editar</button>
                        <button class="btn btn-sm btn-outline-danger" data-cat-del="${id}">Borrar</button>
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="small text-muted mt-2">
          ${canEdit ? 'Admin: CRUD completo de categorías.' : 'Solo admin logeado puede editar.'}
        </div>
      </div>
    `;

    mountDataTable('#tblCategories');
  };

  /* ---------- Lens section toggle ---------- */
  function toggleLensSection(){
    const catId = document.getElementById('category_id')?.value || '';
    const cat = (categories || []).find(x => String(x.id) === String(catId));
    const code = pickCategoryCode(cat);

    const lensSection = document.getElementById('lensSection');
    const micasPowerSection = document.getElementById('micasPowerSection');
    if(!lensSection || !micasPowerSection) return;

    const isMicas = (code === 'MICAS');
    const isContacts = (code === 'LENTES_CONTACTO');
    const isLens = isMicas || isContacts;

    lensSection.classList.toggle('d-none', !isLens);
    micasPowerSection.classList.toggle('d-none', !isMicas);

    // Si NO es lens, limpiamos todo
    if(!isLens){
      ['lens_type_id','material_id','sphere','cylinder'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.value = '';
      });
      return;
    }

    // Si es LENTES_CONTACTO, limpia sphere/cylinder (no aplica fijo por SKU normalmente)
    if(isContacts){
      ['sphere','cylinder'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.value = '';
      });
    }
  }

  /* ---------- Product Modal Logic ---------- */
  const openProductModal = async (productOrNull) => {
    const p = productOrNull || null;

    document.getElementById('modalTitle').textContent = p ? 'Editar producto' : 'Nuevo producto';
    document.getElementById('productId').value = p?.id ?? '';

    document.getElementById('sku').value = p?.sku ?? '';
    document.getElementById('name').value = p?.name ?? '';
    document.getElementById('description').value = p?.description ?? '';

    document.getElementById('buyPrice').value = (p?.buyPrice ?? '');
    document.getElementById('salePrice').value = (p?.salePrice ?? '');
    document.getElementById('minStock').value = (p?.minStock ?? '');
    document.getElementById('maxStock').value = (p?.maxStock ?? '');

    document.getElementById('type').value = (p?.type ?? '');
    document.getElementById('material').value = (p?.material ?? '');

    document.getElementById('supplier_id').value = (p?.supplier_id ?? '');
    document.getElementById('box_id').value = (p?.box_id ?? '');

    document.getElementById('lens_type_id').value = (p?.lens_type_id ?? '');
    document.getElementById('material_id').value = (p?.material_id ?? '');

    document.getElementById('sphere').value = (p?.sphere ?? '');
    document.getElementById('cylinder').value = (p?.cylinder ?? '');

    // category_id select
    const sel = document.getElementById('category_id');
    sel.value = (p?.categoryId ?? '');

    toggleLensSection();

    productModal.show();
  };

  const wireProductModalHandlers = () => {
    const btnSave = document.getElementById('btnSaveProduct');

    document.getElementById('category_id')?.addEventListener('change', toggleLensSection);

    btnSave?.addEventListener('click', async ()=>{
      const id = document.getElementById('productId').value || '';

      const sku = document.getElementById('sku').value.trim();
      const name = document.getElementById('name').value.trim();
      const category_id = Number(document.getElementById('category_id').value || 0);

      if(!sku || !name || !category_id){
        Swal.fire('Faltan datos','SKU, Nombre y Categoría son obligatorios.','info');
        return;
      }

      const payload = {
        sku,
        name,
        description: (document.getElementById('description').value || '').trim() || null,
        category_id,

        type: (document.getElementById('type').value || '').trim() || null,
        material: (document.getElementById('material').value || '').trim() || null,

        buyPrice: Number(document.getElementById('buyPrice').value || 0),
        salePrice: Number(document.getElementById('salePrice').value || 0),
        minStock: Number(document.getElementById('minStock').value || 0),
        maxStock: (document.getElementById('maxStock').value === '' ? null : Number(document.getElementById('maxStock').value)),

        supplier_id: (document.getElementById('supplier_id').value === '' ? null : Number(document.getElementById('supplier_id').value)),
        box_id: (document.getElementById('box_id').value === '' ? null : Number(document.getElementById('box_id').value)),
        lens_type_id: (document.getElementById('lens_type_id').value === '' ? null : Number(document.getElementById('lens_type_id').value)),
        material_id: (document.getElementById('material_id').value === '' ? null : Number(document.getElementById('material_id').value)),

        // Tratamiento ya NO va en producto:
        // treatment_id: ...

        sphere: (document.getElementById('sphere').value === '' ? null : Number(document.getElementById('sphere').value)),
        cylinder: (document.getElementById('cylinder').value === '' ? null : Number(document.getElementById('cylinder').value)),
      };

      // Validación rápida cliente (evita triggers)
      if(payload.cylinder !== null && payload.cylinder > 0){
        Swal.fire('Dato inválido','cylinder debe ser <= 0','warning');
        return;
      }

      try{
        if(id){
          await api.put(`/products/${id}`, payload);
        }else{
          await api.post('/products', payload);
        }

        productModal.hide();
        Swal.fire('Guardado','Producto guardado.','success');
        await refresh('inventory');
      }catch(err){
        console.error(err);
        Swal.fire('Error', extractAxiosErrorMessage(err), 'error');
      }
    });
  };

  /* ---------- Category CRUD (igual) ---------- */
  const openCreateCategory = async () => {
    if(!canEdit) return;

    const r = await Swal.fire({
      title: 'Nueva categoría',
      html: `
        <div class="text-start">
          <label class="form-label">CODE</label>
          <input id="swCatCode" class="form-control" placeholder="Ej: MICAS">
          <label class="form-label mt-2">Nombre</label>
          <input id="swCatName" class="form-control" placeholder="Ej: Micas">
          <label class="form-label mt-2">Descripción (opcional)</label>
          <input id="swCatDesc" class="form-control" placeholder="Opcional">
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: ()=>{
        const code = document.getElementById('swCatCode')?.value?.trim() || '';
        const name = document.getElementById('swCatName')?.value?.trim() || '';
        const description = document.getElementById('swCatDesc')?.value?.trim() || '';
        if(!code || !name){
          Swal.showValidationMessage('CODE y Nombre son obligatorios');
          return false;
        }
        return { code, name, description };
      }
    });

    if(!r.isConfirmed) return;

    try{
      await inventoryService.createCategory({
        code: r.value.code,
        name: r.value.name,
        description: r.value.description || null
      });
      Swal.fire('Listo','Categoría creada.','success');
      await refresh('categories');
    }catch(e){
      console.error(e);
      Swal.fire('Error', extractAxiosErrorMessage(e), 'error');
    }
  };

  const openEditCategory = async (catId) => {
    if(!canEdit) return;

    const cat = (categories || []).find(x => String(x.id) === String(catId));
    const currentName = pickCategoryName(cat);
    const currentCode = pickCategoryCode(cat);
    const currentDesc = cat?.description ?? '';

    const r = await Swal.fire({
      title: 'Editar categoría',
      html: `
        <div class="text-start">
          <label class="form-label">CODE</label>
          <input id="swCatCode" class="form-control" value="${safe(currentCode)}">
          <label class="form-label mt-2">Nombre</label>
          <input id="swCatName" class="form-control" value="${safe(currentName)}">
          <label class="form-label mt-2">Descripción (opcional)</label>
          <input id="swCatDesc" class="form-control" value="${safe(currentDesc)}">
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: ()=>{
        const code = document.getElementById('swCatCode')?.value?.trim() || '';
        const name = document.getElementById('swCatName')?.value?.trim() || '';
        const description = document.getElementById('swCatDesc')?.value?.trim() || '';
        if(!code || !name){
          Swal.showValidationMessage('CODE y Nombre son obligatorios');
          return false;
        }
        return { code, name, description };
      }
    });

    if(!r.isConfirmed) return;

    try{
      await inventoryService.updateCategory(catId, {
        code: r.value.code,
        name: r.value.name,
        description: r.value.description || null
      });
      Swal.fire('Listo','Categoría actualizada.','success');
      await refresh('categories');
    }catch(e){
      console.error(e);
      Swal.fire('Error', extractAxiosErrorMessage(e), 'error');
    }
  };

  const deleteCategory = async (catId) => {
    if(!canEdit) return;

    const r = await Swal.fire({
      title: '¿Borrar categoría?',
      text: 'Si hay productos usando esta categoría, el backend puede rechazarlo.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar'
    });

    if(!r.isConfirmed) return;

    try{
      await inventoryService.deleteCategory(catId);
      Swal.fire('Listo','Categoría eliminada.','success');
      await refresh('categories');
    }catch(e){
      console.error(e);
      Swal.fire('Error', extractAxiosErrorMessage(e), 'error');
    }
  };

  /* ---------- Inventory actions ---------- */
  const addStock = async (productId) => {
    if(!canEdit) return;

    const r = await Swal.fire({
      title: 'Aumentar stock',
      input: 'number',
      inputLabel: 'Cantidad a agregar',
      inputAttributes: { min: 1, step: 1 },
      inputValue: 1,
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      inputValidator: (v)=>{
        const n = Number(v);
        if(!Number.isInteger(n) || n <= 0) return 'Debe ser un entero mayor a 0';
        return null;
      }
    });

    if(!r.isConfirmed) return;

    try{
      await inventoryService.addStock(productId, { qty: Number(r.value), note: 'Entrada desde inventario' });
      Swal.fire('Listo','Stock actualizado.','success');
      await refresh('inventory');
    }catch(e){
      console.error(e);
      Swal.fire('Error', extractAxiosErrorMessage(e), 'error');
    }
  };

  const deleteProduct = async (productId) => {
    if(!canEdit) return;

    const r = await Swal.fire({
      title: '¿Eliminar producto?',
      text: 'Esta acción se confirmará.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar'
    });
    if(!r.isConfirmed) return;

    try{
      await inventoryService.deleteProduct(productId);
      Swal.fire('Listo','Producto eliminado.','success');
      await refresh('inventory');
    }catch(e){
      console.error(e);
      Swal.fire('Error', extractAxiosErrorMessage(e), 'error');
    }
  };

  /* ---------- Load / Draw / Refresh ---------- */
  const loadData = async () => {
    try{
      const cats = await inventoryService.listCategories();
      categories = Array.isArray(cats) ? cats : [];
    }catch(e){
      console.warn('No se pudieron cargar categorías:', e);
      categories = [];
    }

    if(view === 'inventory'){
      const raw = await inventoryService.list();
      inventoryRows = normalizeInventoryRows(raw);

      // resolver label por categoryId si hace falta
      const map = new Map((categories || []).map(c => [String(c.id), pickCategoryName(c)]));
      inventoryRows = inventoryRows.map(r=>{
        const p = r.product || {};
        if(!p.categoryLabel && p.categoryId && map.has(String(p.categoryId))){
          p.categoryLabel = map.get(String(p.categoryId));
        }
        return r;
      });
    }
  };

  const draw = async () => {
    renderShell();
    if(canEdit) renderTopActions();

    outlet.querySelector('#tabInventory')?.addEventListener('click', async ()=>{ await refresh('inventory'); });
    outlet.querySelector('#tabCategories')?.addEventListener('click', async ()=>{ await refresh('categories'); });

    outlet.querySelector('#btnRefresh')?.addEventListener('click', async ()=>{ await refresh(view); });

    outlet.querySelector('#btnNewProduct')?.addEventListener('click', async ()=>{
      if(!categories.length){
        Swal.fire('Sin categorías','Primero crea una categoría en “Categorías”.','info');
        return;
      }
      await openProductModal(null);
    });

    outlet.querySelector('#btnNewCategory')?.addEventListener('click', async ()=>{ await openCreateCategory(); });

    if(view === 'inventory') renderInventoryTable();
    else renderCategoriesTable();

    outlet.addEventListener('click', onOutletClick);
  };

  const cleanup = () => {
    outlet.removeEventListener('click', onOutletClick);
  };

  const refresh = async (nextView) => {
    cleanup();
    view = nextView;
    outlet.dataset.invView = view;
    await loadData();
    await draw();
  };

  async function onOutletClick(e){
    const t = e.target;

    if(view === 'inventory'){
      const addStockId = t?.dataset?.addstock;
      const editId = t?.dataset?.edit;
      const delId = t?.dataset?.del;

      if(addStockId){ await addStock(addStockId); return; }
      if(editId){
        const p = inventoryRows.map(r=>r.product).find(x=>String(x?.id)===String(editId));
        if(!p){
          Swal.fire('No encontrado','No se encontró el producto en la lista.','info');
          return;
        }
        await openProductModal(p);
        return;
      }
      if(delId){ await deleteProduct(delId); return; }
    }

    if(view === 'categories'){
      const catEditId = t?.dataset?.catEdit;
      const catDelId = t?.dataset?.catDel;

      if(catEditId){ await openEditCategory(catEditId); return; }
      if(catDelId){ await deleteCategory(catDelId); return; }
    }
  }

  await loadData();
  await draw();
}