import { api } from './api.js';

class AuthService {
  constructor() {
    this.TOKEN_KEY = 'auth_token';
    this.USER_KEY = 'auth_user';
  }

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  getUser() {
    try {
      return JSON.parse(localStorage.getItem(this.USER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  setUser(user) {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user || null));
  }

  // ✅ Normaliza rol para tu front (admin/employee/optica)
  getRole() {
    const u = this.getUser();

    // Si backend ya manda role directo
    const roleName =
      u?.role?.name ||
      u?.role_name ||
      u?.roleName ||
      null;

    if (roleName) return String(roleName).toLowerCase();

    // Fallback: si solo manda role_id
    const roleId = Number(u?.role_id ?? u?.roleId ?? 0);
    if (roleId === 1) return 'admin';
    if (roleId === 2) return 'employee';
    if (roleId === 3) return 'optica';

    return null;
  }

  async login({ email, password }) {
    // ✅ Laravel Sanctum (token-based) - POST /api/auth/login
    const res = await api.post('/auth/login', { email, password });

    const token = res?.data?.token;
    const user = res?.data?.user;

    if (!token || !user) {
      throw new Error('Respuesta inválida del servidor (token/user).');
    }

    this.setToken(token);
    this.setUser(user);

    return res.data;
  }

  async logout() {
    try {
      // si tienes endpoint de logout en backend
      await api.post('/auth/logout', {});
    } catch (e) {
      // no pasa nada si falla
    }
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  isLoggedIn() {
    return !!this.getToken();
  }
}

export const authService = new AuthService();