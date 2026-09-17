/**
 * Microfinance & Credit Business — Store Tool Manifests
 *
 * 22 tools for a ₹3-interest-per-10-months credit business.
 * Tools do the heavy lifting — SLMs just decide what to call.
 *
 * Business model:
 * - Shopkeeper sells appliances on credit
 * - ₹3 interest/month × 10 months
 * - Payments via PhonePe + Cash
 * - Collection agents visit by pincode routes
 * - WhatsApp is the only digital channel
 */

import type { ToolManifest } from "../tool-types";

export const MICROFINANCE_TOOLS: ToolManifest[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // LEDGER & ORDER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fin.ledger.create_order",
    name: "Create Credit Order",
    description: "Register a new appliance sale on credit. Auto-generates 10-month EMI schedule with ₹3/month interest. Creates customer record if new.",
    longDescription:
      "Given customer details (name, phone, pincode, address) and item details (name, price), creates a full credit order with: 10-month EMI schedule, ₹3/month interest, total amount calculation, delivery tracking. If customer doesn't exist, auto-creates them. Returns order ID, EMI breakdown, and first payment due date.",
    category: "microfinance",
    subcategory: "ledger",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "credit", "emi", "ledger", "order", "create"],
    icon: "FilePlus",
    color: "#10b981",
    parameters: [
      { name: "customerName", type: "string", description: "Customer full name", required: true },
      { name: "customerPhone", type: "string", description: "10-digit phone number", required: true },
      { name: "pincode", type: "string", description: "Area pincode for route planning", required: true },
      { name: "address", type: "string", description: "Full delivery address", required: true },
      { name: "itemName", type: "string", description: "Appliance name (e.g., 'Samsung 43\" TV')", required: true },
      { name: "sellingPrice", type: "number", description: "Price charged to customer", required: true },
      { name: "purchasePrice", type: "number", description: "Cost price (for margin tracking)", required: false },
      { name: "financedBy", type: "string", description: "Financier name or 'self'", required: false },
    ],
    capabilities: [{ name: "create-order", description: "Create credit order with EMI schedule", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.ledger.record_payment",
    name: "Record Payment",
    description: "Record a payment (cash or PhonePe) against a customer's EMI. Auto-matches to pending month, handles overpayment/underpayment, generates receipt.",
    longDescription:
      "Records a payment against the next pending EMI. Handles: exact payment, overpayment (auto-applies to next month), partial payment (marks as partial), underpayment warning. Generates WhatsApp receipt message. Returns updated EMI status and any warnings.",
    category: "microfinance",
    subcategory: "ledger",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "payment", "emi", "receipt", "cash", "phonepe"],
    icon: "IndianRupee",
    color: "#10b981",
    parameters: [
      { name: "orderId", type: "string", description: "Order ID (ORD-XXXX-XXXX)", required: true },
      { name: "amount", type: "number", description: "Payment amount in ₹", required: true },
      { name: "method", type: "string", description: "Payment method: 'phonepe' or 'cash'", required: true },
      { name: "transactionRef", type: "string", description: "PhonePe UPI reference or cash receipt #", required: false },
      { name: "receivedBy", type: "string", description: "Agent ID if collected in person", required: false },
    ],
    capabilities: [{ name: "record-payment", description: "Record and match payment to EMI", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.ledger.customer_balance",
    name: "Customer Balance",
    description: "Get full balance sheet for any customer: total credit, total paid, outstanding, EMI history, next due date, risk status.",
    longDescription:
      "Retrieves complete financial snapshot for a customer: all orders, payment history, current outstanding, next EMI due date, overdue months, risk score. Useful for answering 'how much does X owe?' instantly.",
    category: "microfinance",
    subcategory: "ledger",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "balance", "outstanding", "customer", "ledger"],
    icon: "Wallet",
    color: "#10b981",
    parameters: [
      { name: "customerId", type: "string", description: "Customer ID or phone number", required: true },
    ],
    capabilities: [{ name: "customer-balance", description: "Query customer financial status", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.ledger.mark_overdue",
    name: "Mark Overdue EMIs",
    description: "Scan all active orders and mark EMIs as overdue if past due date. Auto-detects defaulted orders (3+ months missed). Run daily.",
    longDescription:
      "Batch operation that scans every active order's EMI schedule. If due date has passed and payment not received, marks as 'overdue'. If 3+ consecutive months missed, marks order as 'defaulted'. Returns list of newly overdue items. Designed to run once daily via cron/scheduler.",
    category: "microfinance",
    subcategory: "ledger",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "overdue", "emi", "default", "batch"],
    icon: "AlertTriangle",
    color: "#f59e0b",
    parameters: [],
    capabilities: [{ name: "mark-overdue", description: "Batch update EMI overdue status", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP & COMMUNICATION
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fin.whatsapp.parse_payment",
    name: "Parse WhatsApp Message",
    description: "Extract payment info from WhatsApp messages. Detects amount, customer name, phone, order ID, payment method from free-text messages.",
    longDescription:
      "Parses natural-language WhatsApp messages to extract structured payment data. Handles formats like: 'Rs 500 received from Ramesh', 'PhonePe ₹300 ORD-1234', 'Cash month 3 Ramesh'. Returns detected amount, customer, order ID, method, and confidence score. Works with English, Hindi, and Telugu mixed messages.",
    category: "microfinance",
    subcategory: "whatsapp",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "whatsapp", "nlp", "payment", "parse"],
    icon: "MessageSquare",
    color: "#25D366",
    parameters: [
      { name: "message", type: "string", description: "Raw WhatsApp message text", required: true },
    ],
    capabilities: [{ name: "parse-whatsapp", description: "Extract payment info from text", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.whatsapp.send_receipt",
    name: "Generate Receipt Message",
    description: "Generate a formatted WhatsApp receipt for a completed payment. Shows item, month, amount, remaining balance, next due date.",
    longDescription:
      "Creates a WhatsApp-ready receipt message with emoji formatting. Includes: customer name, item purchased, month paid, amount, payment method, transaction ref, months completed, remaining balance, next EMI date. Copy-paste ready for WhatsApp.",
    category: "microfinance",
    subcategory: "whatsapp",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "whatsapp", "receipt", "message"],
    icon: "Receipt",
    color: "#25D366",
    parameters: [
      { name: "orderId", type: "string", description: "Order ID", required: true },
      { name: "paymentAmount", type: "number", description: "Amount paid", required: true },
    ],
    capabilities: [{ name: "generate-receipt", description: "Create WhatsApp receipt message", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.whatsapp.send_reminder",
    name: "Generate Reminder Message",
    description: "Generate a polite WhatsApp reminder for overdue EMI. Shows missed months, amount due, payment options.",
    longDescription:
      "Creates a WhatsApp reminder message for customers with overdue payments. Includes: customer name, item name, missed months list, total due amount, payment options (PhonePe number + cash). Polite tone with urgency escalation based on overdue duration.",
    category: "microfinance",
    subcategory: "whatsapp",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "whatsapp", "reminder", "overdue"],
    icon: "Bell",
    color: "#25D366",
    parameters: [
      { name: "orderId", type: "string", description: "Order ID with overdue EMI", required: true },
    ],
    capabilities: [{ name: "generate-reminder", description: "Create overdue reminder message", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.whatsapp.batch_reminders",
    name: "Send Batch Reminders",
    description: "Auto-generate and queue reminder messages for all overdue customers in a pincode area. Agent can copy-paste to WhatsApp.",
    longDescription:
      "Scans all overdue orders in specified pincodes, generates personalized reminder messages for each, and produces a ready-to-send list. Groups by pincode so agent can send area-wise. Returns count of reminders generated and total overdue amount.",
    category: "microfinance",
    subcategory: "whatsapp",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "whatsapp", "batch", "reminder", "overdue"],
    icon: "Send",
    color: "#25D366",
    parameters: [
      { name: "pincodes", type: "string", description: "Comma-separated pincodes to target", required: false },
      { name: "minOverdueMonths", type: "number", description: "Minimum months overdue (default: 1)", required: false },
    ],
    capabilities: [{ name: "batch-reminders", description: "Generate bulk reminder messages", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLECTION ROUTES & AGENTS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fin.route.plan_daily",
    name: "Plan Daily Collection Route",
    description: "Generate optimized collection route for an agent based on assigned pincodes. Prioritizes by overdue severity, groups by area.",
    longDescription:
      "Takes an agent ID and generates today's collection route: all customers with pending EMIs in their assigned pincodes, sorted by priority (urgent > high > medium > low), grouped by pincode for efficient travel. Returns: numbered stop list with customer details, amounts due, landmarks, and total expected collection.",
    category: "microfinance",
    subcategory: "collection",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "route", "collection", "agent", "pincode"],
    icon: "MapPin",
    color: "#f97316",
    parameters: [
      { name: "agentId", type: "string", description: "Collection agent ID", required: true },
      { name: "date", type: "string", description: "Date for route (YYYY-MM-DD, default: today)", required: false },
      { name: "maxStops", type: "number", description: "Maximum stops per route (default: 15)", required: false },
    ],
    capabilities: [{ name: "plan-route", description: "Generate optimized collection route", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.route.assign_pincodes",
    name: "Assign Pincodes to Agent",
    description: "Assign a set of pincodes to a collection agent. Updates their daily route scope.",
    longDescription:
      "Assigns one or more pincodes to a collection agent. The agent will only see customers in these pincodes when planning routes. Validates pincodes exist in customer database before assigning.",
    category: "microfinance",
    subcategory: "collection",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "agent", "pincode", "assignment"],
    icon: "UserPlus",
    color: "#f97316",
    parameters: [
      { name: "agentId", type: "string", description: "Agent ID", required: true },
      { name: "pincodes", type: "string", description: "Comma-separated pincodes to assign", required: true },
    ],
    capabilities: [{ name: "assign-pincodes", description: "Update agent pincode assignments", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.route.pincode_summary",
    name: "Pincode Collection Summary",
    description: "Get collection stats for a specific pincode: total orders, outstanding, overdue, customer count, defaulters.",
    longDescription:
      "Returns a summary for any pincode area: number of active orders, total outstanding amount, overdue count, customer list, defaulters. Useful for planning which areas need more agent coverage.",
    category: "microfinance",
    subcategory: "collection",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "pincode", "summary", "analytics"],
    icon: "Map",
    color: "#f97316",
    parameters: [
      { name: "pincode", type: "string", description: "Pincode to analyze", required: true },
    ],
    capabilities: [{ name: "pincode-summary", description: "Get pincode area collection stats", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEFAULTER DETECTION & RISK
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fin.risk.detect_defaulters",
    name: "Detect Defaulters",
    description: "Scan all orders and identify defaulters with risk scores, missed months, recommended actions (call/visit/repossession).",
    longDescription:
      "Analyzes every active and defaulted order to identify customers who have missed payments. Calculates risk score (0-100) based on: months missed, consecutive misses, last payment recency, outstanding ratio. Assigns escalation level (0-3) and recommends action (remind/call/visit/repossession). Returns sorted list by risk.",
    category: "microfinance",
    subcategory: "risk",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "defaulter", "risk", "escalation", "detection"],
    icon: "ShieldAlert",
    color: "#ef4444",
    parameters: [
      { name: "pincode", type: "string", description: "Filter by pincode (optional)", required: false },
      { name: "minRiskScore", type: "number", description: "Minimum risk score to include (default: 30)", required: false },
    ],
    capabilities: [{ name: "detect-defaulters", description: "Identify and score defaulters", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.risk.total_credit_exposure",
    name: "Total Credit Exposure",
    description: "Get total credit given out, total collected, total outstanding, and exposure by financier. The 'how much money is at risk' query.",
    longDescription:
      "Calculates the business's total credit exposure: total credit issued (sum of all order amounts), total collected so far, total outstanding, breakdown by financier (who funded the purchases), breakdown by status (active vs defaulted). Essential for understanding business health.",
    category: "microfinance",
    subcategory: "risk",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "credit", "exposure", "financier", "risk"],
    icon: "TrendingUp",
    color: "#ef4444",
    parameters: [],
    capabilities: [{ name: "credit-exposure", description: "Calculate total credit risk", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.risk.weekly_summary",
    name: "Weekly Collection Summary",
    description: "This week's collection: total expected vs collected, cash vs PhonePe split, agent-wise performance, new defaulters.",
    longDescription:
      "Generates a comprehensive weekly summary: total EMI expected this week, total collected, collection rate percentage, cash vs PhonePe split, per-agent performance (collections made, amount collected), new defaulters detected, resolved defaulters. Perfect for the weekly review meeting.",
    category: "microfinance",
    subcategory: "risk",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "weekly", "summary", "collection", "performance"],
    icon: "Calendar",
    color: "#ef4444",
    parameters: [
      { name: "weekStarting", type: "string", description: "Week start date (YYYY-MM-DD)", required: false },
    ],
    capabilities: [{ name: "weekly-summary", description: "Generate weekly collection report", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHONEPE RECONCILIATION
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fin.reconcile.match_transactions",
    name: "Match PhonePe Transactions",
    description: "Match incoming PhonePe payments against expected EMIs. Identifies matches, mismatches, and unknown payments.",
    longDescription:
      "Takes a list of PhonePe transactions (from bank statement or PhonePe business app) and matches each against expected EMI amounts. Identifies: exact matches (auto-reconciled), amount mismatches (suspected), unknown senders (unmatched). Returns full reconciliation report with match confidence.",
    category: "microfinance",
    subcategory: "reconciliation",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "phonepe", "reconciliation", "upi", "matching"],
    icon: "CheckCircle",
    color: "#6366f1",
    parameters: [
      { name: "transactions", type: "string", description: "JSON array of {amount, phone, date, upiRef}", required: true },
      { name: "date", type: "string", description: "Transaction date to match against", required: false },
    ],
    capabilities: [{ name: "match-transactions", description: "Auto-match PhonePe payments to EMIs", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.reconcile.daily_settlement",
    name: "Daily Settlement Report",
    description: "End-of-day settlement: total cash collected, PhonePe collected, agent-wise breakdown, unmatched payments, discrepancies.",
    longDescription:
      "Generates the daily settlement report showing: total expected collection, total actual collected, cash vs PhonePe split, per-agent performance, any unmatched PhonePe transactions (money received but not attributed), any discrepancies between expected and actual. Designed to run at end of business day.",
    category: "microfinance",
    subcategory: "reconciliation",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "settlement", "daily", "reconciliation", "cash", "phonepe"],
    icon: "ClipboardCheck",
    color: "#6366f1",
    parameters: [
      { name: "date", type: "string", description: "Settlement date (default: today)", required: false },
    ],
    capabilities: [{ name: "daily-settlement", description: "Generate end-of-day settlement report", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS & DUCKDB QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fin.analytics.duckdb_query",
    name: "Run DuckDB Query",
    description: "Execute any SQL query against the microfinance database. Pre-loaded DuckDB in-browser with customers, orders, payments, EMIs tables.",
    longDescription:
      "Runs arbitrary SQL against an in-browser DuckDB instance loaded with the microfinance data. Tables: customers, orders, payments, emis, agents. Supports full SQL: JOINs, aggregations, window functions, CTEs. Returns query results as JSON. For power users who need custom analytics.",
    category: "microfinance",
    subcategory: "analytics",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "duckdb", "sql", "analytics", "query"],
    icon: "Database",
    color: "#8b5cf6",
    parameters: [
      { name: "query", type: "string", description: "SQL query to execute", required: true },
    ],
    capabilities: [{ name: "duckdb-query", description: "Execute SQL against DuckDB", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.analytics.financier_report",
    name: "Financier Report",
    description: "Show credit exposure by financier: how much each financier has funded, outstanding, default rate. Essential for business relationships.",
    longDescription:
      "Generates a report grouped by financier: total orders funded, total credit amount, total collected, outstanding amount, default rate (percentage of orders that defaulted). Helps shopkeeper know which financiers have the most exposure and which have the highest default risk.",
    category: "microfinance",
    subcategory: "analytics",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "financier", "report", "credit", "exposure"],
    icon: "Building2",
    color: "#8b5cf6",
    parameters: [],
    capabilities: [{ name: "financier-report", description: "Generate financier exposure report", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.analytics.monthly_trend",
    name: "Monthly Collection Trend",
    description: "12-month collection trend: total collected per month, unique customers, average payment size. Spot seasonal patterns.",
    longDescription:
      "Shows month-by-month collection trend for the last 12 months: total collected, number of unique customers who paid, average payment size. Helps identify seasonal patterns (e.g., lower collections during festival months, higher during salary days).",
    category: "microfinance",
    subcategory: "analytics",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "trend", "monthly", "analytics", "collection"],
    icon: "TrendingUp",
    color: "#8b5cf6",
    parameters: [],
    capabilities: [{ name: "monthly-trend", description: "Generate 12-month collection trend", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.analytics.agent_leaderboard",
    name: "Agent Leaderboard",
    description: "Rank collection agents by performance: collections made, amount collected, success rate, pincodes covered.",
    longDescription:
      "Ranks all active collection agents by: total collections this week/month, total amount collected, success rate (collections attempted vs successful), average time per stop, pincodes covered. Helps identify top performers and agents needing coaching.",
    category: "microfinance",
    subcategory: "analytics",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "agent", "leaderboard", "performance", "ranking"],
    icon: "Trophy",
    color: "#8b5cf6",
    parameters: [
      { name: "period", type: "string", description: "Time period: 'today', 'week', 'month' (default: week)", required: false },
    ],
    capabilities: [{ name: "agent-leaderboard", description: "Rank agent performance", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.analytics.emi_collection_rate",
    name: "EMI Collection Rate",
    description: "Daily EMI collection rate: paid vs overdue vs pending. Track how many EMIs are collected on time each day.",
    longDescription:
      "Shows the daily EMI collection rate: how many EMIs were due, how many were paid, how many are overdue, how many still pending. Calculates collection rate percentage. Essential for tracking business health over time. Compare day-over-day or week-over-week.",
    category: "microfinance",
    subcategory: "analytics",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "emi", "collection", "rate", "daily"],
    icon: "Percent",
    color: "#8b5cf6",
    parameters: [
      { name: "days", type: "number", description: "Number of days to look back (default: 7)", required: false },
    ],
    capabilities: [{ name: "collection-rate", description: "Calculate daily EMI collection rate", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fin.customer.search",
    name: "Search Customer",
    description: "Find customer by name, phone, or order ID. Returns full profile with all orders, payments, and current status.",
    longDescription:
      "Searches the customer database by name (fuzzy), phone number, or order ID. Returns: customer details, all orders (active/completed/defaulted), payment history, current outstanding, risk score, last payment date, assigned pincode. Fast lookup for phone queries.",
    category: "microfinance",
    subcategory: "customer",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "customer", "search", "lookup", "profile"],
    icon: "Search",
    color: "#0ea5e9",
    parameters: [
      { name: "query", type: "string", description: "Search term: name, phone, or order ID", required: true },
    ],
    capabilities: [{ name: "search-customer", description: "Find customer by any identifier", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },

  {
    id: "fin.customer.list_by_pincode",
    name: "List Customers by Pincode",
    description: "List all customers in a pincode area with their outstanding amounts. Used for area-wise collection planning.",
    longDescription:
      "Returns all customers in a specific pincode with: name, phone, total outstanding, overdue count, last payment date, risk status. Sorted by outstanding amount (highest first). Essential for planning collection routes and understanding area-wise exposure.",
    category: "microfinance",
    subcategory: "customer",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["microfinance", "customer", "pincode", "list", "area"],
    icon: "Users",
    color: "#0ea5e9",
    parameters: [
      { name: "pincode", type: "string", description: "Pincode to search", required: true },
      { name: "includeCompleted", type: "string", description: "Include completed orders (default: false)", required: false },
    ],
    capabilities: [{ name: "list-by-pincode", description: "List customers in pincode area", requiresBrowser: false, requiresNetwork: false, offline: true }],
    slmFriendly: true,
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },
];
