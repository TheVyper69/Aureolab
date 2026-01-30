import { api } from './api.js';

class OpticasService {
  async list(){ return (await api.get('/opticas')).data; }
  async create(payload){ return (await api.post('/opticas', payload)).data; }
  async update(id, payload){ return (await api.put(`/opticas/${id}`, payload)).data; }
  async remove(id){ return (await api.delete(`/opticas/${id}`)).data; }
}
export const opticasService = new OpticasService();
