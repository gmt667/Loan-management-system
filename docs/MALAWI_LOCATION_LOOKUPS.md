# Malawi District and Traditional Authority lookup

Accessed on **26 August 2026**.

The seed uses the Malawi administrative-level-three Common Operational Dataset published by the United Nations Office for the Coordination of Humanitarian Affairs (OCHA). Its layer name identifies Malawi's National Statistical Office (NSO) and Humanitarian OpenStreetMap Team as the data sources, and contains 433 records with official P-codes and explicit district relationships.

- [OCHA ArcGIS feature layer](https://services-eu1.arcgis.com/fppoCYaq7HfVFbIV/ArcGIS/rest/services/mwi_admbnda_adm3_nso_hotosm_20230405/FeatureServer/0)
- [NSO 2018 Malawi Population and Housing Census Main Report](https://cms.nsomalawi.mw/api/download/270/2018-Malawi-Population-and-Housing-Census-Main-Report.pdf), used to confirm that census reporting includes districts, TAs, STAs and urban areas.
- [UN Second Administrative Level Boundaries metadata for Malawi](https://salb.un.org/en/data/mwi), which identifies Malawi's Surveys Department / National Spatial Data Centre as the national geospatial authority.

Labels preserve the dataset's administrative prefixes (`TA` and `STA`) and official area descriptions. Bomas, towns, reserves, national parks and city areas are retained because they are explicit level-three registration areas in the source. The four city councils are grouped into the application's existing 28-district model as follows: Blantyre City → Blantyre, Lilongwe City → Lilongwe, Mzuzu City → Mzimba, and Zomba City → Zomba. No unsupported names are added.

The source contains no level-three record explicitly labelled `Senior Chief` or `SC`; those authorities remain under the source's `TA` classification rather than being re-titled without evidence.

Known source issue: the source spells `Nyika Ntational Park-Chitipa` that way. The seed preserves this source label rather than silently guessing a correction.

Run `node scripts/generate-malawi-location-seed.mjs` only when intentionally refreshing from the cited source. The script validates the expected source row count and rejects duplicate district/name or P-code pairs before regenerating the migration.
