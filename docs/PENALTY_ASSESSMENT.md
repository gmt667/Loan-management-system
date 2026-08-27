# Penalty assessment and posting

Assessment uses only the immutable penalty-policy version assigned to the normalized loan's exact product version. Loans without that verified relationship are skipped. Preview performs no writes; posting revalidates and inserts an atomic run and immutable `POSTED` charges.

Day zero is the contractual due date in Africa/Blantyre date-only business context. The first eligible date is due date plus grace days plus one calendar day. Weekends and holidays are not adjusted. Daily intervals occur on each eligible calendar date; weekly intervals occur every seven elapsed days; monthly intervals use calendar anniversaries with month-end clamping; once-per-instalment has one interval.

Bases are unpaid contractual instalment VAT, fees, interest and principal; unpaid instalment principal; or contractual outstanding across the loan. When partial-payment reduction is enabled, allocations with payment dates on or before the assessment date reduce the base. When disabled, a partially paid instalment uses its original contractual base, while a fully paid instalment remains ineligible. Payment allocations are never changed.

Percentage formula: `(base minor units × rate basis points + 5,000) ÷ 10,000`, using integers and half-up rounding. Fixed policies use the snapshotted fixed minor-unit amount. Penalty VAT is zero. Previously posted penalties are never included in a base and charges never compound.

Caps are computed from the snapshotted fixed cap, original principal percentage, or overdue-principal percentage. Previously posted charges in the configured per-instalment or per-loan scope reduce remaining cap room. Charges are truncated to remaining cap room and omitted when exhausted.

Historical reconstruction is limited to normalized repayments and allocations carrying reliable payment dates. Legacy JSON activity is not inferred. This module does not collect, waive, reverse, cancel, notify, create accounting entries, or allocate payments to penalties.
