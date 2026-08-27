# Penalty settings

This module configures and versions penalty rules only. It does not assess, post, waive, collect, reverse, or compound penalties.

Supported methods are fixed amount, percentage of the overdue instalment, percentage of overdue principal, and percentage of total outstanding contractual balance. Percentage rates use basis points and fixed amounts use MWK minor units. Previously charged penalties are never a calculation base.

Assessment frequencies are once per overdue instalment, daily elapsed intervals, weekly elapsed seven-day intervals, and monthly calendar anniversaries. Day zero is the contractual due date. The first theoretical assessment date is the due date plus the configured calendar-day grace period plus one day. Partial intervals would not be assessed. Dates use Africa/Blantyre business context with date-only storage; weekends and public holidays are not adjusted because no holiday calendar exists.

Caps may be absent, fixed, a percentage of original principal, or a percentage of overdue principal, and must explicitly apply per instalment or across the loan. Future assessment should round percentage results to the nearest minor unit, with half units rounded up using exact integer arithmetic.

Every financially significant change creates a new immutable version. Product assignment references an exact policy version and creates a new product version containing the immutable penalty snapshot. Existing applications and loans retain their existing snapshots. Null legacy references are preserved and ambiguous legacy text references are not migrated automatically.

Penalty VAT is unsupported and stored only as `NOT_APPLICABLE`. Compounding, penalty-on-penalty, public-holiday adjustment, and actual penalty assessment are unsupported.
