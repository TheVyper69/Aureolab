import { inventoryService } from '../services/inventoryService.js';
import { authService } from '../services/authService.js';
import { money } from '../utils/helpers.js';

const BASE_CATEGORIES = ['MICAS','BISEL','LENTES_CONTACTO','ARMAZONES','ACCESORIOS'];
const CATEGORIES_KEY = 'pos.categories.v1';

function loadCategories(){
  try{
    const raw = localStorage.getItem(CATEGORIES_KEY);
    const extra = raw ? JSON.parse(raw) : [];
    const all = [...BASE_CATEGORIES, ...(Array.isArray(extra) ? extra : [])]
      .map(s => String(s || '').trim())
      .filter(Boolean);

    return Array.from(new Set(all)).sort((a,b)=>a.localeCompare(b));
  }catch{
    return [...BASE_CATEGORIES];
  }
}

function saveCategories(extraCategories){
  const cleaned = (extraCategories || [])
    .map(s=>String(s||'').trim())
    .filter(Boolean);

  const extras = cleaned.filter(c => !BASE_CATEGORIES.includes(c));
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(Array.from(new Set(extras))));
}

function safe(v){
  return String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

/**
 * ✅ Normaliza rows para soportar:
 * A) Backend real: [{ id, sku, name, category, sale_price, buy_price, stock, ... }]
 * B) Mock viejo:   [{ stock, product:{...} }]
 */
function normalizeRows(rows){
  const arr = Array.isArray(rows) ? rows : [];

  // Si detectamos formato plano (backend)
  const looksFlat = arr.length && (
    'sku' in arr[0] || 'sale_price' in arr[0] || 'category' in arr[0]
  );

  if(looksFlat){
    return arr.map(p => {
      const categoryRaw = p.category ?? '';
      // tu API trae: "Micas", "Lentes de Contacto", "Bisel (servicio)"
      // Para tu UI de reglas usamos también el "code" (MICAS etc.) si te lo mandan, si no, dejamos el label.
      return {
        stock: Number(p.stock ?? 0),
        product: {
          id: p.id,
          sku: p.sku ?? '',
          name: p.name ?? '',
          category: categoryRaw ?? '',
          description: p.description ?? '',
          type: p.type ?? '',
          supplier: p.supplier ?? '',
          minStock: Number(p.min_stock ?? 0),
          maxStock: p.max_stock ?? null,
          buyPrice: Number(p.buy_price ?? 0),
          salePrice: Number(p.sale_price ?? 0),

          // compat para imagen/graduaciones si luego las mandas
          imageUrl: p.image_url ?? null,
          imageBase64: p.image ?? null,
          graduation: p.graduation ?? null,
          bisel: p.bisel ?? null,
          variants: Array.isArray(p.variants) ? p.variants : []
        }
      };
    });
  }

  // Formato mock antiguo
  return arr.map(r=>{
    const p = r.product || {};
    return {
      stock: Number(r.stock ?? 0),
      product: {
        id: p.id,
        sku: p.sku ?? '',
        name: p.name ?? '',
        category: p.category ?? '',
        description: p.description ?? '',
        type: p.type ?? '',
        supplier: p.supplier ?? '',
        minStock: Number(p.minStock ?? p.min_stock ?? 0),
        maxStock: p.maxStock ?? p.max_stock ?? null,
        buyPrice: Number(p.buyPrice ?? p.buy_price ?? 0),
        salePrice: Number(p.salePrice ?? p.sale_price ?? 0),
        imageUrl: p.imageUrl ?? p.image_url ?? null,
        imageBase64: p.imageBase64 ?? null,
        graduation: p.graduation ?? null,
        bisel: p.bisel ?? null,
        variants: Array.isArray(p.variants) ? p.variants : []
      }
    };
  });
}

export async function renderInventory(outlet){
  const role = authService.getRole();
  const rawRows = await inventoryService.list();
  const rows = normalizeRows(rawRows);
  const canEdit = role === 'admin';

  let categories = loadCategories();

  outlet.innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
      <h4 class="mb-0">Inventario</h4>

      ${canEdit ? `
        <div class="d-flex gap-2">
          <button class="btn btn-outline-brand" id="btnNewCategory">Nueva categoría</button>
          <button class="btn btn-brand" id="btnNew">Nuevo producto</button>
        </div>
      ` : ''}
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
              const low = (Number(r.stock ?? 0) <= Number(p.minStock ?? 0));
              return `
                <tr class="${low ? 'table-warning' : ''}">
                  <td>${safe(p.sku ?? '')}</td>
                  <td>
                    ${safe(p.name ?? '')}
                    ${low ? '<span class="badge text-bg-danger ms-2">Crítico</span>' : ''}
                  </td>
                  <td>${safe(p.category ?? '')}</td>
                  <td class="fw-semibold">${Number(r.stock ?? 0)}</td>
                  <td>${Number(p.minStock ?? 0)}</td>
                  <td>${p.maxStock ?? ''}</td>
                  <td>${money(p.salePrice ?? 0)}</td>
                  <td>${safe(p.supplier ?? '')}</td>
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
        ${
          canEdit
            ? 'Admin: puedes crear/editar/borrar. (Con backend, persistirá).'
            : 'Modo empleado: solo lectura.'
        }
      </div>
    </div>

    ${canEdit ? `
    <!-- Modal PRODUCTO (solo admin) -->
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
                    ${categories.map(c=>`<option value="${safe(c)}">${safe(c)}</option>`).join('')}
                  </select>
                  <div class="form-text">Si no existe, crea una con “Nueva categoría”.</div>
                </div>

                <div class="col-md-8">
                  <label class="form-label">Descripción</label>
                  <input class="form-control" id="description" placeholder="Descripción breve (opcional)">
                </div>

                <div class="col-md-8">
                  <label class="form-label">Imagen del producto</label>
                  <input type="file" class="form-control" id="imageFile" accept="image/*">
                  <div class="form-text">Se mostrará en las cards del Punto de Venta.</div>
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

                <!-- ✅ MICAS: SPH/CYL (sin eje) -->
                <div class="col-12" id="gradMicasBox" style="display:none;">
                  <div class="border rounded p-3 bg-light">
                    <div class="fw-semibold">Graduación (Micas)</div>
                    <div class="row g-3 mt-1">
                      <div class="col-md-6">
                        <label class="form-label">Esférico (SPH)</label>
                        <input class="form-control" id="mSph" placeholder="Ej: -1.25">
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Cilíndrico (CYL)</label>
                        <input class="form-control" id="mCyl" placeholder="Ej: -0.50">
                      </div>
                    </div>
                    <div class="small text-muted mt-2">El EJE se captura en BISEL.</div>
                  </div>
                </div>

                <!-- ✅ BISEL: EJE -->
                <div class="col-12" id="gradBiselBox" style="display:none;">
                  <div class="border rounded p-3 bg-light">
                    <div class="fw-semibold">Parámetros (Bisel)</div>
                    <div class="row g-3 mt-1">
                      <div class="col-md-6">
                        <label class="form-label">Eje (AXIS)</label>
                        <input class="form-control" id="bAxis" placeholder="Ej: 180">
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Notas bisel (opcional)</label>
                        <input class="form-control" id="bNotes" placeholder="Ej: bisel fino / grueso...">
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ✅ CONTACTO: SPH/CYL (sin eje) -->
                <div class="col-12" id="gradContactBox" style="display:none;">
                  <div class="border rounded p-3 bg-light">
                    <div class="fw-semibold">Graduación (Lentes de Contacto)</div>
                    <div class="row g-3 mt-1">
                      <div class="col-md-6">
                        <label class="form-label">Esférico (SPH)</label>
                        <input class="form-control" id="cSph" placeholder="Ej: -2.00">
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Cilíndrico (CYL)</label>
                        <input class="form-control" id="cCyl" placeholder="Ej: -0.75">
                      </div>
                    </div>
                    <div class="small text-muted mt-2">El EJE se captura en BISEL.</div>
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

    <!-- Modal CATEGORÍA (solo admin) -->
    <div class="modal fade" id="categoryModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Nueva categoría</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <div class="mb-2">
              <label class="form-label">Nombre de la categoría</label>
              <input class="form-control" id="catName" placeholder="Ej: GOTAS, SERVICIOS, ETC">
              <div class="form-text">Tip: usa MAYÚSCULAS y sin acentos.</div>
            </div>
            <div class="alert alert-light border mb-0 small">
              Mock: se guardará en <b>localStorage</b>. En backend, esto sería <code>POST /api/categories</code>.
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-brand" id="btnSaveCategory">Guardar categoría</button>
          </div>
        </div>
      </div>
    </div>
    ` : ''}
  `;

  // DataTable
  if(window.$ && $.fn.dataTable){
    if($.fn.DataTable.isDataTable('#tblInventory')){
      $('#tblInventory').DataTable().destroy();
    }
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

  // ✅ EMPLEADO: sale aquí
  if(!canEdit) return;

  // --- MODALES ---
  const productModal = new bootstrap.Modal(document.getElementById('productModal'));
  const categoryModal = new bootstrap.Modal(document.getElementById('categoryModal'));

  let imageBase64 = null;

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

  const toggleSpecificUI = ()=>{
    const cat = document.getElementById('category').value;
    document.getElementById('gradMicasBox').style.display = (cat === 'MICAS') ? '' : 'none';
    document.getElementById('gradBiselBox').style.display = (cat === 'BISEL') ? '' : 'none';
    document.getElementById('gradContactBox').style.display = (cat === 'LENTES_CONTACTO') ? '' : 'none';
  };

  const clearSpecificInputs = ()=>{
    ['mSph','mCyl','bAxis','bNotes','cSph','cCyl'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.value = '';
    });
  };

  const rebuildCategorySelect = (selected=null)=>{
    categories = loadCategories();
    const sel = document.getElementById('category');
    if(!sel) return;

    sel.innerHTML = categories.map(c=>`<option value="${safe(c)}">${safe(c)}</option>`).join('');
    if(selected && categories.includes(selected)) sel.value = selected;
  };

  const openProductModal = (p=null)=>{
    document.getElementById('modalTitle').textContent = p ? 'Editar producto' : 'Nuevo producto';

    document.getElementById('productId').value = p?.id ?? '';
    document.getElementById('sku').value = p?.sku ?? '';
    document.getElementById('name').value = p?.name ?? '';

    rebuildCategorySelect(p?.category ?? 'MICAS');

    document.getElementById('description').value = p?.description ?? '';
    document.getElementById('buyPrice').value = p?.buyPrice ?? '';
    document.getElementById('salePrice').value = p?.salePrice ?? '';
    document.getElementById('minStock').value = p?.minStock ?? '';
    document.getElementById('maxStock').value = p?.maxStock ?? '';
    document.getElementById('supplier').value = p?.supplier ?? '';

    const fileInput = document.getElementById('imageFile');
    if(fileInput) fileInput.value = '';

    const imgUrl = p?.imageUrl || p?.image_url || null;
    imageBase64 = p?.imageBase64 || null;
    renderImagePreview(imgUrl || imageBase64);

    clearSpecificInputs();

    const cat = p?.category ?? document.getElementById('category').value;
    const g = p?.graduation || {};
    const b = p?.bisel || {};

    if(cat === 'MICAS'){
      document.getElementById('mSph').value = g.sph ?? '';
      document.getElementById('mCyl').value = g.cyl ?? '';
    }else if(cat === 'BISEL'){
      document.getElementById('bAxis').value = b.axis ?? '';
      document.getElementById('bNotes').value = b.notes ?? '';
    }else if(cat === 'LENTES_CONTACTO'){
      document.getElementById('cSph').value = g.sph ?? '';
      document.getElementById('cCyl').value = g.cyl ?? '';
    }

    toggleSpecificUI();
    productModal.show();
  };

  outlet.querySelector('#btnNew')?.addEventListener('click', ()=> openProductModal(null));
  outlet.querySelector('#btnNewCategory')?.addEventListener('click', ()=>{
    document.getElementById('catName').value = '';
    categoryModal.show();
  });

  document.getElementById('category').addEventListener('change', toggleSpecificUI);

  document.getElementById('imageFile').addEventListener('change', async (e)=>{
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

    imageBase64 = await readImageFileToBase64(file);
    renderImagePreview(imageBase64);
  });

  // EDITAR/BORRAR
  outlet.addEventListener('click', async (e)=>{
    const editId = e.target?.dataset?.edit;
    const delId = e.target?.dataset?.del;

    if(editId){
      const p = rows.map(r=>r.product).find(x=>String(x?.id)===String(editId));
      openProductModal(p);
    }

    if(delId){
      const r = await Swal.fire({
        title: '¿Eliminar producto?',
        text: 'Esta acción se confirmará.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, borrar'
      });
      if(!r.isConfirmed) return;
      await inventoryService.deleteProduct(delId);
      Swal.fire('Listo','Producto eliminado.','success');
    }
  });

  // GUARDAR PRODUCTO
  document.getElementById('btnSave').addEventListener('click', async ()=>{
    const category = document.getElementById('category').value;

    const graduation =
      category === 'MICAS'
        ? { sph: document.getElementById('mSph').value.trim(), cyl: document.getElementById('mCyl').value.trim() }
        : category === 'LENTES_CONTACTO'
          ? { sph: document.getElementById('cSph').value.trim(), cyl: document.getElementById('cCyl').value.trim() }
          : null;

    const bisel =
      category === 'BISEL'
        ? { axis: document.getElementById('bAxis').value.trim(), notes: document.getElementById('bNotes').value.trim() }
        : null;

    const normalizedGraduation =
      graduation && (graduation.sph || graduation.cyl) ? graduation : null;

    const payload = {
      sku: document.getElementById('sku').value.trim(),
      name: document.getElementById('name').value.trim(),
      category,
      description: document.getElementById('description').value.trim(),
      graduation: normalizedGraduation,
      bisel: (bisel && (bisel.axis || bisel.notes)) ? bisel : null,
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

    const file = document.getElementById('imageFile')?.files?.[0] || null;

    // ✅ Intentamos con FormData (backend real)
    const fd = new FormData();
    fd.append('sku', payload.sku);
    fd.append('name', payload.name);
    fd.append('category', payload.category);
    fd.append('description', payload.description || '');
    fd.append('buyPrice', String(payload.buyPrice || 0));
    fd.append('salePrice', String(payload.salePrice || 0));
    fd.append('minStock', String(payload.minStock || 0));
    fd.append('maxStock', String(payload.maxStock || 0));
    fd.append('supplier', payload.supplier || '');
    if(payload.graduation) fd.append('graduation', JSON.stringify(payload.graduation));
    if(payload.bisel) fd.append('bisel', JSON.stringify(payload.bisel));
    if(file) fd.append('image', file);

    const id = document.getElementById('productId').value;

    try{
      if(id) await inventoryService.updateProduct(id, fd);
      else await inventoryService.createProduct(fd);

      productModal.hide();
      Swal.fire('Guardado','Producto guardado.','success');
    }catch(err){
      // fallback mock
      console.error(err);
      const fallbackPayload = { ...payload, imageBase64: imageBase64 || null };
      try{
        if(id) await inventoryService.updateProduct(id, fallbackPayload);
        else await inventoryService.createProduct(fallbackPayload);

        productModal.hide();
        Swal.fire('Guardado (mock)','No se pudo subir al backend, se guardó local para vista.','warning');
      }catch(e2){
        console.error(e2);
        Swal.fire('Error','No se pudo guardar el producto.','error');
      }
    }
  });

  // GUARDAR CATEGORÍA
  document.getElementById('btnSaveCategory').addEventListener('click', async ()=>{
    const raw = document.getElementById('catName').value || '';
    let name = raw.trim();

    name = name
      .toUpperCase()
      .replaceAll('Á','A').replaceAll('É','E').replaceAll('Í','I').replaceAll('Ó','O').replaceAll('Ú','U').replaceAll('Ñ','N')
      .replace(/\s+/g,'_')
      .replace(/[^A-Z0-9_]/g,'');

    if(!name){
      Swal.fire('Falta nombre','Escribe el nombre de la categoría.','info');
      return;
    }
    if(BASE_CATEGORIES.includes(name)){
      Swal.fire('Ya existe','Esa categoría ya existe (base).','info');
      return;
    }

    const current = loadCategories().filter(c => !BASE_CATEGORIES.includes(c));
    const allExtras = Array.from(new Set([...current, name]));
    saveCategories(allExtras);

    rebuildCategorySelect(name);

    categoryModal.hide();
    Swal.fire('Guardado','Categoría creada (mock).','success');
  });
}
