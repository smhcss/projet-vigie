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
const localToday=new Date();
guestDate.min=new Date(localToday.getTime()-localToday.getTimezoneOffset()*60000).toISOString().slice(0,10);

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

guestForm.addEventListener('submit',event=>{
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
  message.textContent='Votre demande invité est prête. Dans cette maquette, elle n’est pas transmise à l’entreprise.';
  message.scrollIntoView({behavior:'smooth',block:'nearest'});
});
