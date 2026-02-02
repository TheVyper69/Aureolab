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
  const adminOnly = ['#/users', '#/opticas'];

  // Optica-only
  const opticaOnly = ['#/orders'];

  // Employee allowed (solo POS + Inventario)
  const employeeAllowed = ['#/pos', '#/inventory'];

  // --- ADMIN ---
  if (adminOnly.includes(hash) && role !== 'admin') {
    Swal.fire('Acceso restringido', 'Solo administradores.', 'warning');
    location.hash = role === 'optica' ? '#/orders' : '#/pos';
    return false;
  }

  // --- ÓPTICA ---
  if (role === 'optica' && !opticaOnly.includes(hash)) {
    location.hash = '#/orders';
    return false;
  }
  if (opticaOnly.includes(hash) && role !== 'optica') {
    Swal.fire('Acceso restringido', 'Solo ópticas.', 'warning');
    location.hash = '#/pos';
    return false;
  }

  // --- EMPLEADO ---
  if (role === 'employee' && !employeeAllowed.includes(hash)) {
    Swal.fire('Acceso restringido', 'Tu rol solo permite POS e Inventario.', 'warning');
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
    location.hash = role === 'optica' ? '#/orders' : '#/pos';
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