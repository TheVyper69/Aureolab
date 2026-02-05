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

  if (!authService.getToken()) {
    location.hash = '#/login';
    return false;
  }
  return true;
}

function requireRole(hash) {
  const role = authService.getRole();

  // Admin-only
  const adminOnly = ['#/users', '#/opticas', '#/sales'];

  // ✅ Óptica allowed
  const opticaAllowed = ['#/pos', '#/orders'];

  // ✅ Employee allowed (ahora también #/orders)
  const employeeAllowed = ['#/pos', '#/inventory', '#/orders'];

  // --- ADMIN-ONLY ---
  if (adminOnly.includes(hash) && role !== 'admin') {
    Swal.fire('Acceso restringido', 'Solo administradores.', 'warning');
    location.hash = role === 'optica' ? '#/orders' : '#/pos';
    return false;
  }

  // --- ÓPTICA ---
  if (role === 'optica' && !opticaAllowed.includes(hash)) {
    location.hash = '#/orders';
    return false;
  }

  // --- EMPLEADO ---
  if (role === 'employee' && !employeeAllowed.includes(hash)) {
    Swal.fire('Acceso restringido', 'Tu rol solo permite POS, Inventario y Pedidos.', 'warning');
    location.hash = '#/pos';
    return false;
  }

  return true;
}

async function navigate() {
  const root = document.getElementById('appRoot');
  let hash = location.hash || '#/login';

  if (!routes[hash]) {
    if (!authService.getToken()) {
      location.hash = '#/login';
      return;
    }
    const role = authService.getRole();
    location.hash = (role === 'optica') ? '#/orders' : '#/pos';
    return;
  }

  if (!requireAuth(hash)) return;

  const isPublic = ['#/login', '#/register'].includes(hash);
  if (isPublic) {
    await routes[hash](root);
    return;
  }

  if (!requireRole(hash)) return;

  root.innerHTML = renderLayout();
  const outlet = document.getElementById('outlet');

  showOverlay('Cargando…');
  try {
    await routes[hash](outlet);
  } catch (err) {
    console.error(err);
    Swal.fire('Error', 'Ocurrió un error cargando el módulo.', 'error');
  } finally {
    hideOverlay();
  }
}

window.addEventListener('hashchange', navigate);
window.addEventListener('DOMContentLoaded', navigate);