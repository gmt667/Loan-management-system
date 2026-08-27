# Loan product calculations

All money is stored and calculated in integer minor units. Rates and percentages use basis points (`10000` = 100%). Division is rounded to the nearest minor unit.

- **Flat rate:** `interest = principal × annual rate × term months / (10000 × 12)`.
- **Reducing balance:** equal principal is allocated across periods; each period's interest is `opening balance × annual rate / (10000 × 12)`. The last principal instalment absorbs any integer remainder.
- **Percentage fee:** `selected requested/approved amount × fee rate / 10000`. A fixed fee uses its configured minor-unit value. VAT, when enabled for that fee, is calculated on the fee. `ONCE` and `PERIODIC` are stored explicitly; this settings module does not post charges.
- **External-loan eligibility:** eligible only when `repaid percentage > configured threshold`. The default threshold is 70% (`7000` basis points), so exactly 70% remains ineligible.

The three products previously hard-coded in the interface had no calculation method. They are preserved with their exact displayed amounts, annual rates and statuses, and explicitly initialized as flat-rate products; this does not alter an existing calculation because the former screen performed none.
