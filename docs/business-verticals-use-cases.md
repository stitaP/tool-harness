# Business Verticals — Complete Use Case Catalog

> **341 tools across 40 categories.** Every tool below has a real implementation.
> SLMs pick the right tool — tools do the math, manage the data, generate the output.

---

## PART A: Financial Scenario Calculator (9 Tools)

### Use Case 1: Home Loan Affordability Check
**Who:** First-time home buyer earning ₹12L/year
**SLM Prompt:** "I earn ₹12L per year. Can I afford a ₹50L home loan at 8.5% for 20 years?"
**Tool Chain:** `fin.calc.loan` → `fin.calc.tax`
**Output:**
- EMI: ₹43,391 (36% of income — stretched)
- Total interest: ₹54.1L over 20 years
- Tax benefit: ₹1.05L/year under Section 24 + 80C
- Recommendation: "Affordable if you have ₹15L down payment. Tax saving offsets 25% of interest."

### Use Case 2: Prepayment Impact Analysis
**Who:** Home loan borrower with ₹2L annual bonus
**SLM Prompt:** "I have a ₹40L loan at 8.5% for 20 years. If I prepay ₹2L every year, how much do I save?"
**Tool Chain:** `fin.calc.loan` (with prepayment) → `fin.calc.loan` (without)
**Output:**
- Original tenure: 240 months → New tenure: 168 months
- Months saved: 72 (6 years!)
- Interest saved: ₹18.7L
- New payoff date: March 2033 instead of March 2039

### Use Case 3: SIP Step-Up Retirement Planning
**Who:** 28-year-old wanting ₹5Cr by age 55
**SLM Prompt:** "I'm 28. I want ₹5 crore by 55. Start with ₹10,000/month SIP with 10% annual step-up."
**Tool Chain:** `fin.calc.goal` → `fin.calc.sip`
**Output:**
- Monthly investment: ₹10,000 (with 10% step-up)
- At 12% return: ₹5.2Cr achieved ✅
- Year-wise wealth curve showing crossover at year 22
- Feasibility: "Easy — within 10% of income"

### Use Case 4: Tax Regime Comparison
**Who:** Salaried employee with home loan and investments
**SLM Prompt:** "I earn ₹18L. I have ₹1.5L in 80C, ₹2L home loan interest, ₹25K health insurance. Which regime is better?"
**Tool Chain:** `fin.calc.tax`
**Output:**
- Old regime tax: ₹2,15,600
- New regime tax: ₹1,45,600
- **New regime saves ₹70,000/year**
- Breakdown: Even with deductions, new regime wins at ₹18L income

### Use Case 5: FD vs SIP vs PPF Comparison
**Who:** Conservative investor with ₹10L to invest for 10 years
**SLM Prompt:** "I have ₹10 lakh. Compare FD (7.5%), SIP (12%), and PPF (7.1%) for 10 years."
**Tool Chain:** `fin.calc.compare` → `fin.calc.fd` + `fin.calc.sip` + `fin.calc.goal`
**Output:**

| Option | Invested | Maturity | Returns | Risk |
|--------|----------|----------|---------|------|
| FD | ₹10,00,000 | ₹20,61,032 | 106% | None |
| SIP | ₹10,00,000 | ₹23,23,391 | 132% | Medium |
| PPF | ₹10,00,000 | ₹19,73,543 | 97% | None |

**Winner: SIP** (highest returns) | **Safest: FD** (guaranteed)

### Use Case 6: Stamp Duty Calculator for Property Purchase
**Who:** Buying ₹85L flat in Bangalore
**SLM Prompt:** "I'm buying a flat for ₹85 lakh in Bangalore. What's the stamp duty?"
**Tool Chain:** `fin.calc.stamp_duty` → `fin.calc.loan`
**Output:**
- Stamp duty (5.6%): ₹4,76,000
- Registration (1%): ₹85,000
- Total: ₹5,61,000
- This is additional to the flat cost — budget ₹90.6L total

### Use Case 7: SWP Retirement Income Planning
**Who:** Retiree with ₹1Cr corpus wanting ₹40,000/month
**SLM Prompt:** "I have ₹1 crore. I need ₹40,000/month. At 8% return, how long will it last?"
**Tool Chain:** `fin.calc.swp`
**Output:**
- Duration: 31 years 4 months
- Total withdrawn: ₹1,49,60,000
- Total growth: ₹49,60,000
- "Your corpus will outlast you comfortably"

### Use Case 8: RD vs FD for Monthly Saver
**Who:** Salaried person wanting to save ₹5,000/month
**SLM Prompt:** "I can save ₹5,000/month. Should I do RD or FD for 3 years at 7%?"
**Tool Chain:** `fin.calc.rd` → `fin.calc.fd`
**Output:**
- RD maturity: ₹1,96,298 (deposited ₹1,80,000)
- FD (if I invest ₹1.8L lump sum): ₹2,22,028
- **FD earns ₹25,730 more** — but RD enforces discipline

### Use Case 9: Child Education Goal Planning
**Who:** Parent with 5-year-old child needing ₹50L for college at 18
**SLM Prompt:** "My child is 5. I need ₹50 lakh for engineering college when she's 18."
**Tool Chain:** `fin.calc.goal`
**Output:**
- Monthly investment needed: ₹12,500
- Expected return: 12% (moderate risk)
- Total invested: ₹19.5L → Grows to ₹50L
- Feasibility: "Possible — within 15% of ₹1L monthly income"

### Use Case 10: Business Loan EMI Planning
**Who:** Small business owner needing ₹20L machinery loan
**SLM Prompt:** "I need ₹20 lakh for machinery. Bank offers 12% for 5 years. What's the EMI?"
**Tool Chain:** `fin.calc.loan`
**Output:**
- EMI: ₹44,489/month
- Total interest: ₹6,69,340
- Total cost: ₹26,69,340
- "Consider 7-year tenure (₹38,900 EMI) if cash flow is tight"

### Use Case 11: Investment Portfolio Rebalancing
**Who:** Investor with ₹50L across equity, debt, gold
**SLM Prompt:** "I have ₹30L in equity MFs, ₹15L in FDs, ₹5L in gold. Is this balanced for my age (40)?"
**Tool Chain:** `fin.calc.sip` + `fin.calc.fd` + `fin.calc.compare`
**Output:**
- Current allocation: 60% equity, 30% debt, 10% gold
- Recommended (age 40, moderate): 60% equity, 30% debt, 10% gold
- "Your allocation is already optimal for your age"

### Use Case 12: EMI vs Full Payment Decision
**Who:** Car buyer deciding between loan and full payment
**SLM Prompt:** "Should I take a ₹10L car loan at 9% for 5 years or pay full?"
**Tool Chain:** `fin.calc.loan` + `fin.calc.sip` (opportunity cost)
**Output:**
- Loan EMI: ₹20,758, total interest: ₹2,45,480
- Opportunity cost: If you invest ₹10L in SIP at 12%, you earn ₹7.95L in 5 years
- **Take the loan** — SIP returns > loan interest by ₹5.5L

---

## PART B: Chit Fund Management (9 Tools)

### Use Case 13: Create a 25-Member Chit Group
**Who:** Chit fund foreman starting a new group
**SLM Prompt:** "Create a ₹1 lakh chit with 25 members. State: Karnataka."
**Tool Chain:** `chit.group.create` → `chit.compliance.check`
**Output:**
- Monthly contribution: ₹4,000 per member
- Foreman commission: ₹5,000/month (5%)
- Duration: 25 months
- Compliance: ✅ Within Karnataka limit (₹5L)
- Registration required with Registrar of Chits

### Use Case 14: Record and Close Monthly Bidding
**Who:** Foreman conducting monthly auction
**SLM Prompt:** "Close this month's bidding. Raju bid ₹85,000, Meena bid ₹87,000, Kumar bid ₹83,000."
**Tool Chain:** `chit.round.bid` (×3) → `chit.round.close`
**Output:**
- Winner: Kumar at ₹83,000 (17% discount)
- Prize money: ₹83,000
- Commission: ₹5,000
- Dividend per member: ₹500
- "Kumar gets ₹83,000, each member gets ₹500 dividend"

### Use Case 15: Monthly Collection Tracking
**Who:** Foreman collecting monthly contributions
**SLM Prompt:** "Raju paid ₹4,000 by UPI. Meena paid by cheque. Kumar hasn't paid yet."
**Tool Chain:** `chit.collection.record` (×2) → `chit.member.statement`
**Output:**
- Collected: ₹8,000 (2 members)
- Pending: ₹4,000 (Kumar)
- Collection rate: 67%
- Warning: Kumar has now missed 2 consecutive payments

### Use Case 16: Member Statement Generation
**Who:** Member requesting their statement
**SLM Prompt:** "Generate statement for Raju (MEM-001) in group CHIT-001"
**Tool Chain:** `chit.member.statement`
**Output:**
```
Rajesh Kumar — Group: Premium Chit ₹1L
Total contributed: ₹48,000 (12 months)
Total dividends received: ₹6,000
Prize won: ₹83,000 (Month 8)
Net position: +₹41,000 (profit)
Standing: Contributing (Round 13 of 25)
```

### Use Case 17: Foreman Commission Report
**Who:** Chit fund company owner reviewing earnings
**SLM Prompt:** "Show me all commission earned this year across all groups"
**Tool Chain:** `chit.foreman.report` → `chit.dashboard`
**Output:**
- Total commission earned: ₹3,60,000
- From 3 groups × 12 months × ₹10,000 average
- Default rate: 4.2% (1 member across all groups)
- Net profit after expenses: ₹2,85,000

### Use Case 18: Regulatory Compliance Check
**Who:** New chit fund foreman
**SLM Prompt:** "Is my ₹2 lakh chit group legal in Tamil Nadu?"
**Tool Chain:** `chit.compliance.check`
**Output:**
- State limit: ₹10,00,000 ✅
- Your chit value: ₹2,00,000 ✅
- Required: Registration Certificate, Surety Bond (₹2L), Foreman License
- Bond required: ₹2,00,000
- Compliance score: 85/100
- ⚠️ Missing: Annual audit report

### Use Case 19: Default Notice Generation
**Who:** Foreman dealing with defaulter
**SLM Prompt:** "Kumar has missed rounds 10 and 11. Send a final warning."
**Tool Chain:** `chit.default.notice`
**Output (WhatsApp-ready):**
```
🔴 Chit Fund Payment Notice

Dear Kumar,

Group: Premium Chit ₹1L
Missed Rounds: 10, 11
Outstanding: ₹8,000
Penalty: ₹200

🔴 This is a FINAL WARNING. Please clear dues immediately.

— Premium Chit Foreman
```

### Use Case 20: Chit Fund Dashboard
**Who:** Company owner with 5 active chit groups
**SLM Prompt:** "Show me the complete dashboard for all my chit groups"
**Tool Chain:** `chit.dashboard`
**Output:**
- Total groups: 5 (4 active, 1 completed)
- Total members: 125
- Collection rate this month: 92%
- Total disbursements this month: ₹15,00,000
- Commission earned: ₹75,000
- Default rate: 3.2%
- Top performing group: "Golden Chit" (98% collection rate)

### Use Case 21: Dividend Optimization Analysis
**Who:** Member deciding whether to bid high or low
**SLM Prompt:** "If I bid ₹80,000 vs ₹85,000, how does it affect my dividend?"
**Tool Chain:** `chit.round.close` (simulated with both bids)
**Output:**
- Bid ₹80,000: Dividend ₹700/member, you save ₹3,000 extra
- Bid ₹85,000: Dividend ₹500/member, you save ₹2,000 less
- **Bid ₹80,000** if you need the money — the ₹500 less dividend per member costs you only ₹12,500 total, but you get ₹5,000 more prize money

---

## PART C: Real Estate Company (10 Tools)

### Use Case 22: New Project Cost Estimation
**Who:** Small builder considering a 2-acre apartment project
**SLM Prompt:** "I'm looking at 2 acres in Whitefield, Bangalore. 14 floors, 2&3 BHK. Construction cost ₹2,800/sqft. Selling at ₹7,500/sqft."
**Tool Chain:** `re.cost.estimate` → `re.project.create`
**Output:**
- Total area: 54,432 sqft × 14 floors = 7,62,048 sqft
- Total units: ~635 (at 1200 sqft avg)
- Total cost: ₹321 Cr
- Total revenue: ₹571 Cr
- Net profit: ₹250 Cr (43.8% margin)
- Breakeven: 340 units (54% sell-through)
- **Verdict: Highly profitable if 60%+ units sell**

### Use Case 23: Unit Pricing Engine
**Who:** Builder pricing 200 apartments across floors and facings
**SLM Prompt:** "Price all units. Base ₹7,500/sqft. Floor rise ₹50/sqft per floor. East facing +3%, South facing -2%."
**Tool Chain:** `re.unit.pricing`
**Output:**
- Ground floor, South: ₹7,350/sqft
- 7th floor, East: ₹7,950/sqft (base + floor rise + facing)
- 14th floor, East: ₹8,300/sqft (premium penthouse pricing)
- Revenue range: ₹88.2L to ₹1.0Cr per unit
- Total revenue: ₹571 Cr

### Use Case 24: Sales Pipeline Management
**Who:** Sales head tracking 200 units across 3 months
**SLM Prompt:** "Show me the sales pipeline for Prestige Heights"
**Tool Chain:** `re.sales.pipeline`
**Output:**
```
Pipeline Funnel:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Leads:        450  ████████████████  100%
Visited:      280  ████████████      62%
Interested:   180  ████████          40%
Negotiating:   95  ████              21%
Booked:        62  ██                14%
Registered:    45  █                 10%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Revenue booked: ₹285 Cr / ₹571 Cr target (50%)
Conversion rate: 14% (leads to bookings)
```

### Use Case 25: CRM Follow-up System
**Who:** Sales team needing daily follow-up list
**SLM Prompt:** "Who do I need to follow up with today?"
**Tool Chain:** `re.crm.followup`
**Output:**
```
Today's Follow-ups (Sep 1, 2026):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 OVERDUE (3):
  1. Mr. Sharma — Interested since Aug 20, no response to 3 calls
  2. Mrs. Patel — Visited Aug 25, promised callback, didn't
  3. Mr. Reddy — Negotiating on 3BHK, needs price confirmation

📅 TODAY (2):
  4. Mr. Kumar — Site visit at 11 AM
  5. Mrs. Iyer — Final discussion on payment plan

🔥 HOT LEADS (5):
  - 2 customers comparing with Brigade Orchid
  - 3 customers need loan approval confirmation

💰 LOST RECOVERY (1):
  - Mr. Gupta — Lost to Sobha Dream Acres on price
```

### Use Case 26: Cash Flow Management
**Who:** Builder managing construction + sales cash flow
**SLM Prompt:** "Show me the cash flow for Prestige Heights this quarter"
**Tool Chain:** `re.cashflow.report`
**Output:**
```
Cash Flow — Q3 2026:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Opening balance: ₹12.5 Cr
INFLOWS:
  Customer payments:     ₹45.0 Cr
  Bank disbursement:     ₹20.0 Cr
  Total inflow:          ₹65.0 Cr
OUTFLOWS:
  Construction:          ₹38.0 Cr
  Land payment:          ₹10.0 Cr
  Approvals:              ₹2.5 Cr
  Marketing:              ₹3.0 Cr
  Staff & admin:          ₹1.5 Cr
  Total outflow:         ₹55.0 Cr
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Net cash flow:          +₹10.0 Cr
Closing balance:        ₹22.5 Cr
```

### Use Case 27: Profitability Analysis
**Who:** Builder calculating project ROI
**SLM Prompt:** "What's the actual profit on Prestige Heights?"
**Tool Chain:** `re.profitability`
**Output:**
```
Profitability Report — Prestige Heights:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total revenue:         ₹571 Cr
Total cost:            ₹321 Cr
Gross profit:          ₹250 Cr (43.8%)
Brokerage paid:        ₹14.3 Cr (2.5%)
Net profit:            ₹235.7 Cr (41.3%)
ROI:                   73.4%
IRR:                   28.2%
Payback period:        18 months
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cost breakdown:
  Land:          ₹150 Cr  (46.7%)
  Construction:  ₹108 Cr  (33.6%)
  Approvals:      ₹12 Cr  (3.7%)
  Marketing:      ₹18 Cr  (5.6%)
  Finance:        ₹18 Cr  (5.6%)
  Other:          ₹15 Cr  (4.7%)
```

### Use Case 28: RERA Compliance Tracking
**Who:** Builder needing to track 15 approvals across projects
**SLM Prompt:** "What approvals are pending for Prestige Heights?"
**Tool Chain:** `re.compliance.track`
**Output:**
```
Compliance Status — Prestige Heights:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RERA: ✅ Registered (KA-RERA-PRM-2026-001)
Plan approval: ✅ Received
Environmental: ✅ Received
Fire NOC: ⏳ Applied (21 days pending)
Occupancy certificate: ❌ Not applied (expected Dec 2026)
Completion certificate: ❌ Not applied

⚠️ UPCOMING EXPIRIES:
  - Environmental clearance: 45 days left
  - Plan approval: 180 days left

Compliance score: 78/100
Violations: None
```

### Use Case 29: Revenue Forecast
**Who:** Builder projecting sales for next 6 months
**SLM Prompt:** "When will I sell all 635 units at current pace?"
**Tool Chain:** `re.forecast.revenue`
**Output:**
```
Revenue Forecast — Prestige Heights:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current velocity: 28 units/month
Remaining units: 573
Projected completion: Month 21 (March 2028)

Monthly forecast:
  Oct 2026: 28 units → ₹21 Cr
  Nov 2026: 26 units → ₹19.5 Cr
  Dec 2026: 25 units → ₹18.8 Cr
  ...
  Mar 2028: 5 units → ₹3.8 Cr

Confidence: HIGH (9 months of data)
```

### Use Case 30: Company Dashboard
**Who:** Builder owner with 3 projects
**SLM Prompt:** "Show me the complete picture of all my projects"
**Tool Chain:** `re.dashboard`
**Output:**
```
Company Dashboard — ABC Builders:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Projects: 3 (2 active, 1 completed)
Total units: 850 | Sold: 612 (72%)
Total revenue: ₹425 Cr
Total cost: ₹285 Cr
Net profit: ₹140 Cr (33%)

Project breakdown:
  1. Prestige Heights: 45/200 sold (22.5%) — Construction
  2. Green Valley: 367/450 sold (81.6%) — Sales
  3. Sunrise Apartments: 200/200 (100%) — Completed ✅

Inventory value: ₹185 Cr (unsold units)
Approvals pending: 4
```

### Use Case 31: What-If Pricing Analysis
**Who:** Builder deciding between ₹7,000 vs ₹8,000 vs ₹9,000/sqft
**SLM Prompt:** "If I price at ₹7K vs ₹8K vs ₹9K, what changes?"
**Tool Chain:** `re.cost.estimate` (×3)
**Output:**

| Scenario | Price/sqft | Revenue | Profit | Breakeven |
|----------|-----------|---------|--------|-----------|
| Conservative | ₹7,000 | ₹494 Cr | ₹173 Cr (35%) | 490 units (77%) |
| Moderate | ₹8,000 | ₹571 Cr | ₹250 Cr (44%) | 425 units (67%) |
| Premium | ₹9,000 | ₹648 Cr | ₹327 Cr (50%) | 375 units (59%) |

**Recommendation:** ₹8,000/sqft — best balance of margin and sell-through speed

---

## PART D: Microfinance & Credit Business (22 Tools)

### Use Case 32: Digitize Notebook Records
**Who:** Shopkeeper entering 50 existing credit customers
**SLM Prompt:** "Register Ramesh Kumar, phone 9876543210, pincode 500001. Bought Samsung TV ₹25,000 on credit."
**Tool Chain:** `fin.ledger.create_order`
**Output:**
- Order: ORD-20260901-A1B2
- 10 EMIs of ₹2,503 each
- First EMI due: September 1, 2026
- Total payable: ₹25,030

### Use Case 33: Parse WhatsApp Payment Message
**Who:** Shopkeeper forwarding a WhatsApp message
**SLM Prompt:** "Rs 2500 received from Ramesh 9876543210"
**Tool Chain:** `fin.whatsapp.parse_payment` → `fin.ledger.record_payment`
**Output:**
- Detected: amount=₹2500, customer="Ramesh", method="phonepe"
- Confidence: 90%
- Auto-recorded against Month 1 EMI
- Receipt generated and ready to send

### Use Case 34: Daily Collection Route Planning
**Who:** Collection agent starting morning rounds
**SLM Prompt:** "Plan my route for today"
**Tool Chain:** `fin.route.plan_daily`
**Output:**
```
Route for Agent Suresh — Sep 1, 2026:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Ramesh Kumar — ₹2,503 (Month 3) — URGENT (15 days late)
   📍 500001, Near Bus Stand
2. Priya Devi — ₹2,503 (Month 2) — HIGH (5 days late)
   📍 500001, Main Road
3. Suresh Reddy — ₹2,503 (Month 1) — MEDIUM
   📍 500002, Ganesh Nagar
4. Lakshmi — ₹2,503 (Month 4) — LOW
   📍 500002, Temple Street
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total expected: ₹10,012
Pincodes: 500001 → 500002 (optimized route)
```

### Use Case 35: Defaulter Detection & Risk Scoring
**Who:** Shopkeeper wanting to know who's at risk
**SLM Prompt:** "Who are my riskiest customers?"
**Tool Chain:** `fin.risk.detect_defaulters`
**Output:**
```
Defaulter Report:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Mohan Lal — Risk: 85/100
   4 months missed, ₹10,012 outstanding
   Last payment: May 2026
   Action: FINAL NOTICE —/repossession

2. Sunita Devi — Risk: 65/100
   2 months missed, ₹5,006 outstanding
   Last payment: July 2026
   Action: Visit home, collect overdue

3. Ajay Singh — Risk: 45/100
   1 month missed, ₹2,503 outstanding
   Action: Call, follow up in 3 days
```

### Use Case 36: Weekly Collection Summary
**Who:** Shopkeeper reviewing week's performance
**SLM Prompt:** "How did we do this week?"
**Tool Chain:** `fin.risk.weekly_summary`
**Output:**
```
Weekly Summary — Aug 25-31, 2026:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total expected: ₹75,090
Total collected: ₹52,563 (70%)
Cash: ₹15,000 | PhonePe: ₹37,563

Agent performance:
  Suresh: ₹30,036 (4 stops, 75% rate)
  Ravi: ₹22,527 (3 stops, 64% rate)

New defaulters: 2
Resolved: 1
```

### Use Case 37: PhonePe Reconciliation
**Who:** Shopkeeper matching PhonePe transactions
**SLM Prompt:** "Match today's PhonePe transactions"
**Tool Chain:** `fin.reconcile.match_transactions`
**Output:**
```
Reconciliation — Sep 1, 2026:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Matched (5):
  ₹2,500 → Ramesh (Month 3)
  ₹2,500 → Priya (Month 2)
  ₹2,500 → Suresh (Month 1)
  ₹5,000 → Lakshmi (Month 4 + advance)
  ₹2,500 → Unknown customer

⚠️ Suspected (1):
  ₹1,500 from 9876543210 — no matching EMI amount

❌ Unmatched (0):
  None
```

### Use Case 38: DuckDB Analytics Query
**Who:** Shopkeeper asking complex business question
**SLM Prompt:** "How much has financier Bajaj given as credit?"
**Tool Chain:** `fin.analytics.duckdb_query` → `fin.analytics.financier_report`
**Output:**
```
Bajaj FinServ Exposure:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Active orders: 45
Total credit: ₹11,25,000
Collected: ₹4,50,000
Outstanding: ₹6,75,000
Defaulted: 3 (6.7% default rate)
Average EMI: ₹2,500
```

---

## PART E: Cross-Vertical Combined Use Cases

### Use Case 39: Builder + Home Loan Calculator
**Who:** Real estate builder helping buyer with loan
**SLM Prompt:** "Customer wants to buy ₹65L flat. What EMI at 8.5% for 20 years?"
**Tool Chain:** `re.project.create` → `fin.calc.loan` → `fin.calc.tax`
**Output:**
- EMI: ₹56,383
- Total interest: ₹70.1L
- Tax benefit: ₹1.05L/year
- "Effective cost after tax benefit: ₹55.3L net interest"

### Use Case 40: Chit Fund + SIP Comparison
**Who:** Investor deciding between chit fund and SIP
**SLM Prompt:** "Is a ₹1L chit better than ₹4,000/month SIP?"
**Tool Chain:** `chit.member.statement` → `fin.calc.sip` → `fin.calc.compare`
**Output:**
- Chit: ₹4,000/month × 25 months = ₹1L prize (if won at discount)
  - Expected return: 12-18% (depends on bid)
  - Risk: Default by other members
- SIP: ₹4,000/month × 25 months at 12% = ₹1,15,811
  - Expected return: 12% (market-linked)
  - Risk: Market volatility
- **Recommendation:** Do both — chit for short-term cash needs, SIP for long-term wealth

### Use Case 41: Property Investment Analysis
**Who:** Investor comparing real estate vs financial assets
**SLM Prompt:** "Should I buy a ₹50L flat for rental income or invest in SIP?"
**Tool Chain:** `re.cost.estimate` + `fin.calc.sip` + `fin.calc.compare`
**Output:**
- Flat: ₹50L investment, ₹15,000/month rent (3.6% yield)
  - After maintenance: ₹12,000/month net
  - Capital appreciation: ~8% annually
  - Total return: ~11.6%
- SIP: ₹50L lump sum at 12% = ₹1.55Cr in 10 years
  - Total return: 12%
- **Verdict:** SIP wins on pure returns, but flat provides leverage (80% loan) and tax benefits

### Use Case 42: Business Loan for Real Estate Project
**Who:** Builder needing project financing
**SLM Prompt:** "I need ₹100Cr construction loan at 11% for 3 years. What's the interest burden?"
**Tool Chain:** `fin.calc.loan` → `re.profitability`
**Output:**
- EMI: ₹3,32,14,456/month
- Total interest: ₹19.56 Cr
- This increases project cost by 6.1%
- Profit margin drops from 43.8% to 37.7%
- "Consider phased drawdown to reduce interest burden"

### Use Case 43: Complete South Indian Business Stack
**Who:** Entrepreneur starting a credit business + chit fund + small real estate
**SLM Prompt:** "I want to start all three businesses. What do I need?"
**Tool Chain:** All 22 microfinance + 9 chitfund + 10 realestate tools
**Output:**
```
Business Stack Recommendation:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Credit Business (₹5L starting capital):
   - 50 customers × ₹25,000 average = ₹12.5L credit book
   - Monthly collection: ₹3.1L
   - Revenue: ₹3000/month interest per customer

2. Chit Fund (₹2L registration):
   - Start with 1 group × 25 members × ₹1L
   - Commission: ₹5,000/month
   - Zero capital needed (member funds)

3. Real Estate (₹10L advance):
   - Start with 1 small project (20 units)
   - Breakeven at 12 units sold
   - Profit: ₹80L-1.2Cr

Total setup cost: ₹17L
Expected monthly income: ₹5-8L (Year 1)
```

---

## Summary: Use Cases by Vertical

| Vertical | Tools | Use Cases | Key Metrics |
|----------|-------|-----------|-------------|
| Financial Calculator | 9 | 12 | Loan EMI, SIP returns, tax saving, FD maturity |
| Chit Fund | 9 | 9 | Dividend, collection rate, compliance, default rate |
| Real Estate | 10 | 10 | Profit margin, ROI, IRR, sales velocity, RERA |
| Microfinance | 22 | 7 | Credit book, defaulter risk, collection rate, reconciliation |
| Cross-Vertical | — | 5 | Combined scenarios, investment comparison |
| **TOTAL** | **50** | **43** | |

---

*Generated: September 2026 | stitaP Business Verticals — 43 Use Cases v1.0*
