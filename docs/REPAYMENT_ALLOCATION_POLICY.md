# Manual repayment allocation policy

This policy was introduced on 2026-08-27 because the repository had no documented allocation or unapplied-credit policy.

Manual repayments are applied only to contractual instalments due on or before the payment date. The oldest due instalment is processed first. Within each instalment the order is VAT, fees, interest, then principal. Partial payments stop at the last component reached; a payment may cover multiple due instalments.

Payments greater than the exact due-and-unpaid amount are rejected. Future instalments cannot be prepaid, and excess funds are not retained as credit. All values use integer minor units. Contractual schedule amounts remain immutable; paid component columns and allocation rows hold repayment activity separately.
