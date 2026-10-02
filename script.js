const menuButton=document.querySelector('.menu-toggle');
menuButton.addEventListener('click',()=>{
  const nav=document.querySelector('.main-nav');
  const open=nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded',String(open));
});
document.querySelectorAll('.main-nav a').forEach(link=>link.addEventListener('click',()=>{
  document.querySelector('.main-nav').classList.remove('open');
  menuButton.setAttribute('aria-expanded','false');
}));

const guestChoice=document.querySelector('#guest-choice');
const choicePanel=document.querySelector('#request-choice');
const guestForm=document.querySelector('#guest-form');
const guestDate=guestForm.querySelector('[name="date"]');
const requestMessage=document.querySelector('#form-message');
let csrfToken='';
const localToday=new Date();
guestDate.min=new Date(localToday.getTime()-localToday.getTimezoneOffset()*60000).toISOString().slice(0,10);

async function initializeSession(){
  try{
    const response=await fetch('/api/me');
    if(!response.ok)return;
    const result=await response.json();
    csrfToken=result.csrf||'';
    if(result.user?.role==='client'){
      const accountLink=document.querySelector('#account-link');
      if(accountLink){accountLink.href='client.html';accountLink.textContent='Mon compte'}
      choicePanel.hidden=true;
      guestForm.hidden=false;
      guestForm.querySelector('.form-step').innerHTML='DEMANDE CLIENT <b>·</b> CONNECTÉ';
      guestForm.elements.contactMethod.value=result.user.identifier||'';
      guestForm.elements.company.value=result.user.company||'';
      const privacy=guestForm.querySelector('.form-privacy');
      privacy.textContent='Cette demande sera liée à votre compte et ajoutée à votre historique.';
    }
  }catch{/* The static preview remains usable when the local server is stopped. */}
}

guestChoice.addEventListener('click',()=>{
  choicePanel.hidden=true;
  guestForm.hidden=false;
  guestForm.querySelector('[name="company"]').focus();
});

document.querySelector('#back-choice').addEventListener('click',()=>{
  guestForm.hidden=true;
  choicePanel.hidden=false;
  choicePanel.scrollIntoView({behavior:'smooth',block:'center'});
});

guestForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const method=guestForm.elements.contactMethod.value.trim();
  const isEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(method);
  const digits=method.replace(/\D/g,'');
  const isPhone=digits.length>=8&&digits.length<=15;
  const message=document.querySelector('#form-message');
  if(!isEmail&&!isPhone){
    message.textContent='Entrez un courriel valide ou un numéro de téléphone avec indicatif régional.';
    guestForm.elements.contactMethod.focus();
    return;
  }
  try{
    if(!csrfToken){const tokenResponse=await fetch('/api/csrf');if(!tokenResponse.ok)throw new Error('');csrfToken=(await tokenResponse.json()).csrf}
    const response=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify(Object.fromEntries(new FormData(guestForm).entries()))});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'La demande n’a pas pu être envoyée.');
    message.textContent=result.historyLinked?`Demande ${result.publicId} envoyée et ajoutée à votre historique.`:`Demande ${result.publicId} envoyée. L’équipe pourra vous joindre au sujet de votre événement.`;
  }catch(error){
    message.textContent=error.message||'Le serveur local ne répond pas. Lance le serveur de test pour envoyer cette demande.';
  }
  message.scrollIntoView({behavior:'smooth',block:'nearest'});
});

initializeSession();
