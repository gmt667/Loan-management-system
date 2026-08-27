import { writeFile } from 'node:fs/promises';

const sourceUrl = 'https://services-eu1.arcgis.com/fppoCYaq7HfVFbIV/ArcGIS/rest/services/mwi_admbnda_adm3_nso_hotosm_20230405/FeatureServer/0/query?where=1%3D1&outFields=ADM3_EN%2CADM3_PCODE%2CADM2_EN%2CADM2_PCODE&returnGeometry=false&f=json';
const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Location source returned HTTP ${response.status}`);
const payload = await response.json();
if (!Array.isArray(payload.features) || payload.features.length !== 433) {
  throw new Error(`Expected 433 administrative-level-three records; received ${payload.features?.length ?? 0}`);
}

const cityDistricts = new Map([
  ['Blantyre City', 'Blantyre'],
  ['Lilongwe City', 'Lilongwe'],
  ['Mzuzu City', 'Mzimba'],
  ['Zomba City', 'Zomba'],
]);
const districtCodes = new Map([
  ['Balaka','BALAKA'],['Blantyre','BLANTYRE'],['Chikwawa','CHIKWAWA'],['Chiradzulu','CHIRADZULU'],
  ['Chitipa','CHITIPA'],['Dedza','DEDZA'],['Dowa','DOWA'],['Karonga','KARONGA'],['Kasungu','KASUNGU'],
  ['Likoma','LIKOMA'],['Lilongwe','LILONGWE'],['Machinga','MACHINGA'],['Mangochi','MANGOCHI'],
  ['Mchinji','MCHINJI'],['Mulanje','MULANJE'],['Mwanza','MWANZA'],['Mzimba','MZIMBA'],['Neno','NENO'],
  ['Nkhatabay','NKHATA_BAY'],['Nkhotakota','NKHOTAKOTA'],['Nsanje','NSANJE'],['Ntcheu','NTCHEU'],
  ['Ntchisi','NTCHISI'],['Phalombe','PHALOMBE'],['Rumphi','RUMPHI'],['Salima','SALIMA'],
  ['Thyolo','THYOLO'],['Zomba','ZOMBA'],
]);
const legacyCodes = new Map([
  ['BLANTYRE|TA Kunthembwe','BLANTYRE_KUNTHEMBWE'],
  ['BLANTYRE|TA Machinjiri','BLANTYRE_MACHINJIRI'],
  ['LILONGWE|TA Chitukula','LILONGWE_CHITUKULA'],
  ['LILONGWE|TA Kalumba','LILONGWE_KALUMBA'],
  ['MZIMBA|TA M\'Mbelwa','MZIMBA_MMBELWA'],
  ['ZOMBA|TA Chikowi','ZOMBA_CHIKOWE'],
  ['MANGOCHI|TA Chimwala','MANGOCHI_CHIMWALA'],
  ['DEDZA|TA Kachindamoto','DEDZA_KACHINDAMOTO'],
]);
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const seenNames = new Set();
const seenCodes = new Set();
const rows = payload.features.map(({ attributes }) => {
  const sourceDistrict = attributes.ADM2_EN;
  const district = cityDistricts.get(sourceDistrict) ?? sourceDistrict;
  const parent = districtCodes.get(district);
  if (!parent) throw new Error(`Unmapped district: ${sourceDistrict}`);
  const label = attributes.ADM3_EN;
  const nameKey = `${parent}|${label.toLocaleLowerCase('en')}`;
  if (seenNames.has(nameKey)) throw new Error(`Duplicate district/name: ${parent}/${label}`);
  seenNames.add(nameKey);
  const code = legacyCodes.get(`${parent}|${label}`) ?? attributes.ADM3_PCODE;
  if (seenCodes.has(code)) throw new Error(`Duplicate code: ${code}`);
  seenCodes.add(code);
  return { code, label, parent, sourceDistrict };
}).sort((a, b) => a.parent.localeCompare(b.parent) || a.label.localeCompare(b.label));

const values = rows.map((row, index) =>
  `('TRADITIONAL_AUTHORITY',${sqlString(row.code)},${sqlString(row.label)},${sqlString(row.parent)},${(index + 1) * 10},TRUE)`
).join(',\n');
const migration = `-- NSO-sourced Malawi administrative-level-three lookup seed (see docs/MALAWI_LOCATION_LOOKUPS.md).
-- Existing lookup codes are retained for the eight records that predate this seed.
INSERT INTO location_lookups(category,code,label,parent_code,sort_order,active) VALUES
${values}
ON DUPLICATE KEY UPDATE label=VALUES(label),parent_code=VALUES(parent_code),sort_order=VALUES(sort_order),active=VALUES(active);

SET @location_unique_index_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='location_lookups' AND index_name='uq_location_category_parent_label');
SET @location_unique_index_sql = IF(@location_unique_index_exists=0,'ALTER TABLE location_lookups ADD UNIQUE KEY uq_location_category_parent_label(category,parent_code,label)','SELECT 1');
PREPARE location_unique_index_statement FROM @location_unique_index_sql;
EXECUTE location_unique_index_statement;
DEALLOCATE PREPARE location_unique_index_statement;
`;
await writeFile('database/migrations/20260828_complete_malawi_location_lookups.sql', migration, 'utf8');
console.log(`Wrote ${rows.length} verified records (${rows.length - legacyCodes.size} new identifiers).`);
