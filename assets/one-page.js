const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function selectService(tab,focus=false){tab.closest('[data-one-tabs]').querySelectorAll('[role=tab]').forEach(t=>{const yes=t===tab;t.setAttribute('aria-selected',String(yes));t.tabIndex=yes?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!yes});if(focus)tab.focus()}
document.querySelectorAll('[data-one-tabs]').forEach(group=>{const serviceTabs=[...group.querySelectorAll('[role=tab]')];serviceTabs.forEach((t,i)=>{t.addEventListener('click',()=>selectService(t));t.addEventListener('keydown',e=>{let n;if(e.key==='ArrowDown'||e.key==='ArrowRight')n=(i+1)%serviceTabs.length;else if(e.key==='ArrowUp'||e.key==='ArrowLeft')n=(i+serviceTabs.length-1)%serviceTabs.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=serviceTabs.length-1;else return;e.preventDefault();selectService(serviceTabs[n],true)})})});document.querySelectorAll('[data-open-service]').forEach(a=>a.addEventListener('click',()=>selectService(document.getElementById('tab-'+a.dataset.openService))));
document.querySelectorAll('[data-product-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-product-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));document.querySelectorAll('#products .one-product').forEach(p=>{p.hidden=b.dataset.productFilter!=='All products'&&b.dataset.productFilter!==p.dataset.category});document.querySelectorAll('#products [data-product-category]').forEach(group=>{group.hidden=b.dataset.productFilter!=='All products'&&group.dataset.productCategory!==b.dataset.productFilter});document.querySelectorAll('#products [data-division]').forEach(d=>{const f=b.dataset.productFilter;d.hidden=f!=='All products'&&((d.dataset.division==='military')!==(f==='Military & defense'))})}));
const organizations=JSON.parse(document.getElementById('organization-data').textContent);let orgGroup='research',orgLimit=12;const orgSearch=document.getElementById('one-org-search'),orgSector=document.getElementById('one-org-sector'),orgGrid=document.getElementById('one-org-grid'),orgMore=document.getElementById('one-org-more');
function sectors(){orgSector.replaceChildren(new Option('All sectors','All sectors'));[...new Set(organizations.filter(o=>o.group===orgGroup).map(o=>o.sector))].sort().forEach(s=>orgSector.add(new Option(s,s)))}
function renderOrganizations(){const all=organizations.filter(o=>o.group===orgGroup),filtered=all.filter(o=>(orgSector.value==='All sectors'||orgSector.value===o.sector)&&o.name.toLowerCase().includes(orgSearch.value.trim().toLowerCase())).sort((a,b)=>(({'AI & Technology Services':-2,'Government':-1}[a.sector]??0)-({'AI & Technology Services':-2,'Government':-1}[b.sector]??0))||a.sector.localeCompare(b.sector)||a.name.localeCompare(b.name));orgGrid.replaceChildren();for(const o of filtered.slice(0,orgLimit)){const card=document.createElement('article');card.className='one-org-card';const img=document.createElement('img');img.src=o.src;img.alt='';img.loading='lazy';img.width=o.displayWidth||120;img.height=62;const name=document.createElement('h3');name.textContent=o.name;const sector=document.createElement('p');sector.textContent=o.sector;card.append(img,name,sector);orgGrid.append(card)}document.getElementById('one-org-count').textContent=filtered.length?`Showing ${Math.min(orgLimit,filtered.length)} of ${filtered.length} organizations${filtered.length!==all.length?' matching your filters':''}`:'No organizations match. Try another name or sector.';orgMore.hidden=filtered.length<=orgLimit}
function choosePortfolio(b){orgGroup=b.dataset.orgGroup;orgLimit=12;orgSearch.value='';document.querySelectorAll('[data-org-group]').forEach(x=>{x.setAttribute('aria-selected',String(x===b));x.tabIndex=x===b?0:-1});document.getElementById('portfolio-results').setAttribute('aria-labelledby',b.id);document.getElementById('portfolio-description').textContent=orgGroup==='research'?'':'Corporate Cognitive Warfare clients, organized by sector.';sectors();renderOrganizations()}
const portfolioTabs=[...document.querySelectorAll('[data-org-group]')];portfolioTabs.forEach((b,i)=>{b.addEventListener('click',()=>choosePortfolio(b));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?portfolioTabs[0]:e.key==='End'?portfolioTabs.at(-1):portfolioTabs[1-i];choosePortfolio(next);next.focus()})});orgSearch.addEventListener('input',()=>{orgLimit=12;renderOrganizations()});orgSector.addEventListener('change',()=>{orgLimit=12;renderOrganizations()});orgMore.addEventListener('click',()=>{orgLimit+=12;renderOrganizations()});sectors();renderOrganizations();
let queued=false;function progress(){queued=false;const height=document.documentElement.scrollHeight-innerHeight;document.documentElement.style.setProperty('--reading',height>0?Math.max(0,Math.min(1,scrollY/height)):0);let current='overview';document.querySelectorAll('[data-chapter]').forEach(s=>{if(s.getBoundingClientRect().top<innerHeight*.4)current=s.id});document.querySelectorAll('.one-header nav a').forEach(a=>{if(a.hash==='#'+current)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(progress)}},{passive:true});addEventListener('resize',progress);progress();document.getElementById('one-motion').addEventListener('click',e=>{const paused=document.documentElement.classList.toggle('motion-paused');e.target.setAttribute('aria-pressed',String(paused));e.target.textContent=paused?'Enable motion':'Pause motion'});

document.querySelectorAll('[data-email-form]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;const values=new FormData(form);const body='Name: '+values.get('name')+'\nEmail: '+values.get('email')+'\n\n'+values.get('message');location.href='mailto:info@infinitumcorporation.ai?subject='+encodeURIComponent('Website inquiry')+'&body='+encodeURIComponent(body);form.querySelector('[data-email-status]').textContent='Your email draft is ready in your email app. If it did not open, email info@infinitumcorporation.ai directly.';}));

// Hero quotes on strategy, each tied to a service: Sun Tzu's The Art of War (Lionel Giles translation, 1910)
// unless an entry names its own author (by) and source (work).
const artOfWar=[
  {head:['Know the enemy.','Know yourself.'],quote:'If you know the enemy and know yourself, you need not fear the result of a hundred battles.',tie:'Intelligence on the threats around you and clarity on your own systems: that is the work we do.'},
  {head:['See through','the deception.'],quote:'All warfare is based on deception.',tie:'Our security research and open-source intelligence expose what others try to hide.'},
  {head:['Win without','fighting.'],quote:'Supreme excellence consists in breaking the enemy’s resistance without fighting.',tie:'Corporate Cognitive Warfare and strategy that resolve contests before they escalate.'},
  {head:['Become','unbeatable first.'],quote:'The good fighters of old first put themselves beyond the possibility of defeat, and then waited for an opportunity of defeating the enemy.',tie:'Security consulting that hardens your foundations before anyone tests them.'},
  {head:['Your defense is','in your hands.'],quote:'To secure ourselves against defeat lies in our own hands, but the opportunity of defeating the enemy is provided by the enemy himself.',tie:'cyber and security engineering that put control of your systems back with you.'},
  {head:['Win first.','Then engage.'],quote:'The victorious strategist only seeks battle after the victory has been won.',tie:'Project planning that settles the outcome before the work begins.'},
  {head:['Calculate more.','Win more.'],quote:'Thus do many calculations lead to victory, and few calculations to defeat.',tie:'AI-assisted analysis that runs the numbers no team has time for.'},
  {head:['Plan in silence.','Move like thunder.'],quote:'Let your plans be dark and impenetrable as night, and when you move, fall like a thunderbolt.',tie:'Confidential planning and decisive delivery for business and government.'},
  {head:['Speed is','the essence.'],quote:'Rapidity is the essence of war: take advantage of the enemy’s unreadiness, make your way by unexpected routes, and attack unguarded spots.',tie:'AI workflows with SCALVS.ai™ that move faster than the competition.'},
  {head:['Foreknowledge','wins.'],quote:'What enables the wise sovereign and the good general to strike and conquer, and achieve things beyond the reach of ordinary men, is foreknowledge.',tie:'Sensor and open-source intelligence that tells you what comes next.'},
  {head:['Intelligence comes','from people.'],quote:'Knowledge of the enemy’s dispositions can only be obtained from other men.',tie:'Human expertise, amplified by AI, in every engagement.'},
  {head:['Rely on','readiness.'],quote:'The art of war teaches us to rely not on the likelihood of the enemy’s not coming, but on our own readiness to receive him.',tie:'Security assessments that keep you prepared, not hopeful.'},
  {head:['Adapt like','water.'],quote:'Water shapes its course according to the nature of the ground over which it flows; the soldier works out his victory in relation to the foe whom he is facing.',tie:'Services built around your context: civilian, business, or military.'},
  {head:['Change tactics.','Win the field.'],quote:'He who can modify his tactics in relation to his opponent and thereby succeed in winning, may be called a heaven-born captain.',tie:'Strategy that adapts as your market and adversaries change.'},
  {head:['Combine the direct','and the indirect.'],quote:'These two in combination give rise to an endless series of maneuvers.',tie:'Services and products that work together across one connected ecosystem.'},
  {head:['Decide at','the right moment.'],quote:'The quality of decision is like the well-timed swoop of a falcon which enables it to strike and destroy its victim.',tie:'Unified analytics with METATRON¹⁰⁰™ for decisions made on time.'},
  {head:['Scale without','losing control.'],quote:'The control of a large force is the same principle as the control of a few men: it is merely a question of dividing up their numbers.',tie:'Cloud and AI infrastructure on Cumulus://Cloud™ that grows without losing command.'},
  {head:['Hold what cannot','be attacked.'],quote:'You can ensure the safety of your defense if you only hold positions that cannot be attacked.',tie:'Security engineering that leaves attackers nowhere to go.'},
  {head:['Seek victory,','not long wars.'],quote:'In war, then, let your great object be victory, not lengthy campaigns.',tie:'Project delivery focused on outcomes, not open-ended engagements.'},
  {head:['Strategy is','a matter of state.'],quote:'The art of war is of vital importance to the State.',tie:'Technology and security advisory for government and the organizations that serve it.'},
  // Carl von Clausewitz, On War (J. J. Graham translation, 1873).
  {by:'Carl von Clausewitz',work:'On War',head:['Strategy serves','the mission.'],quote:'War is a mere continuation of policy by other means.',tie:'Strategy and advisory that keep every operation tied to your objectives.'},
  {by:'Carl von Clausewitz',work:'On War',head:['See through','the clouds.'],quote:'War is the province of uncertainty: three-fourths of those things upon which action in war must be calculated, are hidden more or less in the clouds of great uncertainty.',tie:'Forecasting with METATRON¹⁰⁰™ that clears the clouds before you commit.'},
  {by:'Carl von Clausewitz',work:'On War',head:['Question every','report.'],quote:'A great part of the information obtained in war is contradictory, a still greater part is false, and by far the greatest part is of a doubtful character.',tie:'Intelligence analysis that verifies every source before you act on it.'},
  {by:'Carl von Clausewitz',work:'On War',head:['Simple is','never easy.'],quote:'Everything is very simple in war, but the simplest thing is difficult.',tie:'Execution with :\\ARCHITECT\\™ that gets the simple things done, every time.'},
  // Winston Churchill, wartime speeches and broadcasts.
  {by:'Winston Churchill',work:'broadcast, 9 February 1941',head:['Give us','the tools.'],quote:'Give us the tools, and we will finish the job.',tie:'Infinitum products that put the right tools in your team’s hands.'},
  {by:'Winston Churchill',work:'Mansion House, 10 November 1942',head:['The end of','the beginning.'],quote:'Now this is not the end. It is not even the beginning of the end. But it is, perhaps, the end of the beginning.',tie:'Long-term partnerships that carry a program well past launch.'},
  {by:'Winston Churchill',work:'House of Commons, 20 August 1940',head:['A few experts.','Real impact.'],quote:'Never in the field of human conflict was so much owed by so many to so few.',tie:'A focused team, amplified by AI, that delivers far beyond its size.'},
  {by:'Winston Churchill',work:'Harrow School, 29 October 1941',head:['Never','give in.'],quote:'Never give in, never give in, never, never, never, never.',tie:'Security programs that hold the line, year after year.'},
];
(()=>{
const hero=document.querySelector('.one-hero'),h1=hero?.querySelector('h1'),quoteText=hero?.querySelector('.hero-quote blockquote p'),caption=hero?.querySelector('.hero-quote figcaption');
if(!h1||!quoteText||!caption)return;
let current=-1;
function render(i){
  const q=artOfWar[i];current=i;
  h1.replaceChildren(...q.head.map(line=>{const s=document.createElement('span');s.textContent=line;return s}));
  quoteText.textContent='“'+q.quote+'”';
  const cite=document.createElement('cite');cite.textContent=q.work||'The Art of War';
  caption.replaceChildren((q.by||'Sun Tzu')+', ',cite,'. '+q.tie);
}
const pick=()=>{let i;do{i=Math.floor(Math.random()*artOfWar.length)}while(i===current&&artOfWar.length>1);return i};
render(pick());
if(reduced.matches)return;
// Rotate on a timer, holding while the visitor reads, interacts, or has paused motion.
let held=false,visible=true;
hero.addEventListener('pointerenter',()=>{held=true});hero.addEventListener('pointerleave',()=>{held=false});
hero.addEventListener('focusin',()=>{held=true});hero.addEventListener('focusout',()=>{held=false});
new IntersectionObserver(([e])=>{visible=e.isIntersecting}).observe(hero);
setInterval(()=>{
  if(held||!visible||document.hidden||document.documentElement.classList.contains('motion-paused'))return;
  hero.classList.add('quote-out');
  setTimeout(()=>{render(pick());hero.classList.remove('quote-out');const fig=hero.querySelector('.hero-quote');fig.style.animation='none';void fig.offsetWidth;fig.style.animation=''},450);
},9000);
})();

// 3D motion: pointer depth, hinge reveals and card tilt.
// Skipped entirely with reduced motion; "Pause motion" freezes it in place.
(()=>{
if(reduced.matches)return;
const root=document.documentElement;root.classList.add('m3d');
const paused=()=>root.classList.contains('motion-paused');
const finePointer=matchMedia('(hover: hover) and (pointer: fine)').matches;
const setTilt=(el,e)=>{const b=el.getBoundingClientRect();el.style.setProperty('--tx',(((e.clientX-b.left)/b.width)*2-1).toFixed(3));el.style.setProperty('--ty',(((e.clientY-b.top)/b.height)*2-1).toFixed(3))};
const clearTilt=el=>{el.classList.remove('is-tilting');el.style.setProperty('--tx','0');el.style.setProperty('--ty','0')};

// Hinge reveals, staggered among siblings.
const revealTargets='.one-section-heading,.one-service-menu,.one-service-content,.one-product-note,.one-product-featured article,.one-ecosystem,.one-filters,.one-product-category,.delivery-steps li,.one-portfolio-tabs,#portfolio-description,.one-directory-tools,.token-flow li,.nexus,.token-table-wrap,.token-disclaimer,.one-contact-section h2,.one-contact-details,.contact-email-form,.one-footer';
const items=[...document.querySelectorAll(revealTargets)];
items.forEach(el=>{const sibs=[...el.parentElement.children].filter(c=>items.includes(c));el.style.setProperty('--m-delay',Math.min(sibs.indexOf(el),5)*90+'ms');el.classList.add('m-reveal')});
const io=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;const el=entry.target;el.classList.add('is-in');io.unobserve(el);setTimeout(()=>el.style.setProperty('--m-delay','0ms'),1700)}),{threshold:.1,rootMargin:'0px 0px -6% 0px'});
items.forEach(el=>io.observe(el));

// Organization cards flip in as each set renders, then follow the pointer.
const grid=document.getElementById('one-org-grid');
if(grid){const indexCards=()=>[...grid.children].forEach((card,i)=>card.style.setProperty('--card-index',String(i%12)));indexCards();new MutationObserver(indexCards).observe(grid,{childList:true})}

if(finePointer){
  document.querySelectorAll('.one-product-featured article').forEach(el=>{el.classList.add('m-tilt');el.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||paused())return;el.classList.add('is-tilting');setTilt(el,e)});el.addEventListener('pointerleave',()=>clearTilt(el))});
  let active=null;
  grid?.addEventListener('pointermove',e=>{const card=e.target.closest('.one-org-card');if(card!==active){if(active)clearTilt(active);active=card}if(!card||paused()||e.pointerType!=='mouse')return;card.classList.add('is-tilting');setTilt(card,e)});
  grid?.addEventListener('pointerleave',()=>{if(active)clearTilt(active);active=null});
}

// Hero: the headline tilts toward the pointer.
const hero=document.querySelector('.one-hero');
if(hero&&finePointer){hero.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||paused())return;const b=hero.getBoundingClientRect();hero.style.setProperty('--px',(((e.clientX-b.left)/b.width)*2-1).toFixed(3));hero.style.setProperty('--py',(((e.clientY-b.top)/b.height)*2-1).toFixed(3))});hero.addEventListener('pointerleave',()=>{hero.style.setProperty('--px','0');hero.style.setProperty('--py','0')})}
})();
