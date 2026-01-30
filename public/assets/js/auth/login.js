import { authService } from '../services/authService.js';
import { required, isEmail } from '../utils/validators.js';

export function renderLogin(root) {
  root.innerHTML = `
  <div class="auth-wrap">
    <div class="card auth-card">
      <div class="card-body p-4">
        <div class="text-center mb-3">
          <div class="fw-bold text-brand fs-4">POS Laboratorio</div>
          <div class="text-muted small">Acceso al sistema</div>
        </div>

        <form id="loginForm" novalidate>
          <div class="mb-3">
            <label class="form-label">Correo</label>
            <input type="email" class="form-control" id="email" placeholder="correo@dominio.com" required>
            <div class="invalid-feedback">Ingresa un correo válido.</div>
          </div>

          <div class="mb-3">
            <label class="form-label">Contraseña</label>
            <input type="password" class="form-control" id="password" placeholder="••••••••" required>
            <div class="invalid-feedback">La contraseña es obligatoria.</div>
          </div>

          <button class="btn btn-brand w-100" type="submit">Entrar</button>

          <div class="mt-3 small text-muted">
            Mock: si tu correo contiene <b>admin</b> entrarás como admin. Si contiene <b>optica</b>, entrarás como óptica.
          </div>

          <div class="mt-3 text-center">
            <a href="#/register" class="text-decoration-none">Crear cuenta (admin)</a>
          </div>
        </form>
      </div>
    </div>
  </div>
  `;

  // ✅ IMPORTANTE: usa root.querySelector para no “perder” elementos en SPA
  const form = root.querySelector('#loginForm');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = root.querySelector('#email');
    const password = root.querySelector('#password');

    const emailOk = required(email.value) && isEmail(email.value);
    const passOk = required(password.value);

    email.classList.toggle('is-invalid', !emailOk);
    password.classList.toggle('is-invalid', !passOk);
    if (!emailOk || !passOk) return;

    try {
      await authService.login({ email: email.value, password: password.value });

      // ✅ Redirección por rol
      const role = authService.getRole();
      location.hash = role === 'optica' ? '#/orders' : '#/pos';
    } catch (err) {
      Swal.fire('Error', 'No se pudo iniciar sesión.', 'error');
    }
  });
}
