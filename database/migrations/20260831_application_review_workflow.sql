ALTER TABLE loan_applications MODIFY status ENUM('SUBMITTED','PENDING_ASSESSMENT','UNDER_REVIEW','IN_REVIEW','APPROVED','REJECTED','RETURNED_FOR_CORRECTION','CANCELLED','WITHDRAWN') NOT NULL DEFAULT 'SUBMITTED';
ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS assigned_reviewer_id CHAR(36) NULL AFTER status;
ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS review_started_at DATETIME(3) NULL AFTER assigned_reviewer_id;
ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS decision_at DATETIME(3) NULL AFTER review_started_at;
ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS review_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER decision_at;
CREATE INDEX IF NOT EXISTS idx_application_review_queue ON loan_applications(status,assigned_reviewer_id,application_date);

CREATE TABLE IF NOT EXISTS loan_rejection_reasons (
  code VARCHAR(64) NOT NULL PRIMARY KEY,
  label VARCHAR(160) NOT NULL,
  requires_explanation BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
INSERT INTO loan_rejection_reasons(code,label,requires_explanation,sort_order) VALUES
('INSUFFICIENT_CAPACITY','Insufficient repayment capacity',FALSE,10),
('INCOMPLETE_INFORMATION','Incomplete or unverifiable information',FALSE,20),
('EXTERNAL_THRESHOLD','External-loan threshold not satisfied',FALSE,30),
('EXISTING_LOAN_CONFLICT','Existing loan conflict',FALSE,40),
('DOCUMENT_FAILURE','Document verification failure',FALSE,50),
('PRODUCT_CRITERIA','Product criteria not satisfied',FALSE,60),
('SUSPECTED_DUPLICATE','Suspected duplicate application',FALSE,70),
('OTHER','Other',TRUE,80)
ON DUPLICATE KEY UPDATE label=VALUES(label),requires_explanation=VALUES(requires_explanation),active=VALUES(active),sort_order=VALUES(sort_order);

CREATE TABLE IF NOT EXISTS loan_application_decisions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  decision ENUM('APPROVED','REJECTED') NOT NULL,
  reviewer_id CHAR(36) NOT NULL,
  review_version INT UNSIGNED NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  reason_code VARCHAR(64) NULL,
  reviewer_notes TEXT NOT NULL,
  approval_terms_snapshot JSON NULL,
  revalidation_snapshot JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_application_final_decision(application_id),
  UNIQUE KEY uq_application_decision_idempotency(idempotency_key),
  INDEX idx_decision_reviewer_created(reviewer_id,created_at),
  CONSTRAINT fk_decision_application FOREIGN KEY(application_id) REFERENCES loan_applications(id),
  CONSTRAINT fk_decision_reason FOREIGN KEY(reason_code) REFERENCES loan_rejection_reasons(code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loan_application_review_actions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  action ENUM('CLAIMED') NOT NULL,
  actor_id CHAR(36) NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  resulting_version INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_review_action_idempotency(idempotency_key),
  INDEX idx_review_action_application(application_id,created_at),
  CONSTRAINT fk_review_action_application FOREIGN KEY(application_id) REFERENCES loan_applications(id)
) ENGINE=InnoDB;
