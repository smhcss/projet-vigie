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

function showPublicAccount(user){
  const accountLink=document.querySelector('#account-link');
  const mobileLink=document.querySelector('#nav-account-link');
  const secondary=document.querySelector('#nav-account-secondary');
  const summary=document.querySelector('#nav-account-summary');
  if(!user||user.role!=='client')return;
  if(accountLink){accountLink.href='client.html';accountLink.textContent='Mon compte'}
  if(location.protocol==='file:'){
    try{const params=new URLSearchParams();params.set('localUser',JSON.stringify(user));params.set('localRequests',localStorage.getItem('vigie-local-test-requests-v1')||'[]');const catalog=localStorage.getItem(agentCatalogKey);if(catalog)params.set('agentCatalog',catalog);if(accountLink)accountLink.href=`client.html?${params}`;if(mobileLink)mobileLink.href=`client.html?${params}`}catch{}
  }
  if(mobileLink){if(location.protocol!=='file:')mobileLink.href='client.html';mobileLink.textContent='Ouvrir mon compte client'}
  if(secondary)secondary.hidden=true;
  if(summary){summary.hidden=false;document.querySelector('#nav-account-company').textContent=user.company||'Compte client';document.querySelector('#nav-account-identifier').textContent=user.identifier||''}
}

const guestChoice=document.querySelector('#guest-choice');
const choicePanel=document.querySelector('#request-choice');
const guestForm=document.querySelector('#guest-form');
const otherNeedWrap=document.querySelector('#other-need-wrap');
const otherNeedInput=guestForm.elements.otherNeed;
const guestDate=guestForm.querySelector('[name="date"]');
const requestMessage=document.querySelector('#form-message');
let csrfToken='';
const localToday=new Date();
guestDate.min=new Date(localToday.getTime()-localToday.getTimezoneOffset()*60000).toISOString().slice(0,10);
function updateOtherNeed(){const isOther=guestForm.elements.eventType.value==='Autre besoin';otherNeedWrap.hidden=!isOther;otherNeedInput.required=isOther;if(!isOther)otherNeedInput.value=''}
guestForm.elements.eventType.addEventListener('change',updateOtherNeed);
const agentCatalogKey='vigie-agent-catalog-v2';
const defaultAgentCategories=[];
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
  const submitButton=guestForm.querySelector('[type="submit"]');
  const typeLabel=document.querySelector('#agent-type-label');
  const emptyMessage=document.querySelector('#agent-type-empty');
  const detailNote=document.querySelector('#agent-type-details');
  if(!availableAgentCategories.length){select.add(new Option('',''));select.disabled=true;typeLabel.hidden=true;emptyMessage.hidden=false;detailNote.hidden=true;submitButton.disabled=true}
  else{select.disabled=false;typeLabel.hidden=false;emptyMessage.hidden=true;detailNote.hidden=false;detailNote.textContent='Choisissez un type d’agent proposé par l’entreprise.';submitButton.disabled=false}
  const requestedAgent=params.get('agentType');if(requestedAgent&&availableAgentCategories.some(category=>category.name===requestedAgent))select.value=requestedAgent;
  select.addEventListener('change',showAgentCategory);
  showAgentCategory();
}

async function initializeSession(){
  if(location.protocol==='file:'){
    try{const params=new URLSearchParams(location.search);const incomingUser=JSON.parse(params.get('localUser')||'null');const incomingRequests=JSON.parse(params.get('localRequests')||'null');if(incomingUser?.role==='client'){const users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');const index=users.findIndex(item=>item.id===incomingUser.id);if(index<0)users.push(incomingUser);else users[index]={...users[index],...incomingUser};localStorage.setItem('vigie-local-test-users-v1',JSON.stringify(users));localStorage.setItem('vigie-local-test-session-v1',JSON.stringify({id:incomingUser.id,role:'client'}))}if(Array.isArray(incomingRequests))localStorage.setItem('vigie-local-test-requests-v1',JSON.stringify(incomingRequests));const catalog=params.get('agentCatalog');if(catalog)localStorage.setItem(agentCatalogKey,catalog);if(incomingUser||Array.isArray(incomingRequests)){params.delete('localUser');params.delete('localRequests');history.replaceState(null,'',`${location.pathname}${params.size?'?'+params.toString():''}${location.hash}`)}const session=JSON.parse(localStorage.getItem('vigie-local-test-session-v1')||'null');const user=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]').find(item=>item.id===session?.id&&item.role==='client');if(user){showPublicAccount(user);choicePanel.hidden=true;guestForm.hidden=false;guestForm.querySelector('.form-step').innerHTML='DEMANDE CLIENT <b>·</b> CONNECTÉ';guestForm.elements.contactMethod.value=user.identifier;guestForm.elements.company.value=user.company;guestForm.dataset.clientUserId=user.id;guestForm.querySelector('.form-privacy').textContent='Cette demande sera enregistrée dans votre historique local de test.'}}catch{}
    return;
  }
  try{
    const response=await fetch('/api/me');
    if(!response.ok)return;
    const result=await response.json();
    csrfToken=result.csrf||'';
    if(result.user?.role==='client'){
      showPublicAccount(result.user);
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
  const values=Object.fromEntries(new FormData(guestForm).entries());
  const otherNeed=String(values.otherNeed||'').trim();
  if(values.eventType==='Autre besoin'&&otherNeed.length<5){requestMessage.textContent='Expliquez votre autre besoin en au moins quelques mots.';otherNeedInput.focus();return}
  values.details=[values.eventType==='Autre besoin'?`Autre besoin : ${otherNeed}`:'',String(values.details||'').trim()].filter(Boolean).join('\n\n');
  if(location.protocol==='file:'){
    try{
      const requests=JSON.parse(localStorage.getItem('vigie-local-test-requests-v1')||'[]');
      const categories=JSON.parse(localStorage.getItem(agentCatalogKey)||'null')||[];
      const category=categories.find(item=>item.name===guestForm.elements.agentType.value);
      const session=JSON.parse(localStorage.getItem('vigie-local-test-session-v1')||'null');
      const users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');
      const client=guestForm.dataset.clientUserId?users.find(item=>item.id===guestForm.dataset.clientUserId):null;
      const activeClient=client||(session?.role==='client'?users.find(item=>item.id===session.id&&item.role==='client'):null);
      const request={id:Date.now(),public_id:`VG-LOCAL-${String(Date.now()).slice(-6)}`,company:values.company.trim(),contact:values.contact.trim(),contact_method:values.contactMethod.trim(),event_type:values.eventType,location:values.location.trim(),agent_type:values.agentType,event_date:values.date,agents:Number(values.agents),billing_duration:Number(values.duration)||1,status:'pending',details:values.details.trim(),client_user_id:activeClient?.id||null,is_guest:!activeClient,created_at:new Date().toISOString(),billing_unit:category?.billing_unit||'hour'};
      requests.unshift(request);localStorage.setItem('vigie-local-test-requests-v1',JSON.stringify(requests));
      if(activeClient)showPublicAccount(activeClient);
      const adminHref=`admin.html?localRequests=${encodeURIComponent(JSON.stringify(requests))}`;
      message.innerHTML=`Demande ${request.public_id} enregistrée pour le test local.${activeClient?' Elle apparaîtra dans votre historique client.':''} <a href="${adminHref}">Ouvrir le panneau administrateur ↗</a>`;guestForm.reset();updateOtherNeed();guestForm.elements.date.min=new Date().toISOString().slice(0,10);guestForm.elements.agentType.value='';showAgentCategory();
    }catch(error){message.textContent='Impossible d’enregistrer cette demande dans le navigateur. Vérifie que le stockage local est autorisé.'}
    message.scrollIntoView({behavior:'smooth',block:'nearest'});return;
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
