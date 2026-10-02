const activationToken=new URLSearchParams(location.search).get('token')||'';
async function csrf(){const r=await fetch('/api/csrf');if(!r.ok)throw new Error('Serveur indisponible.');return (await r.json()).csrf}
const activationForm=document.querySelector('#admin-setup-form');
const activationMessage=document.querySelector('#message');
if(!activationToken){activationMessage.textContent='Le lien d’activation est incomplet. Demande un nouveau lien au propriétaire du serveur.';activationForm.querySelector('button').disabled=true}
activationForm.addEventListener('submit',async event=>{
  event.preventDefault();activationMessage.textContent='';
  const values=Object.fromEntries(new FormData(activationForm));
  if(values.password!==values.confirm){activationMessage.textContent='Les deux mots de passe ne correspondent pas.';return}
  try{const token=await csrf();const response=await fetch('/api/admin/setup',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify({token:activationToken,name:values.name,identifier:values.identifier,password:values.password})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Activation impossible.');location.href='/admin.html';}
  catch(error){activationMessage.textContent=error.message||'Impossible de joindre le serveur local.'}
});
