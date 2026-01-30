import { usersService } from '../services/usersService.js';

export async function renderUsers(outlet){
  const users = await usersService.list();

  outlet.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h4 class="mb-0">Usuarios</h4>
      <button class="btn btn-brand" id="btnNewUser">Dar de alta</button>
    </div>

    <div class="card p-3">
      <div class="table-responsive">
        <table id="tblUsers" class="table table-striped align-middle" style="width:100%">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Estatus</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td><span class="badge ${u.role==='admin'?'text-bg-primary':(u.role==='optica'?'text-bg-info':'text-bg-secondary')}">${u.role}</span></td>
                <td>${u.active ? '<span class="badge text-bg-success">Activo</span>' : '<span class="badge text-bg-danger">Inactivo</span>'}</td>
                <td>
                  <button class="btn btn-sm btn-outline-brand" data-edit="${u.id}">Editar</button>
                  <button class="btn btn-sm btn-outline-danger" data-del="${u.id}">Borrar</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="small text-muted mt-2">Mock: no persiste.</div>
    </div>

    <div class="modal fade" id="userModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="userModalTitle">Alta de usuario</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <form id="userForm">
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Nombre</label>
                  <input class="form-control" id="uName" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" id="uEmail" required>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Rol</label>
                  <select class="form-select" id="uRole">
                    <option value="employee">Empleado</option>
                    <option value="optica">Óptica</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Estatus</label>
                  <select class="form-select" id="uActive">
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Contraseña</label>
                  <input type="password" class="form-control" id="uPassword" placeholder="Solo requerido al crear">
                  <div class="form-text">En edición puedes dejarlo vacío.</div>
                </div>
              </div>
              <input type="hidden" id="uId">
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-brand" id="btnSaveUser">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  if(window.$ && $.fn.dataTable){
    $('#tblUsers').DataTable({
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

  const modal = new bootstrap.Modal(document.getElementById('userModal'));

  const openModal = (u=null)=>{
    document.getElementById('userModalTitle').textContent = u ? 'Editar usuario' : 'Alta de usuario';
    document.getElementById('uId').value = u?.id ?? '';
    document.getElementById('uName').value = u?.name ?? '';
    document.getElementById('uEmail').value = u?.email ?? '';
    document.getElementById('uRole').value = u?.role ?? 'employee';
    document.getElementById('uActive').value = String(u?.active ?? true);
    document.getElementById('uPassword').value = '';
    modal.show();
  };

  outlet.querySelector('#btnNewUser').addEventListener('click', ()=>openModal(null));

  outlet.addEventListener('click', async (e)=>{
    const editId = e.target?.dataset?.edit;
    const delId = e.target?.dataset?.del;

    if(editId){
      const u = users.find(x=>String(x.id)===String(editId));
      openModal(u);
    }
    if(delId){
      const r = await Swal.fire({
        title: '¿Eliminar usuario?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, borrar'
      });
      if(!r.isConfirmed) return;
      await usersService.remove(delId);
      Swal.fire('Listo','Usuario eliminado (mock).','success');
    }
  });

  document.getElementById('btnSaveUser').addEventListener('click', async ()=>{
    const payload = {
      name: document.getElementById('uName').value.trim(),
      email: document.getElementById('uEmail').value.trim(),
      role: document.getElementById('uRole').value,
      active: document.getElementById('uActive').value === 'true'
    };
    const pass = document.getElementById('uPassword').value;

    if(!payload.name || !payload.email){
      Swal.fire('Faltan datos','Nombre y Email son obligatorios.','info');
      return;
    }

    const id = document.getElementById('uId').value;
    if(pass) payload.password = pass;

    if(id) await usersService.update(id, payload);
    else{
      if(!payload.password){
        Swal.fire('Falta contraseña','Para dar de alta, agrega contraseña.','info');
        return;
      }
      await usersService.create(payload);
    }

    modal.hide();
    Swal.fire('Guardado','(Mock) Listo.','success');
  });
}
