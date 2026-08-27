ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS principal_paid_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER outstanding_principal_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS interest_paid_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER principal_paid_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS fees_paid_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER interest_paid_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS vat_paid_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER fees_paid_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS total_paid_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER vat_paid_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS outstanding_interest_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER total_paid_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS outstanding_fees_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER outstanding_interest_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS outstanding_vat_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER outstanding_fees_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS total_outstanding_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER outstanding_vat_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS next_due_date DATE NULL AFTER total_outstanding_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS next_amount_due_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER next_due_date;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS paid_off_at DATETIME(3) NULL AFTER next_amount_due_minor;
ALTER TABLE normalized_loans ADD COLUMN IF NOT EXISTS repayment_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER paid_off_at;
ALTER TABLE normalized_loans MODIFY status ENUM('ACTIVE','CLOSED','PAID_OFF','DEFAULTED') NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE loan_repayment_schedule ADD COLUMN IF NOT EXISTS principal_paid_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER principal_due_minor;
ALTER TABLE loan_repayment_schedule ADD COLUMN IF NOT EXISTS interest_paid_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER interest_due_minor;
ALTER TABLE loan_repayment_schedule ADD COLUMN IF NOT EXISTS fee_paid_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER fee_due_minor;
ALTER TABLE loan_repayment_schedule ADD COLUMN IF NOT EXISTS vat_paid_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER vat_due_minor;
ALTER TABLE loan_repayment_schedule ADD COLUMN IF NOT EXISTS total_paid_minor BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER total_due_minor;
ALTER TABLE loan_repayment_schedule MODIFY status ENUM('UNPAID','PARTIALLY_PAID','PAID') NOT NULL DEFAULT 'UNPAID';

UPDATE normalized_loans l SET
  outstanding_interest_minor=(SELECT COALESCE(SUM(interest_due_minor-interest_paid_minor),0) FROM loan_repayment_schedule WHERE loan_id=l.id),
  outstanding_fees_minor=(SELECT COALESCE(SUM(fee_due_minor-fee_paid_minor),0) FROM loan_repayment_schedule WHERE loan_id=l.id),
  outstanding_vat_minor=(SELECT COALESCE(SUM(vat_due_minor-vat_paid_minor),0) FROM loan_repayment_schedule WHERE loan_id=l.id),
  total_outstanding_minor=(SELECT COALESCE(SUM(total_due_minor-total_paid_minor),0) FROM loan_repayment_schedule WHERE loan_id=l.id),
  next_due_date=(SELECT MIN(due_date) FROM loan_repayment_schedule WHERE loan_id=l.id AND status<>'PAID'),
  next_amount_due_minor=(SELECT COALESCE(total_due_minor-total_paid_minor,0) FROM loan_repayment_schedule WHERE loan_id=l.id AND status<>'PAID' ORDER BY due_date,instalment_number LIMIT 1)
WHERE total_paid_minor=0;

CREATE TABLE IF NOT EXISTS loan_repayments (
  id CHAR(36) PRIMARY KEY,
  repayment_reference VARCHAR(48) NOT NULL,
  loan_id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  disbursement_id CHAR(36) NOT NULL,
  payment_date DATE NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  method ENUM('BANK_TRANSFER','MOBILE_MONEY','CASH','CHEQUE','OTHER_MANUAL') NOT NULL,
  external_reference VARCHAR(128) NOT NULL,
  notes TEXT NOT NULL,
  recorded_by CHAR(36) NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  loan_version INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_repayment_reference(repayment_reference),
  UNIQUE KEY uq_repayment_idempotency(idempotency_key),
  UNIQUE KEY uq_repayment_external_reference(external_reference),
  INDEX idx_repayment_loan_date(loan_id,payment_date,created_at),
  CONSTRAINT fk_repayment_loan FOREIGN KEY(loan_id) REFERENCES normalized_loans(id),
  CONSTRAINT fk_repayment_disbursement FOREIGN KEY(disbursement_id) REFERENCES loan_disbursements(id)
) ENGINE=InnoDB;
ALTER TABLE loan_repayments ADD COLUMN IF NOT EXISTS remaining_balance_minor BIGINT UNSIGNED NULL AFTER loan_version;
ALTER TABLE loan_repayments ADD COLUMN IF NOT EXISTS next_due_date DATE NULL AFTER remaining_balance_minor;
ALTER TABLE loan_repayments ADD COLUMN IF NOT EXISTS next_amount_due_minor BIGINT UNSIGNED NULL AFTER next_due_date;

CREATE TABLE IF NOT EXISTS loan_repayment_allocations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  repayment_id CHAR(36) NOT NULL,
  schedule_id BIGINT UNSIGNED NOT NULL,
  vat_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
  fee_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
  interest_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
  principal_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_minor BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_repayment_schedule_allocation(repayment_id,schedule_id),
  INDEX idx_allocation_schedule(schedule_id),
  CONSTRAINT fk_allocation_repayment FOREIGN KEY(repayment_id) REFERENCES loan_repayments(id),
  CONSTRAINT fk_allocation_schedule FOREIGN KEY(schedule_id) REFERENCES loan_repayment_schedule(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS normalized_loan_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  loan_id CHAR(36) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  changed_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_normalized_loan_history(loan_id,created_at),
  CONSTRAINT fk_normalized_loan_history FOREIGN KEY(loan_id) REFERENCES normalized_loans(id)
) ENGINE=InnoDB;
