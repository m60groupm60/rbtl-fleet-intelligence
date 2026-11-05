import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { serverClient } from '@/lib/server';
export const runtime = 'nodejs';
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false,autoRefreshToken:false}});
async function manager() {
  const session = await serverClient();
  const {data:{user}} = await session.auth.getUser();
  if (!user) return null;
  const {data:profile} = await session.from('profiles').select('role').eq('id',user.id).single();
  return profile?.role === 'manager' ? user : null;
}
export async function GET() {
  if (!await manager()) return NextResponse.json({error:'Forbidden'}, {status:403});
  const db=admin();
  const {data:mappings,error:mappingError}=await db.from('driver_directory').select('inspector_id:amazon_id,driver_name,updated_at').order('driver_name');
  if(mappingError) return NextResponse.json({error:mappingError.message},{status:500});
  // Discover all known inspector IDs, not just those within the dashboard date filter.
  const ids=new Set<string>();
  for(const table of ['dvic_inspections','driver_assignments'] as const) {
    for(let offset=0;;offset+=1000) {
      const {data,error}=await db.from(table).select('inspector_id').not('inspector_id','is',null).range(offset,offset+999);
      if(error) return NextResponse.json({error:error.message},{status:500});
      for(const row of data||[]) if(row.inspector_id?.trim()) ids.add(row.inspector_id.trim());
      if((data||[]).length<1000)break;
    }
  }
  return NextResponse.json({mappings:mappings||[],ids:[...ids].sort()});
}
export async function PUT(req:NextRequest) {
  const user=await manager();
  if(!user) return NextResponse.json({error:'Forbidden'},{status:403});
  let body:unknown;
  try{body=await req.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  if(!body||typeof body!=='object')return NextResponse.json({error:'Invalid input'},{status:400});
  const record=body as Record<string,unknown>;
  const inspector_id=typeof record.inspector_id==='string'?record.inspector_id.trim():'';
  const driver_name=typeof record.driver_name==='string'?record.driver_name.trim():'';
  if(!/^[A-Za-z0-9_-]{5,80}$/.test(inspector_id)||driver_name.length<2||driver_name.length>120)
    return NextResponse.json({error:'Enter a valid Amazon ID and driver name (2–120 characters)'},{status:400});
  const db=admin();
  const {data:known,error:lookupError}=await db.from('dvic_inspections').select('inspection_id').eq('inspector_id',inspector_id).limit(1);
  if(lookupError)return NextResponse.json({error:lookupError.message},{status:500});
  if(!known?.length){const {data:assignment,error}=await db.from('driver_assignments').select('inspection_id').eq('inspector_id',inspector_id).limit(1);
    if(error)return NextResponse.json({error:error.message},{status:500});
    if(!assignment?.length)return NextResponse.json({error:'Amazon ID not found in imported inspections'},{status:400});}
  const {error}=await db.from('driver_directory').upsert({amazon_id:inspector_id,driver_name,updated_at:new Date().toISOString()},{onConflict:'amazon_id'});
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true});
}
