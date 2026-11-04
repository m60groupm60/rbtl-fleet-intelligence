import { supabaseServer } from './supabase';
export type Profile = { id:string; role:'manager'|'driver'; display_name:string; inspector_ids:string[] };
export async function getViewer(){
  const supabase=await supabaseServer();
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user) return null;
  const {data:profile,error:profileError}=await supabase.from('profiles').select('id,role,display_name,inspector_ids').eq('id',user.id).single();
  if(profileError||!profile||!['manager','driver'].includes(profile.role))return null;
  return {user,profile:profile as Profile};
}
