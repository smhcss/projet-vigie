const statusLabels={pending:'À examiner',review:'En traitement',approved:'Approuvée',assigned:'Agents coordonnés',rejected:'Refusée'};
const historyNode=document.querySelector('#request-history');
const errorNode=document.querySelector('#history-error');
let csrfToken='';

function esc(value=''){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function formatDate(value){
  if(!value)return'À confirmer';
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'});
}
function renderRequests(requests){
  const active=requests.filter(request=>['pending','review'].includes(request.status)).length;
  const decided=requests.filter(request=>['approved','assigned','rejected'].includes(request.status)).length;
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
      <div class="request-details"><div><small>DATE DE L’ÉVÉNEMENT</small><b>${esc(formatDate(request.event_date))}</b></div><div><small>EFFECTIF</small><b>${Number(request.agents)||0} agent${Number(request.agents)===1?'':'s'}</b></div><div><small>LIEU</small><b>${esc(request.location)}</b></div></div>
      ${rejected?`<div class="rejection-reason"><small>MOTIF DU REFUS</small><p>${esc(request.rejection_reason||'L’équipe n’a pas encore ajouté de motif.')}</p></div>`:''}
      ${request.team?`<div class="team-note"><small>COORDINATION</small><p><b>${esc(request.team)}</b>${request.coordination_note?` · ${esc(request.coordination_note)}`:''}</p></div>`:''}
    </article>`;
  }).join('');
}
async function loadHistory(){
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
    document.querySelector('#welcome-company').textContent=data.user.company||'votre compte';
    document.querySelector('#account-identifier').textContent=data.user.identifier||'';
    await loadHistory();
  }catch{
    location.href='auth.html?role=client&mode=login';
  }
}
document.querySelector('#refresh-button').addEventListener('click',loadHistory);
document.querySelector('#logout-button').addEventListener('click',async()=>{
  try{
    if(!csrfToken){const response=await fetch('/api/csrf');csrfToken=(await response.json()).csrf}
    await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:'{}'});
  }finally{location.href='index.html'}
});
initialize();
