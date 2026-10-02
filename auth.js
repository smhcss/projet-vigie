const params=new URLSearchParams(location.search);
let currentRole=params.get('role')==='admin'?'admin':'client';
let currentMode=params.get('mode')==='signup'?'signup':'login';
const form=document.querySelector('#auth-form');
const errorBox=document.querySelector('#form-error');
const successBox=document.querySelector('#form-success');
const password=document.querySelector('#password');
const identifier=document.querySelector('#identifier');

function updateView(){
  const signup=currentMode==='signup';
  const admin=currentRole==='admin';
  document.querySelectorAll('.role-tab').forEach(tab=>{
    const selected=tab.dataset.role===currentRole;
    tab.classList.toggle('selected',selected);
    tab.setAttribute('aria-selected',String(selected));
  });
  document.querySelectorAll('.mode-tab').forEach(tab=>tab.classList.toggle('selected',tab.dataset.mode===currentMode));
  document.querySelector('.admin-only').hidden=!(signup&&admin);
  document.querySelector('.client-only').hidden=!(signup&&!admin);
  document.querySelector('.confirm-group').hidden=!signup;
  document.querySelector('.invitation-group').hidden=!(signup&&admin);
  document.querySelector('.login-only').hidden=signup;
  document.querySelector('#full-name').required=signup&&admin;
  document.querySelector('#company-name').required=signup&&!admin;
  document.querySelector('#password-confirm').required=signup;
  document.querySelector('#invite-code').required=signup&&admin;
  document.querySelector('#page-title').textContent=signup?(admin?'Créer un compte administrateur':'Créer votre compte client'):(admin?'Administration Vigie':'Bienvenue chez Vigie');
  document.querySelector('#page-subtitle').textContent=signup?(admin?'Les accès administrateur sont réservés aux personnes autorisées.':'Créez votre espace pour envoyer des demandes et conserver leur historique.'):(admin?'Connectez-vous à votre espace de gestion.':'Connectez-vous à votre espace client pour retrouver vos demandes.');
  document.querySelector('#submit-button').innerHTML=signup?`Créer mon compte <span>→</span>`:`Se connecter <span>→</span>`;
  document.querySelector('#password').autocomplete=signup?'new-password':'current-password';
  document.querySelector('#password-hint').textContent=signup?'Minimum 8 caractères':'Minimum 8 caractères';
  errorBox.textContent='';successBox.textContent='';
  document.title=`Vigie — ${signup?'Créer un compte':'Connexion'} ${admin?'administrateur':'client'}`;
  let notice=document.querySelector('.admin-notice');
  if(signup&&admin&&!notice){notice=document.createElement('p');notice.className='admin-notice';notice.textContent='Le propriétaire du compte Vigie remet un code d’invitation aux administrateurs autorisés.';document.querySelector('.mode-switch').after(notice)}
  if((!signup||!admin)&&notice)notice.remove();
}

document.querySelectorAll('.role-tab').forEach(tab=>tab.addEventListener('click',()=>{currentRole=tab.dataset.role;updateView()}));
document.querySelectorAll('.mode-tab').forEach(tab=>tab.addEventListener('click',()=>{currentMode=tab.dataset.mode;updateView()}));
document.querySelector('.show-password').addEventListener('click',event=>{
  const visible=password.type==='password';password.type=visible?'text':'password';event.currentTarget.textContent=visible?'Masquer':'Afficher';event.currentTarget.setAttribute('aria-label',visible?'Masquer le mot de passe':'Afficher le mot de passe');
});
document.querySelector('#forgot-link').addEventListener('click',event=>{event.preventDefault();successBox.textContent='La réinitialisation sera envoyée à votre courriel ou téléphone une fois le service de comptes activé.'});
form.addEventListener('submit',event=>{
  event.preventDefault();errorBox.textContent='';successBox.textContent='';
  if(!form.reportValidity())return;
  const value=identifier.value.trim();
  const isEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const digits=value.replace(/\D/g,'');
  const isPhone=digits.length>=8&&digits.length<=15;
  if(!isEmail&&!isPhone){errorBox.textContent='Entrez un courriel valide ou un numéro de téléphone avec son indicatif régional.';identifier.focus();return}
  if(currentMode==='signup'&&password.value!==document.querySelector('#password-confirm').value){errorBox.textContent='Les deux mots de passe ne correspondent pas.';document.querySelector('#password-confirm').focus();return}
  if(currentMode==='signup'&&currentRole==='admin'&&!document.querySelector('#invite-code').value.trim()){errorBox.textContent='Un code d’invitation administrateur est requis.';return}
  successBox.textContent=currentMode==='signup'?'Les champs sont valides. La création du compte sera activée lorsque le serveur sécurisé sera connecté.':'La connexion sera activée lorsque le serveur de comptes sera connecté.';
});
updateView();
