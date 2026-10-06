---
name: loan-emi-calculations
description: Compute loan EMIs, amortization schedules, interest, and prepayment effects accurately. Use for microfinance, chit funds, home/vehicle loans.
version: 1.0.0
---

# Loan / EMI calculations

Formula (reducing balance): `EMI = P·r·(1+r)^n / ((1+r)^n − 1)`, r = annual_rate/12/100, n = months.
Flat rate: interest = P·annual_rate/100·years; EMI = (P + interest)/n.

1. Confirm: principal, annual rate, tenure, flat vs reducing, processing fees, prepayments.
2. Compute with `execute_code` (Python) — never by hand — and print an amortization table (month, EMI, interest, principal, balance).
3. Round only for display (2 decimals); check that the final balance ≈ 0 and total principal = P.
4. For comparisons, compute effective annual rate (IRR of cash flows) — flat rates look cheaper than they are.
5. Save tables to CSV when asked.
