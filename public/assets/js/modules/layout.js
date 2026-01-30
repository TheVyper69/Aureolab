import { authService } from '../services/authService.js';

export function renderLayout(){
  const role = authService.getRole();
  const user = authService.getUser() || { name: 'Usuario' };

  const links = [
    { hash: '#/pos', label: 'Punto de Venta', roles: ['admin','employee'] },
    { hash: '#/inventory', label: 'Inventario', roles: ['admin','employee'] }, // employee solo lectura dentro del módulo
    { hash: '#/sales', label: 'Ventas / Reportes', roles: ['admin','employee'] },
    { hash: '#/users', label: 'Usuarios', roles: ['admin'] },
    { hash: '#/opticas', label: 'Ópticas', roles: ['admin'] },
    { hash: '#/orders', label: 'Pedidos', roles: ['optica'] }
  ].filter(l => l.roles.includes(role));

  const current = location.hash || '#/pos';

  return `
  <div class="container-fluid">
    <div class="row">
      <aside class="col-12 col-lg-2 sidebar p-2">
        <div class="p-3">
          <div class="fw-bold text-brand fs-5">Laboratorio POS</div>
          <div class="mt-2">
            <span class="badge badge-role">${role}</span>
            <div class="small text-muted mt-1">${user.name}</div>
          </div>
        </div>
        <nav>
          ${links.map(l => `<a class="${l.hash===current?'active':''}" href="${l.hash}">${l.label}</a>`).join('')}
          <a href="#" id="btnLogout" class="text-danger">Cerrar sesión</a>
        </nav>
      </aside>

      <main class="col-12 col-lg-10 p-3">
        <div id="outlet"></div>
      </main>
    </div>
  </div>
  `;
}

document.addEventListener('click', (e)=>{
  if(e.target?.id === 'btnLogout'){
    e.preventDefault();
    Swal.fire({
      title: '¿Cerrar sesión?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, salir'
    }).then(r=>{
      if(r.isConfirmed){
        authService.logout();
        location.hash = '#/login';
      }
    });
  }
});
