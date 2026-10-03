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
const agentCatalogKey='vigie-agent-catalog-v1';
const defaultAgentCategories=[
  {name:'Agent événementiel',description:'Accueil et contrôle des accès lors d’événements.',price:null,currency:'CAD',billing_unit:'hour',active:true},
  {name:'Agent de contrôle d’accès',description:'Vérification des entrées et gestion des accès.',price:null,currency:'CAD',billing_unit:'hour',active:true},
  {name:'Agent de surveillance de site',description:'Surveillance planifiée de vos lieux et installations.',price:null,currency:'CAD',billing_unit:'hour',active:true}
];
let availableAgentCategories=[];

function agentPrice(category){
  if(category.price===null||category.price===undefined||category.price===''||Number(category.price)===0)return'Tarif à confirmer par l’équipe.';
  const currency=category.currency||'CAD';const digits=currency==='XOF'?0:2;
  const amount=new Intl.NumberFormat('fr-CA',{style:'currency',currency,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(category.price));
  const unit={hour:'par heure et par agent',day:'par jour et par agent',event:'par événement'}[category.billing_unit]||'par heure et par agent';
  return `${amount} ${unit}. Le prix final sera confirmé par l’équipe.`;
}
function showAgentCategory(){
  const selected=availableAgentCategories.find(category=>category.name===guestForm.elements.agentType.value);
  const durationWrap=document.querySelector('#billing-duration-wrap');
  const durationInput=guestForm.elements.duration;
  const isTimed=selected&&['hour','day'].includes(selected.billing_unit);
  durationWrap.hidden=!isTimed;
  durationInput.required=Boolean(isTimed);
  document.querySelector('#billing-duration-unit').textContent=selected?.billing_unit==='day'?'en jours':'en heures';
  durationInput.max=selected?.billing_unit==='day'?'365':'720';
  document.querySelector('#agent-type-details').textContent=selected?`${selected.description?`${selected.description} `:''}${agentPrice(selected)}`:'Le tarif final sera confirmé par l’équipe après étude de la demande.';
}
async function initializeAgentCategories(){
  const select=guestForm.elements.agentType;
  if(!document.querySelector('#agent-type-details')){const note=document.createElement('small');note.id='agent-type-details';note.className='agent-price-note';select.insertAdjacentElement('afterend',note)}
  let categories=null;
  const params=new URLSearchParams(location.search);
  const passedCatalog=params.get('agentCatalog');
  if(passedCatalog){
    try{categories=JSON.parse(passedCatalog);if(Array.isArray(categories)){try{localStorage.setItem(agentCatalogKey,JSON.stringify(categories))}catch{}}}catch{categories=null}
  }
  if(!Array.isArray(categories)){
    if(location.protocol!=='file:'){
      try{const response=await fetch('/api/agent-categories');if(response.ok)categories=(await response.json()).categories}catch{}
    }
  }
  if(!Array.isArray(categories)){
    try{const saved=localStorage.getItem(agentCatalogKey);if(saved)categories=JSON.parse(saved)}catch{}
  }
  availableAgentCategories=(Array.isArray(categories)?categories:defaultAgentCategories).filter(category=>category&&category.active!==false&&typeof category.name==='string');
  select.replaceChildren(new Option('Sélectionnez un type d’agent',''));
  availableAgentCategories.forEach(category=>select.add(new Option(category.name,category.name)));
  if(!availableAgentCategories.length){select.add(new Option('Aucun type disponible pour le moment',''));select.disabled=true}
  const requestedAgent=params.get('agentType');if(requestedAgent&&availableAgentCategories.some(category=>category.name===requestedAgent))select.value=requestedAgent;
  select.addEventListener('change',showAgentCategory);
  showAgentCategory();
}

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
initializeAgentCategories();
