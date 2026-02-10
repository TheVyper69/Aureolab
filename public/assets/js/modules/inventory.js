// inventory.js (FULL)
// Vista con tabs: Inventario / Categorías
// - Inventario: CRUD producto + cargar imagen protegida + aumentar stock
// - Categorías: CRUD categorías con DataTable y botones
//
// Requiere:
// - inventoryService.js con métodos:
//   list(), lowStock(),
//   listCategories(), createCategory(payload), updateCategory(id,payload), deleteCategory(id),
//   createProduct(payload), updateProduct(id,payload), deleteProduct(id),
//   addStock(productId, payload)
// - api.js exporte { api } con getBlob(path) que mande token (Sanctum) (Opción A)
// - authService.getRole() y authService.getToken()
// - SweetAlert2 (Swal) + Bootstrap (bootstrap.Modal) + DataTables (jQuery)

import { inventoryService } from '../services/inventoryService.js';
import { authService } from '../services/authService.js';
import { api } from '../services/api.js';
import { money } from '../utils/helpers.js';

/* =========================
 *  Helpers
 *  ========================= */
function safe(v){
  return String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

function normalizeText(s){
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('á','a').replaceAll('é','e').replaceAll('í','i').replaceAll('ó','o').replaceAll('ú','u')
    .replaceAll('ñ','n');
}

/* =========================
 *  Normalización INVENTARIO
 *  =========================
 * API real (plano):
 * [{ id, sku, name, description, category, category_id, sale_price, buy_price, min_stock, max_stock, stock, supplier, variants }]
 */
function normalizeInventoryRows(rows){
  const arr = Array.isArray(rows) ? rows : [];
  const looksFlat = arr.length && (
    Object.prototype.hasOwnProperty.call(arr[0], 'sku') ||
    Object.prototype.hasOwnProperty.call(arr[0], 'stock') ||
    Object.prototype.hasOwnProperty.call(arr[0], 'sale_price') ||
    Object.prototype.hasOwnProperty.call(arr[0], 'buy_price')
  );

  if(looksFlat){
    return arr.map(p => {
      const supplier =
        (typeof p.supplier === 'string' ? p.supplier :
          (p.supplier?.name ?? p.supplier_name ?? ''));

      const catLabel =
        (typeof p.category === 'string' ? p.category : (p.category?.name ?? ''));

      const catId =
        p.category_id ?? p.categoryId ?? p.category?.id ?? null;

      return {
        stock: Number(p.stock ?? 0),
        critical: Boolean(p.critical ?? false),
        product: {
          id: p.id,
          sku: p.sku ?? '',
          name: p.name ?? '',
          description: p.description ?? '',
          categoryLabel: catLabel ?? '',
          categoryId: catId,
          supplier: supplier ?? '',
          minStock: Number(p.min_stock ?? p.minStock ?? 0),
          maxStock: (p.max_stock ?? p.maxStock ?? null),
          buyPrice: Number(p.buy_price ?? p.buyPrice ?? 0),
          salePrice: Number(p.sale_price ?? p.salePrice ?? 0),
          variants: Array.isArray(p.variants) ? p.variants : [],
        }
      };
    });
  }

  // fallback a formato viejo: [{ stock, product:{...} }]
  return (arr || []).map(r=>{
    const p = r.product || {};
    return {
      stock: Number(r.stock ?? 0),
      critical: Boolean(r.critical ?? false),
      product: {
        id: p.id,
        sku: p.sku ?? '',
        name: p.name ?? '',
        description: p.description ?? '',
        categoryLabel: p.category ?? '',
        categoryId: p.category_id ?? p.categoryId ?? null,
        supplier: p.supplier ?? '',
        minStock: Number(p.minStock ?? p.min_stock ?? 0),
        maxStock: p.maxStock ?? p.max_stock ?? null,
        buyPrice: Number(p.buyPrice ?? p.buy_price ?? 0),
        salePrice: Number(p.salePrice ?? p.sale_price ?? 0),
        variants: Array.isArray(p.variants) ? p.variants : [],
      }
    };
  });
}

/* =========================
 *  Imagen protegida (Sanctum)
 *  ========================= */
async function loadProductImageUrl(productId){
  try{
    const blob = await api.getBlob(`/products/${productId}/image`);
    return URL.createObjectURL(blob);
  }catch(e){
    console.warn('No se pudo cargar imagen:', e?.message || e);
    return null;
  }
}

/* =========================
 *  DataTable helper
 *  ========================= */
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

/* =========================
 *  Main render
 *  ========================= */
export async function renderInventory(outlet){
  const role = authService.getRole();
  const canEdit = role === 'admin';

  // estado de vista (persistente mientras no recargues)
  let view = outlet.dataset.invView || 'inventory'; // 'inventory' | 'categories'
  outlet.dataset.invView = view;

  // cache en memoria para la sesión de la vista
  let categories = [];
  let inventoryRows = [];

  // bootstrap modals (solo existen en inventario)
  let productModal = null;

  // manejo objectURL para preview (para liberar memoria)
  let currentPreviewObjectUrl = null;

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

        ${canEdit ? `
          <div class="d-flex gap-2" id="topActions"></div>
        ` : `<div class="small text-muted">Modo empleado: solo lectura.</div>`}
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
                <th>Stock</th>
                <th>Mín</th>
                <th>Máx</th>
                <th>Venta</th>
                <th>Proveedor</th>
                ${canEdit ? '<th>Acciones</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${inventoryRows.map(r=>{
                const p = r.product || {};
                const stock = Number(r.stock ?? 0);
                const min = Number(p.minStock ?? 0);
                const low = stock <= min;

                return `
                  <tr class="${low ? 'table-warning' : ''}">
                    <td>${safe(p.sku)}</td>
                    <td>
                      ${safe(p.name)}
                      ${low ? '<span class="badge text-bg-danger ms-2">Crítico</span>' : ''}
                    </td>
                    <td>${safe(p.categoryLabel || '')}</td>
                    <td class="fw-semibold">${stock}</td>
                    <td>${min}</td>
                    <td>${p.maxStock ?? ''}</td>
                    <td>${money(p.salePrice ?? 0)}</td>
                    <td>${safe(p.supplier ?? '')}</td>
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
          ${canEdit ? 'Admin: puedes crear/editar/borrar y aumentar stock.' : 'Modo empleado: solo lectura.'}
        </div>
      </div>

      ${canEdit ? renderProductModalHtml() : ''}
    `;

    mountDataTable('#tblInventory');

    if(canEdit){
      // init modal
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
                <th>Nombre</th>
                <th>Code</th>
                ${canEdit ? '<th>Acciones</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${categories.map(c=>{
                const id = c.id ?? '';
                const name = c.name ?? c.label ?? '';
                const code = c.code ?? c.slug ?? (name ? name.toUpperCase().replace(/\s+/g,'_') : '');
                return `
                  <tr>
                    <td>${safe(id)}</td>
                    <td>${safe(name)}</td>
                    <td><code>${safe(code)}</code></td>
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
          ${canEdit ? 'Admin: CRUD completo de categorías.' : 'Modo empleado: solo lectura.'}
        </div>
      </div>
    `;

    mountDataTable('#tblCategories');
  };

  const renderProductModalHtml = () => {
    // select categories (si viene vacío, al menos muestra placeholder)
    const options = (categories.length ? categories : []).map(c=>{
      const id = c.id;
      const name = c.name ?? c.label ?? `Categoría #${id}`;
      return `<option value="${safe(id)}">${safe(name)}</option>`;
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

                  <div class="col-md-4">
                    <label class="form-label">Categoría</label>
                    <select class="form-select" id="categoryId" required>
                      <option value="">-- Selecciona --</option>
                      ${options}
                    </select>
                    <div class="form-text">Admin puede crear categorías en la pestaña “Categorías”.</div>
                  </div>

                  <div class="col-md-8">
                    <label class="form-label">Descripción</label>
                    <input class="form-control" id="description" placeholder="Descripción breve (opcional)">
                  </div>

                  <div class="col-md-8">
                    <label class="form-label">Imagen del producto</label>
                    <input type="file" class="form-control" id="imageFile" accept="image/*">
                    <div class="form-text">Se carga al backend y se obtiene con token.</div>
                  </div>

                  <div class="col-md-4 d-flex align-items-end">
                    <div class="border rounded w-100 overflow-hidden" style="height:84px; background:#F8F9FA;">
                      <img id="imagePreview" alt="preview" style="width:100%; height:84px; object-fit:cover; display:none;">
                      <div id="imageEmpty" class="small text-muted d-flex align-items-center justify-content-center h-100">
                        Sin imagen
                      </div>
                    </div>
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

  /* =========================
   *  Product modal logic
   *  ========================= */
  const renderImagePreview = (src)=>{
    const img = document.getElementById('imagePreview');
    const empty = document.getElementById('imageEmpty');

    if(!src){
      img.style.display = 'none';
      empty.style.display = 'flex';
      img.removeAttribute('src');
      return;
    }
    img.src = src;
    img.style.display = 'block';
    empty.style.display = 'none';
  };

  const readImageFileToBase64 = (file)=>{
    return new Promise((resolve, reject)=>{
      if(!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const openProductModal = async (productOrNull) => {
    // liberar objectURL anterior si había
    if(currentPreviewObjectUrl){
      URL.revokeObjectURL(currentPreviewObjectUrl);
      currentPreviewObjectUrl = null;
    }

    const p = productOrNull;

    document.getElementById('modalTitle').textContent = p ? 'Editar producto' : 'Nuevo producto';
    document.getElementById('productId').value = p?.id ?? '';
    document.getElementById('sku').value = p?.sku ?? '';
    document.getElementById('name').value = p?.name ?? '';
    document.getElementById('description').value = p?.description ?? '';
    document.getElementById('buyPrice').value = p?.buyPrice ?? '';
    document.getElementById('salePrice').value = p?.salePrice ?? '';
    document.getElementById('minStock').value = p?.minStock ?? '';
    document.getElementById('maxStock').value = (p?.maxStock ?? '');
    document.getElementById('supplier').value = p?.supplier ?? '';

    // select categoría
    const sel = document.getElementById('categoryId');
    sel.value = p?.categoryId ?? '';

    // reset file input
    const fileInput = document.getElementById('imageFile');
    if(fileInput) fileInput.value = '';

    renderImagePreview(null);

    // cargar imagen desde backend (token)
    if(p?.id){
      const url = await loadProductImageUrl(p.id);
      if(url){
        currentPreviewObjectUrl = url;
        renderImagePreview(url);
      }
    }

    productModal.show();
  };

  const wireProductModalHandlers = () => {
    document.getElementById('imageFile')?.addEventListener('change', async (e)=>{
      const file = e.target.files?.[0];
      if(!file) return;

      if(!file.type.startsWith('image/')){
        Swal.fire('Archivo inválido','Solo se permiten imágenes.','warning');
        e.target.value = '';
        return;
      }
      if(file.size > 2 * 1024 * 1024){
        Swal.fire('Imagen muy grande','Máximo 2MB.','warning');
        e.target.value = '';
        return;
      }

      // si había url de backend, liberar
      if(currentPreviewObjectUrl){
        URL.revokeObjectURL(currentPreviewObjectUrl);
        currentPreviewObjectUrl = null;
      }

      const base64 = await readImageFileToBase64(file);
      renderImagePreview(base64);
    });

    document.getElementById('btnSaveProduct')?.addEventListener('click', async ()=>{
      const id = document.getElementById('productId').value || '';
      const sku = document.getElementById('sku').value.trim();
      const name = document.getElementById('name').value.trim();
      const categoryId = document.getElementById('categoryId').value;
      const description = document.getElementById('description').value.trim();

      if(!sku || !name || !categoryId){
        Swal.fire('Faltan datos','SKU, Nombre y Categoría son obligatorios.','info');
        return;
      }

      const file = document.getElementById('imageFile')?.files?.[0] || null;

      // FormData para backend (imagen)
      const fd = new FormData();
      fd.append('sku', sku);
      fd.append('name', name);
      fd.append('category_id', String(categoryId));
      fd.append('description', description || '');
      fd.append('buy_price', String(Number(document.getElementById('buyPrice').value || 0)));
      fd.append('sale_price', String(Number(document.getElementById('salePrice').value || 0)));
      fd.append('min_stock', String(Number(document.getElementById('minStock').value || 0)));
      fd.append('max_stock', String(Number(document.getElementById('maxStock').value || 0)));
      fd.append('supplier', (document.getElementById('supplier').value || '').trim());

      if(file) fd.append('image', file);

      try{
        if(id) await inventoryService.updateProduct(id, fd);
        else await inventoryService.createProduct(fd);

        productModal.hide();
        Swal.fire('Guardado','Producto guardado.','success');
        await refresh('inventory');
      }catch(err){
        console.error(err);
        Swal.fire('Error','No se pudo guardar el producto. Revisa consola/Network.','error');
      }
    });
  };

  /* =========================
   *  Actions / refresh
   *  ========================= */
  const loadData = async () => {
    // trae categorías siempre (para select del modal y pestaña)
    try{
      const cats = await inventoryService.listCategories();
      categories = Array.isArray(cats) ? cats : [];
    }catch(e){
      console.warn('No se pudieron cargar categorías:', e);
      categories = [];
    }

    if(view === 'inventory'){
      const rawRows = await inventoryService.list();
      inventoryRows = normalizeInventoryRows(rawRows);
    }
  };

  const draw = async () => {
    renderShell();
    renderTopActions();

    // wire tabs
    outlet.querySelector('#tabInventory')?.addEventListener('click', async ()=>{
      await refresh('inventory');
    });
    outlet.querySelector('#tabCategories')?.addEventListener('click', async ()=>{
      await refresh('categories');
    });

    // wire top actions
    outlet.querySelector('#btnRefresh')?.addEventListener('click', async ()=>{
      await refresh(view);
    });

    outlet.querySelector('#btnNewProduct')?.addEventListener('click', async ()=>{
      // si no hay categorías, avisa
      if(!categories.length){
        Swal.fire('Sin categorías','Primero crea una categoría en la pestaña “Categorías”.','info');
        return;
      }
      await openProductModal(null);
    });

    outlet.querySelector('#btnNewCategory')?.addEventListener('click', async ()=>{
      await openCreateCategory();
    });

    // render view
    if(view === 'inventory') renderInventoryTable();
    else renderCategoriesTable();

    // wire table actions (delegación)
    outlet.addEventListener('click', onOutletClick);
  };

  const cleanup = () => {
    outlet.removeEventListener('click', onOutletClick);

    // liberar objectURL si quedó
    if(currentPreviewObjectUrl){
      URL.revokeObjectURL(currentPreviewObjectUrl);
      currentPreviewObjectUrl = null;
    }
  };

  const refresh = async (nextView) => {
    cleanup();

    view = nextView;
    outlet.dataset.invView = view;

    await loadData();
    await draw();
  };

  /* =========================
   *  Category CRUD (Swal)
   *  ========================= */
  const buildCodeFromName = (name) => {
    return String(name || '')
      .trim()
      .toUpperCase()
      .replaceAll('Á','A').replaceAll('É','E').replaceAll('Í','I').replaceAll('Ó','O').replaceAll('Ú','U').replaceAll('Ñ','N')
      .replace(/\s+/g,'_')
      .replace(/[^A-Z0-9_]/g,'');
  };

  const openCreateCategory = async () => {
    if(!canEdit) return;

    const r = await Swal.fire({
      title: 'Nueva categoría',
      html: `
        <div class="text-start">
          <label class="form-label">Nombre</label>
          <input id="swCatName" class="form-control" placeholder="Ej: Gotas, Servicios...">
          <div class="form-text">Se recomienda nombre claro. (El code lo generamos automático)</div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: ()=>{
        const name = document.getElementById('swCatName')?.value?.trim() || '';
        if(!name) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        return { name };
      }
    });

    if(!r.isConfirmed) return;

    try{
      // backend típico: { name } (si tu API pide code también, lo agregamos)
      const payload = { name: r.value.name, code: buildCodeFromName(r.value.name) };
      await inventoryService.createCategory(payload);
      Swal.fire('Listo','Categoría creada.','success');
      await refresh('categories');
    }catch(e){
      console.error(e);
      Swal.fire('Error','No se pudo crear la categoría.','error');
    }
  };

  const openEditCategory = async (catId) => {
    if(!canEdit) return;

    const cat = categories.find(x => String(x.id) === String(catId));
    const currentName = cat?.name ?? cat?.label ?? '';

    const r = await Swal.fire({
      title: 'Editar categoría',
      input: 'text',
      inputLabel: 'Nombre',
      inputValue: currentName,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      inputValidator: (v)=>{
        if(!String(v||'').trim()) return 'El nombre es obligatorio';
        return null;
      }
    });

    if(!r.isConfirmed) return;

    try{
      const name = String(r.value || '').trim();
      const payload = { name, code: buildCodeFromName(name) };
      await inventoryService.updateCategory(catId, payload);
      Swal.fire('Listo','Categoría actualizada.','success');
      await refresh('categories');
    }catch(e){
      console.error(e);
      Swal.fire('Error','No se pudo actualizar la categoría.','error');
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
      Swal.fire('Error','No se pudo borrar la categoría.','error');
    }
  };

  /* =========================
   *  Inventory actions
   *  ========================= */
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
      Swal.fire('Error','No se pudo actualizar el stock.','error');
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
      Swal.fire('Error','No se pudo eliminar el producto.','error');
    }
  };

  /* =========================
   *  Outlet click delegator
   *  ========================= */
  async function onOutletClick(e){
    const t = e.target;

    // INVENTARIO
    const addStockId = t?.dataset?.addstock;
    const editId = t?.dataset?.edit;
    const delId = t?.dataset?.del;

    if(view === 'inventory'){
      if(addStockId){
        await addStock(addStockId);
        return;
      }
      if(editId){
        const p = inventoryRows.map(r=>r.product).find(x=>String(x?.id)===String(editId));
        if(!p){
          Swal.fire('No encontrado','No se encontró el producto en la lista.','info');
          return;
        }
        await openProductModal(p);
        return;
      }
      if(delId){
        await deleteProduct(delId);
        return;
      }
    }

    // CATEGORÍAS
    const catEditId = t?.dataset?.catEdit;
    const catDelId = t?.dataset?.catDel;

    if(view === 'categories'){
      if(catEditId){
        await openEditCategory(catEditId);
        return;
      }
      if(catDelId){
        await deleteCategory(catDelId);
        return;
      }
    }
  }

  /* =========================
   *  Init
   *  ========================= */
  await loadData();
  await draw();
}
