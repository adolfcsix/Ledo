export async function request(path,data){
  const response=await fetch(path,data===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const payload=await response.json();
  if(!response.ok)throw Object.assign(new Error(payload.error??'Không thực hiện được yêu cầu.'),{status:response.status});
  return payload;
}
