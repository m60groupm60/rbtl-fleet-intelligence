import {NextRequest,NextResponse} from 'next/server';
import {dashboardData} from '@/lib/data';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{const result=await dashboardData(request.nextUrl.searchParams);return NextResponse.json(result.status===200?result.data:{error:result.error},{status:result.status,headers:{'Cache-Control':'private, no-store'}})}catch(e){console.error('Dashboard error',e);return NextResponse.json({error:'Unable to load fleet data. Check configuration and sheet access.'},{status:500})}}
