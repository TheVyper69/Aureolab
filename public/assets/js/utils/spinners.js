export function showOverlay(msg='Cargando…'){
  const el = document.getElementById('globalOverlay');
  const m = document.getElementById('overlayMsg');
  if(m) m.textContent = msg;
  if(el) el.classList.remove('d-none');
}

export function hideOverlay(){
  const el = document.getElementById('globalOverlay');
  if(el) el.classList.add('d-none');
}
