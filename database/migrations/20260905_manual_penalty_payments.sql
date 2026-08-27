ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS penalty_payment_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER penalty_outstanding_minor;

ALTER TABLE loan_penalty_charges MODIFY status ENUM('POSTED','PARTIALLY_PAID','PAID') NOT NULL DEFAULT 'POSTED';
ALTER TABLE loan_penalty_charges ADD COLUMN IF NOT EXISTS paid_amount_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER amount_after_cap_minor;
ALTER TABLE loan_penalty_charges ADD COLUMN IF NOT EXISTS outstanding_amount_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER paid_amount_minor;
ALTER TABLE loan_penalty_charges ADD COLUMN IF NOT EXISTS payment_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER outstanding_amount_minor;
UPDATE loan_penalty_charges SET outstanding_amount_minor=amount_after_cap_minor-paid_amount_minor WHERE outstanding_amount_minor=0 AND paid_amount_minor=0 AND status='POSTED';
DROP TRIGGER IF EXISTS trg_penalty_charge_initial_balance;
CREATE TRIGGER trg_penalty_charge_initial_balance BEFORE INSERT ON loan_penalty_charges FOR EACH ROW SET NEW.outstanding_amount_minor=NEW.amount_after_cap_minor;
DROP TRIGGER IF EXISTS trg_normalized_loan_penalty_projection;
CREATE TRIGGER trg_normalized_loan_penalty_projection BEFORE UPDATE ON normalized_loans FOR EACH ROW SET NEW.penalty_outstanding_minor=(SELECT COALESCE(SUM(outstanding_amount_minor),0) FROM loan_penalty_charges WHERE loan_id=OLD.id AND status IN('POSTED','PARTIALLY_PAID'));

CREATE TABLE IF NOT EXISTS loan_penalty_payments (
  id CHAR(36) PRIMARY KEY,
  payment_reference VARCHAR(52) NOT NULL,
  loan_id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  payment_date DATE NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  method ENUM('BANK_TRANSFER','MOBILE_MONEY','CASH','CHEQUE','OTHER_MANUAL') NOT NULL,
  external_reference VARCHAR(128) NULL,
  notes VARCHAR(5000) NOT NULL,
  recorded_by CHAR(36) NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  loan_version INT UNSIGNED NOT NULL,
  penalty_outstanding_before_minor BIGINT UNSIGNED NOT NULL,
  penalty_outstanding_after_minor BIGINT UNSIGNED NOT NULL,
  contractual_outstanding_snapshot_minor BIGINT UNSIGNED NOT NULL,
  status ENUM('COMPLETED') NOT NULL DEFAULT 'COMPLETED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_penalty_payment_reference(payment_reference),
  UNIQUE KEY uq_penalty_payment_idempotency(idempotency_key),
  UNIQUE KEY uq_penalty_payment_external_reference(external_reference),
  INDEX idx_penalty_payment_loan_date(loan_id,payment_date,created_at),
  INDEX idx_penalty_payment_member(member_id,created_at),
  CONSTRAINT fk_penalty_payment_loan FOREIGN KEY(loan_id) REFERENCES normalized_loans(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loan_penalty_payment_allocations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id CHAR(36) NOT NULL,
  charge_id CHAR(36) NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  charge_outstanding_before_minor BIGINT UNSIGNED NOT NULL,
  charge_outstanding_after_minor BIGINT UNSIGNED NOT NULL,
  charge_status_before ENUM('POSTED','PARTIALLY_PAID','PAID') NOT NULL,
  charge_status_after ENUM('POSTED','PARTIALLY_PAID','PAID') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_penalty_payment_charge(payment_id,charge_id),
  INDEX idx_penalty_allocation_charge(charge_id,created_at),
  CONSTRAINT fk_penalty_allocation_payment FOREIGN KEY(payment_id) REFERENCES loan_penalty_payments(id),
  CONSTRAINT fk_penalty_allocation_charge FOREIGN KEY(charge_id) REFERENCES loan_penalty_charges(id),
  CONSTRAINT chk_penalty_allocation_positive CHECK(amount_minor>0),
  CONSTRAINT chk_penalty_allocation_balance CHECK(charge_outstanding_after_minor<=charge_outstanding_before_minor AND amount_minor=charge_outstanding_before_minor-charge_outstanding_after_minor)
) ENGINE=InnoDB;
