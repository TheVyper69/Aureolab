import { api } from './api.js';

class InventoryService{
  async list(){ return (await api.get('/inventory')).data; }
  async lowStock(){ return (await api.get('/inventory/low-stock')).data; }

  async listCategories(){ return (await api.get('/categories')).data; }

  async createCategory(payload){
    return (await api.post('/categories', payload)).data;
  }

  async updateCategory(id, payload){
    // ✅ si mandas FormData (por si luego agregas icono/imagen a categoría)
    if(payload instanceof FormData){
      payload.append('_method', 'PUT');
      return (await api.post(`/categories/${id}`, payload)).data;
    }
    return (await api.put(`/categories/${id}`, payload)).data;
  }

  async deleteCategory(id){
    return (await api.delete(`/categories/${id}`)).data;
  }

  async createProduct(payload){
    return (await api.post('/products', payload)).data;
  }

  async updateProduct(id, payload){
    if(payload instanceof FormData){
      payload.append('_method', 'PUT');
      return (await api.post(`/products/${id}`, payload)).data;
    }
    return (await api.put(`/products/${id}`, payload)).data;
  }

  async deleteProduct(id){
    return (await api.delete(`/products/${id}`)).data;
  }
  async addStock(productId, payload){
    // payload ejemplo: { qty: 5, note: "Entrada desde inventario" }
    return (await api.post(`/products/${productId}/stock`, payload)).data;
  }
}

export const inventoryService = new InventoryService();
