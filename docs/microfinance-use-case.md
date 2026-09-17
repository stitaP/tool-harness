# Microfinance & Credit Business — Implementation Guide

## The Problem

A local shopkeeper sells electrical appliances on credit:
- **₹3 flat interest/month × 10 months**
- Records kept in physical notebooks
- Payments via PhonePe (UPI) and cash
- Only digital channel: WhatsApp (old phone, no smartphone)
- Collection agents travel routes by pincode
- Needs: who hasn't paid, how much to collect, which route to visit

## What We Built

### 22 Plug-and-Play Tools

| Domain | Tools | What They Do |
|--------|-------|-------------|
| **Ledger & Orders** | `fin.ledger.create_order`, `fin.ledger.record_payment`, `fin.ledger.customer_balance`, `fin.ledger.mark_overdue` | Full credit lifecycle management |
| **WhatsApp** | `fin.whatsapp.parse_payment`, `fin.whatsapp.send_receipt`, `fin.whatsapp.send_reminder`, `fin.whatsapp.batch_reminders` | Parse messages, generate receipts/reminders |
| **Collection Routes** | `fin.route.plan_daily`, `fin.route.assign_pincodes`, `fin.route.pincode_summary` | Pincode-based route planning |
| **Defaulter Detection** | `fin.risk.detect_defaulters`, `fin.risk.total_credit_exposure`, `fin.risk.weekly_summary` | Risk scoring, exposure tracking |
| **Reconciliation** | `fin.reconcile.match_transactions`, `fin.reconcile.daily_settlement` | PhonePe auto-matching |
| **Analytics (DuckDB)** | `fin.analytics.duckdb_query`, `fin.analytics.financier_report`, `fin.analytics.monthly_trend`, `fin.analytics.agent_leaderboard`, `fin.analytics.emi_collection_rate` | SQL-powered business intelligence |
| **Customer Mgmt** | `fin.customer.search`, `fin.customer.list_by_pincode` | Fast lookup by any identifier |

---

## How It Works — End to End

### Step 1: Digitize the Notebook

The shopkeeper (or an assistant) enters existing records:

```
SLM Request: "Register customer Ramesh Kumar, phone 9876543210, pincode 500001, 
bought Samsung 43-inch TV for ₹25,000 on credit"

→ Tool: fin.ledger.create_order
→ Auto-generates: 10 EMIs of ₹2,503 each (₹25,000 + ₹30 interest)
→ Returns: Order ID ORD-20260901-A1B2, first EMI due today
```

### Step 2: Record Daily Payments

When money comes in via PhonePe or cash:

```
SLM Request: "Ramesh paid ₹2,500 via PhonePe today"

→ Tool: fin.ledger.record_payment
→ Auto-matches to Month 1 EMI
→ Generates WhatsApp receipt message
→ Returns: "Month 1 paid. ₹22,527 remaining. Next due: Oct 1."
```

### Step 3: Parse WhatsApp Messages

When the shopkeeper forwards WhatsApp messages:

```
SLM Input: "Rs 2500 received from Ramesh 9876543210"

→ Tool: fin.whatsapp.parse_payment
→ Detected: amount=2500, customer="Ramesh", phone="9876543210", method="phonepe"
→ Confidence: 90%
→ Auto-records payment against Ramesh's pending EMI
```

### Step 4: Plan Collection Routes

Each morning, the agent gets their route:

```
SLM Request: "Plan today's route for agent Suresh"

→ Tool: fin.route.plan_daily
→ Returns numbered stops:
   1. Ramesh Kumar — ₹2,503 due (Month 3) — 500001 — URGENT (15 days overdue)
   2. Priya Devi — ₹2,503 due (Month 2) — 500001 — HIGH (5 days overdue)
   3. Suresh Reddy — ₹2,503 due (Month 1) — 500002 — MEDIUM
   Total expected: ₹7,509
```

### Step 5: Detect Defaulters

Weekly defaulter scan:

```
SLM Request: "Who are the defaulters this week?"

→ Tool: fin.risk.detect_defaulters
→ Returns risk-scored list:
   1. Mohan Lal — Risk: 85/100 — 4 months missed — ₹10,012 outstanding
      Action: FINAL NOTICE. Initiate repossession.
   2. Sunita Devi — Risk: 65/100 — 2 months missed — ₹5,006 outstanding  
      Action: Visit home. Collect full overdue amount.
   3. Ajay Singh — Risk: 45/100 — 1 month missed — ₹2,503 outstanding
      Action: Call customer. If no response in 3 days, visit home.
```

### Step 6: End-of-Day Settlement

```
SLM Request: "Today's settlement"

→ Tool: fin.reconcile.daily_settlement
→ Returns:
   Total expected: ₹25,030
   Total collected: ₹17,521 (70% collection rate)
   Cash: ₹5,000 | PhonePe: ₹12,521
   Agent Suresh: ₹10,012 collected (4 stops)
   Agent Ravi: ₹7,509 collected (3 stops)
   Unmatched PhonePe: 1 transaction (₹1,500 from unknown)
```

### Step 7: DuckDB Analytics

Any business question can be answered with SQL:

```
SLM Request: "How much does financier Bajaj have at risk?"

→ Tool: fin.analytics.duckdb_query
→ Query: SELECT * FROM financier_exposure WHERE financed_by = 'Bajaj'
→ Returns:
   Active orders: 45
   Total credit: ₹11,25,000
   Outstanding: ₹6,75,000
   Defaulted: 3 (6.7% default rate)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    WhatsApp / Phone                      │
│         (Shopkeeper forwards messages to SLM)           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              SLM (Phi-4-Mini / Qwen3-4B)               │
│   Classifies intent → picks tool → executes             │
│   70% of tool calls use ZERO tokens                     │
└──────────────────────┬──────────────────────────────────┘
                       │
           ┌───────────┼───────────┐
           ▼           ▼           ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │  Ledger  │ │  Route   │ │  DuckDB  │
   │  Engine  │ │  Planner │ │ Analytics│
   │ (local)  │ │ (local)  │ │ (browser)│
   └──────────┘ └──────────┘ └──────────┘
           │           │           │
           └───────────┼───────────┘
                       ▼
   ┌─────────────────────────────────────────────────────┐
   │           PhonePe Reconciliation Engine              │
   │   Matches incoming UPI txns against expected EMIs    │
   └─────────────────────────────────────────────────────┘
```

---

## Deployment Options

### Option 1: WhatsApp Bot (Recommended)

Deploy the SLM + tools as a WhatsApp bot using the WhatsApp Business API:
- Shopkeeper sends voice/text messages
- SLM parses, records payments, generates receipts
- Collection agents get daily routes via WhatsApp
- **Cost: ₹0/month** (runs on local hardware)

### Option 2: Feature Phone SMS Gateway

For old phones without WhatsApp:
- SMS gateway receives messages
- SLM parses and responds via SMS
- Simpler but limited formatting

### Option 3: Web Dashboard + WhatsApp Bridge

For the shopkeeper's computer:
- Web dashboard showing all data
- WhatsApp messages auto-forwarded to dashboard
- One-click payment recording

---

## Key Design Decisions

### Why DuckDB?

- Runs in-browser, zero server needed
- Full SQL support for complex queries
- Handles 10,000+ customer records easily
- Pre-built queries for common business questions
- Agent can run arbitrary SQL for custom analytics

### Why Pincode-Based Routes?

- Collection agents travel by area, not by customer name
- Pincodes are the only geographic data available
- Groups customers by physical proximity
- Reduces travel time and fuel costs

### Why WhatsApp Parsing?

- Shopkeeper's only digital channel
- Natural language messages are unpredictable
- Pattern matching handles common formats
- Confidence scoring prevents false matches
- Human review for low-confidence parses

### Why Risk Scoring?

- Not all defaulters need the same treatment
- Score 0-100 based on: months missed, consecutive misses, last payment recency
- Escalation levels: 0=remind, 1=call, 2=visit, 3=legal
- Agents focus on highest-risk customers first

---

## Sample SLM Prompts

These are the prompts the SLM handles — no technical knowledge needed:

| Shopkeeper Says | SLM Does |
|----------------|----------|
| "Ramesh bought a fridge ₹18000" | Creates credit order, generates 10 EMIs |
| "Ramesh paid 1830 PhonePe" | Records payment, matches to EMI, sends receipt |
| "Who hasn't paid?" | Runs defaulter detection, shows risk scores |
| "Plan Suresh's route" | Generates pincode-based collection route |
| "How much did we collect today?" | Runs daily settlement report |
| "Bajaj exposure" | Queries DuckDB for financier report |
| "Send reminders to 500001" | Batch-generates WhatsApp reminders for pincode |
| "Monthly trend" | Shows 12-month collection graph |

---

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/integrations/microfinance.ts` | ~1034 | Core domain engine: ledger, EMI, reconciliation, routes, defaulter detection, DuckDB queries |
| `src/lib/store/tools/microfinance-tools.ts` | ~614 | 22 ToolManifest definitions with parameters, capabilities, tags |
| `docs/microfinance-use-case.md` | This file | Implementation guide and documentation |

## Files Modified

| File | Change |
|------|--------|
| `src/lib/store/tool-types.ts` | Added `"microfinance"` to ToolCategory union type |
| `src/lib/store/registry.ts` | Added MICROFINANCE_TOOLS import, ALL_TOOLS entry, CATEGORIES entry |
