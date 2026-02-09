/* Ruta: public/assets/js/services/api.js */

import { authService } from './authService.js';

class ApiService {
  constructor() {
    // ✅ Laravel API
    this.baseURL = 'http://127.0.0.1:8000/api';

    // ✅ Cambia a false para usar backend real
    this.useMock = false;

    this.client = axios.create({ baseURL: this.baseURL, timeout: 12000 });

    this.client.interceptors.request.use((config) => {
      const token = authService.getToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      // IMPORTANTE: axios ya manda application/json por defecto cuando body es objeto,
      // pero lo dejamos explícito para evitar problemas.
      config.headers.Accept = 'application/json';
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err?.response?.status;
        if (status === 401) {
          authService.logout();
          location.hash = '#/login';
        }
        return Promise.reject(err);
      }
    );
  }

  async _readMockDB() {
    const res = await fetch('../api/mock-data.json', { cache: 'no-store' });
    return await res.json();
  }

  async mockGet(path) {
    const db = await this._readMockDB();

    if (path === '/products') return { data: db.products };
    if (path === '/categories') return { data: db.categories };
    if (path === '/inventory') {
      const joined = db.inventory.map((row) => {
        const p = db.products.find((x) => x.id === row.productId);
        return { ...row, product: p || null };
      });
      return { data: joined };
    }
    if (path === '/inventory/low-stock') {
      const joined = db.inventory
        .map((row) => {
          const p = db.products.find((x) => x.id === row.productId);
          const min = p?.minStock ?? 0;
          return { ...row, product: p || null, isLow: row.stock <= min };
        })
        .filter((x) => x.isLow);
      return { data: joined };
    }
    if (path === '/sales') return { data: db.sales };
    if (path === '/customers') return { data: db.customers };
    if (path === '/users') return { data: db.users || [] };
    if (path === '/opticas') return { data: db.opticas || [] };
    if (path === '/orders') return { data: db.orders || [] };

    throw new Error('Ruta mock no soportada: ' + path);
  }

  async get(path, config = {}) {
    if (this.useMock) return await this.mockGet(path);
    return await this.client.get(path, config);
  }

  async post(path, body, config = {}) {
    if (this.useMock) return { data: { ok: true, body } };
    return await this.client.post(path, body, config);
  }

  async put(path, body, config = {}) {
    if (this.useMock) return { data: { ok: true, body } };
    return await this.client.put(path, body, config);
  }

  async delete(path, config = {}) {
    if (this.useMock) return { data: { ok: true } };
    return await this.client.delete(path, config);
  }
}

export const api = new ApiService();
