import { authService } from '../services/authService.js';
import { required, isEmail, minLen } from '../utils/validators.js';

export function renderRegister(root){
  root.innerHTML = `
  <div class="auth-wrap">
    <div class="card auth-card">
      <div class="card-body p-4">
        <div class="text-center mb-3">
          <div class="fw-bold text-brand fs-4">Crear Admin</div>
          <div class="text-muted small">Registro (fase 1 mock)</div>
        </div>

        <form id="regForm" novalidate>
          <div class="mb-3">
            <label class="form-label">Nombre</label>
            <input class="form-control" id="name" required>
            <div class="invalid-feedback">El nombre es obligatorio.</div>
          </div>

          <div class="mb-3">
            <label class="form-label">Correo</label>
            <input type="email" class="form-control" id="email" required>
            <div class="invalid-feedback">Ingresa un correo válido.</div>
          </div>

          <div class="mb-3">
            <label class="form-label">Contraseña</label>
            <input type="password" class="form-control" id="password" required>
            <div class="invalid-feedback">Mínimo 6 caracteres.</div>
          </div>

          <button class="btn btn-brand w-100" type="submit">Registrar</button>

          <div class="mt-3 text-center">
            <a href="#/login" class="text-decoration-none">Volver</a>
          </div>
        </form>
      </div>
    </div>
  </div>
  `;

  const form = document.getElementById('regForm');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();

    const name = document.getElementById('name');
    const email = document.getElementById('email');
    const password = document.getElementById('password');

    const nameOk = required(name.value);
    const emailOk = required(email.value) && isEmail(email.value);
    const passOk = minLen(password.value, 6);

    name.classList.toggle('is-invalid', !nameOk);
    email.classList.toggle('is-invalid', !emailOk);
    password.classList.toggle('is-invalid', !passOk);
    if(!nameOk || !emailOk || !passOk) return;

    try{
      await authService.register({ name: name.value, email: email.value, password: password.value });
      Swal.fire('Listo','Cuenta registrada (mock). Inicia sesión.','success');
      location.hash = '#/login';
    }catch(err){
      Swal.fire('Error','No se pudo registrar.','error');
    }
  });
}
