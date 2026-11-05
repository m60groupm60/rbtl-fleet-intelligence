"use client";
import {useEffect,useMemo,useState} from 'react';
type Mapping={inspector_id:string;driver_name:string;updated_at:string};
export default function DriverManager(){
 const [ids,setIds]=useState<string[]>([]);const [mappings,setMappings]=useState<Mapping[]>([]);
 const [search,setSearch]=useState('');const [onlyUnmapped,setOnlyUnmapped]=useState(true);
 const [drafts,setDrafts]=useState<Record<string,string>>({});const [busy,setBusy]=useState('');
 const [message,setMessage]=useState('');const [loading,setLoading]=useState(true);
 async function load(){setLoading(true);try{const res=await fetch('/api/driver-mappings',{cache:'no-store'});const data=await res.json();if(!res.ok)throw Error(data.error||'Unable to load drivers');setIds(data.ids);setMappings(data.mappings);setDrafts(Object.fromEntries(data.mappings.map((m:Mapping)=>[m.inspector_id,m.driver_name])));}catch(e){setMessage(String(e));}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 const mapped=useMemo(()=>new Set(mappings.map(m=>m.inspector_id)),[mappings]);
 const shown=ids.filter(id=>(!onlyUnmapped||!mapped.has(id))&&(`${id} ${drafts[id]||''}`).toLowerCase().includes(search.toLowerCase()));
 async function save(id:string){setBusy(id);setMessage('');try{const res=await fetch('/api/driver-mappings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({inspector_id:id,driver_name:drafts[id]||''})});const data=await res.json();if(!res.ok)throw Error(data.error||'Save failed');setMessage('Saved '+id+' — name now applies to historical and future dashboard records.');await load();}catch(e){setMessage(String(e));}finally{setBusy('');}}
 return <main style={{maxWidth:1100,margin:'0 auto',padding:'30px 20px',fontFamily:'Arial,sans-serif',color:'#17314d'}}>
 <a href="/dashboard" style={{color:'#2365df'}}>← Back to dashboard</a><h1>Driver Management</h1>
 <p>Enter each driver’s name once. The Amazon Inspector ID remains linked to that name.</p>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'22px 0'}}><strong>{ids.length} known IDs</strong><strong>{mapped.size} mapped</strong><strong>{ids.filter(id=>!mapped.has(id)).length} unmapped</strong></div>
 <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'center',marginBottom:18}}><input aria-label="Search drivers" placeholder="Search name or Amazon ID" value={search} onChange={e=>setSearch(e.target.value)} style={{padding:12,minWidth:260,border:'1px solid #ccd6e4',borderRadius:8}}/><label><input type="checkbox" checked={onlyUnmapped} onChange={e=>setOnlyUnmapped(e.target.checked)}/> Show unmapped only</label><button onClick={()=>void load()} style={{padding:10}}>Refresh</button></div>
 {message&&<p role="status" style={{padding:12,background:'#eef3fa',borderRadius:8,marginBottom:14}}>{message}</p>}
 {loading?<p>Loading driver IDs…</p>:shown.length===0?<p>No matching drivers.</p>:<div style={{display:'grid',gap:10}}>{shown.map(id=><div key={id} style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',padding:14,background:'white',border:'1px solid #dfe6ee',borderRadius:10}}><code style={{minWidth:190,overflowWrap:'anywhere'}}>{id}</code><input aria-label={'Driver name for '+id} placeholder="Enter driver name" value={drafts[id]||''} onChange={e=>setDrafts(s=>({...s,[id]:e.target.value}))} style={{flex:'1 1 220px',padding:10,border:'1px solid #ccd6e4',borderRadius:8}}/><button disabled={busy===id||!drafts[id]?.trim()||drafts[id]===mappings.find(m=>m.inspector_id===id)?.driver_name} onClick={()=>void save(id)} style={{padding:'10px 20px',border:0,borderRadius:8,background:'#2365df',color:'white',cursor:'pointer'}}> {busy===id?'Saving…':'Save name'} </button></div>)}</div>}
 <p style={{marginTop:25,fontSize:13}}>Only manager accounts can edit names. This page does not change the original Amazon inspection data or Google Sheets.</p>
 </main>;
}
