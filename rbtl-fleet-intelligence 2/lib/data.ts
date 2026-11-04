import {getViewer} from './auth';
import {loadFleet,reg} from './sheets';
import {ALERTS} from './alerts';
export async function dashboardData(params:URLSearchParams){
 const viewer=await getViewer();if(!viewer)return {status:401 as const,error:'Not signed in'};
 const date=params.get('date')||new Date().toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return {status:400 as const,error:'Invalid date'};
 const selected=(params.has('alerts')?params.get('alerts')!:ALERTS.map(a=>a[0]).join(',')).split(',').filter(a=>ALERTS.some(x=>x[0]===a));
 const requestedReg=reg(params.get('van')||'');
 const {vehicles,events,dvics}=await loadFleet();
 const isManager=viewer.profile.role==='manager';
 const ownIds=new Set(viewer.profile.inspector_ids||[]);
 // Driver access is determined exclusively by authenticated inspector IDs, NEVER by a client-supplied driver name or van.
 const permittedDvics=dvics.filter(r=>isManager||ownIds.has(r.inspectorId));
 const dayDvics=permittedDvics.filter(r=>r.date===date);
 // A van can be shared. Do not attribute its alerts to one driver if other inspectors used it that day.
 const dayAllDvics=dvics.filter(r=>r.date===date);
 const allowedVans=new Set(dayDvics.map(r=>r.registration).filter(v=>dayAllDvics.filter(d=>d.registration===v).every(d=>ownIds.has(d.inspectorId))));
 const dayEvents=events.filter(r=>r.date===date&&(isManager||allowedVans.has(r.registration))&&(!requestedReg||r.registration===requestedReg));
 const filtered=dayEvents.filter(r=>selected.includes(r.alert));
 const vans=isManager?vehicles.filter(v=>!requestedReg||v===requestedReg):Array.from(allowedVans).filter(v=>!requestedReg||v===requestedReg);
 const rows=vans.map(v=>{
  const byAlert=Object.fromEntries(ALERTS.map(([code])=>[code,filtered.filter(e=>e.registration===v&&e.alert===code).reduce((n,e)=>n+e.count,0)]));
  const matching=dayDvics.filter(d=>d.registration===v);
  return {registration:v,drivers:[...new Set(matching.map(d=>d.driverName).filter(Boolean))],alerts:byAlert,total:Object.values(byAlert).reduce((a,b)=>a+b,0),dvics:matching.length};
 }).sort((a,b)=>b.total-a.total);
 const visibleDvics=permittedDvics.filter(r=>r.date===date&&(!requestedReg||r.registration===requestedReg));
 return {status:200 as const,data:{date,role:viewer.profile.role,displayName:viewer.profile.display_name,alerts:ALERTS,selected,rows,dvics:visibleDvics,total:rows.reduce((s,r)=>s+r.total,0),affected:rows.filter(r=>r.total>0).length,vehicles:rows.length,dvicCount:visibleDvics.length}};
}
