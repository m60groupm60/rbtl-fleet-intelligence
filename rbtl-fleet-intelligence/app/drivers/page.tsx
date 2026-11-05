import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/server';
import DriverManager from '@/components/DriverManager';
export default async function DriversPage(){
 const db=await serverClient(); const {data:{user}}=await db.auth.getUser();
 if(!user)redirect('/login');
 const {data:profile}=await db.from('profiles').select('role').eq('id',user.id).single();
 if(profile?.role!=='manager')redirect('/dashboard');
 return <DriverManager/>;
}
