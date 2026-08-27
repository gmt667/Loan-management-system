ALTER TABLE loan_applications MODIFY status ENUM('SUBMITTED','PENDING_ASSESSMENT','UNDER_REVIEW','IN_REVIEW','APPROVED','REJECTED','RETURNED_FOR_CORRECTION','CANCELLED','WITHDRAWN','DISBURSED') NOT NULL DEFAULT 'SUBMITTED';

CREATE TABLE IF NOT EXISTS loan_disbursements (
  id CHAR(36) PRIMARY KEY,
  disbursement_reference VARCHAR(48) NOT NULL,
  application_id CHAR(36) NOT NULL,
  approval_decision_id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  status ENUM('AWAITING_DISBURSEMENT','DISBURSEMENT_IN_PROGRESS','DISBURSED','DISBURSEMENT_FAILED','DISBURSEMENT_CANCELLED') NOT NULL,
  principal_minor BIGINT UNSIGNED NOT NULL,
  disbursement_date DATE NOT NULL,
  first_repayment_due_date DATE NOT NULL,
  method ENUM('BANK_TRANSFER','MOBILE_MONEY','CASH','CHEQUE','OTHER_MANUAL') NOT NULL,
  destination_details VARCHAR(500) NOT NULL,
  external_reference VARCHAR(128) NOT NULL,
  supporting_notes TEXT NOT NULL,
  evidence_reference VARCHAR(255) NULL,
  recorded_by CHAR(36) NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  application_version INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_disbursement_reference(disbursement_reference),
  UNIQUE KEY uq_disbursement_application(application_id),
  UNIQUE KEY uq_disbursement_approval(approval_decision_id),
  UNIQUE KEY uq_disbursement_idempotency(idempotency_key),
  UNIQUE KEY uq_disbursement_external_reference(external_reference),
  INDEX idx_disbursement_queue(status,disbursement_date),
  CONSTRAINT fk_disbursement_application FOREIGN KEY(application_id) REFERENCES loan_applications(id),
  CONSTRAINT fk_disbursement_approval FOREIGN KEY(approval_decision_id) REFERENCES loan_application_decisions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS normalized_loans (
  id CHAR(36) PRIMARY KEY,
  loan_reference VARCHAR(48) NOT NULL,
  application_id CHAR(36) NOT NULL,
  disbursement_id CHAR(36) NOT NULL,
  approval_decision_id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  product_version INT UNSIGNED NOT NULL,
  status ENUM('ACTIVE','CLOSED','DEFAULTED') NOT NULL DEFAULT 'ACTIVE',
  principal_minor BIGINT UNSIGNED NOT NULL,
  outstanding_principal_minor BIGINT UNSIGNED NOT NULL,
  total_payable_minor BIGINT UNSIGNED NOT NULL,
  disbursement_date DATE NOT NULL,
  first_repayment_due_date DATE NOT NULL,
  maturity_date DATE NOT NULL,
  contract_snapshot JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_normalized_loan_reference(loan_reference),
  UNIQUE KEY uq_normalized_loan_application(application_id),
  UNIQUE KEY uq_normalized_loan_disbursement(disbursement_id),
  CONSTRAINT fk_normalized_loan_application FOREIGN KEY(application_id) REFERENCES loan_applications(id),
  CONSTRAINT fk_normalized_loan_disbursement FOREIGN KEY(disbursement_id) REFERENCES loan_disbursements(id),
  CONSTRAINT fk_normalized_loan_approval FOREIGN KEY(approval_decision_id) REFERENCES loan_application_decisions(id),
  CONSTRAINT fk_normalized_loan_product_version FOREIGN KEY(product_id,product_version) REFERENCES loan_product_versions(product_id,version)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loan_repayment_schedule (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  loan_id CHAR(36) NOT NULL,
  instalment_number SMALLINT UNSIGNED NOT NULL,
  due_date DATE NOT NULL,
  opening_principal_minor BIGINT UNSIGNED NOT NULL,
  principal_due_minor BIGINT UNSIGNED NOT NULL,
  interest_due_minor BIGINT UNSIGNED NOT NULL,
  fee_due_minor BIGINT UNSIGNED NOT NULL,
  vat_due_minor BIGINT UNSIGNED NOT NULL,
  total_due_minor BIGINT UNSIGNED NOT NULL,
  closing_principal_minor BIGINT UNSIGNED NOT NULL,
  status ENUM('UNPAID') NOT NULL DEFAULT 'UNPAID',
  UNIQUE KEY uq_schedule_instalment(loan_id,instalment_number),
  INDEX idx_schedule_due(status,due_date),
  CONSTRAINT fk_schedule_loan FOREIGN KEY(loan_id) REFERENCES normalized_loans(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loan_disbursement_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  disbursement_id CHAR(36) NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  changed_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_disbursement_history(disbursement_id,created_at),
  CONSTRAINT fk_disbursement_history FOREIGN KEY(disbursement_id) REFERENCES loan_disbursements(id)
) ENGINE=InnoDB;
