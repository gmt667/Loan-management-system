export const REPORT_TYPES=['applications','disbursements','portfolio','contractual-repayments','penalty-payments','arrears','penalties','collections']as const;
export const safeMinor=(v:any,name='amount')=>{const n=BigInt(String(v??0));if(n<0n)throw new Error(`${name} cannot be negative.`);return n};
export const numberMinor=(v:bigint)=>{const n=Number(v);if(!Number.isSafeInteger(n))throw new Error('Report total exceeds the supported exact JSON range.');return n};
export const sumMinor=(rows:any[],key:string)=>numberMinor(rows.reduce((s,r)=>s+safeMinor(r[key]),0n));
export function parBps(numerator:any,denominator:any){const n=safeMinor(numerator),d=safeMinor(denominator);return d===0n?0:Number((n*10000n+d/2n)/d)}
export const reportDate=(v:any,name:string)=>{const s=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(`${s}T00:00:00Z`)))throw new Error(`${name} is invalid.`);return s};
export function reportRange(q:any){const businessDate=reportDate(q.businessDate,'Business date'),from=q.from?reportDate(q.from,'From date'):'1900-01-01',to=q.to?reportDate(q.to,'To date'):businessDate;if(from>to)throw new Error('From date must not be after to date.');const page=Math.max(1,Number(q.page)||1),pageSize=Math.min(100,Math.max(1,Number(q.pageSize)||25));return{businessDate,from,to,page,pageSize,offset:(page-1)*pageSize}}
export const delinquencyBucket=(d:number)=>d<=0?'DUE_TODAY':d<=7?'1_7':d<=30?'8_30':d<=60?'31_60':d<=90?'61_90':'90_PLUS';
export function csvCell(v:any){const s=String(v??'').replace(/\r?\n/g,' '),protectedValue=/^[=+\-@]/.test(s)?`'${s}`:s;return`"${protectedValue.replace(/"/g,'""')}"`}
export function toCsv(rows:any[]){if(!rows.length)return'\uFEFF';const keys=Object.keys(rows[0]);return`\uFEFF${keys.map(csvCell).join(',')}\r\n${rows.map(r=>keys.map(k=>csvCell(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(',')).join('\r\n')}`}
export const canViewReports=(role:string)=>['ADMIN','OFFICER','AUDITOR'].includes(role);
