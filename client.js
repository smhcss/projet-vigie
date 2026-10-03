const statusLabels={pending:'À examiner',review:'En traitement',approved:'Approuvée',assigned:'Agents coordonnés',rejected:'Refusée',cancelled:'Annulée par vous'};
const historyNode=document.querySelector('#request-history');
const errorNode=document.querySelector('#history-error');
const accountDialog=document.querySelector('#client-account-dialog');
const accountForm=document.querySelector('#client-account-form');
const editRequestDialog=document.querySelector('#edit-request-dialog');
const editRequestForm=document.querySelector('#edit-request-form');
const previewRequestsKey='vigie-client-preview-requests-v1';
const localTestRequestsKey='vigie-local-test-requests-v1';
let csrfToken='';
let loadedRequests=[];
let accountData={company:'',identifier:''};
let editingRequestId=null;
let localPreviewUser=null;
function updateLocalNavigationLinks(){
  if(location.protocol!=='file:'||!localPreviewUser)return;
  try{const params=new URLSearchParams();params.set('localUser',JSON.stringify(localPreviewUser));params.set('localRequests',localStorage.getItem(localTestRequestsKey)||'[]');const catalog=localStorage.getItem('vigie-agent-catalog-v2');if(catalog)params.set('agentCatalog',catalog);document.querySelectorAll('a[href^="index.html"]').forEach(link=>{const hash=new URL(link.href,location.href).hash;link.href=`index.html?${params}${hash}`})}catch{}
}

function esc(value=''){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function formatDate(value){
  if(!value)return'À confirmer';
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'});
}
function invoiceAmount(request){const currency=request.invoice_currency||'CAD';const digits=currency==='XOF'?0:2;return new Intl.NumberFormat('fr-CA',{style:'currency',currency,minimumFractionDigits:digits,maximumFractionDigits:digits}).format((Number(request.invoice_total_minor)||0)/(10**digits))}
function renderProgress(request){
  const status=request.status;
  const rejected=status==='rejected';
  const cancelled=status==='cancelled';
  const current={pending:0,review:1,approved:2,assigned:3,rejected:2,cancelled:1}[status]??0;
  const steps=[
    ['Demande envoyée','Votre demande a bien été transmise.'],
    [cancelled?'Demande annulée':'Étude de la demande',cancelled?'Retirée avant sa prise en charge.':'L’équipe examine votre besoin.'],
    [rejected?'Demande refusée':cancelled?'Demande non poursuivie':'Demande approuvée',rejected?'Consultez le motif indiqué ci-dessous.':cancelled?'Cette demande a été annulée.':request.invoice_number?'La facture est disponible dans votre espace.':request.request_kind==='custom'?'L’équipe confirme le tarif et préparera votre facture.':'Votre demande a été acceptée.'],
    ['Agents coordonnés',rejected||cancelled?'Cette étape ne s’applique pas.':'L’équipe responsable est affectée.']
  ];
  return `<section class="request-progress${rejected?' is-rejected':''}${cancelled?' is-cancelled':''}" aria-label="Progression de la demande"><ol class="request-progress-steps">${steps.map(([title,description],index)=>{
    const state=rejected&&index===2?'is-current is-refused':cancelled&&index===1?'is-current is-cancelled':index<current?'is-complete':index===current?'is-current':'is-upcoming';
    const marker=index<current?'✓':String(index+1);
    return `<li class="progress-step ${state}"${index===current?' aria-current="step"':''}><span class="progress-marker" aria-hidden="true">${marker}</span><span class="progress-copy"><b>${title}</b><small>${description}</small></span></li>`;
  }).join('')}</ol></section>`;
}
const serviceFallback=[];
function serviceRate(service){
  if(!service.price)return'Tarif à confirmer';
  const currency=service.currency||'CAD';const digits=currency==='XOF'?0:2;
  const amount=new Intl.NumberFormat('fr-CA',{style:'currency',currency,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(service.price));
  const unit={hour:'par heure et par agent',day:'par jour et par agent',event:'par événement'}[service.billing_unit]||'par heure et par agent';
  return `${amount} ${unit}`;
}
async function loadServices(){
  const node=document.querySelector('#client-services');const customAgentSelect=document.querySelector('#custom-agent-type');let services=null;
  if(location.protocol!=='file:'){
    try{const response=await fetch('/api/agent-categories');if(response.ok)services=(await response.json()).categories}catch{}
  }
  if(!Array.isArray(services)){
    try{const params=new URLSearchParams(location.search);const catalog=params.get('agentCatalog');services=catalog?JSON.parse(catalog):null}catch{}
  }
  if(!Array.isArray(services)){
    try{const catalog=localStorage.getItem('vigie-agent-catalog-v2');services=catalog?JSON.parse(catalog):null}catch{}
  }
  const active=(Array.isArray(services)?services:serviceFallback).filter(service=>service&&service.active!==false);
  active.forEach(service=>customAgentSelect.add(new Option(service.name,service.name)));
  node.innerHTML=active.map(service=>{
    const catalog=encodeURIComponent(JSON.stringify(active));const name=encodeURIComponent(service.name);
    let localParams='';if(location.protocol==='file:'&&localPreviewUser){try{localParams=`&amp;localUser=${encodeURIComponent(JSON.stringify(localPreviewUser))}&amp;localRequests=${encodeURIComponent(localStorage.getItem(localTestRequestsKey)||'[]')}`}catch{}}
    return `<article class="service-offer"><span class="service-offer-icon">♟</span><h3>${esc(service.name)}</h3><p>${esc(service.description||'Service de sécurité personnalisé selon votre besoin.')}</p><strong>${esc(serviceRate(service))}</strong><a href="index.html?agentCatalog=${catalog}${localParams}&amp;agentType=${name}#demande">Demander ce service <span>→</span></a></article>`;
  }).join('')||'<p class="no-services">Aucun service n’est proposé pour le moment. Contactez l’entreprise pour en savoir plus.</p>';
}
function renderRequests(requests){
  loadedRequests=requests;
  if(location.protocol==='file:'){try{localStorage.setItem(previewRequestsKey,JSON.stringify(requests))}catch{}}
  updateLocalNavigationLinks();
  const active=requests.filter(request=>['pending','review'].includes(request.status)).length;
  const decided=requests.filter(request=>['approved','assigned','rejected','cancelled'].includes(request.status)).length;
  document.querySelector('#total-count').textContent=requests.length;
  document.querySelector('#active-count').textContent=active;
  document.querySelector('#decided-count').textContent=decided;
  if(!requests.length){
    historyNode.innerHTML='<div class="empty-state"><span class="empty-icon">▤</span><h3>Aucune demande pour le moment</h3><p>Quand tu enverras une demande avec ce compte, tu pourras la retrouver ici.</p><a class="primary-button" href="index.html#demande">Faire une demande <span>→</span></a></div>';
    return;
  }
  historyNode.innerHTML=requests.map(request=>{
    const rejected=request.status==='rejected';
    const status=statusLabels[request.status]||'Statut inconnu';
    return `<article class="request-card ${rejected?'request-rejected':''}">
      <div class="request-card-top"><div><span class="request-reference">RÉF. ${esc(request.public_id)}</span><h3>${esc(request.event_type)}</h3><p>${esc(request.agent_type)}</p></div><span class="status status-${esc(request.status)}">${esc(status)}</span></div>
      ${renderProgress(request)}
      <div class="request-details"><div><small>DATE ET HEURE</small><b>${esc(formatDate(request.event_date))}${request.event_start_time?` · ${esc(request.event_start_time)}${request.event_end_time?`–${esc(request.event_end_time)}`:''}`:''}</b></div><div><small>EFFECTIF</small><b>${Number(request.agents)||0} agent${Number(request.agents)===1?'':'s'}</b></div><div><small>LIEU</small><b>${esc(request.location)}</b></div></div>
      ${rejected?`<div class="rejection-reason"><small>MOTIF DU REFUS</small><p>${esc(request.rejection_reason||'L’équipe n’a pas encore ajouté de motif.')}</p></div>`:''}
      ${request.status==='pending'?`<div class="client-request-actions"><button type="button" class="edit-request-button" data-edit-request="${Number(request.id)}">Modifier la demande</button><button type="button" data-cancel-request="${Number(request.id)}">Annuler cette demande</button></div>`:''}
      ${request.team?`<div class="team-note"><small>COORDINATION</small><p><b>${esc(request.team)}</b>${request.coordination_note?` · ${esc(request.coordination_note)}`:''}</p></div>`:''}
      ${['approved','assigned'].includes(request.status)&&!request.invoice_number?`<div class="team-note"><small>FACTURATION</small><p>${request.request_kind==='custom'?'L’équipe finalise le tarif de votre demande personnalisée. La facture apparaîtra ici dès son émission.':'Votre demande est approuvée. La facture apparaîtra ici dès son émission.'}</p></div>`:''}
      ${request.invoice_number?`<div class="client-invoice"><div><small>FACTURE ÉMISE</small><b>${esc(request.invoice_number)}</b></div><strong>${esc(invoiceAmount(request))}</strong><span class="client-payment-state ${request.invoice_paid_at?'is-paid':'is-due'}">${request.invoice_paid_at?`Payée le ${esc(new Date(request.invoice_paid_at).toLocaleDateString('fr-CA'))}`:'À payer'}</span><button type="button" data-invoice="${Number(request.id)}">Voir la facture</button></div>`:''}
    </article>`;
  }).join('');
}
function showClientInvoice(request){
  const currency=request.invoice_currency||'CAD';const digits=currency==='XOF'?0:2;
  const amount=minor=>new Intl.NumberFormat('fr-CA',{style:'currency',currency,minimumFractionDigits:digits,maximumFractionDigits:digits}).format((Number(minor)||0)/(10**digits));
  const issuedDate=new Date(request.invoice_issued_at).toLocaleDateString('fr-CA',{year:'numeric',month:'long',day:'numeric'});
  const paymentLabel=request.invoice_paid_at?`Payée le ${new Date(request.invoice_paid_at).toLocaleDateString('fr-CA',{year:'numeric',month:'long',day:'numeric'})}`:'À payer';
  document.querySelector('#client-invoice-paper').innerHTML=`<div class="invoice-brand"><span class="brand-mark">V</span><span>vigie<span>.</span></span></div><div class="invoice-heading"><div><small>FACTURE</small><h2>${esc(request.invoice_number)}</h2></div><div><small>DATE D’ÉMISSION</small><b>${esc(issuedDate)}</b></div></div><div class="invoice-parties"><div><small>FACTURÉ À</small><b>${esc(request.company)}</b><span>${esc(request.contact)}</span><span>${esc(request.contact_method)}</span></div><div><small>SERVICE</small><b>${esc(request.event_type)}</b><span>${esc(request.location)}</span><span>${esc(formatDate(request.event_date))}</span></div></div><table class="invoice-lines"><thead><tr><th>Description</th><th>Qté</th><th>Prix unitaire</th><th>Total</th></tr></thead><tbody><tr><td>${esc(request.invoice_description)}</td><td>${Number(request.invoice_quantity)}</td><td>${esc(amount(request.invoice_unit_price_minor))}</td><td>${esc(amount(request.invoice_total_minor))}</td></tr></tbody></table><div class="invoice-total"><span>Total à payer</span><b>${esc(amount(request.invoice_total_minor))}</b></div><div class="invoice-payment-status ${request.invoice_paid_at?'is-paid':'is-due'}"><span>État du paiement</span><b>${esc(paymentLabel)}</b></div><p class="invoice-terms">Merci de faire affaire avec Vigie Sécurité. Pour toute question concernant cette facture, veuillez contacter l’entreprise.</p><div class="invoice-footer">Vigie Sécurité · Facture ${esc(request.invoice_number)}</div>`;
  document.querySelector('#client-invoice-dialog').showModal();
}
async function loadHistory(){
  if(location.protocol==='file:'){
    let session=null;try{session=JSON.parse(localStorage.getItem('vigie-local-test-session-v1')||'null')}catch{}
    let requests=[];try{requests=JSON.parse(localStorage.getItem(localTestRequestsKey)||'[]')}catch{}
    renderRequests(requests.filter(request=>request.client_user_id===session?.id));return;
  }
  historyNode.innerHTML='<p class="loading-state">Chargement de vos demandes…</p>';
  errorNode.hidden=true;
  try{
    const response=await fetch('/api/client/requests',{headers:{'Accept':'application/json'}});
    const data=await response.json();
    if(response.status===401){location.href='auth.html?role=client&mode=login';return}
    if(!response.ok)throw new Error(data.error||'Impossible de charger vos demandes.');
    renderRequests(data.requests||[]);
  }catch(error){
    historyNode.innerHTML='';
    errorNode.textContent=error.message||'Le serveur ne répond pas. Réessaie dans un instant.';
    errorNode.hidden=false;
  }
}
async function initialize(){
  try{
    const response=await fetch('/api/me');
    if(!response.ok)throw new Error('Session introuvable.');
    const data=await response.json();
    csrfToken=data.csrf||'';
    if(data.user?.role!=='client'){location.href='auth.html?role=client&mode=login';return}
    updateAccountDisplay(data.user);
    accountForm.elements.company.value=data.user.company||'';
    accountForm.elements.identifier.value=data.user.identifier||'';
    await loadHistory();
  }catch{
    location.href='auth.html?role=client&mode=login';
  }
}
function loadClientPreview(){
  let users=[];let session=null;
  try{const params=new URLSearchParams(location.search);const incomingUser=JSON.parse(params.get('localUser')||'null');const incomingRequests=JSON.parse(params.get('localRequests')||'null');if(incomingUser?.role==='client'){localPreviewUser=incomingUser;users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');const index=users.findIndex(item=>item.id===incomingUser.id);if(index<0)users.push(incomingUser);else users[index]={...users[index],...incomingUser};localStorage.setItem('vigie-local-test-users-v1',JSON.stringify(users));localStorage.setItem('vigie-local-test-session-v1',JSON.stringify({id:incomingUser.id,role:'client'}))}if(Array.isArray(incomingRequests))localStorage.setItem(localTestRequestsKey,JSON.stringify(incomingRequests));const catalog=params.get('agentCatalog');if(catalog)localStorage.setItem('vigie-agent-catalog-v2',catalog);if(incomingUser||Array.isArray(incomingRequests)){params.delete('localUser');params.delete('localRequests');history.replaceState(null,'',`${location.pathname}${params.size?'?'+params.toString():''}${location.hash}`)}users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');session=JSON.parse(localStorage.getItem('vigie-local-test-session-v1')||'null')}catch{}
  if(users.length){
    const user=users.find(item=>item.id===session?.id&&item.role==='client');
    if(!user){location.href='auth.html?role=client&mode=login';return}
    localPreviewUser=user;
    accountData={company:user.company||'',identifier:user.identifier||''};updateAccountDisplay(user);accountForm.elements.company.value=user.company||'';accountForm.elements.identifier.value=user.identifier||'';loadHistory();return;
  }
  try{accountData=JSON.parse(localStorage.getItem('vigie-client-account-preview-v1'))||accountData}catch{}
  accountData.company=accountData.company||'Entreprise Démo';accountData.identifier=accountData.identifier||'client@exemple.com';
  updateAccountDisplay(accountData);
  accountForm.elements.company.value=accountData.company;
  accountForm.elements.identifier.value=accountData.identifier;
  const daysFromToday=days=>{const date=new Date();date.setDate(date.getDate()+days);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`};
  const samples=[
    {id:201,public_id:'VG-DEMO01',event_type:'Conférence annuelle',agent_type:'Agent événementiel',event_date:daysFromToday(6),agents:4,location:'Montréal, QC',status:'approved',company:'Entreprise Démo',contact:'Camille Martin',contact_method:'client@exemple.com',invoice_number:'VG-DEMO-2026-02',invoice_description:'Agent événementiel — 4 agents × 5 heures',invoice_quantity:20,invoice_unit_price_minor:4500,invoice_currency:'CAD',invoice_total_minor:90000,invoice_issued_at:Date.now()},
    {id:202,public_id:'VG-DEMO02',event_type:'Surveillance de site',agent_type:'Agent de surveillance de site',event_date:daysFromToday(11),agents:2,location:'Laval, QC',status:'assigned',company:'Entreprise Démo',contact:'Camille Martin',contact_method:'client@exemple.com',team:'Équipe de patrouille A',coordination_note:'Point de rencontre à l’accueil.',invoice_number:'VG-DEMO-2026-01',invoice_description:'Agent de surveillance de site — 2 agents × 1 heure',invoice_quantity:2,invoice_unit_price_minor:4500,invoice_currency:'CAD',invoice_total_minor:9000,invoice_issued_at:Date.now(),invoice_paid_at:Date.now()},
    {id:203,public_id:'VG-DEMO03',event_type:'Événement privé',agent_type:'Agent de contrôle d’accès',event_date:daysFromToday(15),agents:2,location:'Longueuil, QC',status:'rejected',rejection_reason:'Aucun agent n’est disponible à la date demandée.',company:'Entreprise Démo',contact:'Camille Martin',contact_method:'client@exemple.com'},
    {id:204,public_id:'VG-DEMO04',event_type:'Réception corporative',agent_type:'Agent événementiel',event_date:daysFromToday(20),agents:2,location:'Montréal, QC',status:'pending',company:'Entreprise Démo',contact:'Camille Martin',contact_method:'client@exemple.com'}
  ];
  let saved=null;try{const value=JSON.parse(localStorage.getItem(previewRequestsKey));if(Array.isArray(value))saved=value}catch{}
  renderRequests(saved||samples);
}
function updateAccountDisplay(user){
  accountData={company:user.company||'',identifier:user.identifier||''};
  document.querySelector('#welcome-company').textContent=accountData.company||'votre entreprise';
  document.querySelector('#account-identifier').textContent=accountData.identifier+(location.protocol==='file:'?' · aperçu navigateur':'');
}
document.querySelector('#refresh-button').addEventListener('click',loadHistory);
if(location.protocol!=='file:')setInterval(()=>{if(!document.hidden)loadHistory()},30000);
const clientMenuToggle=document.querySelector('#client-menu-toggle');
const clientNav=document.querySelector('#client-nav');
function closeClientMenu(){clientNav.classList.remove('is-open');clientMenuToggle.setAttribute('aria-expanded','false');clientMenuToggle.setAttribute('aria-label','Ouvrir le menu')}
clientMenuToggle.addEventListener('click',()=>{const open=clientNav.classList.toggle('is-open');clientMenuToggle.setAttribute('aria-expanded',String(open));clientMenuToggle.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu')});
clientNav.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeClientMenu));
document.querySelector('#client-settings-link').addEventListener('click',()=>{closeClientMenu();document.querySelector('#account-form-error').hidden=true;document.querySelector('#account-form-success').hidden=true;accountForm.elements.company.value=accountData.company;accountForm.elements.identifier.value=accountData.identifier;accountDialog.showModal()});
const customRequestForm=document.querySelector('#custom-request-form');
const customRequestMessage=document.querySelector('#custom-request-message');
const customRequestDate=customRequestForm.elements.date;
customRequestDate.min=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
customRequestForm.addEventListener('submit',async event=>{
  event.preventDefault();
  customRequestMessage.hidden=true;
  const values=Object.fromEntries(new FormData(customRequestForm).entries());
  if(values.endTime<=values.startTime){customRequestMessage.textContent='L’heure de fin doit être après l’heure de début.';customRequestMessage.hidden=false;return}
  const [startHour,startMinute]=values.startTime.split(':').map(Number);const [endHour,endMinute]=values.endTime.split(':').map(Number);
  const duration=Math.max(1,Math.ceil(((endHour*60+endMinute)-(startHour*60+startMinute))/60));
  const payload={company:accountData.company,contact:accountData.company,contactMethod:accountData.identifier,eventType:values.eventType.trim(),agentType:values.agentType||'Demande personnalisée',date:values.date,agents:Number(values.agents),duration,location:values.location.trim(),details:values.details.trim(),requestKind:'custom',event_start_time:values.startTime,event_end_time:values.endTime};
  const submit=customRequestForm.querySelector('[type="submit"]');submit.disabled=true;submit.textContent='Envoi en cours…';
  try{
    if(location.protocol==='file:'){
      const session=JSON.parse(localStorage.getItem('vigie-local-test-session-v1')||'null');
      const user=localPreviewUser||(JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]').find(item=>item.id===session?.id&&item.role==='client'));
      if(!user)throw new Error('Reconnecte-toi à ton compte client avant d’envoyer une demande.');
      const requests=JSON.parse(localStorage.getItem(localTestRequestsKey)||'[]');
      const request={...payload,id:Date.now(),public_id:`VG-LOCAL-${String(Date.now()).slice(-6)}`,client_user_id:user.id,is_guest:false,status:'pending',created_at:new Date().toISOString(),event_date:payload.date,event_type:payload.eventType,agent_type:payload.agentType,billing_duration:duration,request_kind:'custom',event_start_time:values.startTime,event_end_time:values.endTime};
      requests.unshift(request);localStorage.setItem(localTestRequestsKey,JSON.stringify(requests));
      await loadHistory();
      customRequestMessage.innerHTML=`Demande ${esc(request.public_id)} envoyée et ajoutée à ton historique. <a href="admin.html?localRequests=${encodeURIComponent(JSON.stringify(requests))}">Voir la demande dans le panel admin ↗</a>`;
    }else{
      if(!csrfToken){const tokenResponse=await fetch('/api/csrf');if(!tokenResponse.ok)throw new Error('Session expirée. Reconnecte-toi à ton compte.');csrfToken=(await tokenResponse.json()).csrf}
      const response=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify(payload)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'La demande n’a pas pu être envoyée.');
      await loadHistory();customRequestMessage.textContent=`Demande ${result.publicId} envoyée et ajoutée à ton historique.`;
    }
    customRequestForm.reset();customRequestDate.min=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);customRequestMessage.hidden=false;
  }catch(error){customRequestMessage.textContent=error.message||'Impossible d’envoyer la demande.';customRequestMessage.hidden=false}
  finally{submit.disabled=false;submit.innerHTML='Envoyer ma demande personnalisée <span>→</span>'}
});
document.querySelector('#edit-account-open').addEventListener('click',()=>{
  document.querySelector('#account-form-error').hidden=true;
  document.querySelector('#account-form-success').hidden=true;
  accountForm.elements.company.value=accountData.company;
  accountForm.elements.identifier.value=accountData.identifier;
  accountDialog.showModal();
});
document.querySelectorAll('[data-close-account]').forEach(button=>button.addEventListener('click',()=>accountDialog.close()));
accountDialog.addEventListener('click',event=>{if(event.target===event.currentTarget)accountDialog.close()});
accountForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const errorBox=document.querySelector('#account-form-error');const successBox=document.querySelector('#account-form-success');
  errorBox.hidden=true;successBox.hidden=true;
  const values=Object.fromEntries(new FormData(accountForm).entries());
  values.company=String(values.company||'').trim();values.identifier=String(values.identifier||'').trim();
  const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.identifier);const digits=values.identifier.replace(/\D/g,'');
  if(values.company.length<2){errorBox.textContent='Indique le nom de votre entreprise.';errorBox.hidden=false;return}
  if(!email&&(digits.length<8||digits.length>15)){errorBox.textContent='Entrez un courriel valide ou un numéro de téléphone avec indicatif régional.';errorBox.hidden=false;return}
  const saveButton=accountForm.querySelector('[type="submit"]');saveButton.disabled=true;saveButton.textContent='Enregistrement…';
  try{
    let user;
    if(location.protocol==='file:'){
      user={company:values.company,identifier:values.identifier};
      localStorage.setItem('vigie-client-account-preview-v1',JSON.stringify(user));
      try{const users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');const session=JSON.parse(localStorage.getItem('vigie-local-test-session-v1')||'null');const index=users.findIndex(item=>item.id===session?.id&&item.role==='client');if(index>=0){users[index]={...users[index],company:values.company,identifier:values.identifier};localStorage.setItem('vigie-local-test-users-v1',JSON.stringify(users));user=users[index]}}catch{}
    }else{
      const response=await fetch('/api/client/account',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify(values)});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Impossible d’enregistrer vos coordonnées.');user=data.user;
    }
    updateAccountDisplay(user);if(location.protocol==='file:'&&user.id){localPreviewUser={id:user.id,role:'client',company:user.company,identifier:user.identifier};updateLocalNavigationLinks()}accountForm.elements.company.value=user.company;accountForm.elements.identifier.value=user.identifier;
    successBox.textContent='Vos coordonnées ont été mises à jour.';successBox.hidden=false;
  }catch(error){errorBox.textContent=error.message||'Impossible d’enregistrer vos coordonnées.';errorBox.hidden=false}
  finally{saveButton.disabled=false;saveButton.textContent='Enregistrer'}
});
historyNode.addEventListener('click',async event=>{
  const editButton=event.target.closest('[data-edit-request]');
  if(editButton){
    const request=loadedRequests.find(item=>item.id===Number(editButton.dataset.editRequest));
    if(!request||request.status!=='pending')return;
    editingRequestId=request.id;
    editRequestForm.elements.event_date.value=request.event_date||'';
    editRequestForm.elements.agents.value=Number(request.agents)||1;
    editRequestForm.elements.location.value=request.location||'';
    editRequestForm.elements.details.value=request.details||'';
    document.querySelector('#edit-request-error').hidden=true;
    editRequestDialog.showModal();
    return;
  }
  const cancelButton=event.target.closest('[data-cancel-request]');
  if(cancelButton){
    const request=loadedRequests.find(item=>item.id===Number(cancelButton.dataset.cancelRequest));
    if(!request||request.status!=='pending'||!window.confirm('Annuler cette demande ? Cette action est possible seulement avant que l’équipe la prenne en charge.'))return;
    cancelButton.disabled=true;cancelButton.textContent='Annulation…';
    if(location.protocol==='file:'){
      request.status='cancelled';try{const all=JSON.parse(localStorage.getItem(localTestRequestsKey)||'[]');const index=all.findIndex(item=>item.id===request.id);if(index>=0){all[index]=request;localStorage.setItem(localTestRequestsKey,JSON.stringify(all))}}catch{}renderRequests(loadedRequests);return;
    }
    try{
      const response=await fetch(`/api/client/requests/${Number(request.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify({action:'cancel'})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Impossible d’annuler cette demande.');
      await loadHistory();
    }catch(error){cancelButton.disabled=false;cancelButton.textContent='Annuler cette demande';errorNode.textContent=error.message;errorNode.hidden=false}
    return;
  }
  const button=event.target.closest('[data-invoice]');
  if(button){const invoice=loadedRequests.find(request=>request.id===Number(button.dataset.invoice));if(invoice)showClientInvoice(invoice)}
});
document.querySelectorAll('[data-close-edit-request]').forEach(button=>button.addEventListener('click',()=>editRequestDialog.close()));
editRequestDialog.addEventListener('click',event=>{if(event.target===event.currentTarget)editRequestDialog.close()});
editRequestForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!editingRequestId||!editRequestForm.reportValidity())return;
  const errorBox=document.querySelector('#edit-request-error');errorBox.hidden=true;
  const values=Object.fromEntries(new FormData(editRequestForm).entries());values.action='edit';
  const saveButton=editRequestForm.querySelector('[type="submit"]');saveButton.disabled=true;saveButton.textContent='Enregistrement…';
  try{
    if(location.protocol==='file:'){
      const request=loadedRequests.find(item=>item.id===editingRequestId);
      if(!request||request.status!=='pending')throw new Error('Cette demande ne peut plus être modifiée.');
      Object.assign(request,{event_date:values.event_date,agents:Number(values.agents),location:String(values.location).trim(),details:String(values.details||'').trim()});
      const allRequests=JSON.parse(localStorage.getItem(localTestRequestsKey)||'[]');const index=allRequests.findIndex(item=>item.id===request.id);if(index>=0){allRequests[index]=request;localStorage.setItem(localTestRequestsKey,JSON.stringify(allRequests))}renderRequests(loadedRequests);
    }else{
      const response=await fetch(`/api/client/requests/${Number(editingRequestId)}`,{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify(values)});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Impossible de modifier cette demande.');
      await loadHistory();
    }
    editRequestDialog.close();editingRequestId=null;
  }catch(error){errorBox.textContent=error.message||'Impossible de modifier cette demande.';errorBox.hidden=false}
  finally{saveButton.disabled=false;saveButton.textContent='Enregistrer les modifications'}
});
document.querySelectorAll('[data-close-invoice]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelector('#client-print-invoice').addEventListener('click',()=>{document.body.classList.add('printing-client-invoice');window.print();setTimeout(()=>document.body.classList.remove('printing-client-invoice'),500)});
document.querySelector('#client-invoice-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close()});
document.querySelector('#logout-button').addEventListener('click',async()=>{
  if(location.protocol==='file:'){localStorage.removeItem('vigie-local-test-session-v1');location.href='index.html';return}
  try{
    if(!csrfToken){const response=await fetch('/api/csrf');csrfToken=(await response.json()).csrf}
    await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:'{}'});
  }finally{location.href='index.html'}
});
if(location.protocol==='file:')loadClientPreview();else initialize();
loadServices();
