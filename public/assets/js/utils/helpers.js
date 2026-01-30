export function money(n){
  const num = Number(n || 0);
  return num.toLocaleString('es-MX', { style:'currency', currency:'MXN' });
}

export function formatDateTime(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString('es-MX');
  }catch{
    return String(iso || '');
  }
}

export function uid(prefix='id'){
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
