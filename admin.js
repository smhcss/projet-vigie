let requests=[];
let activeRequest=null;
let csrfToken='';
let toastTimer;
const list=document.querySelector('#request-list');
const detailDialog=document.querySelector('#request-dialog');
const assignDialog=document.querySelector('#assign-dialog');
const labels={pending:'À examiner',review:'En traitement',approved:'Approuvée',assigned:'Agents coordonnés'};

async function api(path,options={}){
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
  list.innerHTML=filtered.map(item=>`<tr><td><div class="client-cell"><span class="client-avatar">${esc(item.company.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase())}</span><span class="client-copy"><b>${esc(item.company)}</b><small>${esc(item.event_type)} · ${esc(item.agent_type)}</small></span></div></td><td>${esc(formatDate(item.event_date))}</td><td>${Number(item.agents)||0} agents</td><td><span class="status status-${item.status}">${labels[item.status]||'Statut inconnu'}</span></td><td><button class="row-action" data-view="${item.id}">Consulter</button></td></tr>`).join('')||'<tr><td colspan="5" style="padding:22px 5px;color:#899598">Aucune demande ne correspond à votre recherche.</td></tr>';
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
function renderUpcoming(){
  const now=new Date();now.setHours(0,0,0,0);
  const upcoming=requests.filter(item=>new Date(`${item.event_date}T12:00:00`)>=now).sort((a,b)=>a.event_date.localeCompare(b.event_date)).slice(0,4);
  document.querySelector('#upcoming-list').innerHTML=upcoming.map(item=>{
    const date=new Date(`${item.event_date}T12:00:00`);
    const day=date.toLocaleDateString('fr-CA',{day:'2-digit'});const month=date.toLocaleDateString('fr-CA',{month:'short'}).replace('.','').toUpperCase();
    return `<div class="upcoming-item"><span class="day-badge"><b>${day}</b><small>${month}</small></span><div><b>${esc(item.event_type)}</b><small>${esc(item.company)} · ${Number(item.agents)} agents</small></div><span class="upcoming-dot ${item.status==='approved'||item.status==='assigned'?'green-dot':item.status==='review'?'blue-dot':'orange-dot'}"></span></div>`;
  }).join('')||'<p class="no-upcoming">Aucune demande à venir.</p>';
}
async function loadRequests(){
  try{const result=await api('/api/admin/requests');requests=result.requests;render()}
  catch(error){if(error.message!=='Connexion requise.')toast(error.message)}
}
function showRequest(id){
  activeRequest=requests.find(item=>item.id===Number(id));if(!activeRequest)return;
  document.querySelector('#detail-title').textContent=activeRequest.event_type;
  document.querySelector('#detail-content').innerHTML=`<div class="detail-grid"><div class="detail-item"><small>Entreprise cliente</small><b>${esc(activeRequest.company)}</b></div><div class="detail-item"><small>Responsable</small><b>${esc(activeRequest.contact)}</b></div><div class="detail-item"><small>Courriel / téléphone</small><b>${esc(activeRequest.contact_method)}</b></div><div class="detail-item"><small>Type d’agent</small><b>${esc(activeRequest.agent_type)}</b></div><div class="detail-item"><small>Date de l’événement</small><b>${esc(formatDate(activeRequest.event_date))}</b></div><div class="detail-item"><small>Effectif demandé</small><b>${Number(activeRequest.agents)} agents</b></div><div class="detail-item"><small>Lieu</small><b>${esc(activeRequest.location)}</b></div><div class="detail-item"><small>Statut</small><b><span class="status status-${activeRequest.status}">${labels[activeRequest.status]}</span></b></div>${activeRequest.team?`<div class="detail-item"><small>Équipe responsable</small><b>${esc(activeRequest.team)}</b></div>`:''}</div><div class="detail-notes"><small>DÉTAILS DU CLIENT</small><p>${esc(activeRequest.details||'Aucun détail supplémentaire fourni.')}</p></div>${activeRequest.coordination_note?`<div class="detail-notes"><small>NOTE DE COORDINATION</small><p>${esc(activeRequest.coordination_note)}</p></div>`:''}`;
  const actions=document.querySelector('#detail-actions');
  if(activeRequest.status==='pending')actions.innerHTML='<button class="action-secondary" data-dialog-close>Fermer</button><button class="action-primary" data-action="take">Prendre en charge <span>→</span></button>';
  else if(activeRequest.status==='review')actions.innerHTML='<button class="action-secondary" data-dialog-close>Fermer</button><button class="action-approve" data-action="approve">Approuver la demande <span>✓</span></button>';
  else if(activeRequest.status==='approved')actions.innerHTML='<button class="action-secondary" data-dialog-close>Fermer</button><button class="action-primary" data-action="assign">Coordonner les agents <span>→</span></button>';
  else actions.innerHTML='<button class="action-secondary" data-dialog-close>Fermer</button><span class="status status-assigned">Agents coordonnés</span>';
  detailDialog.showModal();
}
async function transition(action,extra={}){
  try{await api(`/api/admin/requests/${activeRequest.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});detailDialog.close();toast(action==='take'?'Demande prise en charge.':action==='approve'?'Demande approuvée.':'Coordination enregistrée.');await loadRequests()}
  catch(error){toast(error.message)}
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
  }else transition(action);
});
document.querySelector('#assign-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);transition('assign',{team:data.get('team'),note:data.get('note')});form.reset();assignDialog.close()});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelector('#refresh-requests').addEventListener('click',loadRequests);
document.querySelector('#today-label').textContent=new Date().toLocaleDateString('fr-CA',{weekday:'short',day:'numeric',month:'short'});
document.querySelector('#sidebar-toggle').addEventListener('click',()=>document.querySelector('#sidebar').classList.toggle('open'));
document.querySelectorAll('.nav-item').forEach(link=>link.addEventListener('click',event=>{if(link.classList.contains('muted-link')){event.preventDefault();toast('Cette section sera configurée dans une prochaine étape.');return}document.querySelectorAll('.nav-item').forEach(item=>item.classList.remove('selected'));link.classList.add('selected');document.querySelector('#sidebar').classList.remove('open')}));
document.querySelectorAll('.detail-dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()}));
document.querySelector('#logout-button').addEventListener('click',async()=>{try{const token=await fetch('/api/csrf').then(r=>r.json()).then(d=>d.csrf);await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:'{}'})}finally{location.href='/admin-login.html'}});

(async()=>{try{const session=await fetch('/api/me').then(r=>r.json());csrfToken=session.csrf;if(session.user?.role!=='admin'){location.href='/admin-login.html';return}await loadRequests()}catch{location.href='/admin-login.html'}})();
