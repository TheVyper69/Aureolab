import { api } from './api.js';

class InventoryService{
  async list(){ return (await api.get('/inventory')).data; }
  async lowStock(){ return (await api.get('/inventory/low-stock')).data; }

  // ✅ CATEGORIES
  async listCategories(){ return (await api.get('/categories')).data; }

  async createCategory(payload){
    return (await api.post('/categories', payload)).data;
  }

  async updateCategory(id, payload){
    // ✅ soporta FormData por si en el futuro agregas icono/imagen
    if(payload instanceof FormData){
      payload.append('_method', 'PUT');
      return (await api.post(`/categories/${id}`, payload)).data;
    }
    return (await api.put(`/categories/${id}`, payload)).data;
  }

  async deleteCategory(id){
    return (await api.delete(`/categories/${id}`)).data;
  }

  // ✅ PRODUCTS
  async createProduct(payload){
    return (await api.post('/products', payload)).data;
  }

  // ✅ FIX: soporta FormData + PUT fallback con _method
  async updateProduct(id, payload){
    if(payload instanceof FormData){
      payload.append('_method', 'PUT');
      return (await api.post(`/products/${id}`, payload)).data; // ✅ POST + _method=PUT
    }
    return (await api.put(`/products/${id}`, payload)).data;
  }

  async deleteProduct(id){
    return (await api.delete(`/products/${id}`)).data;
  }

  // ✅ opcional pero MUY útil: traer un producto por id (para edición)
  async getProduct(id){
    return (await api.get(`/products/${id}`)).data;
  }

  // ✅ imagen protegida (blob) usando tu api.getBlob
  async getProductImageBlob(id){
    return await api.getBlob(`/products/${id}/image`);
  }

  // ✅ STOCK
  async addStock(productId, payload){
    // payload ejemplo: { qty: 5, note: "Entrada desde inventario" }
    return (await api.post(`/products/${productId}/stock`, payload)).data;
  }
}

export const inventoryService = new InventoryService();
