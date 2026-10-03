let requests=[];
let agentCategories=[];
let activeRequest=null;
let csrfToken='';
let toastTimer;
const browserPreview=location.protocol==='file:';
const previewStorageKey='vigie-admin-browser-preview-v1';
const list=document.querySelector('#request-list');
const detailDialog=document.querySelector('#request-dialog');
const assignDialog=document.querySelector('#assign-dialog');
const rejectDialog=document.querySelector('#reject-dialog');
const rejectForm=document.querySelector('#reject-form');
const invoiceCreateDialog=document.querySelector('#invoice-create-dialog');
const invoicePreviewDialog=document.querySelector('#invoice-preview-dialog');
const invoiceCreateForm=document.querySelector('#invoice-create-form');
const categoryForm=document.querySelector('#category-form');
const categoryList=document.querySelector('#category-list');
const labels={pending:'À examiner',review:'En traitement',approved:'Approuvée',assigned:'Agents coordonnés',rejected:'Refusée',cancelled:'Annulée par le client'};
const categoryStorageKey='vigie-agent-catalog-v2';
const billingLabels={hour:'par heure et par agent',day:'par jour et par agent',event:'par événement'};

function previewSeed(){
  const dateFromToday=days=>{const date=new Date();date.setDate(date.getDate()+days);return date.toISOString().slice(0,10)};
  return [
    {id:1,company:'Groupe Horizon',event_type:'Conférence annuelle',location:'Montréal, QC',contact:'Nadia Diallo',contact_method:'nadia@example.com · 514 555-0134',agent_type:'Agent événementiel',event_date:dateFromToday(5),agents:4,billing_duration:5,status:'pending',details:'Accueil des invités et surveillance des accès principaux.'},
    {id:2,company:'Marché Central',event_type:'Soirée privée',location:'Laval, QC',contact:'Marc Tremblay',contact_method:'marc@example.com · 450 555-0168',agent_type:'Agent de contrôle d’accès',event_date:dateFromToday(9),agents:2,billing_duration:7,status:'review',details:'Présence demandée de 18 h à 1 h. Vérification des entrées.'},
    {id:3,company:'Studio Nord',event_type:'Tournage extérieur',location:'Longueuil, QC',contact:'Aïcha Koné',contact_method:'aicha@example.com · 438 555-0102',agent_type:'Agent de surveillance de site',event_date:dateFromToday(14),agents:3,billing_duration:1,status:'approved',details:'Sécurisation du périmètre pendant le tournage.',team:'Équipe événementielle A',invoice_number:'VG-DEMO-2026-03',invoice_description:'Agent de surveillance de site — 3 agents × 1 heure',invoice_quantity:3,invoice_unit_price_minor:5000,invoice_currency:'CAD',invoice_total_minor:15000,invoice_issued_at:Date.now()},
    {id:4,company:'Immeubles du Parc',event_type:'Surveillance ponctuelle',location:'Montréal, QC',contact:'Louis Bernard',contact_method:'louis@example.com · 514 555-0179',agent_type:'Agent de patrouille',event_date:dateFromToday(2),agents:1,status:'rejected',details:'Demande de présence de nuit.',rejection_reason:'Aucun agent disponible pour la plage horaire demandée.'},
    {id:5,company:'Clinique du Centre',event_type:'Présence ponctuelle',location:'Montréal, QC',contact:'Sonia Bouchard',contact_method:'sonia@example.com · 514 555-0181',agent_type:'Agent de contrôle d’accès',event_date:dateFromToday(7),agents:1,status:'cancelled',details:'Demande retirée par le client avant prise en charge.'}
  ];
}
function previewCategorySeed(){return []}
function removeLegacyPreviewExamples(categories){
  // Older browser previews persisted these sample types in localStorage. Match
  // by normalized name instead of ID: IDs can change when categories are edited
  // or migrated. Explicitly created types with the same name remain untouched.
  const oldNames=new Set([
    'agent evenementiel',
    'agent de controle d acces',
    'agent de surveillance de site',
    'agent de patrouille'
  ]);
  return categories.filter(category=>{
    if(!category||typeof category!=='object')return false;
    const normalizedName=String(category.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
    return category.created_by_admin===true||!oldNames.has(normalizedName);
  });
}
function getPreviewCategories(){
  try{const saved=localStorage.getItem(categoryStorageKey);if(saved){const parsed=JSON.parse(saved);if(Array.isArray(parsed)){const clean=removeLegacyPreviewExamples(parsed);if(JSON.stringify(clean)!==JSON.stringify(parsed))localStorage.setItem(categoryStorageKey,JSON.stringify(clean));return clean}}}catch{}
  try{const legacy=JSON.parse(localStorage.getItem('vigie-agent-catalog-v1')||'null');if(Array.isArray(legacy)){const migrated=removeLegacyPreviewExamples(legacy);localStorage.setItem(categoryStorageKey,JSON.stringify(migrated));return migrated}}catch{}
  return previewCategorySeed()
}
function savePreviewCategories(){try{localStorage.setItem(categoryStorageKey,JSON.stringify(agentCategories))}catch{}}
function getPreviewRequests(){
  try{const users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');if(users.some(user=>user.role==='admin')){const testRequests=JSON.parse(localStorage.getItem('vigie-local-test-requests-v1')||'[]');return Array.isArray(testRequests)?testRequests:[]}}catch{}
  try{const saved=localStorage.getItem(previewStorageKey);if(saved){const parsed=JSON.parse(saved);if(Array.isArray(parsed))return parsed}}catch{}
  return previewSeed();
}
function savePreviewRequests(){try{localStorage.setItem(previewStorageKey,JSON.stringify(requests));const users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');if(users.some(user=>user.role==='admin'))localStorage.setItem('vigie-local-test-requests-v1',JSON.stringify(requests))}catch{}}

async function api(path,options={}){
  if(browserPreview){
    const method=options.method||'GET';
    if(path==='/api/admin/requests'&&method==='GET')return {requests};
    if(path==='/api/admin/agent-categories'&&method==='GET')return {categories:agentCategories};
    if(path==='/api/agent-categories'&&method==='GET')return {categories:agentCategories.filter(category=>category.active)};
    if(path==='/api/admin/agent-categories'&&method==='POST'){
      const category=JSON.parse(options.body||'{}');category.id=Math.max(0,...agentCategories.map(item=>Number(item.id)||0))+1;category.created_by_admin=true;
      agentCategories.push(category);savePreviewCategories();return {category};
    }
    const categoryMatch=path.match(/^\/api\/admin\/agent-categories\/(\d+)$/);
    if(categoryMatch&&method==='PATCH'){
      const index=agentCategories.findIndex(item=>item.id===Number(categoryMatch[1]));if(index<0)throw new Error('Ce type d’agent est introuvable.');
      const category={...JSON.parse(options.body||'{}'),id:Number(categoryMatch[1]),created_by_admin:agentCategories[index].created_by_admin===true};agentCategories[index]=category;savePreviewCategories();return {category};
    }
    if(categoryMatch&&method==='DELETE'){
      agentCategories=agentCategories.filter(item=>item.id!==Number(categoryMatch[1]));savePreviewCategories();return {ok:true};
    }
    const match=path.match(/^\/api\/admin\/requests\/(\d+)$/);
    if(match&&method==='PATCH'){
      const item=requests.find(request=>request.id===Number(match[1]));
      if(!item)throw new Error('Cette demande est introuvable.');
      const update=JSON.parse(options.body||'{}');
      if(update.action==='take'&&item.status==='pending')item.status='review';
      else if(update.action==='approve'&&item.status==='review'){
        const category=agentCategories.find(entry=>entry.name===item.agent_type&&entry.active!==false);
        if(!category?.price&&item.request_kind!=='custom')throw new Error('Configure d’abord un tarif actif pour ce type d’agent dans la liste des services.');
        item.status='approved';
        if(category?.price){
          const digits=category.currency==='XOF'?0:2;const unitMinor=Math.round(Number(category.price)*(10**digits));
          const quantity=category.billing_unit==='event'?1:(Number(item.agents)||1)*(Number(item.billing_duration)||1);
          item.invoice_number=`VG-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Math.random().toString(16).slice(2,8).toUpperCase()}`;
          item.invoice_description=category.billing_unit==='event'?`${item.agent_type} — événement (${item.agents} agents)`: `${item.agent_type} — ${item.agents} agents × ${item.billing_duration||1} ${category.billing_unit==='day'?'jour':'heure'}${(item.billing_duration||1)===1?'':'s'}`;
          item.invoice_quantity=quantity;item.invoice_unit_price_minor=unitMinor;item.invoice_currency=category.currency||'CAD';item.invoice_total_minor=unitMinor*quantity;item.invoice_issued_at=Date.now();
        }
      }
      else if(update.action==='issue-invoice'&&['approved','assigned'].includes(item.status)){
        if(item.invoice_number)throw new Error('Une facture a déjà été émise pour cette demande.');
        const digits=update.currency==='XOF'?0:2;const unitMinor=Math.round(Number(update.unit_price)*(10**digits));const quantity=Number(update.quantity);
        item.invoice_number=`VG-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Math.random().toString(16).slice(2,8).toUpperCase()}`;
        item.invoice_description=String(update.description||'');item.invoice_quantity=quantity;item.invoice_unit_price_minor=unitMinor;
        item.invoice_currency=update.currency;item.invoice_total_minor=unitMinor*quantity;item.invoice_issued_at=Date.now();
      }
      else if(update.action==='mark-paid'&&['approved','assigned'].includes(item.status)&&item.invoice_number)item.invoice_paid_at=item.invoice_paid_at||Date.now();
      else if(update.action==='reject'&&item.status==='review'){
        const reason=String(update.reason||'').trim();if(reason.length<5)throw new Error('Veuillez préciser le motif du refus (au moins 5 caractères).');
        item.status='rejected';item.rejection_reason=reason;
      }else if(update.action==='assign'&&item.status==='approved'){
        item.status='assigned';item.team=String(update.team||'');item.coordination_note=String(update.note||'');
      }else throw new Error('Cette action n’est pas disponible pour le statut actuel.');
      savePreviewRequests();return {request:item};
    }
    if(path==='/api/logout'&&method==='POST')return {};
    if(path==='/api/csrf')return {csrf:'browser-preview'};
    throw new Error('Cette action n’est pas disponible dans l’aperçu navigateur.');
  }
  const headers={...(options.headers||{})};
  if(options.method&&options.method!=='GET'){
    if(!csrfToken){const tokenResponse=await fetch('/api/csrf');csrfToken=(await tokenResponse.json()).csrf}
    headers['X-CSRF-Token']=csrfToken;
  }
  const response=await fetch(path,{...options,headers});
  const data=await response.json();
  if(response.status===401){location.href='/admin-login.html';throw new Error('Connexion requise.')}
  if(!response.ok)throw new Error(data.error||'La requête a échoué.');
  return data;
}
function esc(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function formatDate(value){if(!value)return'À confirmer';return new Date(`${value}T12:00:00`).toLocaleDateString('fr-CA',{day:'numeric',month:'short',year:'numeric'})}
function toast(message){const node=document.querySelector('#toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),3200)}
function render(){
  const query=document.querySelector('#request-search').value.trim().toLocaleLowerCase('fr-CA');
  const status=document.querySelector('#status-filter').value;
  const filtered=requests.filter(item=>{
    const matchesStatus=status==='all'||item.status===status;
    const text=`${item.company} ${item.event_type} ${item.location} ${item.contact}`.toLocaleLowerCase('fr-CA');
    return matchesStatus&&text.includes(query);
  });
  list.innerHTML=filtered.map(item=>`<tr><td><div class="client-cell"><span class="client-avatar">${esc(item.company.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase())}</span><span class="client-copy"><b>${esc(item.company)}</b><small>${item.is_guest?'Invité':'Compte client'} · ${esc(item.event_type)} · ${esc(item.agent_type)}</small></span></div></td><td>${esc(formatDate(item.event_date))}</td><td>${Number(item.agents)||0} agents</td><td><span class="status status-${item.status}">${labels[item.status]||'Statut inconnu'}</span></td><td><button class="row-action" data-view="${item.id}">Consulter</button></td></tr>`).join('')||'<tr><td colspan="5" style="padding:22px 5px;color:#899598">Aucune demande ne correspond à votre recherche.</td></tr>';
  document.querySelector('#results-label').textContent=`${filtered.length} demande${filtered.length===1?'':'s'}`;
  const pending=requests.filter(item=>item.status==='pending').length;
  const review=requests.filter(item=>item.status==='review').length;
  const approved=requests.filter(item=>item.status==='approved'||item.status==='assigned').length;
  const agents=requests.filter(item=>item.status==='approved'||item.status==='assigned').reduce((sum,item)=>sum+(Number(item.agents)||0),0);
  document.querySelector('#pending-count').textContent=pending;
  document.querySelector('#metric-pending').textContent=String(pending).padStart(2,'0');
  document.querySelector('#metric-review').textContent=String(review).padStart(2,'0');
  document.querySelector('#metric-approved').textContent=String(approved).padStart(2,'0');
  document.querySelector('#metric-agents').textContent=String(agents).padStart(2,'0');
  renderUpcoming();
}
function formatPrice(category){
  if(category.price===null||category.price===undefined||category.price===''||Number(category.price)===0)return'Tarif à confirmer';
  const amount=new Intl.NumberFormat('fr-CA',{style:'currency',currency:category.currency||'CAD'}).format(Number(category.price));
  return `${amount} ${billingLabels[category.billing_unit]||billingLabels.hour}`;
}
function renderCategories(){
  categoryList.innerHTML=agentCategories.map(category=>`<tr><td><div class="category-name"><b>${esc(category.name)}</b><small>${esc(category.description||'Aucune description pour le client.')}</small></div></td><td>${esc(formatPrice(category))}</td><td><span class="category-visibility ${category.active?'is-active':''}">${category.active?'Proposé':'Masqué'}</span></td><td class="category-actions"><button type="button" data-edit-category="${category.id}">Modifier</button><button type="button" data-delete-category="${category.id}">Supprimer</button></td></tr>`).join('')||'<tr><td colspan="4" class="category-empty">Aucun type d’agent créé pour le moment. Crée un type ci-dessus pour l’afficher aux clients.</td></tr>';
  const catalog=encodeURIComponent(JSON.stringify(agentCategories.filter(category=>category.active)));
  const localRequests=browserPreview?`&localRequests=${encodeURIComponent(JSON.stringify(requests))}`:'';
  const publicPreviewUrl=`index.html?agentCatalog=${catalog}${localRequests}#demande`;
  document.querySelector('#public-preview-link').href=publicPreviewUrl;
  document.querySelector('#admin-site-preview-link').href=publicPreviewUrl;
  document.querySelector('#admin-footer-public-link').href=publicPreviewUrl;
  if(browserPreview)document.querySelectorAll('a[href^="index.html"]').forEach(link=>{const hash=new URL(link.href,location.href).hash;link.href=`index.html?agentCatalog=${catalog}${localRequests}${hash||'#demande'}`});
  const linkedRequest=requests.find(item=>item.client_user_id&&!item.is_guest);
  const localUser=browserPreview&&linkedRequest?`&localUser=${encodeURIComponent(JSON.stringify({id:linkedRequest.client_user_id,role:'client',company:linkedRequest.company,identifier:String(linkedRequest.contact_method||'').split(' · ')[0]}))}`:'';
  document.querySelector('#client-panel-preview-link').href=`client.html?agentCatalog=${catalog}${localRequests}${localUser}`;
}
async function loadCategories(){
  try{const result=await api('/api/admin/agent-categories');agentCategories=result.categories||[];renderCategories()}
  catch(error){toast(error.message)}
}
function renderUpcoming(){
  const now=new Date();now.setHours(0,0,0,0);
  const upcoming=requests.filter(item=>!['rejected','cancelled'].includes(item.status)&&new Date(`${item.event_date}T12:00:00`)>=now).sort((a,b)=>a.event_date.localeCompare(b.event_date)).slice(0,4);
  document.querySelector('#upcoming-list').innerHTML=upcoming.map(item=>{
    const date=new Date(`${item.event_date}T12:00:00`);
    const day=date.toLocaleDateString('fr-CA',{day:'2-digit'});const month=date.toLocaleDateString('fr-CA',{month:'short'}).replace('.','').toUpperCase();
    return `<div class="upcoming-item"><span class="day-badge"><b>${day}</b><small>${month}</small></span><div><b>${esc(item.event_type)}</b><small>${esc(item.company)} · ${Number(item.agents)} agents</small></div><span class="upcoming-dot ${item.status==='approved'||item.status==='assigned'?'green-dot':item.status==='review'?'blue-dot':'orange-dot'}"></span></div>`;
  }).join('')||'<p class="no-upcoming">Aucune demande à venir.</p>';
}
async function loadRequests(){
  if(browserPreview){requests=getPreviewRequests();render();return}
  try{const result=await api('/api/admin/requests');requests=result.requests;render()}
  catch(error){if(error.message!=='Connexion requise.')toast(error.message)}
}
function showRequest(id){
  activeRequest=requests.find(item=>item.id===Number(id));if(!activeRequest)return;
  document.querySelector('#detail-title').textContent=activeRequest.event_type;
  const requestCategory=agentCategories.find(item=>item.name===activeRequest.agent_type);
  const durationItem=requestCategory?.billing_unit==='event'?'':`<div class="detail-item"><small>Durée prévue</small><b>${Number(activeRequest.billing_duration)||1} ${requestCategory?.billing_unit==='day'?'jour(s)':'heure(s)'}</b></div>`;
  document.querySelector('#detail-content').innerHTML=`<div class="detail-grid"><div class="detail-item"><small>Entreprise cliente</small><b>${esc(activeRequest.company)}</b></div><div class="detail-item"><small>Type de demande</small><b>${activeRequest.request_kind==='custom'?'Personnalisée':activeRequest.is_guest?'Invité':'Compte client'}</b></div><div class="detail-item"><small>Responsable</small><b>${esc(activeRequest.contact)}</b></div><div class="detail-item"><small>Courriel / téléphone</small><b>${esc(activeRequest.contact_method)}</b></div><div class="detail-item"><small>Type d’agent souhaité</small><b>${esc(activeRequest.agent_type)}</b></div><div class="detail-item"><small>Date de l’événement</small><b>${esc(formatDate(activeRequest.event_date))}${activeRequest.event_start_time?` · ${esc(activeRequest.event_start_time)}${activeRequest.event_end_time?`–${esc(activeRequest.event_end_time)}`:''}`:''}</b></div><div class="detail-item"><small>Effectif demandé</small><b>${Number(activeRequest.agents)} agents</b></div>${durationItem}<div class="detail-item"><small>Lieu</small><b>${esc(activeRequest.location)}</b></div><div class="detail-item"><small>Statut</small><b><span class="status status-${activeRequest.status}">${labels[activeRequest.status]}</span></b></div>${activeRequest.team?`<div class="detail-item"><small>Équipe responsable</small><b>${esc(activeRequest.team)}</b></div>`:''}</div><div class="detail-notes"><small>DÉTAILS DU CLIENT</small><p>${esc(activeRequest.details||'Aucun détail supplémentaire fourni.')}</p></div>${activeRequest.coordination_note?`<div class="detail-notes"><small>NOTE DE COORDINATION</small><p>${esc(activeRequest.coordination_note)}</p></div>`:''}${activeRequest.rejection_reason?`<div class="detail-notes rejection-notes"><small>MOTIF DU REFUS</small><p>${esc(activeRequest.rejection_reason)}</p></div>`:''}`;
  const actions=document.querySelector('#detail-actions');
  if(activeRequest.status==='pending')actions.innerHTML='<button class="action-secondary" data-dialog-close>Fermer</button><button class="action-primary" data-action="take">Prendre en charge <span>→</span></button>';
  else if(activeRequest.status==='review')actions.innerHTML='<button class="action-secondary" data-dialog-close>Fermer</button><button class="action-danger" data-action="reject">Refuser</button><button class="action-approve" data-action="approve">Approuver la demande <span>✓</span></button>';
  else if(['approved','assigned'].includes(activeRequest.status)){
    const invoiceAction=activeRequest.invoice_number?'<button class="action-primary" data-action="view-invoice">Voir la facture</button>':'<button class="action-primary" data-action="prepare-invoice">Émettre une facture</button>';
    const paymentAction=activeRequest.invoice_number?(activeRequest.invoice_paid_at?'<span class="payment-badge payment-paid">Payée ✓</span>':'<button class="action-secondary" data-action="mark-paid">Marquer comme payée</button>'):'';
    const assignAction=activeRequest.status==='approved'?'<button class="action-primary" data-action="assign">Coordonner les agents <span>→</span></button>':'';
    actions.innerHTML=`<button class="action-secondary" data-dialog-close>Fermer</button>${invoiceAction}${paymentAction}${assignAction}`;
  }else actions.innerHTML=`<button class="action-secondary" data-dialog-close>Fermer</button><span class="status status-${activeRequest.status}">${labels[activeRequest.status]}</span>`;
  if(activeRequest.invoice_number){const paidText=activeRequest.invoice_paid_at?`Payée le ${new Date(activeRequest.invoice_paid_at).toLocaleDateString('fr-CA')}`:'En attente de paiement';document.querySelector('#detail-content').insertAdjacentHTML('beforeend',`<div class="invoice-summary"><b>Facture ${esc(activeRequest.invoice_number)}</b><span>${esc(money(activeRequest.invoice_total_minor,activeRequest.invoice_currency))} · émise le ${esc(new Date(activeRequest.invoice_issued_at).toLocaleDateString('fr-CA'))}</span><span class="payment-badge ${activeRequest.invoice_paid_at?'payment-paid':'payment-due'}">${esc(paidText)}</span></div>`)}
  detailDialog.showModal();
}
function money(minor,currency){const code=currency||'CAD';const digits=code==='XOF'?0:2;return new Intl.NumberFormat('fr-CA',{style:'currency',currency:code,minimumFractionDigits:digits,maximumFractionDigits:digits}).format((Number(minor)||0)/(10**digits))}
function showInvoice(request){
  const issuedDate=new Date(request.invoice_issued_at).toLocaleDateString('fr-CA',{year:'numeric',month:'long',day:'numeric'});
  const paymentLabel=request.invoice_paid_at?`Payée le ${new Date(request.invoice_paid_at).toLocaleDateString('fr-CA',{year:'numeric',month:'long',day:'numeric'})}`:'À payer';
  document.querySelector('#invoice-paper').innerHTML=`<div class="invoice-brand"><span class="brand-mark">V</span><span>vigie<span>.</span></span></div><div class="invoice-heading"><div><small>FACTURE</small><h2>${esc(request.invoice_number)}</h2></div><div><small>DATE D’ÉMISSION</small><b>${esc(issuedDate)}</b></div></div><div class="invoice-parties"><div><small>FACTURÉ À</small><b>${esc(request.company)}</b><span>${esc(request.contact)}</span><span>${esc(request.contact_method)}</span></div><div><small>SERVICE</small><b>${esc(request.event_type)}</b><span>${esc(request.location)}</span><span>${esc(formatDate(request.event_date))}</span></div></div><table class="invoice-lines"><thead><tr><th>Description</th><th>Qté</th><th>Prix unitaire</th><th>Total</th></tr></thead><tbody><tr><td>${esc(request.invoice_description)}</td><td>${Number(request.invoice_quantity)}</td><td>${esc(money(request.invoice_unit_price_minor,request.invoice_currency))}</td><td>${esc(money(request.invoice_total_minor,request.invoice_currency))}</td></tr></tbody></table><div class="invoice-total"><span>Total à payer</span><b>${esc(money(request.invoice_total_minor,request.invoice_currency))}</b></div><div class="invoice-payment-status ${request.invoice_paid_at?'is-paid':'is-due'}"><span>État du paiement</span><b>${esc(paymentLabel)}</b></div><p class="invoice-terms">Merci de faire affaire avec Vigie Sécurité. Pour toute question concernant cette facture, veuillez contacter l’entreprise.</p><div class="invoice-footer">Vigie Sécurité · Facture ${esc(request.invoice_number)}</div>`;
  invoicePreviewDialog.showModal();
}
async function transition(action,extra={}){
  try{const requestId=activeRequest.id;const wasCustom=activeRequest.request_kind==='custom';await api(`/api/admin/requests/${requestId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});if(action==='reject')rejectDialog.close();else if(action==='issue-invoice')invoiceCreateDialog.close();else detailDialog.close();toast(action==='take'?'Demande prise en charge.':action==='approve'?wasCustom?'Demande personnalisée approuvée.':'Demande approuvée, facture émise.':action==='reject'?'Demande refusée.':action==='issue-invoice'?'Facture émise.':action==='mark-paid'?'Paiement enregistré.':'Coordination enregistrée.');await loadRequests();activeRequest=requests.find(item=>item.id===requestId)||activeRequest;if(action==='issue-invoice'||(action==='approve'&&activeRequest.invoice_number))showInvoice(activeRequest);else if(action==='approve'||action==='mark-paid')showRequest(requestId);return true}
  catch(error){toast(error.message);return false}
}
list.addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(button)showRequest(button.dataset.view)});
document.querySelector('#request-search').addEventListener('input',render);
document.querySelector('#status-filter').addEventListener('change',render);
document.querySelector('#detail-actions').addEventListener('click',event=>{
  if(event.target.closest('[data-dialog-close]')){detailDialog.close();return}
  const action=event.target.closest('[data-action]')?.dataset.action;if(!action||!activeRequest)return;
  if(action==='assign'){
    detailDialog.close();document.querySelector('#assign-summary').textContent=`${activeRequest.company} · ${activeRequest.event_type} · ${activeRequest.agents} agents · ${formatDate(activeRequest.event_date)}`;
    document.querySelector('#assign-form').dataset.requestId=activeRequest.id;assignDialog.showModal();
  }else if(action==='reject'){
    document.querySelector('#reject-summary').textContent=`${activeRequest.company} · ${activeRequest.event_type} · ${formatDate(activeRequest.event_date)}`;
    document.querySelector('#rejection-reason').value='';
    detailDialog.close();rejectDialog.showModal();document.querySelector('#rejection-reason').focus();
  }else if(action==='prepare-invoice'){
    detailDialog.close();const category=agentCategories.find(item=>item.name===activeRequest.agent_type);const form=invoiceCreateForm;
    document.querySelector('#invoice-create-summary').textContent=`${activeRequest.company} · ${activeRequest.event_type} · ${activeRequest.agents} agents`;
    const duration=Number(activeRequest.billing_duration)||1;const durationUnit=category?.billing_unit==='day'?'jour':'heure';
    form.elements.description.value=category?.billing_unit==='event'?`${activeRequest.agent_type} — événement (${activeRequest.agents} agents)`:`${activeRequest.agent_type} — ${activeRequest.agents} agents × ${duration} ${durationUnit}${duration===1?'':'s'}`;
    form.elements.quantity.value=category?.billing_unit==='event'?'1':String(Number(activeRequest.agents)*duration);
    form.elements.unit_price.value=category?.price??'0';form.elements.currency.value=category?.currency||'CAD';updateInvoiceTotal();invoiceCreateDialog.showModal();
  }else if(action==='view-invoice'){
    detailDialog.close();showInvoice(activeRequest);
  }else transition(action);
});
document.querySelector('#assign-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);transition('assign',{team:data.get('team'),note:data.get('note')});form.reset();assignDialog.close()});
rejectForm.addEventListener('submit',async event=>{event.preventDefault();if(!rejectForm.reportValidity())return;const reason=new FormData(rejectForm).get('reason');if(await transition('reject',{reason}))rejectForm.reset()});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelector('#refresh-requests').addEventListener('click',loadRequests);
document.querySelector('#today-label').textContent=new Date().toLocaleDateString('fr-CA',{weekday:'short',day:'numeric',month:'short'});
document.querySelector('#welcome-date').textContent=new Date().toLocaleDateString('fr-CA',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toLocaleUpperCase('fr-CA');
document.querySelector('#sidebar-toggle').addEventListener('click',()=>document.querySelector('#sidebar').classList.toggle('open'));
document.querySelectorAll('.nav-item').forEach(link=>link.addEventListener('click',event=>{if(link.classList.contains('muted-link')){event.preventDefault();toast('Cette section sera configurée dans une prochaine étape.');return}document.querySelectorAll('.nav-item').forEach(item=>item.classList.remove('selected'));link.classList.add('selected');document.querySelector('#sidebar').classList.remove('open')}));
document.querySelectorAll('.detail-dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()}));
categoryForm.addEventListener('submit',async event=>{
  event.preventDefault();if(!categoryForm.reportValidity())return;
  const values=new FormData(categoryForm);const id=values.get('id');
  const category={name:String(values.get('name')).trim(),description:String(values.get('description')||'').trim(),price:values.get('price')===''?null:Number(values.get('price')),currency:values.get('currency'),billing_unit:values.get('billing_unit'),active:values.get('active')==='on'};
  try{await api(id?`/api/admin/agent-categories/${id}`:'/api/admin/agent-categories',{method:id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(category)});categoryForm.reset();categoryForm.elements.id.value='';document.querySelector('#category-submit-label').textContent='Ajouter ce type d’agent →';document.querySelector('#cancel-category-edit').hidden=true;toast(id?'Type d’agent modifié.':'Type d’agent ajouté.');await loadCategories()}
  catch(error){toast(error.message)}
});
categoryList.addEventListener('click',async event=>{
  const edit=event.target.closest('[data-edit-category]');const remove=event.target.closest('[data-delete-category]');
  if(edit){const category=agentCategories.find(item=>item.id===Number(edit.dataset.editCategory));if(!category)return;categoryForm.elements.id.value=category.id;categoryForm.elements.name.value=category.name;categoryForm.elements.description.value=category.description||'';categoryForm.elements.price.value=category.price??'';categoryForm.elements.currency.value=category.currency||'CAD';categoryForm.elements.price.step=category.currency==='XOF'?'1':'0.01';categoryForm.elements.billing_unit.value=category.billing_unit||'hour';categoryForm.elements.active.checked=Boolean(category.active);document.querySelector('#category-submit-label').textContent='Enregistrer les modifications →';document.querySelector('#cancel-category-edit').hidden=false;categoryForm.elements.name.focus();categoryForm.scrollIntoView({behavior:'smooth',block:'center'});return}
  if(remove){const category=agentCategories.find(item=>item.id===Number(remove.dataset.deleteCategory));if(!category)return;agentCategories=agentCategories.filter(item=>item.id!==category.id);try{await api(`/api/admin/agent-categories/${category.id}`,{method:'DELETE'});toast('Type d’agent supprimé.');renderCategories()}catch(error){toast(error.message);await loadCategories()}}
});
document.querySelector('#cancel-category-edit').addEventListener('click',()=>{categoryForm.reset();categoryForm.elements.id.value='';document.querySelector('#category-submit-label').textContent='Ajouter ce type d’agent →';document.querySelector('#cancel-category-edit').hidden=true});
function updateInvoiceTotal(){const form=invoiceCreateForm;const quantity=Number(form.elements.quantity.value)||0;const price=Number(form.elements.unit_price.value)||0;const currency=form.elements.currency.value||'CAD';const digits=currency==='XOF'?0:2;form.elements.unit_price.step=digits?'0.01':'1';document.querySelector('#invoice-total-preview').textContent=new Intl.NumberFormat('fr-CA',{style:'currency',currency,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(quantity*price)}
invoiceCreateForm.addEventListener('input',updateInvoiceTotal);invoiceCreateForm.elements.currency.addEventListener('change',updateInvoiceTotal);
categoryForm.elements.currency.addEventListener('change',()=>{categoryForm.elements.price.step=categoryForm.elements.currency.value==='XOF'?'1':'0.01'});
invoiceCreateForm.addEventListener('submit',event=>{event.preventDefault();if(!invoiceCreateForm.reportValidity())return;const values=new FormData(invoiceCreateForm);transition('issue-invoice',{description:values.get('description'),quantity:values.get('quantity'),unit_price:values.get('unit_price'),currency:values.get('currency')})});
document.querySelector('#print-invoice').addEventListener('click',()=>{document.body.classList.add('printing-invoice');window.print();setTimeout(()=>document.body.classList.remove('printing-invoice'),500)});
document.querySelector('#logout-button').addEventListener('click',async()=>{try{const token=await fetch('/api/csrf').then(r=>r.json()).then(d=>d.csrf);await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:'{}'})}finally{location.href='/admin-login.html'}});

if(browserPreview){
  let localAdmin=null;let localSession=null;
  try{const params=new URLSearchParams(location.search);const incoming=JSON.parse(params.get('localAdmin')||'null');const incomingRequests=JSON.parse(params.get('localRequests')||'null');const users=JSON.parse(localStorage.getItem('vigie-local-test-users-v1')||'[]');if(Array.isArray(incomingRequests)){localStorage.setItem('vigie-local-test-requests-v1',JSON.stringify(incomingRequests));params.delete('localRequests');history.replaceState(null,'',`${location.pathname}${params.size?'?'+params.toString():''}${location.hash}`)}if(incoming?.role==='admin'){const index=users.findIndex(user=>user.id===incoming.id);if(index<0)users.push(incoming);else users[index]={...users[index],...incoming};localStorage.setItem('vigie-local-test-users-v1',JSON.stringify(users));localStorage.setItem('vigie-local-test-session-v1',JSON.stringify({id:incoming.id,role:'admin'}));localStorage.setItem('vigie-admin-display-name',incoming.display_name)}localAdmin=users.find(user=>user.role==='admin')||null;localSession=JSON.parse(localStorage.getItem('vigie-local-test-session-v1')||'null')}catch{}
  if(localAdmin&&localSession?.id!==localAdmin.id){location.href=`admin-login.html?localAdmin=${encodeURIComponent(JSON.stringify(localAdmin))}`;throw new Error('Connexion administrateur requise.')}
  requests=getPreviewRequests();csrfToken='browser-preview';
  agentCategories=getPreviewCategories();
  const demoAdminName=localAdmin?.display_name||localStorage.getItem('vigie-admin-display-name');if(demoAdminName){document.querySelector('#admin-display-name').textContent=demoAdminName;document.querySelector('#admin-profile-name').textContent=demoAdminName;document.querySelector('#admin-profile-identifier').textContent=localAdmin?.identifier||''}
  document.querySelector('#environment-label').textContent=localAdmin?'Test local · Données conservées dans ce navigateur':'Aperçu navigateur · Données de démonstration conservées sur cet appareil';
  if(localAdmin){document.querySelector('#logout-button').addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();localStorage.removeItem('vigie-local-test-session-v1');location.href=`admin-login.html?localAdmin=${encodeURIComponent(JSON.stringify(localAdmin))}`},true)}
  else{document.querySelector('#logout-button').addEventListener('click',event=>{event.stopImmediatePropagation();toast('L’aperçu ne nécessite pas de connexion administrateur.')},true);document.querySelector('#logout-button').textContent='Mode aperçu'}
  render();renderCategories();
}else{
  (async()=>{try{const session=await fetch('/api/me').then(r=>r.json());csrfToken=session.csrf;if(session.user?.role!=='admin'){location.href='/admin-login.html';return}const adminName=session.user.display_name||session.user.company||'Administrateur';document.querySelector('#admin-display-name').textContent=adminName;document.querySelector('#admin-profile-name').textContent=adminName;document.querySelector('#admin-profile-identifier').textContent=session.user.identifier||'';await Promise.all([loadRequests(),loadCategories()])}catch{location.href='/admin-login.html'}})();
}
