// Baby log app. Firebase settings live in firebase-config.js.
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, setDoc, getDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, limit, writeBatch, arrayUnion, Timestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

if(!firebaseConfig||!firebaseConfig.apiKey||firebaseConfig.apiKey.startsWith('PASTE')){
  document.getElementById('app').innerHTML='<div class="hero"><div class="big empty">Almost there</div><p class="lead">Paste your Firebase settings into <b>firebase-config.js</b>. Step 5 of the setup guide shows how.</p></div>';
  throw new Error('Firebase config missing');
}
const fbApp=initializeApp(firebaseConfig);
const auth=getAuth(fbApp);
const db=initializeFirestore(fbApp,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});

const DEFAULT_ROUTINE=['Prayed','Read a book','Bath','Sang songs'];
const FIRST_IDEAS=['First word','First steps','First tooth','First haircut','Waved bye-bye','First time saying Mama','First time saying Dada','Slept through the night','Climbed stairs','First time using a spoon','First drawing','First trip to the zoo'];
let profile={}, entries=[];
let view='today', filter='all', daysShown=3, ready={p:false,e:false}, screen='';
const $=s=>document.querySelector(s);
const app=$('#app'), dlg=$('#sheet'), sheetBody=$('#sheetBody');
let S={};

/* ---------- appearance (saved on this device) ---------- */
const PALETTES=[['lavender','Lavender','#EDF0F6','#4F4FC9','#111326','#9C9CFF'],['sage','Sage','#EAF0EA','#2F7A4F','#0F1A14','#7FD1A0'],['blush','Blush','#F7ECEF','#B23D6C','#1F1218','#F27FAD'],['ocean','Ocean','#E9F1F7','#1F6FB2','#0B1622','#6CB4F0'],['midnight','Midnight','#F2F2F4','#16161A','#000000','#C9C9D1']];
const THEME_KEY='babylog:theme';
let themePref={};try{themePref=JSON.parse(localStorage.getItem(THEME_KEY))||{}}catch(e){}
const darkMQ=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
const isDark=()=>{const m=themePref.mode||'auto';return m==='dark'||(m==='auto'&&!!(darkMQ&&darkMQ.matches))};
function applyTheme(){const r=document.documentElement;r.dataset.theme=isDark()?'dark':'light';r.dataset.palette=themePref.palette||'lavender'}
if(darkMQ&&darkMQ.addEventListener)darkMQ.addEventListener('change',()=>{applyTheme();if(dlg.open&&S.kind==='settings')refreshSwatches()});
applyTheme();
function swatchesHTML(){const d=isDark(),cur=themePref.palette||'lavender';
  return PALETTES.map(([k,l,lb,la,db,da])=>`<button data-act="palette" data-v="${k}" aria-pressed="${cur===k}"><i style="background:linear-gradient(135deg,${d?db:lb} 50%,${d?da:la} 50%)"></i>${l}</button>`).join('')}
function refreshSwatches(){const b=sheetBody.querySelector('#swatches');if(b)b.innerHTML=swatchesHTML()}
function appearanceHTML(){const m=themePref.mode||'auto';
  return `<hr class="divider"><h2>Appearance</h2><p class="hint" style="margin:0 0 12px">Saved on this device only, so everyone can pick their own.</p>
  <div class="seg" role="group" aria-label="Light or dark">${[['auto','Match phone'],['light','Light'],['dark','Dark']].map(([k,l])=>`<button data-act="themeMode" data-v="${k}" aria-pressed="${m===k}">${l}</button>`).join('')}</div>
  <div class="swatches" id="swatches" role="group" aria-label="Colors">${swatchesHTML()}</div>`}
function setTheme(key,v,btn){themePref[key]=v;try{localStorage.setItem(THEME_KEY,JSON.stringify(themePref))}catch(e){}applyTheme();
  btn.parentElement.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.v===v));refreshSwatches()}

/* ---------- helpers ---------- */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));
const num=v=>{const n=parseFloat(v);return isFinite(n)?n:0};
const clean=o=>JSON.parse(JSON.stringify(o));
function dur(ms){ms=Math.max(0,ms);const m=Math.floor(ms/60000);if(m<1)return '<1m';if(m<60)return m+'m';const h=Math.floor(m/60);if(h<24)return h+'h'+(m%60?' '+(m%60)+'m':'');return Math.floor(h/24)+'d '+(h%24)+'h'}
function clock(ms){ms=Math.max(0,ms);const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0')}
const fmtTime=ts=>new Date(ts).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
const fmtDate=ts=>new Date(ts).toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});
const isoDate=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const dayStart=ts=>{const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime()};
const nightOf=ts=>dayStart(ts-4*36e5); // bedtime after midnight counts for the night before
function dayLabel(k){const t=dayStart(Date.now()),y=new Date(t);y.setDate(y.getDate()-1);
  if(k===t)return 'Today';if(k===y.getTime())return 'Yesterday';
  return new Date(k).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'})}
const toInput=ts=>{const d=new Date(ts);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const fromInput=v=>{if(!v)return null;const t=new Date(v).getTime();return isFinite(t)?t:null};
const fromDate=v=>{if(!v)return null;const t=new Date(v+'T12:00:00').getTime();return isFinite(t)?t:null};
function ageAt(dob,ts){
  if(!dob)return '';const b=new Date(dob+'T00:00:00'),n=new Date(ts);const days=Math.floor((n-b)/864e5);
  if(days<0)return '';if(days<14)return days===1?'1 day':days+' days';if(days<84)return Math.floor(days/7)+' weeks';
  let mo=(n.getFullYear()-b.getFullYear())*12+n.getMonth()-b.getMonth();if(n.getDate()<b.getDate())mo--;
  if(mo<24)return mo+' months';const y=Math.floor(mo/12),m=mo%12;return y+(y===1?' year':' years')+(m?', '+m+(m===1?' month':' months'):'');
}
const vol=()=>profile.vol||'oz', wt=()=>profile.wt||'lb', len=()=>(profile.wt||'lb')==='lb'?'in':'cm';
function routines(){
  if(profile.routines&&profile.routines.length)return profile.routines;
  return [{id:'bedtime',name:'Bedtime',items:profile.routine&&profile.routine.length?profile.routine:DEFAULT_ROUTINE}];
}
const rid=e=>e.routineId||'bedtime';
const rname=e=>e.routineName||(routines().find(r=>r.id===rid(e))||{}).name||'Bedtime';
const rDay=(id,ts)=>id==='bedtime'?nightOf(ts):dayStart(ts);
const findRoutineEntry=id=>sorted().find(x=>x.type==='routine'&&rid(x)===id&&rDay(id,x.ts)===rDay(id,Date.now()))||null;
const fmtNum=n=>Math.round(n*10)/10;
const cap=s=>s?s[0].toUpperCase()+s.slice(1):'';
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('show'),2400)}
const sorted=()=>entries.slice().sort((a,b)=>b.ts-a.ts);
function mealGuess(ts){const h=new Date(ts).getHours()+new Date(ts).getMinutes()/60;return h<10.5?'breakfast':h<14?'lunch':h<16.5?'snack':h<20?'dinner':'snack'}
const ATE={all:'Ate it all',most:'Ate most',some:'Ate some',little:'Ate a little'};
const DRINK={milk:'Milk',formula:'Formula',water:'Water',other:'Drink'};

function describe(e){
  if(e.type==='feed'){
    if(e.sub==='meal')return [cap(e.meal||'meal')+(e.food?': '+e.food:''),e.ate?ATE[e.ate]:''];
    if(e.sub==='drink')return [(DRINK[e.drink]||'Drink')+(e.amount?', '+fmtNum(e.amount)+' '+(e.unit||'oz'):''),''];
    if(e.sub==='breast'){const p=[];if(e.left)p.push('left '+e.left+'m');if(e.right)p.push('right '+e.right+'m');return ['Breastfed '+((e.left||0)+(e.right||0))+' min',p.join(', ')]}
    if(e.sub==='bottle')return ['Bottle, '+fmtNum(e.amount)+' '+(e.unit||'oz'),e.milk==='formula'?'Formula':'Breast milk'];
    return ['Solids',e.food||''];
  }
  if(e.type==='diaper')return [{wet:'Wet diaper',dirty:'Dirty diaper',both:'Wet and dirty diaper'}[e.kind]||'Diaper',[e.rash&&'Diaper rash',e.odd&&'Something looked unusual'].filter(Boolean).join(', ')];
  if(e.type==='sleep')return e.end?['Slept '+dur(e.end-e.ts),fmtTime(e.ts)+' to '+fmtTime(e.end)]:['Sleeping',''];
  if(e.type==='growth'){const p=[];if(e.weight)p.push(fmtNum(e.weight)+' '+e.wtUnit);if(e.length)p.push(fmtNum(e.length)+' '+e.lenUnit+' long');if(e.head)p.push('head '+fmtNum(e.head)+' '+e.lenUnit);return ['Growth',p.join(', ')]}
  if(e.type==='routine')return [rname(e)+': '+(e.items||[]).join(', '),e.detail||e.book||''];
  if(e.type==='first')return ['⭐ '+(e.title||'A first'),''];
  if(e.type==='med')return [e.med||'Medicine',e.dose||''];
  return ['Note',''];
}

/* ---------- storage (Firebase) ---------- */
let user=null, authReady=false, userReady=false, familyId=null, family=null, famDenied=false;
let children=[], childrenReady=false, childId=null, childRef=null, col=null;
let unsubUser=null, famSubs=[], childSubs=[], pendingChild=null;
const prefKey=()=>'babylog:child:'+(user?user.uid:'');
function writeErr(err){console.error(err);toast(navigator.onLine?"Couldn't save. Try again.":"You're offline. This will sync when you reconnect.")}
function saveEntry(e){e=clean(e);const {id,...body}=e;setDoc(doc(col,id),body).catch(writeErr);return Promise.resolve()}
function deleteEntry(id){deleteDoc(doc(col,id)).catch(writeErr);return Promise.resolve()}
function saveProfile(p){profile=clean(p);render();setDoc(childRef,clean(profile)).catch(writeErr);return Promise.resolve()}
const stopAll=a=>{a.forEach(f=>{try{f()}catch(e){}});a.length=0};

function setFamily(fid){
  stopAll(famSubs);stopAll(childSubs);
  familyId=fid;family=null;famDenied=false;children=[];childrenReady=false;childId=null;entries=[];
  if(!fid){render();return}
  const famRef=doc(db,'families',fid);
  famSubs.push(onSnapshot(famRef,s=>{family=s.exists()?s.data():null;render()},err=>{console.error(err);famDenied=true;render()}));
  famSubs.push(onSnapshot(query(collection(famRef,'children'),orderBy('createdAt')),s=>{
    children=s.docs.map(d=>({...d.data(),id:d.id}));childrenReady=true;
    let want=null;if(pendingChild&&children.some(c=>c.id===pendingChild)){want=pendingChild;pendingChild=null}
    want=want||childId;try{want=want||localStorage.getItem(prefKey())}catch(e){}
    if(!children.some(c=>c.id===want))want=children[0]&&children[0].id;
    if(want&&want!==childId)selectChild(want);
    const cur=children.find(c=>c.id===childId);if(cur){profile={...cur};delete profile.id}
    render();
  },err=>{console.error(err);famDenied=true;render()}));
}
function selectChild(id){
  stopAll(childSubs);childId=id;ready.e=false;entries=[];
  try{localStorage.setItem(prefKey(),id)}catch(e){}
  const cur=children.find(c=>c.id===id);profile=cur?{...cur}:{};delete profile.id;
  childRef=doc(db,'families',familyId,'children',id);col=collection(childRef,'entries');
  childSubs.push(onSnapshot(query(col,orderBy('ts','desc'),limit(2000)),s=>{entries=s.docs.map(d=>({...d.data(),id:d.id}));ready.e=true;render()},err=>console.error(err)));
  view='today';filter='all';daysShown=3;render();
}
function initFirebase(){
  onAuthStateChanged(auth,u=>{
    if(unsubUser){unsubUser();unsubUser=null}
    user=u;authReady=true;userReady=false;setFamily(null);
    if(!u){render();return}
    unsubUser=onSnapshot(doc(db,'users',u.uid),s=>{
      const fid=s.exists()?s.data().familyId||null:null;userReady=true;
      if(fid!==familyId)setFamily(fid);else render();
    },err=>{console.error(err);userReady=true;render()});
  });
}

/* ---------- account and family ---------- */
const AUTH_ERR={'auth/invalid-credential':'Email or password is incorrect.','auth/wrong-password':'Email or password is incorrect.','auth/user-not-found':'No account uses that email. Create one instead.',
  'auth/email-already-in-use':'An account already uses that email. Sign in instead.','auth/weak-password':'Use a password with at least 6 characters.','auth/invalid-email':'Enter a valid email address.',
  'auth/too-many-requests':'Too many attempts. Wait a few minutes and try again.','auth/network-request-failed':'You’re offline. Connect to the internet and try again.','auth/unauthorized-domain':'This web address isn’t approved in Firebase yet. See step 6 of the setup guide.'};
const authMsg=e=>AUTH_ERR[e&&e.code]||'Something went wrong. Try again.';
const CODE_CHARS='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode(){const a=new Uint32Array(8);crypto.getRandomValues(a);return [...a].map(n=>CODE_CHARS[n%CODE_CHARS.length]).join('')}
async function createFamily(){
  const famRef=doc(collection(db,'families'));
  await setDoc(famRef,{owner:user.uid,members:[user.uid],createdAt:Date.now()});
  await setDoc(doc(db,'users',user.uid),{familyId:famRef.id});
}
async function joinFamily(raw){
  const code=(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(code.length!==8)return toast('Invite codes are 8 letters and numbers.');
  let inv;try{inv=await getDoc(doc(db,'invites',code))}catch(e){console.error(e);return toast('That code didn’t work. Check it and try again.')}
  if(!inv.exists())return toast('That code didn’t work. Check it and try again.');
  const d=inv.data();if(d.expires.toMillis()<Date.now())return toast('That code has expired. Ask for a new one.');
  try{
    await updateDoc(doc(db,'families',d.familyId),{members:arrayUnion(user.uid),lastInvite:code});
    await setDoc(doc(db,'users',user.uid),{familyId:d.familyId});
    closeSheet();toast('You’ve joined the family log');
  }catch(e){console.error(e);toast('That code didn’t work. Ask for a new one.')}
}
async function createInvite(){
  const code=newCode();
  await setDoc(doc(db,'invites',code),{familyId,createdBy:user.uid,expires:Timestamp.fromMillis(Date.now()+48*36e5)});
  return code;
}
async function handleAccount(a,b){
  const email=()=>($('#authEmail')||{}).value?.trim()||'', pass=()=>($('#authPass')||{}).value||'';
  try{
    if(a==='google'){const p=new GoogleAuthProvider();try{await signInWithPopup(auth,p)}catch(e){if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment')await signInWithRedirect(auth,p);else if(e.code!=='auth/popup-closed-by-user'&&e.code!=='auth/cancelled-popup-request')throw e}return true}
    if(a==='signIn'){await signInWithEmailAndPassword(auth,email(),pass());return true}
    if(a==='signUp'){await createUserWithEmailAndPassword(auth,email(),pass());return true}
    if(a==='forgot'){if(!email()){toast('Enter your email first.');return true}await sendPasswordResetEmail(auth,email());toast('Check your email for a reset link.');return true}
    if(a==='createFamily'){b.disabled=true;await createFamily();return true}
    if(a==='joinFamily'){await joinFamily(($('#joinCode')||sheetBody.querySelector('#joinCode')||{}).value);return true}
    if(a==='signOut'){closeSheet();await signOut(auth);return true}
    if(a==='pickChild'){selectChild(b.dataset.id);return true}
    if(a==='addChild'){openSettings(true);return true}
    if(a==='invite'){b.disabled=true;b.textContent='Creating code…';const code=await createInvite();
      const box=sheetBody.querySelector('#inviteBox');const url=location.origin+location.pathname;
      box.innerHTML=`<p class="code" aria-label="Invite code">${code}</p><p class="hint" style="margin:0 0 12px">Works for 48 hours. They open ${esc(url)}, sign in, choose “Join with an invite code” and enter it.</p><button class="btn wide" data-act="shareInvite" data-code="${code}">Send code</button>`;return true}
    if(a==='shareInvite'){const url=location.origin+location.pathname,text=`Join ${profile.name||'our'} baby log: open ${url}, sign in, and enter invite code ${b.dataset.code}`;
      if(navigator.share){try{await navigator.share({text})}catch(e){}}else{await navigator.clipboard.writeText(text);toast('Copied. Paste it in a text or email.')}return true}
    if(a==='removeOthers'){if(!await ask('Remove everyone else from this family log? They’ll lose access right away.','Remove'))return true;await updateDoc(doc(db,'families',familyId),{members:[user.uid]});toast('Done. Only you have access now.');closeSheet();return true}
    if(a==='joinOther'){S={kind:'join'};renderSheet();if(!dlg.open)dlg.showModal();return true}
  }catch(e){console.error(e);toast(authMsg(e));if(b)b.disabled=false;return true}
  return false;
}
function signInHTML(){
  return `<div class="hero"><div class="big empty" style="color:var(--ink)">Baby log</div><p class="lead">Track meals, diapers, sleep, routines and firsts, shared with your family.</p></div>
  <button class="btn wide" data-act="google">Continue with Google</button><p class="or">or use your email</p>
  <label class="field"><span>Email</span><input id="authEmail" type="email" autocomplete="email"></label>
  <label class="field"><span>Password</span><input id="authPass" type="password" autocomplete="current-password"></label>
  <div class="actions"><button class="btn ghost" data-act="signUp">Create account</button><button class="btn" data-act="signIn">Sign in</button></div>
  <p style="text-align:center"><button class="linkbtn" data-act="forgot">Forgot password?</button></p>`;
}
function onboardHTML(){
  return `<div class="hero"><div class="big empty" style="color:var(--ink)">Welcome</div><p class="lead">${famDenied?'You no longer have access to that family log. Start a new one or join with a code.':'Start a log for your family, or join one someone shared with you.'}</p></div>
  <button class="btn wide" data-act="createFamily">Start a new family log</button><p class="or">or join with an invite code</p>
  <label class="field"><span>Invite code</span><input id="joinCode" type="text" autocomplete="off" autocapitalize="characters" placeholder="8 letters and numbers"></label>
  <button class="btn ghost wide" data-act="joinFamily">Join</button>
  <p style="text-align:center;margin-top:20px"><button class="linkbtn" data-act="signOut">Sign out (${esc(user.email||'')})</button></p>`;
}
function openSettings(newChild){
  S={kind:'settings',newChild,gender:newChild?undefined:profile.gender,vol:newChild?'oz':vol(),wt:newChild?'lb':wt(),nursing:newChild?'off':(profile.nursing?'on':'off'),
    routines:newChild?[{id:'bedtime',name:'Bedtime',items:[...DEFAULT_ROUTINE]}]:clean(routines())};
  if(newChild){S.name='';S.dob=''}
  renderSheet();if(!dlg.open)dlg.showModal();
}

/* ---------- timers ---------- */
function startFeed(side){const n=Date.now();saveProfile({...profile,timer:{kind:'feed',start:n,side,segStart:n,L:0,R:0}});closeSheet()}
function switchSide(){const t={...profile.timer},n=Date.now();t[t.side]+=n-t.segStart;t.side=t.side==='L'?'R':'L';t.segStart=n;saveProfile({...profile,timer:t})}
function startSleep(){const n=Date.now(),st=fromInput(val('timerStart'));if(st&&st>n+6e4)return toast('That time hasn’t happened yet.');if(st&&n-st>24*36e5)return toast('Timers can go back up to 24 hours. For longer, log it as a finished sleep.');saveProfile({...profile,timer:{kind:'sleep',start:st&&st<n?st:n}});closeSheet()}
function stopTimer(){
  const t={...profile.timer},n=Date.now();if(!t.kind)return;let e;
  if(t.kind==='feed'){t[t.side]+=n-t.segStart;let L=Math.round(t.L/60000),R=Math.round(t.R/60000);if(L+R===0){if(t.side==='L')L=1;else R=1}
    e={id:uid(),type:'feed',sub:'breast',ts:t.start,left:L,right:R}}
  else e=clean({id:t.entryId||uid(),type:'sleep',ts:t.start,end:n,note:t.note||undefined,hasPhoto:t.hasPhoto||undefined});
  const p={...profile};delete p.timer;saveProfile(p);saveEntry(e);toast(t.kind==='feed'?'Feed saved':'Sleep saved');
}
async function discardTimer(){if(!await ask('Discard this timer without saving?','Discard'))return;const p={...profile};delete p.timer;saveProfile(p)}

/* ---------- streaks ---------- */
function streaks(list){
  const out=[];
  routines().forEach(r=>{
    const days={};list.filter(e=>e.type==='routine'&&rid(e)===r.id).forEach(e=>{const k=rDay(r.id,e.ts);(days[k]=days[k]||new Set());(e.items||[]).forEach(i=>days[k].add(i))});
    const unit=r.id==='bedtime'?['night','nights']:['day','days'];
    (r.items||[]).forEach(item=>{
      let k=rDay(r.id,Date.now()),n=0;const d=new Date(k);
      if(!(days[k]&&days[k].has(item))){d.setDate(d.getDate()-1);k=d.getTime()}
      while(days[k]&&days[k].has(item)){n++;d.setDate(d.getDate()-1);k=d.getTime()}
      if(n)out.push([item,n,unit]);
    });
  });
  return out;
}

/* ---------- charts ---------- */
function chart(points,unit,title,dob){
  if(!points.length)return '';
  const W=340,H=190,L=40,R=14,T=14,B=30;
  let t0=points[0].t,t1=points[points.length-1].t;if(t1-t0<864e5*14){t0-=864e5*7;t1+=864e5*7}
  let v0=Math.min(...points.map(p=>p.v)),v1=Math.max(...points.map(p=>p.v));const pad=Math.max((v1-v0)*.15,v1*.05||1);v0=Math.max(0,v0-pad);v1=v1+pad;
  const x=t=>L+(t-t0)/(t1-t0)*(W-L-R), y=v=>T+(1-(v-v0)/(v1-v0))*(H-T-B);
  let g='';for(let i=0;i<=3;i++){const v=v0+(v1-v0)*i/3,yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" style="stroke:var(--line)" stroke-width="1"/><text x="${L-6}" y="${yy+4}" text-anchor="end" font-size="11" style="fill:var(--muted)">${fmtNum(v)}</text>`}
  const lab=t=>new Date(t).toLocaleDateString([], {month:'short',year:'2-digit'});
  g+=`<text x="${L}" y="${H-8}" font-size="11" style="fill:var(--muted)">${lab(t0)}</text><text x="${W-R}" y="${H-8}" font-size="11" text-anchor="end" style="fill:var(--muted)">${lab(t1)}</text>`;
  const path=points.map((p,i)=>(i?'L':'M')+x(p.t).toFixed(1)+' '+y(p.v).toFixed(1)).join(' ');
  const dots=points.map(p=>`<circle cx="${x(p.t)}" cy="${y(p.v)}" r="4.5" style="fill:var(--surface);stroke:var(--growth)" stroke-width="2.5"><title>${fmtDate(p.t)}: ${fmtNum(p.v)} ${unit}</title></circle>`).join('');
  const last=points[points.length-1];
  return `<div class="chart"><h3>${title}</h3><p>${fmtNum(last.v)} ${unit} on ${fmtDate(last.t)}${dob?' (age '+ageAt(dob,last.t)+')':''}</p>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title} over time">${g}<path d="${path}" fill="none" style="stroke:var(--growth)" stroke-width="2.5" stroke-linejoin="round"/>${dots}</svg></div>`;
}
function convW(v,u){return u===wt()?v:(wt()==='kg'?v/2.20462:v*2.20462)}
function convL(v,u){return u===len()?v:(len()==='cm'?v*2.54:v/2.54)}

/* ---------- render ---------- */
function render(){
  const show=(k,html)=>{if(screen===k&&k!=='app')return;screen=k;app.innerHTML=html};
  if(!authReady||(user&&!userReady)||(familyId&&!famDenied&&(!childrenReady||(children.length&&!ready.e))))return show('loading','<div class="loading">Loading your log…</div>');
  if(!user)return show('signin',signInHTML());
  if(!familyId||famDenied)return show('onboard',onboardHTML());
  if(!children.length)return show('setup','<div class="hero"><div class="big empty">Let’s set up your log</div><p class="lead">Add your little one’s name and birthday to get started.</p></div><button class="btn wide" data-act="addChild">Set up</button><p style="text-align:center;margin-top:20px"><button class="linkbtn" data-act="signOut">Sign out</button></p>');
  screen='app';
  let h=`<header class="top"><div class="who"><h1>${esc(profile.name)}</h1><p>${profile.dob?esc(ageAt(profile.dob,Date.now()))+' old':''}</p></div><button class="iconbtn" data-act="settings" aria-label="Settings and spreadsheet download">⚙︎</button></header>`;
  if(children.length>1)h+=`<div class="toggles kids" role="group" aria-label="Choose child">${children.map(c=>`<button data-act="pickChild" data-id="${esc(c.id)}" aria-pressed="${c.id===childId}">${esc(c.name||'Child')}</button>`).join('')}</div>`;
  h+=`<nav class="views"><div class="seg" role="group" aria-label="View">${[['today','Today'],['growth','Growth'],['firsts','Firsts']].map(([k,l])=>`<button data-act="view" data-k="${k}" aria-pressed="${view===k}">${l}</button>`).join('')}</div></nav>`;
  h+=view==='growth'?renderGrowth():view==='firsts'?renderFirsts():renderToday();
  const n=family&&family.members?family.members.length:1;
  h+=`<p class="foot">${n>1?'Shared with '+(n-1)+(n===2?' other person':' other people')+'. Changes show up for everyone right away.':'Synced to your account on every device you sign in on.'}</p>`;
  app.innerHTML=h;
  hydratePhotos();
}

function renderToday(){
  const list=sorted(),now=Date.now(),t=profile.timer;let h='';
  const lastFeed=list.find(e=>e.type==='feed'&&e.sub!=='drink'),lastDrink=list.find(e=>e.type==='feed'&&e.sub==='drink'),lastDiaper=list.find(e=>e.type==='diaper'),lastSleep=list.find(e=>e.type==='sleep'&&e.end);
  const bw=birthdayWeek();if(bw)h+=`<button class="timerbar t-first" data-act="recap" data-y="${bw}" style="width:100%;text-align:left;cursor:pointer;color:inherit;font:inherit"><span class="lbl"><strong>🎂 Happy ${ord(bw)} birthday, ${esc(profile.name)}!</strong><span>See and share the highlights from this year</span></span></button>`;
  if(t&&t.kind==='sleep')h+=`<div class="timerbar t-sleep"><div class="lbl"><strong data-clock="${t.start}">${clock(now-t.start)}</strong><span>Asleep since ${fmtTime(t.start)}</span></div><button class="btn soft" data-act="open" data-k="sleep">Edit</button><button class="btn" data-act="stop">Woke up</button><button class="btn ghost" data-act="discard" aria-label="Discard timer">✕</button></div>`;
  else if(t&&t.kind==='feed')h+=`<div class="timerbar t-feed"><div class="lbl"><strong data-clock="${t.start}">${clock(now-t.start)}</strong><span>Nursing, ${t.side==='L'?'left':'right'} side now</span></div><button class="btn soft" data-act="editTimer">Edit start</button><button class="btn soft" data-act="switch">Switch to ${t.side==='L'?'right':'left'}</button><button class="btn" data-act="stop">Stop and save</button><button class="btn ghost" data-act="discard" aria-label="Discard timer">✕</button></div>`;
  h+='<section class="hero" aria-label="Since last">';
  if(lastFeed){const d=describe(lastFeed);h+=`<div class="big" data-since="${lastFeed.ts}">${dur(now-lastFeed.ts)}</div><p class="lead">${profile.nursing?'since last feed':'since '+pr().s+' last ate'} <span>at ${fmtTime(lastFeed.ts)}, ${esc(d[0])}</span></p>`}
  else h+=`<div class="big empty">${profile.nursing?'No feeds':'No meals'} logged yet</div>`;
  const sl=t&&t.kind==='sleep'?['asleep',t.start]:lastSleep?['awake',lastSleep.end]:null;
  h+=`<div class="since"${lastDrink?' style="grid-template-columns:repeat(3,1fr)"':''}><div class="t-diaper"><b ${lastDiaper?`data-since="${lastDiaper.ts}"`:''}>${lastDiaper?dur(now-lastDiaper.ts):'–'}</b><small>since last diaper</small></div>
  <div class="t-sleep"><b ${sl?`data-since="${sl[1]}"`:''}>${sl?dur(now-sl[1]):'–'}</b><small>${sl?sl[0]:'no sleep logged'}</small></div>${lastDrink?`<div class="t-feed"><b data-since="${lastDrink.ts}">${dur(now-lastDrink.ts)}</b><small>since last drink</small></div>`:''}</div></section>`;
  const asleep=t&&t.kind==='sleep';
  h+=nudgesHTML();
  h+=`<div class="quick">
    <button class="t-feed" data-act="open" data-k="feed"><span class="ic">${profile.nursing?'🍼':'🍽️'}</span><span><b>${profile.nursing?'Feed':'Food'}</b><small>${profile.nursing?'Nursing, bottle, meals':'Meals, snacks, drinks'}</small></span></button>
    <button class="t-diaper" data-act="open" data-k="diaper"><span class="ic">💧</span><span><b>Diaper</b><small>Wet or dirty</small></span></button>
    <button class="t-sleep" data-act="open" data-k="sleep"><span class="ic">🌙</span><span><b>${asleep?'Sleeping':'Sleep'}</b><small>${asleep?`<span data-clock="${t.start}">${clock(now-t.start)}</span>, tap to view`:'Nap or night'}</small></span></button>
    <button class="t-routine" data-act="open" data-k="routine"><span class="ic">✨</span><span><b>Routines</b><small>${esc(routines().slice(0,2).map(r=>r.name).join(', '))}${routines().length>2?' and more':''}</small></span></button>
    <button class="t-first" data-act="open" data-k="first"><span class="ic">⭐</span><span><b>A first</b><small>Milestones to remember</small></span></button>
    <button class="t-growth" data-act="open" data-k="more"><span class="ic">📏</span><span><b>More</b><small>Growth, medicine, notes</small></span></button>
  </div>`;
  const ts0=dayStart(now),todays=list.filter(e=>e.ts>=ts0);
  const meals=todays.filter(e=>e.type==='feed'&&e.sub!=='drink').length;
  const nurseMin=todays.filter(e=>e.type==='feed'&&e.sub==='breast').reduce((s,e)=>s+(e.left||0)+(e.right||0),0);
  const dia=todays.filter(e=>e.type==='diaper'),wet=dia.filter(e=>e.kind!=='dirty').length,dirty=dia.filter(e=>e.kind!=='wet').length;
  let sleepMs=0;list.filter(e=>e.type==='sleep').forEach(e=>{const a=Math.max(e.ts,ts0),b=Math.min(e.end||now,now);if(b>a)sleepMs+=b-a});
  if(asleep)sleepMs+=now-Math.max(t.start,ts0);
  const doneR=routines().filter(r=>list.some(e=>e.type==='routine'&&rid(e)===r.id&&rDay(r.id,e.ts)===rDay(r.id,now))).length;
  h+=`<h2>Today</h2><div class="today">
    <div class="t-feed"><b>${meals}</b><small>${profile.nursing?'feeds'+(nurseMin?', '+nurseMin+' min nursing':''):'meals and snacks'}</small></div>
    <div class="t-diaper"><b>${wet} / ${dirty}</b><small>wet / dirty</small></div>
    <div class="t-sleep"><b>${dur(sleepMs).replace('<1m','0m')}</b><small>sleep</small></div>
    <div class="t-routine"><b>${doneR} of ${routines().length}</b><small>routines done</small></div>
  </div>`;
  const st=streaks(list);
  h+=st.length?`<div class="streaks" aria-label="Routine streaks">${st.map(([i,n,u])=>`<span>${esc(i)}: <b>${n}</b> ${n===1?u[0]:u[1]+' in a row'}</span>`).join('')}</div>`:'<div style="height:14px"></div>';
  const F=[['all','All'],['feed','Food'],['diaper','Diapers'],['sleep','Sleep'],['routine','Routines'],['first','Firsts'],['growth','Growth'],['med','Medicine'],['note','Notes']];
  h+=`<h2>History</h2><div class="chips" role="group" aria-label="Filter history">${F.map(([k,l])=>`<button data-act="filter" data-k="${k}" aria-pressed="${filter===k}">${l}</button>`).join('')}</div>`;
  const shown=list.filter(e=>filter==='all'||e.type===filter);
  if(!shown.length)h+=`<div class="empty-state">${filter==='all'?'Nothing logged yet. Tap one of the buttons above to add your first entry.':'No entries of this kind yet.'}</div>`;
  else{
    const groups=[];shown.forEach(e=>{const k=dayStart(e.ts);let g=groups[groups.length-1];if(!g||g.k!==k){g={k,items:[]};groups.push(g)}g.items.push(e)});
    groups.slice(0,daysShown).forEach(g=>{
      h+=`<section class="day"><h3>${dayLabel(g.k)}</h3>`;
      g.items.forEach(e=>{const d=describe(e);h+=`<button class="entry t-${e.type}" data-act="edit" data-id="${esc(e.id)}"><span class="dot"></span><span class="tm">${e.type==='first'?'':fmtTime(e.ts)}</span><span class="tx">${esc(d[0])}${d[1]?`<small>${esc(d[1])}</small>`:''}${e.note?`<small>${esc(e.note)}</small>`:''}${e.hasPhoto?'<small>📷 Photo</small>':''}</span></button>`});
      h+='</section>';
    });
    if(groups.length>daysShown)h+=`<button class="btn ghost more" data-act="moredays">Show earlier days</button>`;
  }
  return h;
}

function renderGrowth(){
  const g=sorted().filter(e=>e.type==='growth').reverse();
  let h=`<div class="h2row" style="margin-top:20px"><h2>Growth</h2><button class="btn" data-act="open" data-k="growth">Add measurement</button></div>`;
  if(!g.length)return h+'<div class="empty-state">No measurements yet. Add a weight or height from the last checkup and the chart will start here.</div>';
  const W=g.filter(e=>e.weight).map(e=>({t:e.ts,v:convW(e.weight,e.wtUnit)}));
  const Ln=g.filter(e=>e.length).map(e=>({t:e.ts,v:convL(e.length,e.lenUnit)}));
  const Hd=g.filter(e=>e.head).map(e=>({t:e.ts,v:convL(e.head,e.lenUnit)}));
  h+=chart(W,wt(),'Weight',profile.dob)+chart(Ln,len(),'Height',profile.dob)+chart(Hd,len(),'Head size',profile.dob);
  h+='<h2 style="margin-top:20px">All measurements</h2>';
  g.slice().reverse().forEach(e=>{const d=describe(e);h+=`<button class="entry t-growth" data-act="edit" data-id="${esc(e.id)}"><span class="dot"></span><span class="tx">${fmtDate(e.ts)}${profile.dob?` <small>Age ${esc(ageAt(profile.dob,e.ts))}</small>`:''}<small>${esc(d[1])}</small></span></button>`});
  return h;
}

function renderFirsts(){
  const f=sorted().filter(e=>e.type==='first');
  let h=`<div class="h2row" style="margin-top:20px"><h2>${esc(profile.name)}’s firsts</h2><button class="btn" data-act="open" data-k="first">Add a first</button></div>`;
  if(!f.length)return h+'<div class="empty-state">No firsts saved yet. First words, first steps, first haircut: add them here so you have them all in one place.</div>';
  h+='<ul class="firsts">'+f.map(e=>`<li><button class="t-first" data-act="edit" data-id="${esc(e.id)}"><b>${esc(e.title)}</b><small>${fmtDate(e.ts)}${profile.dob?', at '+esc(ageAt(profile.dob,e.ts)):''}</small>${e.note?`<p>${esc(e.note)}</p>`:''}${e.hasPhoto?`<img data-photo="${esc(e.id)}" alt="Photo: ${esc(e.title)}">`:''}</button></li>`).join('')+'</ul>';
  return h;
}

/* ---------- sheet ---------- */
function seg(key,opts,cur){return `<div class="seg" role="group">${opts.map(([v,l])=>`<button type="button" data-act="seg" data-key="${key}" data-v="${v}" aria-pressed="${cur===v}">${l}</button>`).join('')}</div>`}
const field=(id,label,type,val,extra='')=>`<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${esc(val??'')}" ${extra}></label>`;
const noteField=(v,label='Note (optional)')=>`<label class="field"><span>${label}</span><textarea id="note">${esc(v||'')}</textarea></label>`;
const whenField=(ts,label='Time')=>field('when',label,'datetime-local',toInput(ts));
const actions=(isEdit,l='Save')=>`<div class="actions">${isEdit?'<button class="btn danger" data-act="del">Delete</button>':''}<button class="btn" data-act="save">${l}</button></div>`;
const head=(t,cls)=>`<div class="sheet-head ${cls}"><h2>${t}</h2><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>`;
function panel(name,cur,html){return `<div data-panel="${name}" ${cur===name?'':'hidden'}>${html}</div>`}

function openSheet(kind,entry){
  let e=entry||null;
  const pickable=kind==='routine'&&!e;
  if(e){kind={feed:'feed',diaper:'diaper',sleep:'sleep',routine:'routine',first:'first'}[e.type]||'more'}
  const ts=e?e.ts:Date.now();
  S={kind,entry:e,ts,
    sub:e?(e.sub||e.type):(kind==='feed'?(profile.nursing?'breast':'meal'):kind==='growth'?'growth':kind==='more'?'growth':null),
    meal:e&&e.meal||mealGuess(ts), ate:e&&e.ate||null, drink:e&&e.drink||'milk', milk:e&&e.milk||'breastmilk', diaper:e&&e.kind||null,
    items:new Set(e&&e.items||[]),routineId:e&&e.type==='routine'?rid(e):routines()[0].id,pickable,photo:undefined,rash:!!(e&&e.rash),odd:!!(e&&e.odd)};
  if(kind==='growth')S.kind='more';
  const pt=profile.timer;if(S.kind==='sleep'&&!e&&pt&&pt.kind==='sleep'&&pt.hasPhoto)S.timerPhoto=pt.entryId;
  renderSheet();if(!dlg.open)dlg.showModal();loadSheetPhoto();if(S.kind==='sleep')updateSleepTotal();
}
function closeSheet(){if(dlg.open)dlg.close()}

function renderSheet(){
  const e=S.entry,isEdit=!!e,ts=S.ts;let h='';
  if(S.kind==='feed'){
    const legacy=e&&e.sub==='solids';
    const nurse=profile.nursing||(e&&['breast','bottle'].includes(e.sub));
    h+=head(isEdit?(nurse?'Edit feed':'Edit food'):(nurse?'Log a feed':'Log food'),'t-feed');
    if(legacy){h+=`<p class="hint" style="margin:0 0 14px">${esc(describe(e).join(', '))}</p>`+whenField(ts)+noteField(e.note)+actions(true)}
    else{
      h+=seg('sub',nurse?[['breast','Nursing'],['bottle','Bottle'],['meal','Meal'],['drink','Drink']]:[['meal','Meal or snack'],['drink','Drink']],S.sub);
      if(nurse){
        h+=panel('breast',S.sub,`${!isEdit&&!profile.timer?`<div class="row"><button class="btn" data-act="startFeed" data-side="L">Start left</button><button class="btn" data-act="startFeed" data-side="R">Start right</button></div><p class="or">or log a finished feed</p>`:''}
          <div class="row">${field('left','Left (minutes)','number',e&&e.left||'','min="0" inputmode="numeric"')}${field('right','Right (minutes)','number',e&&e.right||'','min="0" inputmode="numeric"')}</div>`);
        h+=panel('bottle',S.sub,field('bamount','Amount ('+(e&&e.unit||vol())+')','number',e&&e.sub==='bottle'&&e.amount||'','min="0" step="0.5" inputmode="decimal"')+seg('milk',[['breastmilk','Breast milk'],['formula','Formula']],S.milk));
      }
      h+=panel('meal',S.sub,seg('meal',[['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['snack','Snack']],S.meal)
        +field('food','What '+pr().s+' ate','text',e&&e.food||'','placeholder="e.g. scrambled eggs, banana" autocomplete="off"')
        +'<span class="lbl">How much '+pr().s+' ate</span>'+seg('ate',[['all','All'],['most','Most'],['some','Some'],['little','A little']],S.ate));
      h+=panel('drink',S.sub,seg('drink',[['milk','Milk'],['formula','Formula'],['water','Water'],['other','Other']],S.drink)
        +field('amount','Amount ('+(e&&e.unit||vol())+', optional)','number',e&&e.amount||'','min="0" step="0.5" inputmode="decimal"'));
      h+=whenField(ts)+noteField(e&&e.note)+actions(isEdit);
    }
  }
  else if(S.kind==='diaper'){
    h+=head(isEdit?'Edit diaper':'Log a diaper','t-diaper')+whenField(ts)+`<span class="lbl">Anything to note? (optional)</span><div class="toggles t-diaper">${[['rash','Diaper rash'],['odd','Something looks unusual']].map(([k,l])=>`<button data-act="flag" data-v="${k}" aria-pressed="${S[k]}">${l}</button>`).join('')}</div>`+`<p class="hint">A photo can help your pediatrician. Call them if anything worries you.</p>`+photoField()+noteField(e&&e.note);
    h+=`<p class="hint">Tap one to save.</p><div class="bigchoices t-diaper">${[['wet','💧','Wet'],['dirty','💩','Dirty'],['both','💧💩','Both']].map(([k,i,l])=>`<button data-act="saveDiaper" data-v="${k}" aria-pressed="${S.diaper===k}"><span class="ic">${i}</span>${l}</button>`).join('')}</div>`;
    if(isEdit)h+=`<div class="actions"><button class="btn danger" data-act="del">Delete</button></div>`;
  }
  else if(S.kind==='sleep'){
    const t=profile.timer,running=!isEdit&&t&&t.kind==='sleep';
    const st=isEdit?e.ts:(running?t.start:null),en=isEdit?e.end:null;
    h+=head(isEdit?'Edit sleep':'Sleep','t-sleep');
    h+=`<div class="sleepTotal t-sleep"><span class="lbl">Total time</span><strong id="sleepTotal">0h 0m</strong><small id="sleepNote"></small></div>`;
    if(running)h+=`<button class="btn wide" data-act="stopSleepSheet" style="margin-bottom:16px">Stop timer (woke up now)</button>`;
    else if(!isEdit)h+=`<button class="btn wide" data-act="startSleepSheet" style="margin-bottom:16px">Start timer</button>`;
    h+=field('when','Start time','datetime-local',st?toInput(st):'')+field('end','End time','datetime-local',en?toInput(en):'');
    if(!isEdit)h+=`<p class="hint">${running?'Change the start time and tap Save to adjust the timer, or add an end time to finish it.':'Add only a start time and tap Save to start a timer from then. Add both times to log a finished sleep.'}</p>`;
    h+=photoField()+noteField(isEdit?e.note:(running?t.note:''))+actions(isEdit);
  }
  else if(S.kind==='routine'){
    const r=routines().find(x=>x.id===S.routineId)||{name:e?rname(e):'Routine',items:[]};
    h+=head(isEdit?'Edit '+esc(r.name.toLowerCase())+' routine':'Log a routine','t-routine');
    if(S.pickable&&routines().length>1)h+=`<div class="toggles t-routine" role="group" aria-label="Which routine">${routines().map(x=>`<button data-act="pickRoutine" data-v="${esc(x.id)}" aria-pressed="${x.id===S.routineId}">${esc(x.name)}</button>`).join('')}</div>`;
    const items=[...new Set([...(r.items||[]),...S.items])];
    if(!isEdit){const earlier=sorted().filter(x=>x.type==='routine'&&rid(x)===S.routineId&&rDay(S.routineId,x.ts)===rDay(S.routineId,Date.now())).reverse();
      if(earlier.length)h+=`<p class="hint" style="margin:0 0 12px">Already logged ${S.routineId==='bedtime'?'tonight':'today'}: ${earlier.map(x=>esc(fmtTime(x.ts)+' '+(x.items||[]).join(', '))).join('; ')}</p>`;}
    h+=`<p class="hint" style="margin:0 0 12px">Tap everything you did${isEdit?'':' for '+esc(r.name.toLowerCase())}.</p><div class="toggles t-routine">${items.map(i=>`<button data-act="toggle" data-v="${esc(i)}" aria-pressed="${S.items.has(i)}">${esc(i)}</button>`).join('')||'<p class="hint">This routine has no steps yet. Add them in settings.</p>'}</div>`;
    h+=field('detail','Details (optional)','text',e&&(e.detail||e.book)||'','placeholder="e.g. the book you read" autocomplete="off"');
    h+=photoField()+whenField(ts)+noteField(e&&e.note)+actions(isEdit);
  }
  else if(S.kind==='first'){
    h+=head(isEdit?'Edit first':'Add a first','t-first');
    h+=field('title','What happened','text',e&&e.title||'','placeholder="e.g. First steps" autocomplete="off"');
    if(!isEdit)h+=`<div class="toggles small">${FIRST_IDEAS.map(i=>`<button data-act="idea" data-v="${esc(i)}">${esc(i)}</button>`).join('')}</div>`;
    h+=field('date','Date','date',isoDate(ts))+noteField(e&&e.note,'The story (optional)')+photoField()+actions(isEdit);
  }
  else if(S.kind==='more'){
    h+=head(isEdit?'Edit entry':'Log something else','t-growth');
    h+=seg('sub',[['growth','Growth'],['med','Medicine'],['note','Note']],S.sub);
    const wu=e&&e.wtUnit||wt(),lu=e&&e.lenUnit||len();
    h+=panel('growth',S.sub,`<div class="row3">${field('weight','Weight ('+wu+')','number',e&&e.weight||'','min="0" step="0.01" inputmode="decimal"')}${field('length','Height ('+lu+')','number',e&&e.length||'','min="0" step="0.1" inputmode="decimal"')}${field('head','Head ('+lu+')','number',e&&e.head||'','min="0" step="0.1" inputmode="decimal"')}</div>`);
    h+=panel('med',S.sub,`<div class="row">${field('med','Medicine','text',e&&e.med||'','placeholder="e.g. Tylenol"')}${field('dose','Dose','text',e&&e.dose||'','placeholder="e.g. 5 ml"')}</div>`);
    h+=whenField(ts)+noteField(e&&e.note)+actions(isEdit);
  }
  else if(S.kind==='settings'){
    h+=head(S.newChild?(children.length?'Add a child':'Set up'):'Settings','t-note');
    h+=field('name','Name','text',S.name!==undefined?S.name:profile.name||'','autocomplete="off"')+field('dob','Birthday','date',S.dob!==undefined?S.dob:profile.dob||'')+genderSeg();
    h+=`<span class="lbl">Drink amounts in</span>`+seg('vol',[['oz','Ounces (oz)'],['ml','Milliliters (ml)']],S.vol);
    h+=`<span class="lbl">Growth measured in</span>`+seg('wt',[['lb','lb and inches'],['kg','kg and cm']],S.wt);
    h+=`<span class="lbl">Nursing and bottle tracking</span>`+seg('nursing',[['off','Off'],['on','On']],S.nursing);
    h+=nudgeSettingsHTML();
    h+=`<span class="lbl">Routines</span>`+S.routines.map((r,i)=>`<div class="rt"><div class="rt-head"><label class="field"><span>Name</span><input class="rname" data-i="${i}" type="text" value="${esc(r.name)}" placeholder="e.g. Morning" autocomplete="off"></label><button class="iconbtn" data-act="rmRoutine" data-i="${i}" aria-label="Remove ${esc(r.name||'routine')}">🗑</button></div>
      <label class="field"><span>Steps (separate with commas)</span><input class="ritems" data-i="${i}" type="text" value="${esc((r.items||[]).join(', '))}" placeholder="e.g. Brushed teeth, Got dressed" autocomplete="off"></label></div>`).join('')
      +`<button class="btn ghost wide" data-act="addRoutine" style="margin-bottom:18px">Add a routine</button>`;
    h+=`<div class="actions"><button class="btn" data-act="saveSettings">${S.newChild?'Add child':'Save'}</button></div>`;
    if(!S.newChild)h+=recapSettingsHTML()+appearanceHTML()+`<hr class="divider"><h2>Spreadsheet</h2><p class="hint" style="margin:0 0 12px">Download everything as one workbook with a tab for food, diapers, sleep, bedtime, growth, firsts, medicine and notes.</p><button class="btn ghost wide" data-act="export">Download spreadsheet (.xlsx)</button>
      <hr class="divider"><h2>Backup</h2><p class="hint" style="margin:0 0 12px">A backup file holds everything you’ve logged. Keep a recent copy somewhere safe. You can restore it here, or into the offline copy of this tracker.</p>
      <div class="actions" style="margin-bottom:6px"><button class="btn ghost" data-act="backup">Download backup</button><button class="btn ghost" data-act="restore">Restore from backup</button></div>
      <input type="file" id="restoreFile" accept=".json,application/json" hidden>`;
    if(!S.newChild){
      const n=family&&family.members?family.members.length:1,owner=family&&family.owner===user.uid;
      h+=`<hr class="divider"><h2>Family</h2><p class="hint" style="margin:0 0 12px">${n>1?'Shared with '+(n-1)+(n===2?' other person.':' other people.'):'Only you can see this log.'} Anyone you invite can see and add to every child’s log.</p>
      <div id="inviteBox"><button class="btn ghost wide" data-act="invite">Invite someone</button></div>
      <div style="margin-top:10px;display:grid;gap:10px">
      <button class="btn ghost wide" data-act="addChild">Add another child</button>
      ${owner&&n>1?'<button class="btn danger wide" data-act="removeOthers">Remove everyone else</button>':''}
      <button class="btn ghost wide" data-act="joinOther">Join a different family</button>
      <button class="btn ghost wide" data-act="signOut">Sign out${user&&user.email?' ('+esc(user.email)+')':''}</button></div>`;
    }
  }
  else if(S.kind==='join'){
    h+=head('Join a family','t-note')+`<p class="hint" style="margin:0 0 12px">You’ll switch to their log. Your current log stays saved, but you won’t see it unless someone from it invites you back.</p>`
      +`<label class="field"><span>Invite code</span><input id="joinCode" type="text" autocomplete="off" autocapitalize="characters" placeholder="8 letters and numbers"></label><button class="btn wide" data-act="joinFamily">Join</button>`;
  }
  if(S.kind==='recap')h=recapHTML();
  if(S.kind==='timer')h=timerSheetHTML();
  sheetBody.innerHTML=h;
}
function val(id){const el=sheetBody.querySelector('#'+id);return el?el.value.trim():''}

function doSave(){
  if(S.kind==='sleep')return saveSleep();
  const e=S.entry,base={id:e?e.id:uid(),note:val('note')||undefined};
  const ts=fromInput(val('when'))||Date.now();let out;
  if(S.kind==='feed'){
    if(e&&e.sub==='solids')out={...e,...base,ts};
    else if(S.sub==='breast'){const L=num(val('left')),Rr=num(val('right'));if(L+Rr<=0)return toast('Enter minutes for at least one side.');out={...base,type:'feed',sub:'breast',ts,left:L||undefined,right:Rr||undefined}}
    else if(S.sub==='bottle'){const a=num(val('bamount'));if(a<=0)return toast('Enter the amount.');out={...base,type:'feed',sub:'bottle',ts,amount:a,unit:e&&e.unit||vol(),milk:S.milk}}
    else if(S.sub==='meal'){const f=val('food');if(!f)return toast('Enter what '+pr().s+' ate.');out={...base,type:'feed',sub:'meal',ts,meal:S.meal,food:f,ate:S.ate||undefined}}
    else{const a=num(val('amount'));out={...base,type:'feed',sub:'drink',ts,drink:S.drink,amount:a||undefined,unit:a?(e&&e.unit||vol()):undefined}}
  } else if(S.kind==='sleep'){
    const a=fromInput(val('when')),b=fromInput(val('end'));
    if(!a||!b)return toast('Enter when the sleep started and ended.');if(b<=a)return toast('Wake-up time needs to be after the start time.');
    out={...base,type:'sleep',ts:a,end:b};
  } else if(S.kind==='routine'){
    if(!S.items.size)return toast('Tap at least one thing you did.');
    const r=routines().find(x=>x.id===S.routineId);
    out={...base,type:'routine',ts,routineId:S.routineId,routineName:r?r.name:(e&&rname(e))||'Routine',items:[...S.items],detail:val('detail')||undefined};
  } else if(S.kind==='first'){
    const t=val('title');if(!t)return toast('Enter what happened.');
    out={...base,type:'first',title:t,ts:fromDate(val('date'))||Date.now()};
  } else if(S.kind==='more'){
    if(S.sub==='growth'){const w=num(val('weight')),l=num(val('length')),hd=num(val('head'));if(!w&&!l&&!hd)return toast('Enter at least one measurement.');
      out={...base,type:'growth',ts,weight:w||undefined,length:l||undefined,head:hd||undefined,wtUnit:e&&e.wtUnit||wt(),lenUnit:e&&e.lenUnit||len()}}
    else if(S.sub==='med'){const m=val('med');if(!m)return toast('Enter the medicine name.');out={...base,type:'med',ts,med:m,dose:val('dose')||undefined}}
    else{if(!base.note)return toast('Write a note first.');out={...base,type:'note',ts}}
  }
  applyPhoto(out,e);saveEntry(out);closeSheet();toast(e?'Changes saved':'Saved');
}

/* ---------- photos ---------- */
const photoCache={};
async function getPhoto(id){
  if(id in photoCache)return photoCache[id];
  let d=null;try{const s=await getDoc(doc(childRef,'photos',id));d=s.exists()?s.data().data:null}catch(e){console.error(e)}
  return photoCache[id]=d;
}
function setPhoto(id,data){photoCache[id]=data;return setDoc(doc(childRef,'photos',id),{data}).catch(writeErr)}
function delPhoto(id){delete photoCache[id];return deleteDoc(doc(childRef,'photos',id)).catch(writeErr)}
function compress(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();fr.onerror=rej;
    fr.onload=()=>{const img=new Image();img.onerror=rej;img.onload=()=>{
      const go=(max,q)=>{const k=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',q)};
      let d=go(1000,.75);if(d.length>230000)d=go(760,.65);if(d.length>230000)d=go(560,.6);res(d)};img.src=fr.result};
    fr.readAsDataURL(file);
  });
}
function photoPreview(){
  const e=S.entry;let src=S.photo;
  if(src===undefined){const pid=e&&e.hasPhoto?e.id:(S.timerPhoto||null);src=pid?photoCache[pid]:null}
  if(src===undefined)return '<p class="hint">Loading photo…</p>';
  if(src)return `<img class="pv" src="${src}" alt="Attached photo"><div class="actions"><button class="btn ghost" data-act="addPhoto">Change photo</button><button class="btn ghost" data-act="removePhoto">Remove photo</button></div>`;
  return '<button class="btn ghost wide" data-act="addPhoto">Add a photo</button>';
}
const photoField=()=>`<div class="photo"><span class="lbl">Photo (optional)</span><div id="photoBox">${photoPreview()}</div><input type="file" id="photoInput" accept="image/*" hidden></div>`;
function refreshPhotoBox(){const b=sheetBody.querySelector('#photoBox');if(b)b.innerHTML=photoPreview()}
function loadSheetPhoto(){const e=S.entry,pid=e&&e.hasPhoto?e.id:(S.timerPhoto||null);if(pid&&!(pid in photoCache))getPhoto(pid).then(()=>{if(S.entry===e)refreshPhotoBox()})}
function applyPhoto(out,e){
  if(!['routine','first','diaper','sleep'].includes(out.type))return;
  if(S.photo===undefined){if(e&&e.hasPhoto)out.hasPhoto=true;return}
  if(S.photo===null){if(e&&e.hasPhoto)delPhoto(out.id);delete out.hasPhoto;return}
  out.hasPhoto=true;setPhoto(out.id,S.photo);
}
function hydratePhotos(){document.querySelectorAll('img[data-photo]').forEach(img=>{const id=img.dataset.photo;
  const set=d=>{if(d)img.src=d;else img.remove()};if(id in photoCache)set(photoCache[id]);else getPhoto(id).then(set)})}
function grabSettings(){
  S.name=val('name');S.dob=val('dob');S.nMeal=val('nMeal');S.nDiaper=val('nDiaper');S.nAwake=val('nAwake');
  sheetBody.querySelectorAll('.rname').forEach(i=>{S.routines[+i.dataset.i].name=i.value});
  sheetBody.querySelectorAll('.ritems').forEach(i=>{S.routines[+i.dataset.i].items=i.value.split(',').map(x=>x.trim()).filter(Boolean)});
}

/* ---------- spreadsheet export ---------- */
function loadXLSX(){
  if(window.XLSX)return Promise.resolve();
  return new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)});
}
function buildWorkbook(){
  const list=sorted().reverse(),dob=profile.dob,X=window.XLSX,wb=X.utils.book_new();
  const add=(name,rows,cols)=>{const ws=X.utils.aoa_to_sheet([cols,...rows]);ws['!cols']=cols.map(c=>({wch:Math.max(12,c.length+2)}));X.utils.book_append_sheet(wb,ws,name)};
  const by=t=>list.filter(e=>e.type===t);
  add('Food',by('feed').map(e=>{
    if(e.sub==='meal')return [isoDate(e.ts),fmtTime(e.ts),cap(e.meal),e.food||'',e.ate?ATE[e.ate]:'','',e.note||''];
    if(e.sub==='drink')return [isoDate(e.ts),fmtTime(e.ts),'Drink',DRINK[e.drink]||'','',e.amount?fmtNum(e.amount)+' '+e.unit:'',e.note||''];
    if(e.sub==='breast')return [isoDate(e.ts),fmtTime(e.ts),'Nursing',describe(e)[1],'',((e.left||0)+(e.right||0))+' min',e.note||''];
    if(e.sub==='bottle')return [isoDate(e.ts),fmtTime(e.ts),'Bottle',e.milk==='formula'?'Formula':'Breast milk','',fmtNum(e.amount)+' '+(e.unit||'oz'),e.note||''];
    const d=describe(e);return [isoDate(e.ts),fmtTime(e.ts),cap(e.sub),d.join(', '),'','',e.note||''];
  }),['Date','Time','Meal','Food or drink','How much was eaten','Amount','Note']);
  add('Diapers',by('diaper').map(e=>[isoDate(e.ts),fmtTime(e.ts),{wet:'Wet',dirty:'Dirty',both:'Wet and dirty'}[e.kind]||'',e.rash?'Yes':'',e.odd?'Yes':'',e.hasPhoto?'Yes':'',e.note||'']),['Date','Time','Type','Diaper rash','Looked unusual','Photo','Note']);
  const sl=by('sleep').filter(e=>e.end);
  add('Sleep',sl.map(e=>[isoDate(e.ts),fmtTime(e.ts),isoDate(e.end)===isoDate(e.ts)?fmtTime(e.end):isoDate(e.end)+' '+fmtTime(e.end),Math.round((e.end-e.ts)/36e3)/100,e.note||'']),['Date','Fell asleep','Woke up','Hours','Note']);
  const daily={};sl.forEach(e=>{let a=e.ts;while(a<e.end){const ds=dayStart(a),de=ds+864e5*1.0,b=Math.min(e.end,new Date(ds).setDate(new Date(ds).getDate()+1));const k=isoDate(ds);daily[k]=(daily[k]||0)+(b-a);a=b}});
  add('Sleep by day',Object.keys(daily).sort().map(k=>[k,Math.round(daily[k]/36e3)/100]),['Date','Total hours slept']);
  const used=new Set(['Food','Diapers','Sleep','Sleep by day','Growth','Firsts','Medicine','Notes']);
  const rlist=[...routines()];by('routine').forEach(e=>{if(!rlist.some(r=>r.id===rid(e)))rlist.push({id:rid(e),name:rname(e),items:[]})});
  rlist.forEach(r=>{
    const es=by('routine').filter(e=>rid(e)===r.id);if(!es.length&&!routines().includes(r))return;
    const cols=[...new Set([...(r.items||[]),...es.flatMap(e=>e.items||[])])];
    let nm=(r.name||'Routine').replace(/[\\\/?*\[\]:]/g,'').slice(0,28)||'Routine';if(used.has(nm))nm=(nm+' routine').slice(0,31);let k=2,base=nm;while(used.has(nm))nm=base.slice(0,28)+' '+k++;used.add(nm);
    add(nm,es.map(e=>[isoDate(rDay(r.id,e.ts)),fmtTime(e.ts),...cols.map(i=>(e.items||[]).includes(i)?'Yes':''),e.detail||e.book||'',e.hasPhoto?'Yes':'',e.note||'']),[r.id==='bedtime'?'Night of':'Date','Time',...cols,'Details','Photo','Note']);
  });
  add('Growth',by('growth').map(e=>[isoDate(e.ts),dob?ageAt(dob,e.ts):'',e.weight||'',e.weight?e.wtUnit:'',e.length||'',e.head||'',(e.length||e.head)?e.lenUnit:'',e.note||'']),['Date','Age','Weight','Weight unit','Height','Head size','Length unit','Note']);
  add('Firsts',by('first').map(e=>[isoDate(e.ts),dob?ageAt(dob,e.ts):'',e.title||'',e.note||'']),['Date','Age','First','Story']);
  add('Medicine',by('med').map(e=>[isoDate(e.ts),fmtTime(e.ts),e.med||'',e.dose||'',e.note||'']),['Date','Time','Medicine','Dose','Note']);
  add('Notes',by('note').map(e=>[isoDate(e.ts),fmtTime(e.ts),e.note||'']),['Date','Time','Note']);
  return wb;
}
async function saveFile(filename,blob){
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
}
const stamp=()=>isoDate(Date.now());
async function exportBackup(){
  const p={...profile};delete p.timer;
  toast('Preparing backup…');
  const photos={};for(const e of entries.filter(x=>x.hasPhoto)){const d=await getPhoto(e.id);if(d)photos[e.id]=d}
  const data={app:'babylog',version:1,exported:new Date().toISOString(),profile:p,entries:sorted(),photos};
  try{await saveFile((profile.name||'Baby')+' backup '+stamp()+'.json',new Blob([JSON.stringify(data,null,1)],{type:'application/json'}))}
  catch(err){toast('Couldn’t create the backup. Try again.')}
}
async function restoreBackup(file){
  let data;try{data=JSON.parse(await file.text())}catch(e){return toast('That file isn’t a baby log backup.')}
  if(!data||data.app!=='babylog'||!Array.isArray(data.entries))return toast('That file isn’t a baby log backup.');
  const have=new Set(entries.map(e=>e.id)),fresh=data.entries.filter(e=>e&&e.id&&e.type&&isFinite(e.ts));
  const added=fresh.filter(e=>!have.has(e.id)).length;
  if(!await ask(`Restore ${fresh.length} entries into ${profile.name||'this'}’s log? ${added} are new. Anything already in the log stays.`,'Restore'))return;
  closeSheet();toast('Restoring…');
  try{
    if(data.profile){const bp={...data.profile};delete bp.timer;delete bp.name;delete bp.id;const merged={...bp,...profile};if(JSON.stringify(merged)!==JSON.stringify(profile))saveProfile(merged)}
    for(let i=0;i<fresh.length;i+=400){const b=writeBatch(db);fresh.slice(i,i+400).forEach(e=>{const {id,...body}=clean(e);b.set(doc(col,id),body)});await b.commit()}
    const ph=Object.entries(data.photos&&typeof data.photos==='object'?data.photos:{}).filter(([id,d])=>typeof d==='string'&&d.startsWith('data:image/'));
    for(let i=0;i<ph.length;i+=20){const b=writeBatch(db);ph.slice(i,i+20).forEach(([id,d])=>{photoCache[id]=d;b.set(doc(childRef,'photos',id),{data:d})});await b.commit()}
    toast('Backup restored');
  }catch(e){console.error(e);toast('The restore stopped partway. Try it again; nothing will be duplicated.')}
}
async function exportXlsx(btn){
  btn.disabled=true;btn.textContent='Preparing…';
  try{
    await loadXLSX();
    const buf=window.XLSX.write(buildWorkbook(),{bookType:'xlsx',type:'array'});
    await saveFile((profile.name||'Baby')+' log '+stamp()+'.xlsx',new Blob([buf]));
  }catch(err){console.error(err);toast('Couldn’t create the spreadsheet. Check your internet connection and try again.')}
  finally{btn.disabled=false;btn.textContent='Download spreadsheet (.xlsx)'}
}

/* ---------- birthday recap ---------- */
const ord=n=>{const s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])};
function birthdayAt(k){const b=new Date(profile.dob+'T00:00:00');b.setFullYear(b.getFullYear()+k);return b.getTime()}
function completedYears(){if(!profile.dob)return 0;let k=0;while(birthdayAt(k+1)<=Date.now())k++;return k}
function birthdayWeek(){const k=completedYears();return k>=1&&Date.now()-birthdayAt(k)<8*864e5?k:0}
const fmtInt=n=>Math.round(n).toLocaleString();
function recapStats(start,end){
  const L=entries.filter(e=>e.ts>=start&&e.ts<end),by=t=>L.filter(e=>e.type===t),tiles=[];
  const dia=by('diaper');
  if(dia.length)tiles.push({c:'diaper',big:fmtInt(dia.length),label:'diapers changed',more:`${fmtInt(dia.filter(e=>e.kind!=='dirty').length)} wet, ${fmtInt(dia.filter(e=>e.kind!=='wet').length)} dirty`});
  const feeds=by('feed'),meals=feeds.filter(e=>e.sub==='meal'||e.sub==='solids'),nurse=feeds.filter(e=>e.sub==='breast'),bottles=feeds.filter(e=>e.sub==='bottle');
  if(meals.length)tiles.push({c:'feed',big:fmtInt(meals.length),label:'meals and snacks'});
  if(nurse.length){const m=nurse.reduce((s,e)=>s+(e.left||0)+(e.right||0),0);tiles.push({c:'feed',big:fmtInt(m/60),label:'hours of nursing',more:fmtInt(nurse.length)+' nursing sessions'})}
  if(bottles.length)tiles.push({c:'feed',big:fmtInt(bottles.length),label:'bottles'});
  const sl=by('sleep').filter(e=>e.end);
  if(sl.length){const h=sl.reduce((s,e)=>s+(Math.min(e.end,end)-e.ts),0)/36e5;tiles.push({c:'sleep',big:fmtInt(h),label:'hours of sleep logged',more:fmtInt(sl.length)+' naps and nights'})}
  const counts={},nightly={};by('routine').forEach(e=>(e.items||[]).forEach(i=>{counts[i]=(counts[i]||0)+1;if(rid(e)==='bedtime')nightly[i]=1}));
  Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,2).forEach(([i,n])=>tiles.push({c:'routine',big:fmtInt(n),label:i+(nightly[i]?' (nights)':' (times)')}));
  const books=by('routine').filter(e=>(e.items||[]).some(i=>/read|book|stor/i.test(i))).length;
  if(books&&!tiles.some(t=>/read|book|stor/i.test(t.label)))tiles.push({c:'routine',big:fmtInt(books),label:'nights of reading together'});
  const firsts=by('first').sort((a,b)=>a.ts-b.ts);
  if(firsts.length)tiles.push({c:'first',big:fmtInt(firsts.length),label:firsts.length===1?'first':'firsts'});
  const g=by('growth').sort((a,b)=>a.ts-b.ts);
  const gw=g.filter(e=>e.weight),gl=g.filter(e=>e.length);
  if(gw.length>1){const d=convW(gw[gw.length-1].weight,gw[gw.length-1].wtUnit)-convW(gw[0].weight,gw[0].wtUnit);if(d>0)tiles.push({c:'growth',big:'+'+fmtNum(d)+' '+wt(),label:'of growing'})}
  if(gl.length>1){const d=convL(gl[gl.length-1].length,gl[gl.length-1].lenUnit)-convL(gl[0].length,gl[0].lenUnit);if(d>0)tiles.push({c:'growth',big:'+'+fmtNum(d)+' '+len(),label:'taller'})}
  const foods={};meals.forEach(e=>(e.food||'').split(/,| and /).map(x=>x.trim().toLowerCase()).filter(Boolean).forEach(f=>foods[f]=(foods[f]||0)+1));
  const fav=Object.entries(foods).sort((a,b)=>b[1]-a[1])[0];
  const photos=L.filter(e=>e.hasPhoto&&e.type!=='diaper').length;
  if(photos)tiles.push({c:'note',big:fmtInt(photos),label:photos===1?'photo saved':'photos saved'});
  return {tiles,firsts,fav:fav&&fav[1]>=3?fav[0]:null,days:new Set(L.map(e=>dayStart(e.ts))).size};
}
function recapRange(){
  const k=S.year;
  if(k)return {start:birthdayAt(k-1),end:birthdayAt(k),title:`Happy ${ord(k)} birthday, ${profile.name}!`,sub:k===1?'Your first year':`Your ${ord(k)} year`};
  return {start:birthdayAt(completedYears()),end:Date.now(),title:`${profile.name}’s year so far`,sub:`Since ${fmtDate(birthdayAt(completedYears()))}`};
}
function recapText(r,st){
  let t=(S.year?'🎂 ':'')+r.title+' Here are some of the things you did:\n';
  st.tiles.forEach(x=>{t+=`• ${x.big} ${x.label}${x.more?' ('+x.more+')':''}\n`});
  if(st.fav)t+=`• Favorite food: ${st.fav}\n`;
  if(st.firsts.length)t+=`• Your firsts: ${st.firsts.map(f=>f.title).join(', ')}\n`;
  return t.trim();
}
async function recapCanvas(r,st){
  const cs=getComputedStyle(document.documentElement),v=n=>cs.getPropertyValue('--'+n).trim();
  try{await Promise.all([document.fonts.load('700 80px "Bricolage Grotesque"'),document.fonts.load('400 30px "Atkinson Hyperlegible"')])}catch(e){}
  const W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const D='"Bricolage Grotesque", system-ui, sans-serif',B='"Atkinson Hyperlegible", system-ui, sans-serif';
  const rr=(X,Y,w,h,r)=>{x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath()};
  const wrap=(text,X,Y,maxW,lh,maxLines=2)=>{const words=text.split(' ');let line='',n=0;for(let i=0;i<words.length;i++){const t=line?line+' '+words[i]:words[i];if(x.measureText(t).width>maxW&&line){if(n===maxLines-1){while(x.measureText(line+'…').width>maxW)line=line.slice(0,-1);x.fillText(line+'…',X,Y+n*lh);return Y+(n+1)*lh}x.fillText(line,X,Y+n*lh);n++;line=words[i]}else line=t}x.fillText(line,X,Y+n*lh);return Y+(n+1)*lh};
  x.fillStyle=v('bg');x.fillRect(0,0,W,H);
  x.font='110px '+B;x.textBaseline='top';x.fillText(S.year?'🎂':'✨',72,64);
  x.fillStyle=v('ink');x.font='700 84px '+D;let y=wrap(r.title,72,210,W-144,92,2);
  x.fillStyle=v('muted');x.font='34px '+B;x.fillText(r.sub+(st.days?`, ${fmtInt(st.days)} days logged`:''),72,y+14);
  const tiles=st.tiles.slice(0,6),tw=(W-144-24)/2,th=178;let ty=y+92;
  tiles.forEach((t,i)=>{const X=72+(i%2)*(tw+24),Y=ty+Math.floor(i/2)*(th+24);
    x.save();rr(X,Y,tw,th,28);x.clip();x.fillStyle=v('surface');x.fillRect(X,Y,tw,th);x.fillStyle=v(t.c);x.fillRect(X,Y,12,th);x.restore();
    x.fillStyle=v(t.c);x.font='700 64px '+D;x.fillText(t.big,X+40,Y+24);
    x.fillStyle=v('muted');x.font='30px '+B;wrap(t.label,X+40,Y+102,tw-64,36,2)});
  y=ty+Math.ceil(tiles.length/2)*(th+24)+8;
  x.font='30px '+B;
  if(st.fav&&y<H-170){x.fillStyle=v('ink');y=wrap('Favorite food: '+st.fav,72,y,W-144,40,1)+6}
  if(st.firsts.length&&y<H-130){x.fillStyle=v('ink');y=wrap('Firsts: '+st.firsts.map(f=>f.title).join(', '),72,y,W-144,40,Math.max(1,Math.floor((H-120-y)/40)))}
  x.fillStyle=v('muted');x.font='26px '+B;x.fillText('Made with Baby log',72,H-72);
  return c;
}
function recapHTML(){
  const r=recapRange(),st=recapStats(r.start,r.end);S.recap={r,st};
  let h=`<div class="sheet-head t-first"><h2>${esc(r.title)}</h2><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>`;
  if(!st.tiles.length&&!st.firsts.length)return h+'<div class="empty-state">There’s nothing logged for this year yet. Once you log meals, diapers, sleep and routines, the recap fills in here.</div>';
  h+=`<img id="recapImg" class="pv" alt="Birthday recap picture" style="aspect-ratio:4/5;max-height:none;object-fit:contain;background:var(--bg)">
  <div class="actions" style="margin-bottom:16px"><button class="btn" data-act="shareRecap">Share picture</button><button class="btn ghost" data-act="saveRecap">Save picture</button></div>
  <label class="field"><span>Or share as text</span><textarea id="recapText" rows="8" readonly>${esc(recapText(r,st))}</textarea></label>
  <button class="btn ghost wide" data-act="copyRecap">Copy text</button>`;
  return h;
}
async function fillRecapImage(){const im=sheetBody.querySelector('#recapImg');if(!im||!S.recap)return;const c=await recapCanvas(S.recap.r,S.recap.st);S.recap.canvas=c;im.src=c.toDataURL('image/png')}
async function recapBlob(){if(!S.recap.canvas)await fillRecapImage();return new Promise(r=>S.recap.canvas.toBlob(r,'image/png'))}
const recapFile=()=>(profile.name||'Baby')+(S.year?' '+ord(S.year)+' birthday':' year so far')+'.png';
async function shareRecap(){
  const blob=await recapBlob(),file=new File([blob],recapFile(),{type:'image/png'});
  try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],text:recapText(S.recap.r,S.recap.st)});return}}catch(e){if(e&&e.name==='AbortError')return}
  return saveRecap();
}
async function saveRecap(){try{await saveFile(recapFile(),await recapBlob())}catch(e){if(!e||e.code!=='declined')toast('Couldn’t save the picture here. Press and hold the picture to save it instead.')}}
async function copyRecap(){const t=sheetBody.querySelector('#recapText');try{await navigator.clipboard.writeText(t.value);toast('Copied')}catch(e){t.focus();t.select();toast('Text selected. Use your phone’s Copy.')}}
function openRecap(year){S={kind:'recap',year};renderSheet();if(!dlg.open)dlg.showModal();fillRecapImage()}
function recapSettingsHTML(){
  if(!profile.dob)return '';const k=completedYears();
  let b='';for(let y=k;y>=1;y--)b+=`<button class="btn ghost wide" data-act="recap" data-y="${y}">${ord(y)} birthday recap</button>`;
  b+=`<button class="btn ghost wide" data-act="recap" data-y="0">${k?'This year so far':'First year so far'}</button>`;
  return `<hr class="divider"><h2>Birthday recaps</h2><p class="hint" style="margin:0 0 12px">A shareable picture and message with the highlights from each year.</p><div style="display:grid;gap:10px">${b}</div>`;
}


/* ---------- in-app confirm (browser pop-ups are blocked in some apps) ---------- */
const askDlg=document.createElement('dialog');askDlg.className='askdlg';askDlg.setAttribute('aria-label','Confirm');document.body.appendChild(askDlg);
const askCss=document.createElement('style');askCss.textContent='dialog.askdlg{margin:auto;border-radius:22px;width:min(420px,92vw);padding:22px 20px 18px}dialog.askdlg p{margin:0 0 18px;font-size:1.05rem}';document.head.appendChild(askCss);
function ask(msg,ok='Delete'){
  return new Promise(res=>{
    askDlg.innerHTML=`<p>${esc(msg)}</p><div class="actions"><button class="btn ghost" data-a="no">Cancel</button><button class="btn danger" data-a="yes">${esc(ok)}</button></div>`;
    let done=false;const fin=v=>{if(done)return;done=true;if(askDlg.open)askDlg.close();res(v)};
    askDlg.onclick=ev=>{const b=ev.target.closest('[data-a]');if(b)fin(b.dataset.a==='yes');else if(ev.target===askDlg)fin(false)};
    askDlg.oncancel=ev=>{ev.preventDefault();fin(false)};
    askDlg.showModal();askDlg.querySelector('[data-a="no"]').focus();
  });
}
/* ---------- gentle reminders ---------- */
const nudgeCss=document.createElement('style');nudgeCss.textContent='.nudge{display:flex;gap:12px;align-items:flex-start;background:var(--c-t);border-radius:16px;padding:12px 14px;margin:10px 0 0}.nudge .ic{font-size:1.4rem;line-height:1.2}.nudge p{margin:0}.nudge small{display:block;color:var(--muted);font-size:.9rem}';document.head.appendChild(nudgeCss);
const NUDGE_DEFAULT={meal:3,diaper:3};
function usualGap(kind){
  const since=Date.now()-14*864e5;let ts;
  if(kind==='meal')ts=entries.filter(e=>e.type==='feed'&&e.sub!=='drink'&&e.ts>since).map(e=>e.ts);
  else if(kind==='diaper')ts=entries.filter(e=>e.type==='diaper'&&e.ts>since).map(e=>e.ts);
  else{const gaps=[];const sl=entries.filter(e=>e.type==='sleep'&&e.end&&e.ts>since).sort((a,b)=>a.ts-b.ts);
    for(let i=1;i<sl.length;i++){const g=sl[i].ts-sl[i-1].end;if(g>20*6e4&&g<12*36e5)gaps.push(g)}return median(gaps)}
  ts.sort((a,b)=>a-b);const gaps=[];for(let i=1;i<ts.length;i++){const g=ts[i]-ts[i-1];if(g>20*6e4&&g<9*36e5)gaps.push(g)}
  return median(gaps);
}
function median(a){if(a.length<5)return null;a=a.slice().sort((x,y)=>x-y);const m=a[Math.floor(a.length/2)];return Math.round(m/9e5)*9e5}
function nudgeLimit(kind){
  const n=profile.nudges||{};if(num(n[kind])>0)return {ms:num(n[kind])*36e5,src:'set'};
  const u=usualGap(kind);if(u)return {ms:u,src:'usual'};
  return NUDGE_DEFAULT[kind]?{ms:NUDGE_DEFAULT[kind]*36e5,src:'default'}:null;
}
function nudgeCard(c,ic,title,sub){return `<div class="nudge t-${c}" role="status"><span class="ic">${ic}</span><p>${title}<small>${sub}</small></p></div>`}
function nudgesHTML(){
  if(profile.nudges&&profile.nudges.on===false)return '';
  const now=Date.now(),t=profile.timer,list=sorted(),nm=esc(profile.name||'Baby');
  if(t&&t.kind==='sleep')return '';
  const why=l=>l.src==='usual'?`${nm} usually goes about ${dur(l.ms)} between`:l.src==='set'?`You set a reminder for every ${dur(l.ms)}`:`Reminder after ${dur(l.ms)} until there’s enough logged to learn ${nm}’s rhythm`;
  let h='';
  const lf=list.find(e=>e.type==='feed'&&e.sub!=='drink'),ml=nudgeLimit('meal');
  if(lf&&ml&&!(t&&t.kind==='feed')&&now-lf.ts>=ml.ms)h+=nudgeCard('feed','🍽️',`It’s been ${dur(now-lf.ts)} since ${nm} last ${profile.nursing?'fed':'ate'}. ${Cap(pr().s)} may be getting hungry.`,why(ml)+(ml.src==='usual'?(profile.nursing?' feeds.':' meals.'):'.'));
  const ld=list.find(e=>e.type==='diaper'),dl=nudgeLimit('diaper');
  if(ld&&dl&&now-ld.ts>=dl.ms)h+=nudgeCard('diaper','💧',`It’s been ${dur(now-ld.ts)} since the last diaper change. ${Cap(pr().s)} may be due for a check.`,why(dl)+(dl.src==='usual'?' changes.':'.'));
  const ls=list.find(e=>e.type==='sleep'&&e.end),al=nudgeLimit('awake');
  if(ls&&al&&now-ls.end>=al.ms)h+=nudgeCard('sleep','🌙',`${nm} has been awake for ${dur(now-ls.end)} and may be getting tired.`,why(al)+(al.src==='usual'?' sleeps.':'.'));
  return h;
}
function nudgeSettingsHTML(){
  const n=S.newChild?{}:(profile.nudges||{});if(S.nudge===undefined)S.nudge=n.on===false?'off':'on';
  const hint=k=>{if(S.newChild)return k==='awake'?'Optional':'Learns from what you log';const u=usualGap(k);return u?'Usually about '+dur(u):k==='awake'?'Learns once you log more sleep':'Using '+NUDGE_DEFAULT[k]+'h for now'};
  const f=(id,k,label)=>`<label class="field"><span>${label}</span><input id="${id}" type="number" min="0.5" step="0.25" inputmode="decimal" value="${esc(S[id]!==undefined?S[id]:(n[k]||''))}" placeholder="Hours (optional)"><small style="display:block;color:var(--muted);font-size:.88rem;margin-top:4px">${esc(hint(k))}</small></label>`;
  const nm=esc(S.newChild?'your baby':(profile.name||'Baby'));
  return `<span class="lbl">Gentle reminders</span><p class="hint" style="margin:0 0 10px">A heads-up on Today when it’s been longer than usual since a meal, diaper change or nap. Leave the hours blank to use ${nm}’s own rhythm.</p>`
    +seg('nudge',[['off','Off'],['on','On']],S.nudge)
    +f('nMeal','meal','Remind me about a meal after')+f('nDiaper','diaper','Remind me about a diaper after')+f('nAwake','awake','Remind me about a nap after being awake')
    +`<p class="hint" style="margin:0 0 6px">Preview:</p>${nudgeCard('feed','🍽️',`It’s been 3h 40m since ${nm} last ate. ${Cap(pr().s)} may be getting hungry.`,`${nm} usually goes about 3h between meals.`)}<div style="height:16px"></div>`;
}


/* ---------- edit a running timer ---------- */
function timerSheetHTML(){
  const t=profile.timer;
  if(!t)return `<div class="sheet-head t-sleep"><h2>Timer</h2><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div><div class="empty-state">There’s no timer running right now.</div>`;
  const sl=t.kind==='sleep';
  return `<div class="sheet-head ${sl?'t-sleep':'t-feed'}"><h2>${sl?'Edit sleep timer':'Edit nursing timer'}</h2><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>`
    +field('timerStart',sl?'Fell asleep at':'Started at','datetime-local',toInput(t.start))
    +`<p class="hint">The timer will count from this time. You can change it again anytime before you stop the timer.</p>`
    +`<div class="actions"><button class="btn" data-act="saveTimer">Save</button></div>`;
}
function saveTimer(){
  const t={...profile.timer};if(!t.kind)return closeSheet();
  const st=fromInput(val('timerStart')),n=Date.now();
  if(!st)return toast('Enter a start time.');
  if(st>n+6e4)return toast('That time hasn’t happened yet.');
  if(n-st>24*36e5)return toast('Timers can go back up to 24 hours. For longer, log it as a finished sleep.');
  if(t.kind==='feed'){const shift=t.start-st;t[t.side]=Math.max(0,(t[t.side]||0)+shift);if(st>t.segStart)t.segStart=st}
  t.start=Math.min(st,n);saveProfile({...profile,timer:t});closeSheet();toast('Timer updated');
}
const DEFAULT_GENDER=()=>'they';
/* ---------- pronouns ---------- */
const PRON={she:{s:'she',o:'her',p:'her'},he:{s:'he',o:'him',p:'his'},they:{s:'they',o:'them',p:'their'}};
const pr=()=>PRON[profile.gender||DEFAULT_GENDER()]||PRON.they;
const Cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
const genderSeg=()=>`<span class="lbl">Boy or girl</span>`+seg('gender',[['she','Girl'],['he','Boy']],S.gender);

/* ---------- sleep sheet: timer and log in one ---------- */
const sleepCss=document.createElement('style');sleepCss.textContent='.sleepTotal{background:var(--c-t);border-radius:18px;padding:16px;text-align:center;margin-bottom:14px}.sleepTotal .lbl{margin:0;color:var(--muted)}.sleepTotal strong{display:block;font-family:var(--display);font-size:3rem;line-height:1.1;font-variant-numeric:tabular-nums;color:var(--c)}.sleepTotal small{display:block;color:var(--muted);min-height:1.2em}.row>*,.row3>*{min-width:0}.field input{min-width:0;max-width:100%}dialog{overflow-x:hidden}';document.head.appendChild(sleepCss);
function readStart(){
  const v=val('when'),e=S.entry,t=profile.timer;
  if(e&&e.type==='sleep'&&v===toInput(e.ts))return e.ts;
  if(!e&&t&&t.kind==='sleep'&&v===toInput(t.start))return t.start;
  return fromInput(v);
}
const hm=ms=>{const m=Math.max(0,Math.floor(ms/6e4));return Math.floor(m/60)+'h '+(m%60)+'m'};
function updateSleepTotal(){
  const out=sheetBody.querySelector('#sleepTotal'),note=sheetBody.querySelector('#sleepNote');if(!out)return;
  const a=readStart(),b=fromInput(val('end')),n=Date.now();
  if(!a){out.textContent='0h 0m';note.textContent='Add a start time, or tap Start timer';return}
  if(b&&b<=a){out.textContent='0h 0m';note.textContent='The end time is before the start time';return}
  if(b){out.textContent=hm(b-a);note.textContent=fmtTime(a)+' to '+fmtTime(b);return}
  out.textContent=clock(n-a);note.textContent=(profile.timer&&profile.timer.kind==='sleep'&&!S.entry)?'Timer running since '+fmtTime(a):'Counting from '+fmtTime(a);
}
function sleepPhoto(id,had){
  if(S.photo===undefined)return had||undefined;
  if(S.photo===null){if(had)delPhoto(id);return undefined}
  setPhoto(id,S.photo);return true;
}
function startSleepTimer(a,keepOpen){
  const n=Date.now();if(a>n+6e4)return toast('The start time hasn’t happened yet.');
  if(n-a>24*36e5)return toast('Timers can go back up to 24 hours. Add an end time to save it as a finished sleep.');
  if(S.photoBusy)return toast('The photo is still loading. Try again in a second.');
  const t0=profile.timer&&profile.timer.kind==='sleep'?profile.timer:{},id=t0.entryId||uid();
  const timer=clean({kind:'sleep',start:Math.min(a,n),entryId:id,note:val('note')||undefined,hasPhoto:sleepPhoto(id,t0.hasPhoto)});
  saveProfile({...profile,timer});
  if(keepOpen){S.photo=undefined;S.timerPhoto=timer.hasPhoto?id:null;renderSheet();updateSleepTotal();toast('Timer started');return}
  closeSheet();toast(t0.kind?'Timer updated':'Timer started');
}
function saveSleep(endNow){
  if(S.photoBusy)return toast('The photo is still loading. Try again in a second.');
  const e=S.entry,t=profile.timer,running=!e&&t&&t.kind==='sleep',n=Date.now();
  const a=readStart(),b=endNow?n:fromInput(val('end'));
  if(!a)return toast('Add a start time, or tap Start timer.');
  if(a>n+6e4)return toast('The start time hasn’t happened yet.');
  if(!b){if(e)return toast('Add an end time.');return startSleepTimer(a)}
  if(b<=a)return toast('The end time needs to be after the start time.');
  if(b>n+6e4)return toast('The end time hasn’t happened yet.');
  const id=e?e.id:(running&&t.entryId)||uid();
  const out=clean({id,type:'sleep',ts:a,end:b,note:val('note')||undefined,hasPhoto:sleepPhoto(id,e?e.hasPhoto:(running&&t.hasPhoto))});
  if(running){const p={...profile};delete p.timer;saveProfile(p)}
  saveEntry(out);closeSheet();toast(e?'Changes saved':'Sleep saved');
}
/* ---------- events ---------- */
async function onClick(ev){
  const b=ev.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='themeMode')return setTheme('mode',b.dataset.v,b);
  if(a==='palette')return setTheme('palette',b.dataset.v,b);
  if(a==='recap')return openRecap(+b.dataset.y);
  if(a==='editTimer'){S={kind:'timer'};renderSheet();if(!dlg.open)dlg.showModal();return}
  if(a==='saveTimer')return saveTimer();
  if(a==='startSleepSheet'){const v=fromInput(val('when'));return startSleepTimer(v||Date.now(),true)}
  if(a==='stopSleepSheet')return saveSleep(true);
  if(a==='shareRecap')return shareRecap();
  if(a==='saveRecap')return saveRecap();
  if(a==='copyRecap')return copyRecap();
  if(['google','signIn','signUp','forgot','createFamily','joinFamily','signOut','pickChild','addChild','invite','shareInvite','removeOthers','joinOther'].includes(a)){handleAccount(a,b);return}
  if(a==='open')return openSheet(b.dataset.k);
  if(a==='settings')return openSettings(false);
  if(a==='close')return closeSheet();
  if(a==='view'){view=b.dataset.k;render();return window.scrollTo(0,0)}
  if(a==='edit'){const e=entries.find(x=>x.id===b.dataset.id);if(e)openSheet(e.type,e);return}
  if(a==='filter'){filter=b.dataset.k;daysShown=3;return render()}
  if(a==='moredays'){daysShown+=7;return render()}
  if(a==='seg'){
    const k=b.dataset.key;S[k]=(S[k]===b.dataset.v&&k==='ate')?null:b.dataset.v;
    b.parentElement.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.v===S[k]));
    if(k==='sub')sheetBody.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==S.sub);
    return;
  }
  if(a==='toggle'){const v=b.dataset.v;S.items.has(v)?S.items.delete(v):S.items.add(v);b.setAttribute('aria-pressed',S.items.has(v));return}
  if(a==='idea'){const i=sheetBody.querySelector('#title');i.value=b.dataset.v;i.focus();return}
  if(a==='startSleep')return startSleep();
  if(a==='pickRoutine'){Object.assign(S,{routineId:b.dataset.v,entry:null,ts:fromInput(val('when'))||Date.now(),items:new Set(),photo:undefined});renderSheet();return loadSheetPhoto()}
  if(a==='addPhoto')return sheetBody.querySelector('#photoInput').click();
  if(a==='removePhoto'){S.photo=null;return refreshPhotoBox()}
  if(a==='addRoutine'){grabSettings();S.routines.push({id:uid(),name:'',items:[]});renderSheet();const ins=sheetBody.querySelectorAll('.rname');ins[ins.length-1].focus();return}
  if(a==='rmRoutine'){grabSettings();const r=S.routines[+b.dataset.i];if(r.name&&!await ask(`Remove the ${r.name} routine? Entries you already logged stay in your history.`,'Remove'))return;S.routines.splice(+b.dataset.i,1);return renderSheet()}
  if(a==='startFeed')return startFeed(b.dataset.side);
  if(a==='switch')return switchSide();
  if(a==='backup')return exportBackup();
  if(a==='restore')return sheetBody.querySelector('#restoreFile').click();
  if(a==='stop')return stopTimer();
  if(a==='discard')return discardTimer();
  if(a==='save')return doSave();
  if(a==='export')return exportXlsx(b);
  if(a==='flag'){S[b.dataset.v]=!S[b.dataset.v];b.setAttribute('aria-pressed',S[b.dataset.v]);return}
  if(a==='saveDiaper'){if(S.photoBusy)return toast('The photo is still loading. Try again in a second.');const e=S.entry;const out={id:e?e.id:uid(),type:'diaper',kind:b.dataset.v,ts:fromInput(val('when'))||Date.now(),rash:S.rash||undefined,odd:S.odd||undefined,note:val('note')||undefined};applyPhoto(out,e);saveEntry(out);closeSheet();toast(e?'Changes saved':'Diaper saved');return}
  if(a==='del'){if(!await ask('Delete this entry?','Delete'))return;if(S.entry.hasPhoto)delPhoto(S.entry.id);deleteEntry(S.entry.id);closeSheet();toast('Deleted');return}
  if(a==='saveSettings'){
    const name=val('name');if(!name)return toast('Enter a name.');
    grabSettings();
    const rs=S.routines.filter(r=>r.name.trim()).map(r=>({id:r.id,name:r.name.trim(),items:r.items}));
    if(!S.gender)return toast('Choose boy or girl.');
    const fields={name,gender:S.gender,dob:val('dob')||undefined,vol:S.vol,wt:S.wt,nursing:S.nursing==='on'||undefined,routines:rs.length?rs:undefined,nudges:clean({on:S.nudge==='off'?false:undefined,meal:num(S.nMeal)||undefined,diaper:num(S.nDiaper)||undefined,awake:num(S.nAwake)||undefined})};
    if(S.newChild){
      const ref=doc(collection(db,'families',familyId,'children'));
      try{localStorage.setItem(prefKey(),ref.id)}catch(e){}
      pendingChild=ref.id;setDoc(ref,clean({...fields,createdAt:Date.now()})).catch(writeErr);closeSheet();toast('Added '+name);return;
    }
    const p={...profile,...fields};delete p.routine;
    saveProfile(p);closeSheet();toast('Saved');
  }
}
app.addEventListener('click',onClick);sheetBody.addEventListener('click',onClick);
dlg.addEventListener('click',ev=>{if(ev.target===dlg)closeSheet()});
sheetBody.addEventListener('input',ev=>{if(S.kind==='sleep'&&(ev.target.id==='when'||ev.target.id==='end'))updateSleepTotal()});
sheetBody.addEventListener('change',ev=>{
  if(S.kind==='sleep'&&(ev.target.id==='when'||ev.target.id==='end'))updateSleepTotal();
  if(ev.target.id==='restoreFile'&&ev.target.files[0])restoreBackup(ev.target.files[0]);
  if(ev.target.id==='photoInput'&&ev.target.files[0]){const f=ev.target.files[0];ev.target.value='';const box=sheetBody.querySelector('#photoBox');if(box)box.innerHTML='<p class="hint">Preparing photo…</p>';S.photoBusy=true;
    compress(f).then(d=>{S.photo=d;S.photoBusy=false;refreshPhotoBox()}).catch(()=>{S.photoBusy=false;toast('That photo couldn’t be opened. Try a different one.');refreshPhotoBox()})}
});
setInterval(()=>{const n=Date.now();
  document.querySelectorAll('[data-clock]').forEach(el=>el.textContent=clock(n-+el.dataset.clock));
  if(n%30000<1000)document.querySelectorAll('[data-since]').forEach(el=>el.textContent=dur(n-+el.dataset.since));
  if(n%60000<1000&&!dlg.open&&view==='today')render();
  if(dlg.open&&S.kind==='sleep')updateSleepTotal();
},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&screen==='app')render()});
initFirebase();
