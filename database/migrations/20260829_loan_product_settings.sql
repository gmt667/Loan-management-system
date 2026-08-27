CREATE TABLE IF NOT EXISTS loan_products (
  id CHAR(36) NOT NULL PRIMARY KEY,
  product_code VARCHAR(40) NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  min_amount_minor BIGINT UNSIGNED NOT NULL,
  max_amount_minor BIGINT UNSIGNED NOT NULL,
  annual_interest_rate_bps INT UNSIGNED NOT NULL,
  interest_method ENUM('FLAT_RATE','REDUCING_BALANCE') NOT NULL,
  repayment_frequency ENUM('WEEKLY','FORTNIGHTLY','MONTHLY','QUARTERLY') NOT NULL,
  min_periods SMALLINT UNSIGNED NOT NULL,
  max_periods SMALLINT UNSIGNED NOT NULL,
  insurance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  insurance_fee_type ENUM('FIXED','PERCENTAGE') NOT NULL DEFAULT 'PERCENTAGE',
  insurance_fixed_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
  insurance_percentage_bps INT UNSIGNED NOT NULL DEFAULT 0,
  insurance_calculation_base ENUM('REQUESTED','APPROVED') NOT NULL DEFAULT 'APPROVED',
  insurance_charge_timing ENUM('ONCE','PERIODIC') NOT NULL DEFAULT 'ONCE',
  insurance_vat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  administration_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  administration_fee_type ENUM('FIXED','PERCENTAGE') NOT NULL DEFAULT 'PERCENTAGE',
  administration_fixed_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
  administration_percentage_bps INT UNSIGNED NOT NULL DEFAULT 0,
  administration_calculation_base ENUM('REQUESTED','APPROVED') NOT NULL DEFAULT 'APPROVED',
  administration_charge_timing ENUM('ONCE','PERIODIC') NOT NULL DEFAULT 'ONCE',
  administration_vat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  vat_rate_bps INT UNSIGNED NOT NULL DEFAULT 1650,
  penalty_configuration_reference VARCHAR(128) NULL,
  grace_period_days SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  external_loan_repayment_threshold_bps INT UNSIGNED NOT NULL DEFAULT 7000,
  status ENUM('ACTIVE','INACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  effective_date DATE NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_loan_products_code(product_code),
  INDEX idx_loan_products_status_effective(status,effective_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loan_product_versions (
  product_id CHAR(36) NOT NULL,
  version INT UNSIGNED NOT NULL,
  terms JSON NOT NULL,
  changed_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(product_id,version),
  CONSTRAINT fk_loan_product_versions_product FOREIGN KEY(product_id) REFERENCES loan_products(id)
) ENGINE=InnoDB;

INSERT IGNORE INTO loan_products(id,product_code,product_name,description,min_amount_minor,max_amount_minor,annual_interest_rate_bps,interest_method,repayment_frequency,min_periods,max_periods,status,effective_date) VALUES
('00000000-0000-4000-8000-000000000001','CGB','Commercial Growth Bridge','Migrated from the original Loan Products screen.',1000000,50000000,1250,'FLAT_RATE','MONTHLY',1,36,'ACTIVE','2026-01-01'),
('00000000-0000-4000-8000-000000000002','SEF','SME Expansion Fund','Migrated from the original Loan Products screen.',500000,10000000,1500,'FLAT_RATE','MONTHLY',1,24,'ACTIVE','2026-01-01'),
('00000000-0000-4000-8000-000000000003','PAL','Personal Asset Loan','Migrated from the original Loan Products screen.',100000,2500000,1800,'FLAT_RATE','MONTHLY',1,12,'INACTIVE','2026-01-01');

INSERT IGNORE INTO loan_product_versions(product_id,version,terms,changed_by)
SELECT id,version,JSON_OBJECT('productCode',product_code,'productName',product_name,'minAmountMinor',min_amount_minor,'maxAmountMinor',max_amount_minor,'annualInterestRateBps',annual_interest_rate_bps,'interestMethod',interest_method,'repaymentFrequency',repayment_frequency,'minPeriods',min_periods,'maxPeriods',max_periods,'status',status,'effectiveDate',DATE_FORMAT(effective_date,'%Y-%m-%d')),created_by
FROM loan_products;
