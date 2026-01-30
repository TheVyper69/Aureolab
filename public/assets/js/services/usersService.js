import { api } from './api.js';

class UsersService {
  async list() { return (await api.get('/users')).data; }
  async create(payload) { return (await api.post('/users', payload)).data; }
  async update(id, payload) { return (await api.put(`/users/${id}`, payload)).data; }
  async remove(id) { return (await api.delete(`/users/${id}`)).data; }
}
export const usersService = new UsersService();
