CREATE TABLE IF NOT EXISTS penalty_policies (
  id CHAR(36) PRIMARY KEY,
  policy_code VARCHAR(40) NOT NULL,
  policy_name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('ACTIVE','INACTIVE','ARCHIVED') NOT NULL DEFAULT 'INACTIVE',
  current_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_penalty_policy_code(policy_code),
  INDEX idx_penalty_policy_status(status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS penalty_policy_versions (
  policy_id CHAR(36) NOT NULL,
  version INT UNSIGNED NOT NULL,
  policy_name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  effective_date DATE NOT NULL,
  end_date DATE NULL,
  grace_period_days SMALLINT UNSIGNED NOT NULL,
  calculation_method ENUM('FIXED_AMOUNT','PERCENT_OVERDUE_INSTALMENT','PERCENT_OVERDUE_PRINCIPAL','PERCENT_TOTAL_OUTSTANDING') NOT NULL,
  calculation_base ENUM('NONE','OVERDUE_INSTALMENT','OVERDUE_PRINCIPAL','TOTAL_OUTSTANDING') NOT NULL,
  fixed_amount_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rate_bps INT UNSIGNED NOT NULL DEFAULT 0,
  assessment_frequency ENUM('ONCE_PER_OVERDUE_INSTALMENT','DAILY','WEEKLY','MONTHLY') NOT NULL,
  cap_type ENUM('NONE','FIXED_AMOUNT','PERCENT_ORIGINAL_PRINCIPAL','PERCENT_OVERDUE_PRINCIPAL') NOT NULL,
  cap_fixed_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cap_rate_bps INT UNSIGNED NOT NULL DEFAULT 0,
  cap_scope ENUM('PER_INSTALMENT','PER_LOAN') NULL,
  vat_treatment ENUM('NOT_APPLICABLE') NOT NULL DEFAULT 'NOT_APPLICABLE',
  partial_payment_reduces_base BOOLEAN NOT NULL,
  continues_after_maturity BOOLEAN NOT NULL,
  administrative_notes TEXT NOT NULL,
  terms_snapshot JSON NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(policy_id,version),
  INDEX idx_penalty_version_effective(effective_date,end_date),
  CONSTRAINT fk_penalty_version_policy FOREIGN KEY(policy_id) REFERENCES penalty_policies(id)
) ENGINE=InnoDB;

ALTER TABLE loan_products ADD COLUMN IF NOT EXISTS penalty_policy_id CHAR(36) NULL AFTER penalty_configuration_reference;
ALTER TABLE loan_products ADD COLUMN IF NOT EXISTS penalty_policy_version INT UNSIGNED NULL AFTER penalty_policy_id;
ALTER TABLE loan_product_versions ADD COLUMN IF NOT EXISTS penalty_policy_id CHAR(36) NULL AFTER terms;
ALTER TABLE loan_product_versions ADD COLUMN IF NOT EXISTS penalty_policy_version INT UNSIGNED NULL AFTER penalty_policy_id;
ALTER TABLE loan_product_versions ADD CONSTRAINT fk_product_version_penalty FOREIGN KEY(penalty_policy_id,penalty_policy_version) REFERENCES penalty_policy_versions(policy_id,version);
CREATE INDEX IF NOT EXISTS idx_product_penalty_assignment ON loan_products(penalty_policy_id,penalty_policy_version);
CREATE INDEX IF NOT EXISTS idx_product_version_penalty ON loan_product_versions(penalty_policy_id,penalty_policy_version);
