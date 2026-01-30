export function isEmail(v){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
}

export function required(v){
  return String(v||'').trim().length > 0;
}

export function minLen(v, n){
  return String(v||'').trim().length >= n;
}
