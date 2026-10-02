async function csrf(){const r=await fetch('/api/csrf');if(!r.ok)throw new Error('Serveur indisponible.');return (await r.json()).csrf}
document.querySelector('#admin-login-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const message=document.querySelector('#message');message.textContent='';
  try{const data=Object.fromEntries(new FormData(form));const token=await csrf();const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Connexion refusée.');if(result.user.role!=='admin'){await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:'{}'});throw new Error('Ce compte ne possède pas les droits administrateur.');}location.href='/admin.html';}
  catch(error){message.textContent=error.message||'Impossible de joindre le serveur local.'}
});
