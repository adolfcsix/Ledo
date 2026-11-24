export const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});

export async function hash(token){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
