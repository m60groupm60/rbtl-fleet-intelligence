import {google} from 'googleapis';
const sheetId=process.env.GOOGLE_SHEET_ID;
function required(name:string){const v=process.env[name];if(!v)throw new Error(`Missing ${name}`);return v}
export async function readRanges(ranges:string[]){
  if(!sheetId)throw new Error('Missing GOOGLE_SHEET_ID');
  const auth=new google.auth.JWT({email:required('GOOGLE_SERVICE_ACCOUNT_EMAIL'),key:required('GOOGLE_PRIVATE_KEY').replace(/\\n/g,'\n'),scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
  const api=google.sheets({version:'v4',auth});
  const response=await api.spreadsheets.values.batchGet({spreadsheetId:sheetId,ranges,valueRenderOption:'FORMATTED_VALUE'});
  return (response.data.valueRanges||[]).map(r=>r.values||[]) as string[][][];
}
import {ALERTS} from './alerts';
export function reg(v:string){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
export function dateKey(v:string){const s=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:''}
export type EventRow={date:string;registration:string;alert:string;count:number;severity:string};
export type DvicRow={date:string;time:string;registration:string;inspectorId:string;result:string;inspectionId:string;driverName:string};
export async function loadFleet(){
 const [rawEvents,rawDvic,rawVehicles,rawLookup]=await readRanges(["'Netradyne Data'!A2:G","'Driver Assignments'!A2:J","'Vehicle Map'!A2:B","'Driver Lookup'!A2:B"]);
 const lookup=new Map(rawLookup.map(r=>[String(r[0]||'').trim(),String(r[1]||'').trim()]));
 const vehicles=rawVehicles.map(r=>reg(r[1]||'')).filter(Boolean);
 const events:EventRow[]=rawEvents.map(r=>({date:dateKey(r[0]),registration:reg(r[2]),alert:String(r[3]||'').trim().toUpperCase(),count:Number(r[6]||0)||0,severity:String(r[5]||'')})).filter(r=>r.date&&r.registration&&r.alert);
 const dvics:DvicRow[]=rawDvic.map(r=>({date:dateKey(r[0]),time:String(r[1]||''),registration:reg(r[2]),inspectorId:String(r[3]||'').trim(),result:String(r[4]||''),inspectionId:String(r[5]||''),driverName:lookup.get(String(r[3]||'').trim())||String(r[9]||'').trim()})).filter(r=>r.date&&r.registration&&r.inspectorId);
 return {vehicles,events,dvics};
}
