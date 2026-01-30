class AuthService {
  getToken(){ return localStorage.getItem('authToken'); }
  getRole(){ return localStorage.getItem('userRole'); } // 'admin' | 'employee'
  getUser(){ return JSON.parse(localStorage.getItem('userData') || 'null'); }

  async login({ email, password }){
    // Mock:
    // - email contiene "admin" => admin
    // - email contiene "optica" => optica
    // - si no => employee
    const token = 'mock-jwt-token';
    const em = String(email||'').toLowerCase();
    let role = 'employee';
    if(em.includes('admin')) role = 'admin';
    else if(em.includes('optica')) role = 'optica';

    localStorage.setItem('authToken', token);
    localStorage.setItem('userRole', role);

    const displayName = role === 'admin' ? 'Admin' : (role === 'optica' ? 'Óptica' : 'Empleado');
    localStorage.setItem('userData', JSON.stringify({ name: displayName, email }));

    if (role === 'optica') location.hash = '#/orders';
    else location.hash = '#/pos';

    return { ok:true, role };
  }

  async register({ name, email, password }){
    // Fase 1 (mock): permite crear admin
    return { ok:true };
  }

  logout(){
    localStorage.removeItem('authToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userData');
  }
}
export const authService = new AuthService();
