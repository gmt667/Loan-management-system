import { randomBytes } from 'node:crypto';
export const EMAIL_SOURCE_VALUES = ['MEMBER_PROVIDED','SYSTEM_GENERATED'] as const;
export const EMPLOYMENT_VALUES = ['EMPLOYED','SELF_EMPLOYED','UNEMPLOYED','STUDENT','RETIRED','OTHER'] as const;
export const KIN_RELATIONSHIPS = ['SPOUSE','FATHER','MOTHER','BROTHER','SISTER','SON','DAUGHTER','UNCLE','AUNT','COUSIN','GUARDIAN','FRIEND','OTHER'] as const;
export function normalizePhone(value: unknown) {
  let phone=String(value||'').trim().replace(/[\s()-]/g,'');
  if(/^0[89]\d{8}$/.test(phone)) phone=`+265${phone.slice(1)}`;
  else if(/^265[89]\d{8}$/.test(phone)) phone=`+${phone}`;
  if(!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Use a valid Malawi or international phone number, for example +265991234567.');
  return phone;
}
export function toIncomeMinor(value: unknown) {
  const text=String(value??'').trim(); if(!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Monthly income must be a non-negative amount with at most two decimals.');
  const [whole,fraction='']=text.split('.'); const result=Number(BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2))); if(!Number.isSafeInteger(result))throw new Error('Monthly income is outside the supported range.'); return result;
}
const clean=(v:unknown,max=255)=>String(v||'').trim().slice(0,max);
export function generateInternalEmail(nationalId: string) { const key=nationalId.toLowerCase().replace(/[^a-z0-9]/g,'').slice(-12)||'member'; return `${key}.${randomBytes(5).toString('hex')}@members.giantfluid.invalid`; }
export function validateMember(input:any, generatedEmail?:string) {
  const required=['firstName','lastName','idNumber','primaryPhone','secondaryPhone','district','traditionalAuthority','villageArea','physicalAddress','employmentStatus','nextOfKin'];
  const missing=required.filter(field=>field==='nextOfKin'?!input.nextOfKin:!clean(input[field])); if(missing.length)throw new Error(`Missing required member fields: ${missing.join(', ')}.`);
  const emailSource=EMAIL_SOURCE_VALUES.includes(input.emailSource)?input.emailSource:'MEMBER_PROVIDED';
  const email=emailSource==='SYSTEM_GENERATED'?(generatedEmail||generateInternalEmail(clean(input.idNumber))):clean(input.email,254).toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('A valid member email is required.');
  const employmentStatus=clean(input.employmentStatus).toUpperCase(); if(!EMPLOYMENT_VALUES.includes(employmentStatus as any))throw new Error('Invalid employment status.');
  const employment=input.employmentDetails||{}; if(employmentStatus==='EMPLOYED'){
    const employedRequired=['employerName','employerAddress','employerPhone','employerEmail','jobTitle','department','employmentLength','employmentType','monthlyIncome','supervisorContact','workLocation'];
    const absent=employedRequired.filter(k=>!clean(employment[k]??input[k])); if(absent.length)throw new Error(`Missing employed-member fields: ${absent.join(', ')}.`);
    normalizePhone(employment.employerPhone||input.employerPhone); if(!/^\S+@\S+\.\S+$/.test(clean(employment.employerEmail||input.employerEmail)))throw new Error('A valid employer email is required.');
  }
  if(employmentStatus==='OTHER'&&!clean(employment.otherEmploymentStatus||input.otherEmploymentStatus))throw new Error('Specify the other employment status.');
  const kin=input.nextOfKin||{}; const relationship=clean(kin.relationship).toUpperCase(); if(!KIN_RELATIONSHIPS.includes(relationship as any))throw new Error('Select a valid next-of-kin relationship.'); if(relationship==='OTHER'&&!clean(kin.relationshipOther))throw new Error('Specify the next-of-kin relationship.');
  if(!clean(kin.fullName)||!clean(kin.phoneNumber)||!clean(kin.address))throw new Error('Next-of-kin name, phone and address are required.');
  return {...input,firstName:clean(input.firstName),lastName:clean(input.lastName),idNumber:clean(input.idNumber,40).toUpperCase(),primaryPhone:normalizePhone(input.primaryPhone),phone:normalizePhone(input.primaryPhone),secondaryPhone:normalizePhone(input.secondaryPhone),email,emailSource,district:clean(input.district,64),traditionalAuthority:clean(input.traditionalAuthority,64),villageArea:clean(input.villageArea),physicalAddress:clean(input.physicalAddress,1000),employmentStatus,monthlyIncomeMinor:toIncomeMinor(employment.monthlyIncome??input.monthlyIncome??0),nextOfKin:{...kin,relationship,phoneNumber:normalizePhone(kin.phoneNumber)}};
}
