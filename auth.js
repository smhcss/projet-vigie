const params=new URLSearchParams(location.search);
let currentMode=params.get('mode')==='signup'?'signup':'login';
const form=document.querySelector('#auth-form');
const errorBox=document.querySelector('#form-error');
const successBox=document.querySelector('#form-success');
const password=document.querySelector('#password');
const identifier=document.querySelector('#identifier');
const company=document.querySelector('#company-name');
async function getCsrf(){const response=await fetch('/api/csrf');if(!response.ok)throw new Error('Serveur local indisponible.');return (await response.json()).csrf}

function updateView(){
  const signup=currentMode==='signup';
  document.querySelector('.client-only').hidden=!signup;
  document.querySelector('.confirm-group').hidden=!signup;
  document.querySelector('.login-only').hidden=signup;
  company.required=signup;
  document.querySelector('#password-confirm').required=signup;
  document.querySelector('#page-title').textContent=signup?'Créer votre compte client':'Connexion au compte client';
  document.querySelector('#page-subtitle').textContent=signup?'Créez votre espace pour envoyer des demandes et conserver leur historique.':'Connectez-vous à votre espace client pour retrouver vos demandes.';
  document.querySelector('#submit-button').innerHTML=signup?'Créer mon compte <span>→</span>':'Se connecter <span>→</span>';
  password.autocomplete=signup?'new-password':'current-password';
  errorBox.textContent='';successBox.textContent='';
  document.title=`Vigie — ${signup?'Créer un compte client':'Connexion client'}`;
}

document.querySelectorAll('.mode-tab').forEach(tab=>tab.addEventListener('click',()=>{
  currentMode=tab.dataset.mode;
  document.querySelectorAll('.mode-tab').forEach(item=>item.classList.toggle('selected',item===tab));
  updateView();
}));

document.querySelector('.show-password').addEventListener('click',event=>{
  const visible=password.type==='password';
  password.type=visible?'text':'password';
  event.currentTarget.textContent=visible?'Masquer':'Afficher';
  event.currentTarget.setAttribute('aria-label',visible?'Masquer le mot de passe':'Afficher le mot de passe');
});

document.querySelector('#forgot-link').addEventListener('click',event=>{
  event.preventDefault();
  successBox.textContent='La réinitialisation sera envoyée à votre courriel ou téléphone une fois le service de comptes activé.';
});

form.addEventListener('submit',async event=>{
  event.preventDefault();errorBox.textContent='';successBox.textContent='';
  if(!form.reportValidity())return;
  const value=identifier.value.trim();
  const isEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const digits=value.replace(/\D/g,'');
  const isPhone=digits.length>=8&&digits.length<=15;
  if(!isEmail&&!isPhone){errorBox.textContent='Entrez un courriel valide ou un numéro de téléphone avec son indicatif régional.';identifier.focus();return}
  if(currentMode==='signup'&&password.value!==document.querySelector('#password-confirm').value){errorBox.textContent='Les deux mots de passe ne correspondent pas.';document.querySelector('#password-confirm').focus();return}
  try{
    const token=await getCsrf();
    const endpoint=currentMode==='signup'?'/api/signup':'/api/login';
    const payload={identifier:value,password:password.value};
    if(currentMode==='signup')payload.company=company.value.trim();
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify(payload)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'La demande n’a pas abouti.');
    if(result.user?.role!=='client'){
      await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:'{}'});
      throw new Error('Cette page est réservée aux clients.');
    }
    location.href='/client.html';
  }catch(error){errorBox.textContent=error.message||'Impossible de joindre le serveur local.'}
});

updateView();
