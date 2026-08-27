USE loan_management_system;
CREATE TABLE IF NOT EXISTS member_directory (
  member_id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(254) NULL UNIQUE,
  email_source ENUM('MEMBER_PROVIDED','SYSTEM_GENERATED') NULL,
  primary_phone VARCHAR(32) NULL,
  secondary_phone VARCHAR(32) NULL,
  district_code VARCHAR(64) NULL,
  traditional_authority_code VARCHAR(64) NULL,
  monthly_income_minor BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS location_lookups (
  category ENUM('DISTRICT','TRADITIONAL_AUTHORITY') NOT NULL,
  code VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  parent_code VARCHAR(64) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY(category,code), INDEX idx_location_parent(category,parent_code,active)
) ENGINE=InnoDB;
INSERT IGNORE INTO member_directory(member_id,email,email_source,primary_phone,secondary_phone,district_code,traditional_authority_code)
SELECT id,NULLIF(LOWER(JSON_UNQUOTE(JSON_EXTRACT(data,'$.email'))),''),
IF(JSON_UNQUOTE(JSON_EXTRACT(data,'$.emailSource'))='SYSTEM_GENERATED','SYSTEM_GENERATED','MEMBER_PROVIDED'),
NULLIF(JSON_UNQUOTE(JSON_EXTRACT(data,'$.primaryPhone')),''),NULLIF(JSON_UNQUOTE(JSON_EXTRACT(data,'$.secondaryPhone')),''),
NULLIF(JSON_UNQUOTE(JSON_EXTRACT(data,'$.district')),''),NULLIF(JSON_UNQUOTE(JSON_EXTRACT(data,'$.traditionalAuthority')),'')
FROM records WHERE collection_name='clients';
INSERT IGNORE INTO location_lookups(category,code,label,sort_order) VALUES
('DISTRICT','BALAKA','Balaka',10),('DISTRICT','BLANTYRE','Blantyre',20),('DISTRICT','CHIKWAWA','Chikwawa',30),('DISTRICT','CHIRADZULU','Chiradzulu',40),('DISTRICT','CHITIPA','Chitipa',50),('DISTRICT','DEDZA','Dedza',60),('DISTRICT','DOWA','Dowa',70),('DISTRICT','KARONGA','Karonga',80),('DISTRICT','KASUNGU','Kasungu',90),('DISTRICT','LIKOMA','Likoma',100),('DISTRICT','LILONGWE','Lilongwe',110),('DISTRICT','MACHINGA','Machinga',120),('DISTRICT','MANGOCHI','Mangochi',130),('DISTRICT','MCHINJI','Mchinji',140),('DISTRICT','MULANJE','Mulanje',150),('DISTRICT','MWANZA','Mwanza',160),('DISTRICT','MZIMBA','Mzimba',170),('DISTRICT','NENO','Neno',180),('DISTRICT','NKHATA_BAY','Nkhata Bay',190),('DISTRICT','NKHOTAKOTA','Nkhotakota',200),('DISTRICT','NSANJE','Nsanje',210),('DISTRICT','NTCHEU','Ntcheu',220),('DISTRICT','NTCHISI','Ntchisi',230),('DISTRICT','PHALOMBE','Phalombe',240),('DISTRICT','RUMPHI','Rumphi',250),('DISTRICT','SALIMA','Salima',260),('DISTRICT','THYOLO','Thyolo',270),('DISTRICT','ZOMBA','Zomba',280);
INSERT IGNORE INTO location_lookups(category,code,label,parent_code,sort_order) VALUES
('TRADITIONAL_AUTHORITY','BLANTYRE_KUNTHEMBWE','Kunthembwe','BLANTYRE',10),('TRADITIONAL_AUTHORITY','BLANTYRE_MACHINJIRI','Machinjiri','BLANTYRE',20),
('TRADITIONAL_AUTHORITY','LILONGWE_CHITUKULA','Chitukula','LILONGWE',10),('TRADITIONAL_AUTHORITY','LILONGWE_KALUMBA','Kalumba','LILONGWE',20),
('TRADITIONAL_AUTHORITY','MZIMBA_MMBELWA','Mmbelwa','MZIMBA',10),('TRADITIONAL_AUTHORITY','ZOMBA_CHIKOWE','Chikowe','ZOMBA',10),
('TRADITIONAL_AUTHORITY','MANGOCHI_CHIMWALA','Chimwala','MANGOCHI',10),('TRADITIONAL_AUTHORITY','DEDZA_KACHINDAMOTO','Kachindamoto','DEDZA',10);
