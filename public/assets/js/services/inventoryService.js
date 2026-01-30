import { api } from './api.js';

class InventoryService{
  async list(){ return (await api.get('/inventory')).data; }
  async lowStock(){ return (await api.get('/inventory/low-stock')).data; }

  // CRUD (mock: no persiste, queda listo para backend)
  async createProduct(payload){ return (await api.post('/products', payload)).data; }
  async updateProduct(id, payload){ return (await api.put(`/products/${id}`, payload)).data; }
  async deleteProduct(id){ return (await api.delete(`/products/${id}`)).data; }
}
export const inventoryService = new InventoryService();
