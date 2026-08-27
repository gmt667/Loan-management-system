import 'dotenv/config';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { pool } from './db.js';

after(async () => { await pool.end(); });

test('review schema contains queue, immutable decision and idempotency controls', async () => {
  const [columns] = await pool.query<any[]>("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='loan_applications' AND column_name IN ('assigned_reviewer_id','review_started_at','decision_at','review_version')");
  const [indexes] = await pool.query<any[]>("SELECT DISTINCT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='loan_application_decisions' AND index_name IN ('uq_application_final_decision','uq_application_decision_idempotency')");
  assert.equal(columns.length, 4);
  assert.equal(indexes.length, 2);
});

test('configured rejection reasons are unique and include Other explanation control', async () => {
  const [reasons] = await pool.query<any[]>('SELECT code,requires_explanation FROM loan_rejection_reasons WHERE active=TRUE ORDER BY sort_order');
  assert.ok(reasons.length >= 8);
  assert.equal(new Set(reasons.map(row => row.code)).size, reasons.length);
  assert.equal(Number(reasons.find(row => row.code === 'OTHER')?.requires_explanation), 1);
});
