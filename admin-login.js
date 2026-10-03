async function csrf(){const r=await fetch('/api/csrf');if(!r.ok)throw new Error('Serveur indisponible.');return (await r.json()).csrf}
if(location.protocol==='file:'){
  try{const params=new URLSearchParams(location.search);const incoming=JSON.parse(params.get('localAdmin')||'null');if(incoming?.role==='admin'){const users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');if(!users.some(user=>user.id===incoming.id)){users.push(incoming);localStorage.setItem('vigie-local-test-users-v1',JSON.stringify(users))}history.replaceState(null,'',location.pathname+location.hash)}}catch{}
  const setupLink=document.querySelector('#local-admin-setup');
  try{const users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');setupLink.hidden=users.some(user=>user.role==='admin')}catch{setupLink.hidden=false}
}
document.querySelector('#admin-login-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const message=document.querySelector('#message');message.textContent='';
  if(location.protocol==='file:'){
    try{const data=Object.fromEntries(new FormData(form));const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.password));const passwordHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');const users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');const user=users.find(item=>item.role==='admin'&&item.identifier.toLocaleLowerCase('fr-CA')===data.identifier.trim().toLocaleLowerCase('fr-CA')&&item.passwordHash===passwordHash);if(!user)throw new Error('Courriel, numéro ou mot de passe incorrect.');localStorage.setItem('vigie-local-test-session-v1',JSON.stringify({id:user.id,role:user.role}));localStorage.setItem('vigie-admin-display-name',user.display_name);location.href=`admin.html?localAdmin=${encodeURIComponent(JSON.stringify(user))}`}catch(error){message.textContent=error.message||'Impossible de se connecter dans ce navigateur.'}
    return;
  }
  try{const data=Object.fromEntries(new FormData(form));const token=await csrf();const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Connexion refusée.');if(result.user.role!=='admin'){await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:'{}'});throw new Error('Ce compte ne possède pas les droits administrateur.');}location.href='/admin.html';}
  catch(error){message.textContent=error.message||'Impossible de joindre le serveur local.'}
});
