import { api } from './api.js';

class OrdersService {
  async list(){ return (await api.get('/orders')).data; }
  async create(payload){ return (await api.post('/orders', payload)).data; }
  async update(id, payload){ return (await api.put(`/orders/${id}`, payload)).data; }
}
export const ordersService = new OrdersService();
