/**
 * Microfinance & Credit Business Engine
 *
 * Designed for small shopkeepers who sell appliances on credit
 * (e.g., ₹3 interest per 10 months). Handles:
 * - Customer ledger with EMI schedules
 * - Payment tracking (PhonePe/UPI + Cash)
 * - WhatsApp message parsing
 * - Collection route planning (pincode-based)
 * - Defaulter detection & risk scoring
 * - DuckDB-compatible analytics
 */

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface BusinessConfig {
  businessName: string;
  ownerPhone: string;
  whatsappNumber: string;
  defaultInterestRate: number;       // e.g. 3 (₹3 flat per month)
  defaultTenure: number;             // e.g. 10 months
  gstRate: number;                   // e.g. 18 (%)
  currency: string;                  // INR
  paymentMethods: ("phonepe" | "cash" | "bank_transfer")[];
  timezone: string;                  // Asia/Kolkata
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  whatsappPhone?: string;
  pincode: string;
  address: string;
  landmark?: string;
  aadhaarLast4?: string;
  category: "regular" | "new" | "risky" | "defaulted";
  riskScore: number;                 // 0-100 (higher = riskier)
  createdAt: string;
  notes?: string;
  totalCredits: number;
  totalPaid: number;
  outstandingBalance: number;
}

export interface CreditOrder {
  id: string;
  customerId: string;
  itemName: string;
  itemDescription?: string;
  itemCategory: "electrical" | "appliance" | "other";
  purchasePrice: number;             // Cost to shopkeeper
  sellingPrice: number;              // Price charged to customer
  interestPerMonth: number;          // ₹3 flat
  tenure: number;                    // 10 months
  totalAmount: number;               // sellingPrice + (interestPerMonth × tenure)
  monthlyEmi: number;                // totalAmount / tenure
  financedBy: string;                // Financier name or "self"
  orderDate: string;
  deliveryDate?: string;
  status: "active" | "completed" | "defaulted" | "repossessed";
  emiSchedule: EmiSchedule[];
  pincode: string;
  collectionAgentId?: string;
}

export interface EmiSchedule {
  month: number;
  dueDate: string;
  amount: number;
  status: "pending" | "paid" | "overdue" | "partial";
  paidAmount: number;
  paidDate?: string;
  paymentMethod?: "phonepe" | "cash" | "bank_transfer";
  transactionRef?: string;
  collectedBy?: string;              // Agent ID or "phonepe-auto"
  notes?: string;
}

export interface Payment {
  id: string;
  customerId: string;
  orderId: string;
  amount: number;
  method: "phonepe" | "cash" | "bank_transfer";
  transactionRef?: string;           // PhonePe UPI ref or cash receipt #
  receivedDate: string;
  receivedBy?: string;               // Agent ID or "direct"
  matched: boolean;
  matchedEmiMonth?: number;
  notes?: string;
}

export interface PhonePeTransaction {
  id: string;
  transactionId: string;
  upiRef: string;
  amount: number;
  senderPhone: string;
  senderName?: string;
  receivedDate: string;
  status: "success" | "pending" | "failed";
  matched: boolean;
  matchedPaymentId?: string;
}

export interface CollectionAgent {
  id: string;
  name: string;
  phone: string;
  assignedPincodes: string[];
  area: string;
  dailyTarget: number;
  weeklyCollected: number;
  active: boolean;
}

export interface CollectionRoute {
  agentId: string;
  date: string;
  stops: CollectionStop[];
  totalExpected: number;
  totalCollected: number;
  pincodes: string[];
}

export interface CollectionStop {
  customerId: string;
  customerName: string;
  phone: string;
  address: string;
  pincode: string;
  landmark?: string;
  orderId: string;
  itemName: string;
  dueMonth: number;
  emiAmount: number;
  totalOutstanding: number;
  daysOverdue: number;
  priority: "urgent" | "high" | "medium" | "low";
  lastPaymentDate?: string;
  notes?: string;
  sequence: number;
}

export interface Defaulter {
  customerId: string;
  customerName: string;
  phone: string;
  pincode: string;
  orderId: string;
  itemName: string;
  monthsMissed: number[];
  totalOutstanding: number;
  totalOverdue: number;
  riskScore: number;
  riskFactors: string[];
  lastContactDate?: string;
  lastPaymentDate?: string;
  escalationLevel: 0 | 1 | 2 | 3;   // 0=normal, 3=legal
  recommendedAction: string;
}

export interface SettlementReport {
  date: string;
  totalExpected: number;
  totalCollected: number;
  totalPending: number;
  collectionRate: number;            // percentage
  cashCollected: number;
  phonepeCollected: number;
  newDefaulters: number;
  resolvedDefaulters: number;
  agentPerformance: AgentPerformance[];
}

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  assigned: number;
  collected: number;
  collectionRate: number;
  avgTimePerStop: number;            // minutes
  pincodesCovered: string[];
}

// ─── Ledger Engine ───────────────────────────────────────────────────────────

/**
 * Create a new credit order with full EMI schedule.
 * This is the core function — it generates a 10-month EMI plan.
 */
export function createCreditOrder(
  customer: Customer,
  config: BusinessConfig,
  params: {
    itemName: string;
    itemDescription?: string;
    itemCategory: "electrical" | "appliance" | "other";
    purchasePrice: number;
    sellingPrice: number;
    financedBy?: string;
  },
): CreditOrder {
  const interestPerMonth = config.defaultInterestRate;
  const tenure = config.defaultTenure;
  const totalInterest = interestPerMonth * tenure;
  const totalAmount = params.sellingPrice + totalInterest;
  const monthlyEmi = Math.ceil(totalAmount / tenure);

  const emiSchedule: EmiSchedule[] = [];
  const startDate = new Date();

  for (let i = 0; i < tenure; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    emiSchedule.push({
      month: i + 1,
      dueDate: dueDate.toISOString().split("T")[0],
      amount: monthlyEmi,
      status: i === 0 ? "pending" : "pending",
      paidAmount: 0,
    });
  }

  return {
    id: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    customerId: customer.id,
    itemName: params.itemName,
    itemDescription: params.itemDescription,
    itemCategory: params.itemCategory,
    purchasePrice: params.purchasePrice,
    sellingPrice: params.sellingPrice,
    interestPerMonth,
    tenure,
    totalAmount,
    monthlyEmi,
    financedBy: params.financedBy || "self",
    orderDate: startDate.toISOString().split("T")[0],
    status: "active",
    emiSchedule,
    pincode: customer.pincode,
  };
}

/**
 * Record a payment against a specific EMI.
 * Returns the updated order and any mismatch warnings.
 */
export function recordPayment(
  order: CreditOrder,
  payment: {
    amount: number;
    method: "phonepe" | "cash" | "bank_transfer";
    transactionRef?: string;
    receivedBy?: string;
    date?: string;
  },
): {
  order: CreditOrder;
  paymentRecord: Payment;
  warnings: string[];
} {
  const warnings: string[] = [];
  const paymentDate = payment.date || new Date().toISOString().split("T")[0];

  // Find the current pending EMI
  const pendingEmi = order.emiSchedule.find(
    (e) => e.status === "pending" || e.status === "overdue" || e.status === "partial",
  );

  if (!pendingEmi) {
    warnings.push("No pending EMI found — order may already be fully paid.");
    return { order, paymentRecord: {} as Payment, warnings };
  }

  // Check overpayment
  const remainingDue = pendingEmi.amount - pendingEmi.paidAmount;
  if (payment.amount > remainingDue + pendingEmi.amount * 0.5) {
    warnings.push(
      `Payment ₹${payment.amount} significantly exceeds EMI ₹${pendingEmi.amount}. Verify amount.`,
    );
  }

  // Check underpayment
  if (payment.amount < remainingDue * 0.5 && payment.amount < pendingEmi.amount) {
    warnings.push(
      `Partial payment ₹${payment.amount} against EMI ₹${remainingDue}. Marking as partial.`,
    );
    pendingEmi.status = "partial";
    pendingEmi.paidAmount += payment.amount;
  } else {
    // Full payment for this month
    const actualPaid = Math.min(payment.amount, remainingDue);
    pendingEmi.paidAmount += actualPaid;
    pendingEmi.status = "paid";
    pendingEmi.paidDate = paymentDate;
    pendingEmi.paymentMethod = payment.method;
    pendingEmi.transactionRef = payment.transactionRef;
    pendingEmi.collectedBy = payment.receivedBy;

    // If there's excess, apply to next EMI
    if (payment.amount > remainingDue) {
      const excess = payment.amount - remainingDue;
      const nextEmi = order.emiSchedule.find((e) => e.status === "pending");
      if (nextEmi) {
        nextEmi.paidAmount += excess;
        warnings.push(`Excess ₹${excess} applied to month ${nextEmi.month}.`);
      }
    }

    // Check if order is fully paid
    const allPaid = order.emiSchedule.every((e) => e.status === "paid");
    if (allPaid) {
      order.status = "completed";
      warnings.push("🎉 Order fully paid! Marked as completed.");
    }
  }

  const paymentRecord: Payment = {
    id: `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    customerId: order.customerId,
    orderId: order.id,
    amount: payment.amount,
    method: payment.method,
    transactionRef: payment.transactionRef,
    receivedDate: paymentDate,
    receivedBy: payment.receivedBy,
    matched: true,
    matchedEmiMonth: pendingEmi.month,
  };

  return { order, paymentRecord, warnings };
}

/**
 * Mark an EMI as overdue if past due date.
 * Run daily to keep the ledger accurate.
 */
export function markOverdueEmis(orders: CreditOrder[]): {
  updatedOrders: CreditOrder[];
  newlyOverdue: { orderId: string; customerId: string; month: number; daysOverdue: number }[];
} {
  const today = new Date();
  const newlyOverdue: { orderId: string; customerId: string; month: number; daysOverdue: number }[] = [];

  const updatedOrders = orders.map((order) => {
    if (order.status !== "active") return order;

    const updatedSchedule = order.emiSchedule.map((emi) => {
      if (emi.status === "pending") {
        const dueDate = new Date(emi.dueDate);
        if (dueDate < today) {
          const daysOverdue = Math.floor(
            (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          newlyOverdue.push({
            orderId: order.id,
            customerId: order.customerId,
            month: emi.month,
            daysOverdue,
          });
          return { ...emi, status: "overdue" as const };
        }
      }
      return emi;
    });

    // Check if too many months missed → default
    const missedMonths = updatedSchedule.filter(
      (e) => e.status === "overdue" && daysSince(e.dueDate) > 30,
    ).length;

    return {
      ...order,
      emiSchedule: updatedSchedule,
      status: missedMonths >= 3 ? ("defaulted" as const) : order.status,
    };
  });

  return { updatedOrders, newlyOverdue };
}

// ─── WhatsApp Message Parser ─────────────────────────────────────────────────

/**
 * Parse WhatsApp messages to extract payment information.
 * Handles messages like:
 * - "Rs 500 received from Ramesh for ORD-123"
 * - "PhonePe ₹300 Ramesh 9876543210"
 * - "Cash received Rs 500 Ramesh month 3"
 */
export function parseWhatsAppPayment(message: string): {
  detected: boolean;
  amount?: number;
  customerName?: string;
  customerPhone?: string;
  orderId?: string;
  month?: number;
  method: "phonepe" | "cash" | "unknown";
  rawMessage: string;
  confidence: number;
} {
  const raw = message.trim();
  const lower = raw.toLowerCase();

  // Extract amount
  const amountMatch = raw.match(
    /(?:rs\.?|₹|inr|rupees?)\s*(\d[\d,]*\.?\d*)/i,
  );
  const amount = amountMatch
    ? parseFloat(amountMatch[1].replace(/,/g, ""))
    : undefined;

  // Extract phone number
  const phoneMatch = raw.match(/(\d{10})/);
  const phone = phoneMatch ? phoneMatch[1] : undefined;

  // Extract order ID
  const orderMatch = raw.match(/(ORD-\d{4,}-?\w{4,})/i);
  const orderId = orderMatch ? orderMatch[1].toUpperCase() : undefined;

  // Extract month
  const monthMatch = raw.match(/(?:month|emi|inst(?:allment)?|kist)\s*(\d{1,2})/i);
  const month = monthMatch ? parseInt(monthMatch[1]) : undefined;

  // Extract customer name (word after common patterns)
  const namePatterns = [
    /(?:from|name|customer|paid\s+by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /(?:received|payment)\s+(?:from\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  ];
  let customerName: string | undefined;
  for (const pat of namePatterns) {
    const m = raw.match(pat);
    if (m) {
      customerName = m[1];
      break;
    }
  }

  // Detect payment method
  let method: "phonepe" | "cash" | "unknown" = "unknown";
  if (lower.includes("phonepe") || lower.includes("phone pay") || lower.includes("upi")) {
    method = "phonepe";
  } else if (lower.includes("cash") || lower.includes("नगद") || lower.includes("రోకడ్")) {
    method = "cash";
  } else if (amount && phone) {
    method = "phonepe"; // If amount + phone detected, likely PhonePe
  }

  // Calculate confidence
  let confidence = 0;
  if (amount) confidence += 40;
  if (customerName) confidence += 20;
  if (orderId) confidence += 20;
  if (phone) confidence += 10;
  if (method !== "unknown") confidence += 10;

  return {
    detected: confidence >= 40,
    amount,
    customerName,
    customerPhone: phone,
    orderId,
    month,
    method,
    rawMessage: raw,
    confidence,
  };
}

/**
 * Generate a WhatsApp receipt message for a customer.
 */
export function generateReceipt(
  customer: Customer,
  order: CreditOrder,
  payment: Payment,
  config: BusinessConfig,
): string {
  const emi = order.emiSchedule.find(
    (e) => e.month === payment.matchedEmiMonth,
  );
  const paidMonths = order.emiSchedule.filter((e) => e.status === "paid").length;
  const remaining = order.totalAmount - order.emiSchedule.reduce(
    (sum, e) => sum + e.paidAmount, 0,
  );

  const currency = "₹";
  const lines = [
    `✅ *Payment Received*`,
    ``,
    `Dear *${customer.name}*,`,
    ``,
    `📦 Item: ${order.itemName}`,
    `📅 Month: ${emi ? emi.month : payment.matchedEmiMonth} of ${order.tenure}`,
    `💰 Amount: ${currency}${payment.amount}`,
    `💳 Method: ${payment.method === "phonepe" ? "PhonePe" : "Cash"}`,
    payment.transactionRef ? `🔗 Ref: ${payment.transactionRef}` : null,
    ``,
    `📊 *Summary*`,
    `• Paid: ${paidMonths}/${order.tenure} months`,
    `• Remaining: ${currency}${remaining}`,
    `• Next EMI due: ${emi ? nextEmiDate(order, emi.month) : "N/A"}`,
    ``,
    `Thank you for your payment! 🙏`,
    `— ${config.businessName}`,
  ];

  return lines.filter(Boolean).join("\n");
}

/**
 * Generate a defaulter reminder message.
 */
export function generateReminder(
  customer: Customer,
  order: CreditOrder,
  monthsMissed: number[],
  config: BusinessConfig,
): string {
  const totalDue = monthsMissed.length * order.monthlyEmi;
  const lastMonth = Math.max(...monthsMissed);

  return [
    `📋 *Payment Reminder*`,
    ``,
    `Dear *${customer.name}*,`,
    ``,
    `Your EMI for *${order.itemName}* is pending.`,
    `📅 Missed months: ${monthsMissed.join(", ")}`,
    `💰 Amount due: ₹${totalDue}`,
    ``,
    `Please pay at your earliest convenience.`,
    `📱 PhonePe: ${config.ownerPhone}`,
    ``,
    `— ${config.businessName}`,
  ].join("\n");
}

// ─── Collection Route Planner ────────────────────────────────────────────────

/**
 * Plan a collection route for an agent based on pincode areas.
 * Groups customers by pincode, prioritizes by overdue days.
 */
export function planCollectionRoute(
  agents: CollectionAgent[],
  orders: CreditOrder[],
  customers: Customer[],
  date: string,
): CollectionRoute[] {
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const today = new Date(date);

  return agents
    .filter((a) => a.active)
    .map((agent) => {
      // Find all active orders in agent's assigned pincodes
      const relevantOrders = orders.filter(
        (o) =>
          o.status === "active" &&
          agent.assignedPincodes.includes(o.pincode) &&
          o.emiSchedule.some(
            (e) => e.status === "pending" || e.status === "overdue" || e.status === "partial",
          ),
      );

      // Build stops
      const stops: CollectionStop[] = relevantOrders
        .map((order) => {
          const customer = customerMap.get(order.customerId);
          if (!customer) return null;

          const currentEmi = order.emiSchedule.find(
            (e) => e.status === "pending" || e.status === "overdue" || e.status === "partial",
          );
          if (!currentEmi) return null;

          const dueDate = new Date(currentEmi.dueDate);
          const daysOverdue = Math.max(
            0,
            Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
          );

          const totalOutstanding = order.emiSchedule
            .filter((e) => e.status !== "paid")
            .reduce((sum, e) => sum + (e.amount - e.paidAmount), 0);

          let priority: CollectionStop["priority"] = "low";
          if (daysOverdue > 60) priority = "urgent";
          else if (daysOverdue > 30) priority = "high";
          else if (daysOverdue > 10) priority = "medium";

          const lastPaid = [...order.emiSchedule]
            .reverse()
            .find((e) => e.status === "paid");

          return {
            customerId: customer.id,
            customerName: customer.name,
            phone: customer.phone,
            address: customer.address,
            pincode: customer.pincode,
            landmark: customer.landmark,
            orderId: order.id,
            itemName: order.itemName,
            dueMonth: currentEmi.month,
            emiAmount: currentEmi.amount - currentEmi.paidAmount,
            totalOutstanding,
            daysOverdue,
            priority,
            lastPaymentDate: lastPaid?.paidDate,
            sequence: 0,
          };
        })
        .filter(Boolean) as CollectionStop[];

      // Sort by priority then by pincode (route optimization)
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      stops.sort((a, b) => {
        const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (pDiff !== 0) return pDiff;
        // Within same priority, group by pincode for route efficiency
        if (a.pincode !== b.pincode) return a.pincode.localeCompare(b.pincode);
        return b.totalOutstanding - a.totalOutstanding;
      });

      // Assign sequence numbers
      stops.forEach((stop, i) => {
        stop.sequence = i + 1;
      });

      const pincodes = [...new Set(stops.map((s) => s.pincode))];

      return {
        agentId: agent.id,
        date,
        stops,
        totalExpected: stops.reduce((sum, s) => sum + s.emiAmount, 0),
        totalCollected: 0,
        pincodes,
      };
    });
}

// ─── Defaulter Detection ─────────────────────────────────────────────────────

/**
 * Detect defaulters and generate risk scores.
 * Returns prioritized list with recommended actions.
 */
export function detectDefaulters(
  orders: CreditOrder[],
  customers: Customer[],
  config: BusinessConfig,
): Defaulter[] {
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const today = new Date();

  return orders
    .filter((o) => o.status === "active" || o.status === "defaulted")
    .flatMap((order) => {
      const customer = customerMap.get(order.customerId);
      if (!customer) return [];

      const missedMonths = order.emiSchedule
        .filter((e) => e.status === "overdue" || (e.status === "pending" && new Date(e.dueDate) < today))
        .map((e) => e.month);

      const totalOutstanding = order.emiSchedule
        .filter((e) => e.status !== "paid")
        .reduce((sum, e) => sum + (e.amount - e.paidAmount), 0);

      const totalOverdue = order.emiSchedule
        .filter((e) => e.status === "overdue")
        .reduce((sum, e) => sum + (e.amount - e.paidAmount), 0);

      // Risk scoring
      let riskScore = 0;
      const riskFactors: string[] = [];

      if (missedMonths.length >= 3) { riskScore += 40; riskFactors.push(`${missedMonths.length} months missed`); }
      if (missedMonths.length >= 2) { riskScore += 20; riskFactors.push("Multiple missed payments"); }
      if (missedMonths.length === 1) { riskScore += 5; }

      // Check consecutive misses
      const isConsecutive = missedMonths.every(
        (m, i) => i === 0 || m === missedMonths[i - 1] + 1,
      );
      if (isConsecutive && missedMonths.length >= 2) {
        riskScore += 15;
        riskFactors.push("Consecutive missed payments");
      }

      // Check last payment recency
      const lastPaid = [...order.emiSchedule].reverse().find((e) => e.status === "paid");
      if (lastPaid?.paidDate) {
        const daysSinceLastPayment = Math.floor(
          (today.getTime() - new Date(lastPaid.paidDate).getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysSinceLastPayment > 90) {
          riskScore += 25;
          riskFactors.push(`No payment in ${daysSinceLastPayment} days`);
        } else if (daysSinceLastPayment > 60) {
          riskScore += 15;
          riskFactors.push(`No payment in ${daysSinceLastPayment} days`);
        }
      }

      // High outstanding increases risk
      if (totalOutstanding > order.totalAmount * 0.5) {
        riskScore += 10;
        riskFactors.push("More than 50% outstanding");
      }

      riskScore = Math.min(100, riskScore);

      // Escalation level
      let escalationLevel: 0 | 1 | 2 | 3 = 0;
      if (riskScore >= 80) escalationLevel = 3;
      else if (riskScore >= 60) escalationLevel = 2;
      else if (riskScore >= 30) escalationLevel = 1;

      // Recommended action
      let recommendedAction = "";
      switch (escalationLevel) {
        case 0:
          recommendedAction = "Send WhatsApp reminder. No action needed.";
          break;
        case 1:
          recommendedAction = "Call customer. If no response in 3 days, visit home.";
          break;
        case 2:
          recommendedAction = "Visit home. Collect full overdue amount. Warn about repossession.";
          break;
        case 3:
          recommendedAction = "Final notice. Initiate repossession process. Consider legal action.";
          break;
      }

      const lastContact = lastPaid?.paidDate;

      if (missedMonths.length === 0) return [];

      return [{
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
        pincode: customer.pincode,
        orderId: order.id,
        itemName: order.itemName,
        monthsMissed: missedMonths,
        totalOutstanding,
        totalOverdue,
        riskScore,
        riskFactors,
        lastContactDate: lastContact,
        lastPaymentDate: lastPaid?.paidDate,
        escalationLevel,
        recommendedAction,
      }];
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

// ─── PhonePe Reconciliation ─────────────────────────────────────────────────

/**
 * Match incoming PhonePe transactions against expected EMIs.
 * Identifies matches, mismatches, and unknown payments.
 */
export function reconcilePayments(
  transactions: PhonePeTransaction[],
  orders: CreditOrder[],
  customers: Customer[],
): {
  matched: { transaction: PhonePeTransaction; orderId: string; customerId: string; month: number }[];
  unmatched: PhonePeTransaction[];
  suspected: { transaction: PhonePeTransaction; possibleCustomers: string[] }[];
} {
  const customerPhoneMap = new Map<string, string>();
  customers.forEach((c) => {
    customerPhoneMap.set(c.phone, c.id);
    if (c.whatsappPhone) customerPhoneMap.set(c.whatsappPhone, c.id);
  });

  const matched: { transaction: PhonePeTransaction; orderId: string; customerId: string; month: number }[] = [];
  const unmatched: PhonePeTransaction[] = [];
  const suspected: { transaction: PhonePeTransaction; possibleCustomers: string[] }[] = [];

  for (const txn of transactions.filter((t) => !t.matched && t.status === "success")) {
    // Find customer by phone
    const customerId = customerPhoneMap.get(txn.senderPhone);

    if (customerId) {
      // Find active order for this customer
      const activeOrder = orders.find(
        (o) => o.customerId === customerId && o.status === "active",
      );

      if (activeOrder) {
        // Find matching pending EMI
        const pendingEmi = activeOrder.emiSchedule.find(
          (e) =>
            (e.status === "pending" || e.status === "overdue" || e.status === "partial") &&
            Math.abs(e.amount - e.paidAmount - txn.amount) < 5, // Allow ₹5 tolerance
        );

        if (pendingEmi) {
          matched.push({
            transaction: txn,
            orderId: activeOrder.id,
            customerId,
            month: pendingEmi.month,
          });
          continue;
        }

        // Amount doesn't match any EMI exactly
        suspected.push({
          transaction: txn,
          possibleCustomers: [customerId],
        });
      } else {
        unmatched.push(txn);
      }
    } else {
      unmatched.push(txn);
    }
  }

  return { matched, unmatched, suspected };
}

// ─── Settlement & Analytics ──────────────────────────────────────────────────

/**
 * Generate daily settlement report.
 */
export function generateSettlementReport(
  payments: Payment[],
  orders: CreditOrder[],
  agents: CollectionAgent[],
  date: string,
): SettlementReport {
  const dayPayments = payments.filter((p) => p.receivedDate === date);

  const totalCollected = dayPayments.reduce((sum, p) => sum + p.amount, 0);
  const cashCollected = dayPayments
    .filter((p) => p.method === "cash")
    .reduce((sum, p) => sum + p.amount, 0);
  const phonepeCollected = dayPayments
    .filter((p) => p.method === "phonepe")
    .reduce((sum, p) => sum + p.amount, 0);

  // Calculate expected (all EMIs due today)
  const totalExpected = orders
    .filter((o) => o.status === "active")
    .reduce((sum, o) => {
      const todayEmi = o.emiSchedule.find(
        (e) => e.dueDate === date && e.status !== "paid",
      );
      return sum + (todayEmi ? todayEmi.amount : 0);
    }, 0);

  const totalPending = totalExpected - totalCollected;

  // Agent performance
  const agentPerformance: AgentPerformance[] = agents
    .filter((a) => a.active)
    .map((agent) => {
      const agentPayments = dayPayments.filter((p) => p.receivedBy === agent.id);
      const assigned = dayPayments.filter((p) => p.receivedBy === agent.id).length;

      return {
        agentId: agent.id,
        agentName: agent.name,
        assigned,
        collected: agentPayments.reduce((sum, p) => sum + p.amount, 0),
        collectionRate: totalExpected > 0
          ? (agentPayments.reduce((sum, p) => sum + p.amount, 0) / totalExpected) * 100
          : 0,
        avgTimePerStop: 15, // Estimate
        pincodesCovered: agent.assignedPincodes,
      };
    });

  return {
    date,
    totalExpected,
    totalCollected,
    totalPending,
    collectionRate: totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0,
    cashCollected,
    phonepeCollected,
    newDefaulters: 0,
    resolvedDefaulters: 0,
    agentPerformance,
  };
}

// ─── DuckDB Query Templates ──────────────────────────────────────────────────

/**
 * Pre-built DuckDB queries for common business questions.
 * These run against the in-browser DuckDB instance.
 */
export const DUCKDB_QUERIES = {
  // Daily collection summary
  dailyCollection: `
    SELECT
      date_trunc('day', received_date) as day,
      method,
      COUNT(*) as transaction_count,
      SUM(amount) as total_collected
    FROM payments
    WHERE received_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2
  `,

  // Customer outstanding report
  customerOutstanding: `
    SELECT
      c.id, c.name, c.phone, c.pincode,
      o.id as order_id, o.item_name,
      o.total_amount,
      COALESCE(SUM(p.amount), 0) as total_paid,
      o.total_amount - COALESCE(SUM(p.amount), 0) as outstanding,
      MAX(p.received_date) as last_payment_date,
      COUNT(CASE WHEN e.status = 'overdue' THEN 1 END) as overdue_months
    FROM customers c
    JOIN orders o ON o.customer_id = c.id
    LEFT JOIN payments p ON p.order_id = o.id
    JOIN emis e ON e.order_id = o.id
    WHERE o.status IN ('active', 'defaulted')
    GROUP BY 1, 2, 3, 4, 5, 6, 7
    ORDER BY outstanding DESC
  `,

  // Pincode-wise collection
  pincodeCollection: `
    SELECT
      c.pincode,
      COUNT(DISTINCT o.id) as active_orders,
      SUM(o.total_amount - COALESCE(p.total_paid, 0)) as total_outstanding,
      COUNT(CASE WHEN e.status = 'overdue' THEN 1 END) as overdue_emis
    FROM customers c
    JOIN orders o ON o.customer_id = c.id
    LEFT JOIN (
      SELECT order_id, SUM(amount) as total_paid
      FROM payments GROUP BY 1
    ) p ON p.order_id = o.id
    JOIN emis e ON e.order_id = o.id
    WHERE o.status IN ('active', 'defaulted')
    GROUP BY 1, 2, 3
    ORDER BY total_outstanding DESC
  `,

  // Agent performance
  agentPerformance: `
    SELECT
      a.id, a.name,
      COUNT(p.id) as collections_today,
      SUM(p.amount) as collected_today,
      AVG(CASE WHEN p.method = 'cash' THEN 1 ELSE 0 END) * 100 as cash_percentage
    FROM agents a
    LEFT JOIN payments p ON p.received_by = a.id
      AND p.received_date = CURRENT_DATE
    WHERE a.active = true
    GROUP BY 1, 2
    ORDER BY collected_today DESC
  `,

  // Monthly collection trend
  monthlyTrend: `
    SELECT
      date_trunc('month', received_date) as month,
      SUM(amount) as total_collected,
      COUNT(DISTINCT customer_id) as unique_customers,
      AVG(amount) as avg_payment
    FROM payments
    WHERE received_date >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY 1
    ORDER BY 1
  `,

  // Financier exposure
  financierExposure: `
    SELECT
      o.financed_by,
      COUNT(*) as active_orders,
      SUM(o.total_amount) as total_credit,
      SUM(o.total_amount - COALESCE(p.total_paid, 0)) as outstanding,
      COUNT(CASE WHEN o.status = 'defaulted' THEN 1 END) as defaulted
    FROM orders o
    LEFT JOIN (
      SELECT order_id, SUM(amount) as total_paid
      FROM payments GROUP BY 1
    ) p ON p.order_id = o.id
    WHERE o.status IN ('active', 'defaulted')
    GROUP BY 1
    ORDER BY outstanding DESC
  `,

  // EMI collection rate
  emiCollectionRate: `
    SELECT
      e.due_date,
      COUNT(CASE WHEN e.status = 'paid' THEN 1 END) as paid,
      COUNT(CASE WHEN e.status = 'overdue' THEN 1 END) as overdue,
      COUNT(CASE WHEN e.status = 'pending' THEN 1 END) as pending,
      ROUND(COUNT(CASE WHEN e.status = 'paid' THEN 1 END) * 100.0 / COUNT(*), 1) as collection_rate
    FROM emis e
    WHERE e.due_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY 1
    ORDER BY 1
  `,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function nextEmiDate(order: CreditOrder, currentMonth: number): string {
  const nextEmi = order.emiSchedule.find((e) => e.month === currentMonth + 1);
  return nextEmi?.dueDate || "Completed";
}
