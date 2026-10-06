/**
 * Executors for Indian business tools: financial calculators (fin.calc.*),
 * the microfinance credit ledger (fin.ledger/whatsapp/route/risk/reconcile/
 * analytics/customer), chit funds (chit.*) and real-estate projects (re.*).
 * Stateful tools persist their records via `persisted()` (~/.stitap/store-data).
 */
import {
  calculateLoan, calculateSIP, calculateFD, calculateRD, calculateTax, calculateGoal,
  calculateSWP, calculateStampDuty,
} from "@/lib/integrations/financial-scenarios";
import {
  createCreditOrder, recordPayment, markOverdueEmis, parseWhatsAppPayment, generateReceipt, generateReminder,
  planCollectionRoute, detectDefaulters, reconcilePayments, generateSettlementReport,
  type BusinessConfig, type Customer, type CreditOrder, type Payment, type CollectionAgent, type PhonePeTransaction,
} from "@/lib/integrations/microfinance";
import {
  createChitGroup, recordBid, closeBidding, recordCollection, calculateMemberDividends, generateForemanReport,
  checkCompliance, generateDefaultNotice, formatNoticeMessage, generateDashboardData as chitDashboard,
  type ChitGroup, type ChitBid,
} from "@/lib/integrations/chitfund";
import {
  createProject, estimateProjectCosts, generateSalesPipeline, generateCashFlowReport, calculateProfitability,
  trackCompliance, generateFollowUpList, forecastRevenue, generateREDashboard,
  type REProject, type REUnit, type CashFlowEntry,
} from "@/lib/integrations/realestate";
import { fromJSON } from "@/lib/analytics/columnar";
import { executeQuery } from "@/lib/analytics/sql";
import { execs, json, num, str, bool, list, persisted, today, uid, r2, type ExecMap } from "./util";

// ─── microfinance ledger state ───────────────────────────────────────────────

interface Ledger {
  config: BusinessConfig;
  customers: Customer[];
  orders: CreditOrder[];
  payments: Payment[];
  agents: CollectionAgent[];
  messages: { to: string; text: string; link: string; sent: boolean; at: string; kind: string }[];
}

const DEFAULT_CONFIG: BusinessConfig = {
  businessName: "My Electricals", ownerPhone: "", whatsappNumber: "", defaultInterestRate: 3, defaultTenure: 10,
  gstRate: 18, currency: "INR", paymentMethods: ["phonepe", "cash", "bank_transfer"], timezone: "Asia/Kolkata",
};
const ledger = persisted<Ledger>("microfinance", () => ({ config: DEFAULT_CONFIG, customers: [], orders: [], payments: [], agents: [], messages: [] }));

const phone10 = (p: unknown) => str(p).replace(/\D/g, "").slice(-10);
function findOrder(L: Ledger, id: unknown): CreditOrder {
  const o = L.orders.find((x) => x.id === str(id) || x.id.endsWith(str(id)));
  if (!o) throw new Error(`order ${str(id)} not found`);
  return o;
}
function findCustomer(L: Ledger, idOrPhone: unknown): Customer {
  const q = str(idOrPhone);
  const c = L.customers.find((x) => x.id === q || x.phone === phone10(q) || x.name.toLowerCase() === q.toLowerCase());
  if (!c) throw new Error(`customer ${q} not found`);
  return c;
}
function refreshCustomer(L: Ledger, c: Customer) {
  const orders = L.orders.filter((o) => o.customerId === c.id);
  c.totalCredits = orders.reduce((s, o) => s + o.totalAmount, 0);
  c.totalPaid = orders.reduce((s, o) => s + o.emiSchedule.reduce((a, e) => a + e.paidAmount, 0), 0);
  c.outstandingBalance = c.totalCredits - c.totalPaid;
}
const outstanding = (o: CreditOrder) => o.totalAmount - o.emiSchedule.reduce((a, e) => a + e.paidAmount, 0);

/** WhatsApp: real send via Meta Cloud API when configured, otherwise a click-to-chat link. */
async function whatsapp(L: Ledger, to: string, text: string, kind: string) {
  const link = `https://wa.me/91${phone10(to)}?text=${encodeURIComponent(text)}`;
  const env: any = typeof process !== "undefined" ? (process as any).env ?? {} : {};
  let sent = false, error: string | undefined;
  if (env.WHATSAPP_CLOUD_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const r = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST", headers: { authorization: `Bearer ${env.WHATSAPP_CLOUD_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: `91${phone10(to)}`, type: "text", text: { body: text } }),
      });
      sent = r.ok;
      if (!r.ok) error = `WhatsApp API ${r.status}: ${(await r.text()).slice(0, 200)}`;
    } catch (e: any) { error = e.message; }
  }
  L.messages.push({ to: phone10(to), text, link, sent, at: new Date().toISOString(), kind });
  return { to: phone10(to), sent, delivery: sent ? "whatsapp-cloud-api" : "click-to-chat link (set WHATSAPP_CLOUD_TOKEN + WHATSAPP_PHONE_NUMBER_ID to send automatically)", link, message: text, ...(error ? { error } : {}) };
}

function ledgerTables(L: Ledger) {
  const emis = L.orders.flatMap((o) => o.emiSchedule.map((e) => ({ order_id: o.id, customer_id: o.customerId, month: e.month, due_date: e.dueDate, amount: e.amount, status: e.status, paid_amount: e.paidAmount, paid_date: e.paidDate ?? null })));
  const snake = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== "object" || v === null).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), v]));
  const t = new Map<string, any>();
  const add = (name: string, rows: Record<string, unknown>[]) => { if (rows.length) t.set(name, fromJSON(rows, name)); };
  add("customers", L.customers.map(snake));
  add("orders", L.orders.map(snake));
  add("payments", L.payments.map(snake));
  add("emis", emis);
  add("agents", L.agents.map((a) => ({ ...snake(a as any), assigned_pincodes: a.assignedPincodes.join(",") })));
  return t;
}

function monthKey(d: string) { return d.slice(0, 7); }

// ─── chit funds & real estate state ──────────────────────────────────────────

const chits = persisted<{ groups: ChitGroup[] }>("chitfund", () => ({ groups: [] }));
const realty = persisted<{ projects: REProject[]; cashflow: CashFlowEntry[] }>("realestate", () => ({ projects: [], cashflow: [] }));
const getGroup = (id: unknown): ChitGroup => {
  const g = chits.get().groups.find((x) => x.id === str(id) || x.name.toLowerCase() === str(id).toLowerCase());
  if (!g) throw new Error(`chit group ${str(id)} not found`);
  return g;
};
const getProject = (id: unknown): REProject => {
  const p = realty.get().projects.find((x) => x.id === str(id) || x.name.toLowerCase() === str(id).toLowerCase());
  if (!p) throw new Error(`project ${str(id)} not found`);
  return p;
};

export const BUSINESS_EXECUTORS: ExecMap = execs({
  // ── calculators ──
  "fin.calc.loan": (i) => {
    const fee = i.processingFee !== undefined ? num(i.processingFee) : undefined;
    const tenure = num(i.tenureMonths);
    const pre = num(i.prepayment, 0);
    const prepayments = pre > 0 ? Array.from({ length: Math.floor(tenure / 12) }, (_, k) => ({ month: (k + 1) * 12, amount: pre, type: "principal" as const })) : undefined;
    const r = calculateLoan({ principal: num(i.principal), annualRate: num(i.annualRate), tenureMonths: tenure, prepayments, processingFee: fee, processingFeeType: fee !== undefined && fee <= 5 ? "percentage" : "flat" });
    const res: any = { ...r };
    if (Array.isArray(res.schedule) && res.schedule.length > 24) { res.scheduleFirst12 = res.schedule.slice(0, 12); res.scheduleLast12 = res.schedule.slice(-12); delete res.schedule; }
    return res;
  },
  "fin.calc.sip": (i) => calculateSIP({ monthlyAmount: num(i.monthlyAmount), annualReturnRate: num(i.annualReturnRate), durationYears: num(i.durationYears), stepUpPercent: num(i.stepUpPercent, 0), inflationRate: num(i.inflationRate, 6) }),
  "fin.calc.fd": (i) => calculateFD({ principal: num(i.principal), annualRate: num(i.annualRate), tenureYears: num(i.tenureYears), compounding: (str(i.compounding, "quarterly").toLowerCase() as any) }),
  "fin.calc.rd": (i) => calculateRD({ monthlyDeposit: num(i.monthlyDeposit), annualRate: num(i.annualRate), tenureMonths: num(i.tenureMonths) }),
  "fin.calc.tax": (i) => calculateTax({ grossIncome: num(i.grossIncome), deductions: { section80C: num(i.section80C, 0), section24: num(i.section24, 0), section80D: num(i.section80D, 0), hra: num(i.hra, 0) } }),
  "fin.calc.goal": (i) => calculateGoal({ goalName: "Goal", targetAmount: num(i.targetAmount), targetDate: str(i.targetDate), currentAge: num(i.currentAge, 30), riskProfile: (str(i.riskProfile, "moderate").toLowerCase() as any), currentSavings: num(i.currentSavings, 0) }),
  "fin.calc.stamp_duty": (i) => calculateStampDuty(num(i.propertyValue), str(i.state)),
  "fin.calc.swp": (i) => calculateSWP(num(i.corpus), num(i.monthlyWithdrawal), num(i.annualReturnRate), num(i.inflationRate, 6)),
  "fin.calc.compare": (i) => {
    const amount = num(i.amount), years = num(i.duration);
    const opts = list(i.options).map((o) => o.toLowerCase());
    const out: Record<string, Record<string, number>> = {};
    for (const o of opts.length ? opts : ["sip", "fd", "ppf", "nps"]) {
      if (o === "sip") { const r: any = calculateSIP({ monthlyAmount: amount / 12, annualReturnRate: 12, durationYears: years }); out.sip = { invested: r2(r.totalInvested), maturity: r2(r.futureValue), gain: r2(r.wealthGained), assumedReturn: 12 }; }
      else if (o === "fd") { const r: any = calculateFD({ principal: amount, annualRate: 7, tenureYears: years, compounding: "quarterly" }); out.fd = { invested: amount, maturity: r2(r.maturityAmount), gain: r2(r.totalInterest), assumedReturn: 7 }; }
      else if (o === "ppf") { const rate = 7.1; let bal = 0; for (let y = 0; y < years; y++) bal = (bal + Math.min(amount, 150000)) * (1 + rate / 100); out.ppf = { invested: Math.min(amount, 150000) * years, maturity: r2(bal), gain: r2(bal - Math.min(amount, 150000) * years), assumedReturn: rate, note: 1 } as any; }
      else if (o === "nps") { const rate = 10; let bal = 0; for (let y = 0; y < years; y++) bal = (bal + amount) * (1 + rate / 100); out.nps = { invested: amount * years, maturity: r2(bal), gain: r2(bal - amount * years), assumedReturn: rate, lumpSumAt60: r2(bal * 0.6), annuityCorpus: r2(bal * 0.4) }; }
      else if (o === "rd") { const r: any = calculateRD({ monthlyDeposit: amount / 12, annualRate: 6.8, tenureMonths: years * 12 }); out.rd = { invested: r2(r.totalDeposited), maturity: r2(r.maturityAmount), gain: r2(r.totalInterest), assumedReturn: 6.8 }; }
    }
    const best = Object.entries(out).sort((a, b) => b[1].maturity - a[1].maturity)[0]?.[0];
    return { amountPerYear: amount, years, options: out, highestMaturity: best, note: "SIP/FD/PPF/NPS treat `amount` as yearly investment for SIP, PPF, NPS, RD and as a lump sum for FD; returns are assumptions, not guarantees." };
  },

  // ── microfinance ledger ──
  "fin.ledger.create_order": (i) => {
    const L = ledger.get();
    const ph = phone10(i.customerPhone);
    let c = L.customers.find((x) => x.phone === ph);
    if (!c) {
      c = { id: uid("CUS"), name: str(i.customerName), phone: ph, whatsappPhone: ph, pincode: str(i.pincode), address: str(i.address), category: "new", riskScore: 30, createdAt: new Date().toISOString(), totalCredits: 0, totalPaid: 0, outstandingBalance: 0 };
      L.customers.push(c);
    }
    const sp = num(i.sellingPrice);
    const order = createCreditOrder(c, L.config, { itemName: str(i.itemName), itemCategory: /tv|fridge|refrigerator|washing|ac\b|cooler|mixer|oven/i.test(str(i.itemName)) ? "appliance" : "electrical", purchasePrice: num(i.purchasePrice, sp * 0.8), sellingPrice: sp, financedBy: str(i.financedBy, "self") });
    L.orders.push(order);
    refreshCustomer(L, c);
    ledger.save();
    return { orderId: order.id, customerId: c.id, totalAmount: order.totalAmount, monthlyEmi: order.monthlyEmi, tenure: order.tenure, firstDue: order.emiSchedule[0]?.dueDate, margin: sp - num(i.purchasePrice, sp * 0.8) };
  },
  "fin.ledger.record_payment": (i) => {
    const L = ledger.get();
    const o = findOrder(L, i.orderId);
    const method = (str(i.method, "cash").toLowerCase().includes("phone") || str(i.method).toLowerCase().includes("upi") ? "phonepe" : str(i.method, "cash").toLowerCase().includes("bank") ? "bank_transfer" : "cash") as Payment["method"];
    const r = recordPayment(o, { amount: num(i.amount), method, transactionRef: i.transactionRef ? str(i.transactionRef) : undefined, receivedBy: i.receivedBy ? str(i.receivedBy) : undefined });
    Object.assign(o, r.order);
    if (r.paymentRecord?.id) L.payments.push(r.paymentRecord);
    if (o.emiSchedule.every((e) => e.status === "paid")) o.status = "completed";
    const c = L.customers.find((x) => x.id === o.customerId);
    if (c) refreshCustomer(L, c);
    ledger.save();
    return { payment: r.paymentRecord, warnings: r.warnings, outstanding: outstanding(o), orderStatus: o.status, nextDue: o.emiSchedule.find((e) => e.status !== "paid") ?? null };
  },
  "fin.ledger.customer_balance": (i) => {
    const L = ledger.get();
    const c = findCustomer(L, i.customerId);
    refreshCustomer(L, c);
    const orders = L.orders.filter((o) => o.customerId === c.id).map((o) => ({ orderId: o.id, item: o.itemName, status: o.status, monthlyEmi: o.monthlyEmi, paid: o.emiSchedule.filter((e) => e.status === "paid").length, overdue: o.emiSchedule.filter((e) => e.status === "overdue").map((e) => e.month), outstanding: outstanding(o) }));
    return { customer: { id: c.id, name: c.name, phone: c.phone, pincode: c.pincode, category: c.category, riskScore: c.riskScore }, totalCredits: c.totalCredits, totalPaid: c.totalPaid, outstanding: c.outstandingBalance, orders };
  },
  "fin.ledger.mark_overdue": () => {
    const L = ledger.get();
    const r = markOverdueEmis(L.orders);
    L.orders = r.updatedOrders;
    ledger.save();
    return { newlyOverdue: r.newlyOverdue, count: r.newlyOverdue.length };
  },
  "fin.whatsapp.parse_payment": (i) => {
    const p = parseWhatsAppPayment(str(i.message));
    const L = ledger.get();
    const cust = p.customerPhone ? L.customers.find((c) => c.phone === phone10(p.customerPhone)) : p.customerName ? L.customers.find((c) => c.name.toLowerCase().includes(p.customerName!.toLowerCase())) : undefined;
    const order = p.orderId ? L.orders.find((o) => o.id.includes(p.orderId!)) : cust ? L.orders.find((o) => o.customerId === cust.id && o.status === "active") : undefined;
    return { ...p, matchedCustomer: cust ? { id: cust.id, name: cust.name } : null, suggestedOrderId: order?.id ?? null };
  },
  "fin.whatsapp.send_receipt": async (i) => {
    const L = ledger.get();
    const o = findOrder(L, i.orderId);
    const c = findCustomer(L, o.customerId);
    const pay = [...L.payments].reverse().find((p) => p.orderId === o.id) ?? { id: "manual", customerId: c.id, orderId: o.id, amount: num(i.paymentAmount), method: "cash", receivedDate: today(), matched: true } as Payment;
    const text = generateReceipt(c, o, { ...pay, amount: num(i.paymentAmount, pay.amount) }, L.config);
    const r = await whatsapp(L, c.whatsappPhone ?? c.phone, text, "receipt");
    ledger.save();
    return r;
  },
  "fin.whatsapp.send_reminder": async (i) => {
    const L = ledger.get();
    const o = findOrder(L, i.orderId);
    const c = findCustomer(L, o.customerId);
    const missed = o.emiSchedule.filter((e) => e.status === "overdue" || e.status === "partial").map((e) => e.month);
    const r = await whatsapp(L, c.whatsappPhone ?? c.phone, generateReminder(c, o, missed.length ? missed : [o.emiSchedule.find((e) => e.status !== "paid")?.month ?? 1], L.config), "reminder");
    ledger.save();
    return { ...r, monthsMissed: missed };
  },
  "fin.whatsapp.batch_reminders": async (i) => {
    const L = ledger.get();
    markOverdueEmis(L.orders);
    const pins = list(i.pincodes);
    const minM = num(i.minOverdueMonths, 1);
    const out = [];
    for (const o of L.orders.filter((x) => x.status === "active" || x.status === "defaulted")) {
      if (pins.length && !pins.includes(o.pincode)) continue;
      const missed = o.emiSchedule.filter((e) => e.status === "overdue").map((e) => e.month);
      if (missed.length < minM) continue;
      const c = L.customers.find((x) => x.id === o.customerId);
      if (!c) continue;
      out.push(await whatsapp(L, c.whatsappPhone ?? c.phone, generateReminder(c, o, missed, L.config), "reminder"));
    }
    ledger.save();
    return { remindersPrepared: out.length, sent: out.filter((x) => x.sent).length, reminders: out };
  },
  "fin.route.assign_pincodes": (i) => {
    const L = ledger.get();
    let a = L.agents.find((x) => x.id === str(i.agentId) || x.name.toLowerCase() === str(i.agentId).toLowerCase());
    if (!a) { a = { id: str(i.agentId), name: str(i.agentId), phone: "", assignedPincodes: [], area: "", dailyTarget: 15, weeklyCollected: 0, active: true }; L.agents.push(a); }
    a.assignedPincodes = [...new Set([...a.assignedPincodes, ...list(i.pincodes)])];
    ledger.save();
    return { agent: a };
  },
  "fin.route.plan_daily": (i) => {
    const L = ledger.get();
    markOverdueEmis(L.orders);
    const agent = L.agents.find((x) => x.id === str(i.agentId));
    if (!agent) throw new Error(`agent ${str(i.agentId)} not found — assign pincodes first with fin.route.assign_pincodes`);
    const routes = planCollectionRoute([agent], L.orders, L.customers, str(i.date, today()));
    const route = routes.find((r) => r.agentId === agent.id) ?? routes[0];
    if (!route) return { agentId: agent.id, stops: [], message: "no dues in this agent's pincodes" };
    return { ...route, stops: route.stops.slice(0, num(i.maxStops, 15)) };
  },
  "fin.route.pincode_summary": (i) => {
    const L = ledger.get();
    const pin = str(i.pincode);
    const orders = L.orders.filter((o) => o.pincode === pin);
    return {
      pincode: pin, customers: new Set(orders.map((o) => o.customerId)).size, activeOrders: orders.filter((o) => o.status === "active").length,
      totalOutstanding: orders.reduce((s, o) => s + outstanding(o), 0), overdueEmis: orders.reduce((s, o) => s + o.emiSchedule.filter((e) => e.status === "overdue").length, 0),
      agents: L.agents.filter((a) => a.assignedPincodes.includes(pin)).map((a) => a.id),
    };
  },
  "fin.risk.detect_defaulters": (i) => {
    const L = ledger.get();
    markOverdueEmis(L.orders);
    let d = detectDefaulters(L.orders, L.customers, L.config);
    if (i.pincode) d = d.filter((x) => x.pincode === str(i.pincode));
    d = d.filter((x) => x.riskScore >= num(i.minRiskScore, 30));
    return { count: d.length, totalAtRisk: d.reduce((s, x) => s + x.totalOutstanding, 0), defaulters: d };
  },
  "fin.risk.total_credit_exposure": () => {
    const L = ledger.get();
    const active = L.orders.filter((o) => o.status === "active" || o.status === "defaulted");
    const byFin: Record<string, number> = {};
    for (const o of active) byFin[o.financedBy] = (byFin[o.financedBy] ?? 0) + outstanding(o);
    const overdue = active.reduce((s, o) => s + o.emiSchedule.filter((e) => e.status === "overdue").reduce((a, e) => a + e.amount - e.paidAmount, 0), 0);
    return { activeOrders: active.length, totalOutstanding: active.reduce((s, o) => s + outstanding(o), 0), totalOverdue: overdue, byFinancier: byFin, customers: L.customers.length };
  },
  "fin.risk.weekly_summary": (i) => {
    const L = ledger.get();
    const start = str(i.weekStarting, new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
    const end = new Date(new Date(start).getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const pays = L.payments.filter((p) => p.receivedDate >= start && p.receivedDate < end);
    const due = L.orders.flatMap((o) => o.emiSchedule).filter((e) => e.dueDate >= start && e.dueDate < end);
    const expected = due.reduce((s, e) => s + e.amount, 0), collected = pays.reduce((s, p) => s + p.amount, 0);
    return { weekStarting: start, expected, collected, collectionRate: expected ? r2((collected / expected) * 100) : null, payments: pays.length, newOrders: L.orders.filter((o) => o.orderDate >= start && o.orderDate < end).length, defaulters: detectDefaulters(L.orders, L.customers, L.config).length };
  },
  "fin.reconcile.match_transactions": (i) => {
    const L = ledger.get();
    const tx = json<any[]>(i.transactions).map((t, k): PhonePeTransaction => ({ id: `TX${k}`, transactionId: str(t.transactionId ?? t.upiRef ?? `TX${k}`), upiRef: str(t.upiRef), amount: num(t.amount), senderPhone: phone10(t.phone ?? t.senderPhone), senderName: t.name, receivedDate: str(t.date ?? i.date, today()), status: "success", matched: false }));
    const r = reconcilePayments(tx, L.orders, L.customers);
    return { matched: r.matched.length, unmatched: r.unmatched.length, suspected: r.suspected.length, details: r, next: "Record matched payments with fin.ledger.record_payment (orderId, amount, method=phonepe, transactionRef=upiRef)." };
  },
  "fin.reconcile.daily_settlement": (i) => { const L = ledger.get(); return generateSettlementReport(L.payments, L.orders, L.agents, str(i.date, today())); },
  "fin.analytics.duckdb_query": (i) => {
    const t = ledgerTables(ledger.get());
    const res = executeQuery(str(i.query), (n) => t.get(n));
    return { tables: [...t.keys()], columns: res.columnNames(), rows: res.rows().slice(0, 200), rowCount: res.rowCount };
  },
  "fin.analytics.financier_report": () => {
    const L = ledger.get();
    const by: Record<string, { orders: number; financed: number; collected: number; outstanding: number; overdue: number }> = {};
    for (const o of L.orders) {
      const f = (by[o.financedBy] ??= { orders: 0, financed: 0, collected: 0, outstanding: 0, overdue: 0 });
      f.orders++; f.financed += o.totalAmount; f.collected += o.totalAmount - outstanding(o); f.outstanding += outstanding(o);
      f.overdue += o.emiSchedule.filter((e) => e.status === "overdue").reduce((a, e) => a + e.amount - e.paidAmount, 0);
    }
    return { financiers: by };
  },
  "fin.analytics.monthly_trend": () => {
    const L = ledger.get();
    const m: Record<string, { newOrders: number; disbursed: number; collected: number }> = {};
    for (const o of L.orders) { const k = monthKey(o.orderDate); (m[k] ??= { newOrders: 0, disbursed: 0, collected: 0 }); m[k].newOrders++; m[k].disbursed += o.sellingPrice; }
    for (const p of L.payments) { const k = monthKey(p.receivedDate); (m[k] ??= { newOrders: 0, disbursed: 0, collected: 0 }); m[k].collected += p.amount; }
    return { months: Object.keys(m).sort().map((k) => ({ month: k, ...m[k] })) };
  },
  "fin.analytics.agent_leaderboard": (i) => {
    const L = ledger.get();
    const days = { today: 1, week: 7, month: 30 }[str(i.period, "week")] ?? 7;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const by: Record<string, { collected: number; payments: number }> = {};
    for (const p of L.payments.filter((x) => x.receivedDate >= since)) { const k = p.receivedBy ?? "direct"; (by[k] ??= { collected: 0, payments: 0 }); by[k].collected += p.amount; by[k].payments++; }
    return { period: str(i.period, "week"), leaderboard: Object.entries(by).map(([agent, v]) => ({ agent, ...v })).sort((a, b) => b.collected - a.collected) };
  },
  "fin.analytics.emi_collection_rate": (i) => {
    const L = ledger.get();
    const days = num(i.days, 7);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), now = today();
    const due = L.orders.flatMap((o) => o.emiSchedule).filter((e) => e.dueDate >= since && e.dueDate <= now);
    const expected = due.reduce((s, e) => s + e.amount, 0), collected = due.reduce((s, e) => s + e.paidAmount, 0);
    return { days, emisDue: due.length, expected, collected, collectionRate: expected ? r2((collected / expected) * 100) : null };
  },
  "fin.customer.search": (i) => {
    const L = ledger.get();
    const q = str(i.query).toLowerCase();
    const ids = new Set(L.orders.filter((o) => o.id.toLowerCase().includes(q)).map((o) => o.customerId));
    return { results: L.customers.filter((c) => ids.has(c.id) || c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, "") || "~")).map((c) => { refreshCustomer(L, c); return { id: c.id, name: c.name, phone: c.phone, pincode: c.pincode, outstanding: c.outstandingBalance, orders: L.orders.filter((o) => o.customerId === c.id).map((o) => o.id) }; }) };
  },
  "fin.customer.list_by_pincode": (i) => {
    const L = ledger.get();
    const all = bool(i.includeCompleted);
    return { pincode: str(i.pincode), customers: L.customers.filter((c) => c.pincode === str(i.pincode)).map((c) => ({ id: c.id, name: c.name, phone: c.phone, address: c.address, orders: L.orders.filter((o) => o.customerId === c.id && (all || o.status !== "completed")).map((o) => ({ id: o.id, item: o.itemName, status: o.status, outstanding: outstanding(o) })) })).filter((c) => c.orders.length || all) };
  },

  // ── chit funds ──
  "chit.group.create": (i) => {
    const members = json<any[]>(i.members).map((m) => ({ name: str(m.name), phone: str(m.phone), address: str(m.address) }));
    const g = createChitGroup({ name: str(i.name), chitValue: num(i.chitValue), numberOfMembers: num(i.numberOfMembers, members.length), state: str(i.state, "Tamil Nadu"), registrationNumber: str(i.registrationNumber, "PENDING"), startDate: str(i.startDate, today()), members });
    chits.get().groups.push(g);
    chits.save();
    return { groupId: g.id, monthlyContribution: g.monthlyContribution, foremanCommission: g.foremanCommission, members: g.members.map((m) => ({ id: m.id, name: m.name })) };
  },
  "chit.round.bid": (i) => {
    const g = getGroup(i.groupId);
    const r = recordBid(g, str(i.memberId), num(i.bidAmount));
    const pending = ((g as any).pendingBids ??= []) as ChitBid[];
    if (r.success && r.bid) { const k = pending.findIndex((b) => b.memberId === r.bid!.memberId); if (k >= 0) pending[k] = r.bid; else pending.push(r.bid); chits.save(); }
    return { ...r, round: g.currentRound, bidsSoFar: pending.length };
  },
  "chit.round.close": (i) => {
    const g = getGroup(i.groupId);
    let bids = (g as any).pendingBids as ChitBid[] | undefined;
    if (i.bids) bids = json<any[]>(i.bids).map((b) => { const r = recordBid(g, str(b.memberId), num(b.bidAmount)); if (!r.success || !r.bid) throw new Error(r.errors.join("; ")); return r.bid; });
    if (!bids?.length) throw new Error("no bids for this round");
    const r = closeBidding(g, bids);
    g.rounds.push(r.round);
    const w = g.members.find((m) => m.id === r.winnerBid.memberId);
    if (w) { w.hasWonPrize = true; w.wonRound = g.currentRound; w.totalPrizeWon += r.winnerBid.bidAmount; }
    g.currentRound += 1;
    g.status = g.currentRound > g.durationMonths ? "completed" : "active";
    delete (g as any).pendingBids;
    chits.save();
    return { summary: r.summary, winner: r.winnerBid, dividendPerMember: r2(r.dividendPerMember), nextRound: g.currentRound };
  },
  "chit.collection.record": (i) => {
    const g = getGroup(i.groupId);
    const round = g.rounds[g.rounds.length - 1];
    if (!round) throw new Error("no round closed yet — close bidding first");
    const r = recordCollection(round, str(i.memberId), num(i.amount), (str(i.method, "cash").toLowerCase() as any));
    Object.assign(round, r.round);
    const m = g.members.find((x) => x.id === str(i.memberId));
    if (m && r.updated) m.totalContributed += num(i.amount);
    chits.save();
    return { updated: r.updated, warnings: r.warnings, round: round.roundNumber, collected: round.totalCollected, pending: round.totalPending };
  },
  "chit.member.statement": (i) => { const g = getGroup(i.groupId); const m = g.members.find((x) => x.id === str(i.memberId)); if (!m) throw new Error("member not found"); return calculateMemberDividends(m, g.rounds); },
  "chit.foreman.report": (i) => generateForemanReport(getGroup(i.groupId)),
  "chit.compliance.check": (i) => checkCompliance(getGroup(i.groupId)),
  "chit.default.notice": (i) => {
    const g = getGroup(i.groupId);
    const m = g.members.find((x) => x.id === str(i.memberId));
    if (!m) throw new Error("member not found");
    const notice = generateDefaultNotice(m, g, list(i.missedRounds).map(Number));
    return { notice, message: formatNoticeMessage(notice, g), whatsappLink: `https://wa.me/91${phone10(m.phone)}?text=${encodeURIComponent(formatNoticeMessage(notice, g))}` };
  },
  "chit.dashboard": () => chitDashboard(chits.get().groups),

  // ── real estate ──
  "re.project.create": (i) => {
    const p = createProject({
      name: str(i.name), location: str(i.location), city: str(i.city), state: str(i.state), type: (str(i.type, "apartment") as any),
      landAreaAcres: num(i.landAreaAcres), floors: num(i.floors), configuration: str(i.configuration, "2BHK, 3BHK"),
      expectedCompletion: str(i.expectedCompletion, new Date(Date.now() + 3 * 365 * 86400000).toISOString().slice(0, 10)),
      landCost: num(i.landCost), constructionCostPerSqFt: num(i.constructionCostPerSqFt), sellingPricePerSqFt: num(i.sellingPricePerSqFt),
    });
    realty.get().projects.push(p);
    realty.save();
    const { units: _u, ...summary } = p as any;
    return { projectId: p.id, project: summary, next: "Generate unit inventory with re.unit.pricing" };
  },
  "re.cost.estimate": (i) => estimateProjectCosts(num(i.landAreaAcres), num(i.floors), num(i.constructionCostPerSqFt), num(i.sellingPricePerSqFt), str(i.state)),
  "re.sales.pipeline": (i) => generateSalesPipeline(getProject(i.projectId)),
  "re.crm.followup": (i) => generateFollowUpList(getProject(i.projectId)),
  "re.cashflow.report": (i) => generateCashFlowReport(getProject(i.projectId), realty.get().cashflow, str(i.period, "month")),
  "re.profitability": (i) => calculateProfitability(getProject(i.projectId)),
  "re.compliance.track": (i) => trackCompliance(getProject(i.projectId)),
  "re.forecast.revenue": (i) => forecastRevenue(getProject(i.projectId), num(i.monthsAhead, 12)),
  "re.dashboard": () => generateREDashboard(realty.get().projects),
  "re.unit.pricing": (i) => {
    const p = getProject(i.projectId);
    const base = num(i.basePricePerSqFt, (p as any).sellingPricePerSqFt ?? 5000);
    const rise = num(i.floorRise, 50);
    const facing = json<Record<string, number>>(i.facingPremiums, { north: 0, south: 2, east: 5, west: 3 });
    const floors = Math.max(1, (p as any).floors ?? 1);
    const totalUnits = Math.max(1, (p as any).totalUnits ?? floors * 4);
    const perFloor = Math.max(1, Math.ceil(totalUnits / floors));
    const facings = ["east", "north", "west", "south"] as const;
    const units: REUnit[] = [];
    for (let f = 1; f <= floors && units.length < totalUnits; f++) for (let k = 0; k < perFloor && units.length < totalUnits; k++) {
      const area = [1050, 1250, 1650][k % 3], type = (["2bhk", "2bhk", "3bhk"] as const)[k % 3], face = facings[k % 4];
      const pps = base + rise * (f - 1) + base * ((facing[face] ?? 0) / 100);
      const existing = p.units.find((u) => u.unitNumber === `${f}${String(k + 1).padStart(2, "0")}`);
      units.push({
        ...(existing ?? {}), id: existing?.id ?? uid("UNIT"), projectId: p.id, unitNumber: `${f}${String(k + 1).padStart(2, "0")}`, floor: f, type,
        carpetArea: Math.round(area * 0.75), builtUpArea: Math.round(area * 0.9), superBuiltUpArea: area, facing: face,
        status: existing?.status ?? "available", basePrice: Math.round(base * area), pricePerSqFt: Math.round(pps),
        floorRise: rise * (f - 1), facingPremium: Math.round(base * ((facing[face] ?? 0) / 100)), totalPrice: Math.round(pps * area),
      } as REUnit);
    }
    p.units = units;
    realty.save();
    const prices = units.map((u) => u.totalPrice);
    return { projectId: p.id, units: units.length, priceRange: { min: Math.min(...prices), max: Math.max(...prices) }, sample: units.slice(0, 8).map((u) => ({ unit: u.unitNumber, type: u.type, facing: u.facing, area: u.superBuiltUpArea, pricePerSqFt: u.pricePerSqFt, totalPrice: u.totalPrice })) };
  },
});
