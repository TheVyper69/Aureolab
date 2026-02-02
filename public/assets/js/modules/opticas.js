import { opticasService } from '../services/opticasService.js';

const PM_LABEL = { cash: 'Efectivo', transfer: 'Transferencia' };

export async function renderOpticas(outlet){
  const opticas = await opticasService.list();

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h4 class="mb-0">Ópticas</h4>
      <button class="btn btn-brand" id="btnNewOptica">Registrar Óptica</button>
    </div>

    <div class="card p-3">
      <div class="table-responsive">
        <table id="tblOpticas" class="table table-striped align-middle" style="width:100%">
          <thead>
            <tr>
              <th>Óptica</th>
              <th>Contacto</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Pago permitido</th>
              <th>Estatus</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${opticas.map(o => `
              <tr>
                <td>${o.nombre}</td>
                <td>${o.contacto || ''}</td>
                <td>${o.telefono || ''}</td>
                <td>${o.email || ''}</td>
                <td>${(o.paymentMethods||[]).map(m=>`<span class="badge text-bg-light border me-1">${PM_LABEL[m]||m}</span>`).join('')}</td>
                <td>${o.active ? '<span class="badge text-bg-success">Activa</span>' : '<span class="badge text-bg-danger">Inactiva</span>'}</td>
                <td>
                  <button class="btn btn-sm btn-outline-brand" data-edit="${o.id}">Editar</button>
                  <button class="btn btn-sm btn-outline-danger" data-del="${o.id}">Borrar</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="small text-muted mt-2">Mock: no persiste.</div>
    </div>

    <div class="modal fade" id="opticaModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="opticaModalTitle">Registrar Óptica</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <form id="opticaForm">
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Nombre de la óptica</label>
                  <input class="form-control" id="oNombre" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Contacto</label>
                  <input class="form-control" id="oContacto">
                </div>

                <div class="col-md-4">
                  <label class="form-label">Teléfono</label>
                  <input class="form-control" id="oTelefono">
                </div>
                <div class="col-md-8">
                  <label class="form-label">Email (login de la óptica)</label>
                  <input type="email" class="form-control" id="oEmail" required>
                  <div class="form-text">Mock login: email que contenga <b>optica</b>.</div>
                </div>

                <!-- ✅ NUEVO: Contraseña -->
                <div class="col-md-6">
                  <label class="form-label">Contraseña</label>
                  <input type="password" class="form-control" id="oPassword" placeholder="••••••••">
                  <div class="form-text">Escribe una contraseña para crearla o cambiarla.</div>
                </div>

                <div class="col-md-6">
                  <label class="form-label">Métodos de pago permitidos</label>
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="pmCash">
                    <label class="form-check-label" for="pmCash">Efectivo</label>
                  </div>
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="pmTransfer">
                    <label class="form-check-label" for="pmTransfer">Transferencia</label>
                  </div>
                </div>

                <div class="col-md-6">
                  <label class="form-label">Estatus</label>
                  <select class="form-select" id="oActive">
                    <option value="true">Activa</option>
                    <option value="false">Inactiva</option>
                  </select>
                </div>
              </div>
              <input type="hidden" id="oId">
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-brand" id="btnSaveOptica">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  if(window.$ && $.fn.dataTable){
    $('#tblOpticas').DataTable({
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

  const modal = new bootstrap.Modal(document.getElementById('opticaModal'));

  const openModal = (o=null)=>{
    document.getElementById('opticaModalTitle').textContent = o ? 'Editar óptica' : 'Registrar óptica';
    document.getElementById('oId').value = o?.id ?? '';
    document.getElementById('oNombre').value = o?.nombre ?? '';
    document.getElementById('oContacto').value = o?.contacto ?? '';
    document.getElementById('oTelefono').value = o?.telefono ?? '';
    document.getElementById('oEmail').value = o?.email ?? '';
    document.getElementById('oActive').value = String(o?.active ?? true);

    // ✅ Siempre vacío por seguridad (no mostramos contraseñas)
    document.getElementById('oPassword').value = '';

    const pms = new Set(o?.paymentMethods || []);
    document.getElementById('pmCash').checked = pms.has('cash');
    document.getElementById('pmTransfer').checked = pms.has('transfer');
    modal.show();
  };

  outlet.querySelector('#btnNewOptica').addEventListener('click', ()=>openModal(null));

  outlet.addEventListener('click', async (e)=>{
    const editId = e.target?.dataset?.edit;
    const delId = e.target?.dataset?.del;

    if(editId){
      const o = opticas.find(x=>String(x.id)===String(editId));
      openModal(o);
    }
    if(delId){
      const r = await Swal.fire({
        title: '¿Eliminar óptica?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, borrar'
      });
      if(!r.isConfirmed) return;
      await opticasService.remove(delId);
      Swal.fire('Listo','Óptica eliminada (mock).','success');
    }
  });

  document.getElementById('btnSaveOptica').addEventListener('click', async ()=>{
    const nombre = document.getElementById('oNombre').value.trim();
    const email = document.getElementById('oEmail').value.trim();
    const paymentMethods = [];
    if(document.getElementById('pmCash').checked) paymentMethods.push('cash');
    if(document.getElementById('pmTransfer').checked) paymentMethods.push('transfer');

    if(!nombre || !email){
      Swal.fire('Faltan datos','Nombre y Email son obligatorios.','info');
      return;
    }
    if(paymentMethods.length === 0){
      Swal.fire('Falta método de pago','Selecciona al menos un método.','info');
      return;
    }

    // ✅ password: solo si lo escriben
    const password = (document.getElementById('oPassword').value || '').trim();
    if(password && password.length < 6){
      Swal.fire('Contraseña inválida','Debe tener al menos 6 caracteres.','info');
      return;
    }

    const payload = {
      nombre,
      contacto: document.getElementById('oContacto').value.trim(),
      telefono: document.getElementById('oTelefono').value.trim(),
      email,
      active: document.getElementById('oActive').value === 'true',
      paymentMethods
    };

    if(password) payload.password = password;

    const id = document.getElementById('oId').value;
    if(id) await opticasService.update(id, payload);
    else await opticasService.create(payload);

    modal.hide();
    Swal.fire('Guardado','(Mock) Listo.','success');
  });
}