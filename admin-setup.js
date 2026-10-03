const activationToken=new URLSearchParams(location.search).get('token')||'';
const localMode=location.protocol==='file:'&&new URLSearchParams(location.search).get('mode')==='local';
async function csrf(){const r=await fetch('/api/csrf');if(!r.ok)throw new Error('Serveur indisponible.');return (await r.json()).csrf}
const activationForm=document.querySelector('#admin-setup-form');
const activationMessage=document.querySelector('#message');
if(localMode){document.querySelector('.eyebrow').textContent='CONFIGURATION PRIVÉE · TEST SUR CET APPAREIL';document.querySelector('.intro').textContent='Crée ton compte propriétaire pour essayer le panneau administrateur dans ce navigateur. Ces identifiants servent uniquement au mode de test local.';activationForm.querySelector('button').innerHTML='Créer mon compte administrateur <span>→</span>'}
else if(!activationToken){activationMessage.textContent='Le lien d’activation est incomplet. Demande un nouveau lien au propriétaire du serveur.';activationForm.querySelector('button').disabled=true}
activationForm.addEventListener('submit',async event=>{
  event.preventDefault();activationMessage.textContent='';
  const values=Object.fromEntries(new FormData(activationForm));
  if(values.password!==values.confirm){activationMessage.textContent='Les deux mots de passe ne correspondent pas.';return}
  if(localMode){
    try{
      const users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');
      if(users.some(user=>user.role==='admin'))throw new Error('Un compte administrateur local existe déjà. Connecte-toi depuis la page de connexion admin.');
      if(users.some(user=>user.identifier.toLocaleLowerCase('fr-CA')===values.identifier.trim().toLocaleLowerCase('fr-CA')))throw new Error('Un compte utilise déjà ce courriel ou ce numéro.');
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(values.password));
      const passwordHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      const user={id:`admin-${Date.now()}`,role:'admin',display_name:values.name.trim(),identifier:values.identifier.trim(),passwordHash};users.push(user);
      localStorage.setItem('vigie-local-test-users-v1',JSON.stringify(users));localStorage.setItem('vigie-local-test-session-v1',JSON.stringify({id:user.id,role:user.role}));localStorage.setItem('vigie-admin-display-name',user.display_name);
      location.href=`admin.html?localAdmin=${encodeURIComponent(JSON.stringify(user))}`;
    }catch(error){activationMessage.textContent=error.message||'Impossible de créer ce compte dans ce navigateur.'}
    return;
  }
  try{const token=await csrf();const response=await fetch('/api/admin/setup',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify({token:activationToken,name:values.name,identifier:values.identifier,password:values.password})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Activation impossible.');location.href='/admin.html';}
  catch(error){activationMessage.textContent=error.message||'Impossible de joindre le serveur local.'}
});
