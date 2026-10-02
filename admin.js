const DEMO_KEY='vigie-admin-demo-requests-v1';
const defaults=[
  {id:'VG-10482',company:'Maison Fête',contact:'Marie Fortin',email:'marie@maisonfete.example',phone:'(514) 555-0142',event:'Gala corporatif',type:'Événement corporatif',date:'2026-10-18',location:'Grand Quai, Montréal',agents:6,status:'pending',details:'Accueil des invités, contrôle des accès et présence dans la salle principale.',team:'',note:''},
  {id:'VG-10479',company:'Nordik Culture',contact:'Nicolas Caron',email:'nicolas@nordikculture.example',phone:'(514) 555-0168',event:'Festival de musique',type:'Concert ou festival',date:'2026-10-22',location:'Parc Jean-Drapeau, Montréal',agents:12,status:'review',details:'Gestion des entrées, surveillance des zones publiques et coordination avec l’organisation.',team:'',note:''},
  {id:'VG-10463',company:'Groupe Lavoie',contact:'Gabriel Lavoie',email:'gabriel@groupe-lavoie.example',phone:'(514) 555-0121',event:'Surveillance de site',type:'Surveillance de site',date:'2026-10-25',location:'1200 rue des Ateliers, Montréal',agents:2,status:'approved',details:'Présence de soir sur un site commercial pendant des travaux.',team:'',note:''}
];
const labels={pending:'À examiner',review:'En traitement',approved:'Approuvée',assigned:'Agents coordonnés'};
let requests;
try{requests=JSON.parse(localStorage.getItem(DEMO_KEY))||structuredClone(defaults)}catch{requests=structuredClone(defaults)}
let activeRequest=null;
let toastTimer;
const list=document.querySelector('#request-list');
const detailDialog=document.querySelector('#request-dialog');
const assignDialog=document.querySelector('#assign-dialog');

function save(){localStorage.setItem(DEMO_KEY,JSON.stringify(requests))}
function formatDate(iso){if(!iso)return'À confirmer';return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-CA',{day:'numeric',month:'short',year:'numeric'})}
function esc(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function visibleRequests(){
  const query=document.querySelector('#request-search').value.trim().toLocaleLowerCase('fr-CA');
  const status=document.querySelector('#status-filter').value;
  return requests.filter(item=>{
    const matchesStatus=status==='all'||item.status===status;
    const text=`${item.company} ${item.event} ${item.location} ${item.contact}`.toLocaleLowerCase('fr-CA');
    return matchesStatus&&text.includes(query);
  }).sort((a,b)=>a.date.localeCompare(b.date));
}
function render(){
  const filtered=visibleRequests();
  list.innerHTML=filtered.map(item=>`<tr><td><div class="client-cell"><span class="client-avatar ${item.company==='Nordik Culture'?'av-two':item.company==='Groupe Lavoie'?'av-three':''}">${esc(item.company.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase())}</span><span class="client-copy"><b>${esc(item.company)}</b><small>${esc(item.event)}</small></span></div></td><td>${esc(formatDate(item.date))}</td><td>${Number(item.agents)||0} agents</td><td><span class="status status-${item.status}">${labels[item.status]}</span></td><td><button class="row-action" data-view="${esc(item.id)}">Consulter</button></td></tr>`).join('')||'<tr><td colspan="5" style="padding:22px 5px;color:#899598">Aucune demande ne correspond à votre recherche.</td></tr>';
  document.querySelector('#results-label').textContent=`${filtered.length} demande${filtered.length===1?'':'s'}`;
  const pending=requests.filter(item=>item.status==='pending').length;
  const review=requests.filter(item=>item.status==='review').length;
  const approved=requests.filter(item=>item.status==='approved'||item.status==='assigned').length;
  document.querySelector('#pending-count').textContent=pending;
  document.querySelector('#metric-pending').textContent=String(pending).padStart(2,'0');
  document.querySelector('#metric-review').textContent=String(review).padStart(2,'0');
  document.querySelector('#metric-approved').textContent=String(14+Math.max(0,approved-1)).padStart(2,'0');
}
function toast(message){const node=document.querySelector('#toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),3200)}
function showRequest(id){
  activeRequest=requests.find(item=>item.id===id);
  if(!activeRequest)return;
  document.querySelector('#detail-title').textContent=activeRequest.event;
  document.querySelector('#detail-content').innerHTML=`<div class="detail-grid"><div class="detail-item"><small>Entreprise cliente</small><b>${esc(activeRequest.company)}</b></div><div class="detail-item"><small>Responsable</small><b>${esc(activeRequest.contact)}</b></div><div class="detail-item"><small>Courriel</small><b>${esc(activeRequest.email)}</b></div><div class="detail-item"><small>Téléphone</small><b>${esc(activeRequest.phone)}</b></div><div class="detail-item"><small>Type de service</small><b>${esc(activeRequest.type)}</b></div><div class="detail-item"><small>Date de l’événement</small><b>${esc(formatDate(activeRequest.date))}</b></div><div class="detail-item"><small>Lieu</small><b>${esc(activeRequest.location)}</b></div><div class="detail-item"><small>Effectif demandé</small><b>${Number(activeRequest.agents)||0} agents</b></div><div class="detail-item"><small>Statut</small><b><span class="status status-${activeRequest.status}">${labels[activeRequest.status]}</span></b></div>${activeRequest.team?`<div class="detail-item"><small>Équipe responsable</small><b>${esc(activeRequest.team)}</b></div>`:''}</div><div class="detail-notes"><small>DÉTAILS DU CLIENT</small><p>${esc(activeRequest.details||'Aucun détail supplémentaire fourni.')}</p></div>${activeRequest.note?`<div class="detail-notes"><small>NOTE DE COORDINATION</small><p>${esc(activeRequest.note)}</p></div>`:''}`;
  const actions=document.querySelector('#detail-actions');
  if(activeRequest.status==='pending')actions.innerHTML='<button class="action-secondary" data-dialog-close>Fermer</button><button class="action-primary" data-action="review">Prendre en charge <span>→</span></button>';
  else if(activeRequest.status==='review')actions.innerHTML='<button class="action-secondary" data-dialog-close>Fermer</button><button class="action-approve" data-action="approve">Approuver la demande <span>✓</span></button>';
  else if(activeRequest.status==='approved')actions.innerHTML='<button class="action-secondary" data-dialog-close>Fermer</button><button class="action-primary" data-action="assign">Coordonner les agents <span>→</span></button>';
  else actions.innerHTML='<button class="action-secondary" data-dialog-close>Fermer</button><span class="status status-assigned">Coordination enregistrée</span>';
  detailDialog.showModal();
}
list.addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(button)showRequest(button.dataset.view)});
document.querySelector('#request-search').addEventListener('input',render);
document.querySelector('#status-filter').addEventListener('change',render);
document.querySelector('#detail-actions').addEventListener('click',event=>{
  if(event.target.closest('[data-dialog-close]')){detailDialog.close();return}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(!action||!activeRequest)return;
  if(action==='review'){
    activeRequest.status='review';save();render();showRequest(activeRequest.id);toast('La demande est maintenant en traitement.');
  }else if(action==='approve'){
    activeRequest.status='approved';save();render();showRequest(activeRequest.id);toast('La demande a été approuvée. Vous pouvez coordonner les agents.');
  }else if(action==='assign'){
    detailDialog.close();document.querySelector('#assign-summary').textContent=`${activeRequest.company} · ${activeRequest.event} · ${activeRequest.agents} agents · ${formatDate(activeRequest.date)}`;
    document.querySelector('#assign-form').dataset.requestId=activeRequest.id;assignDialog.showModal();
  }
});
document.querySelector('#assign-form').addEventListener('submit',event=>{
  event.preventDefault();const form=event.currentTarget;const item=requests.find(request=>request.id===form.dataset.requestId);if(!item)return;
  const data=new FormData(form);item.team=data.get('team');item.note=data.get('note');item.status='assigned';save();render();assignDialog.close();form.reset();toast(`Coordination enregistrée pour ${item.company}.`);
});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelector('#reset-demo').addEventListener('click',()=>{requests=structuredClone(defaults);save();render();toast('Les demandes de démonstration ont été réinitialisées.')});
document.querySelector('#today-label').textContent=new Date().toLocaleDateString('fr-CA',{weekday:'short',day:'numeric',month:'short'});
const sidebarButton=document.querySelector('#sidebar-toggle');sidebarButton.addEventListener('click',()=>document.querySelector('#sidebar').classList.toggle('open'));
document.querySelectorAll('.nav-item').forEach(link=>link.addEventListener('click',()=>{if(link.classList.contains('muted-link')){toast('Cette section sera configurée dans une prochaine étape.');return}document.querySelectorAll('.nav-item').forEach(item=>item.classList.remove('selected'));link.classList.add('selected');document.querySelector('#sidebar').classList.remove('open')}));
document.querySelectorAll('.detail-dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()}));
render();
