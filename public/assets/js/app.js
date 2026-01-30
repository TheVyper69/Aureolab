import { renderLogin } from './auth/login.js';
import { renderRegister } from './auth/register.js';

import { renderLayout } from './modules/layout.js';
import { renderPOS } from './modules/pos.js';
import { renderInventory } from './modules/inventory.js';
import { renderSales } from './modules/sales.js';
import { renderUsers } from './modules/users.js';
import { renderOpticas } from './modules/opticas.js';
import { renderOrders } from './modules/orders.js';

import { authService } from './services/authService.js';
import { showOverlay, hideOverlay } from './utils/spinners.js';

const routes = {
  '#/login': async (root) => renderLogin(root),
  '#/register': async (root) => renderRegister(root),
  '#/pos': renderPOS,
  '#/inventory': renderInventory,
  '#/sales': renderSales,
  '#/users': renderUsers,
  '#/opticas': renderOpticas,
  '#/orders': renderOrders
};

function requireAuth(hash) {
  const publicRoutes = ['#/login', '#/register'];
  if (publicRoutes.includes(hash)) return true;

  const token = authService.getToken();
  if (!token) {
    location.hash = '#/login';
    return false;
  }
  return true;
}

function requireRole(hash) {
  const role = authService.getRole();
  const adminOnly = ['#/users', '#/opticas'];
  const opticaAllowed = ['#/orders']; // óptica SOLO pedidos

  if (adminOnly.includes(hash) && role !== 'admin') {
    Swal.fire('Acceso restringido', 'Solo administradores.', 'warning');
    location.hash = role === 'optica' ? '#/orders' : '#/pos';
    return false;
  }

  // ✅ La óptica SOLO ve pedidos
  if (role === 'optica' && !opticaAllowed.includes(hash)) {
    location.hash = '#/orders';
    return false;
  }

  // ✅ Rutas de óptica no accesibles por otros roles
  if (opticaAllowed.includes(hash) && role !== 'optica') {
    Swal.fire('Acceso restringido', 'Solo ópticas.', 'warning');
    location.hash = '#/pos';
    return false;
  }

  return true;
}

async function navigate() {
  const root = document.getElementById('appRoot');
  let hash = location.hash || '#/login';

  // Si ruta no existe, manda a login o a lo que toque por rol
  if (!routes[hash]) {
    const role = authService.getRole();
    const token = authService.getToken();
    if (!token) {
      location.hash = '#/login';
      return;
    }
    location.hash = role === 'optica' ? '#/orders' : '#/pos';
    return;
  }

  // Auth
  if (!requireAuth(hash)) return;

  const isPublic = ['#/login', '#/register'].includes(hash);

  // Si es pública, render directo
  if (isPublic) {
    await routes[hash]?.(root);
    return;
  }

  // ✅ Roles (IMPORTANTE: esto faltaba en tu app)
  if (!requireRole(hash)) return;

  // Render layout + outlet
  root.innerHTML = renderLayout();
  const outlet = document.getElementById('outlet');

  showOverlay('Cargando…');
  try {
    await routes[hash]?.(outlet);
  } catch (err) {
    console.error(err);
    Swal.fire('Error', 'Ocurrió un error cargando el módulo.', 'error');
  } finally {
    hideOverlay();
  }
}

window.addEventListener('hashchange', navigate);
window.addEventListener('DOMContentLoaded', navigate);