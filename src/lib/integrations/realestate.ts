/**
 * Real Estate Company Tools
 *
 * Toolkit for small builders to operate at the scale of branded builders:
 * - Project lifecycle management (land → approval → construction → sales → handover)
 * - Cost estimation (land, construction, approvals, marketing, finance)
 * - Sales pipeline and booking management
 * - Customer CRM with follow-up automation
 * - Revenue forecasting and cash flow management
 * - Unit inventory with pricing
 * - Regulatory compliance (RERA, approvals)
 * - Marketing ROI tracking
 * - Profitability analysis per project
 *
 * Designed for builders doing 1-10 projects, 20-200 units each.
 */

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface REProject {
  id: string;
  name: string;
  location: string;
  city: string;
  state: string;
  pincode: string;
  type: "apartment" | "villa" | "plot" | "commercial" | "mixed";
  status: "land_acquisition" | "approval" | "construction" | "sales" | "completed" | "handover";
  totalUnits: number;
  totalSqFt: number;
  landArea: number;           // In sq ft
  landAreaAcres: number;
  floors: number;
  towers?: number;
  configuration: string;      // e.g. "2BHK, 3BHK"
  launchDate?: string;
  expectedCompletion: string;
  actualCompletion?: string;
  reraNumber?: string;
  reraRegistered: boolean;
  costs: ProjectCosts;
  units: REUnit[];
  sales: Sale[];
  approvals: Approval[];
  milestones: Milestone[];
  createdAt: string;
}

export interface ProjectCosts {
  landCost: number;
  landCostPerSqFt: number;
  constructionCost: number;
  constructionCostPerSqFt: number;
  approvalCosts: number;
  approvalBreakdown: { name: string; amount: number; status: "paid" | "pending" | "waived" }[];
  marketingCost: number;
  financeCost: number;        // Interest on project loans
  professionalFees: number;   // Architects, Vastu, legal
  infrastructure: number;     // Roads, drainage, electricity
  contingency: number;        // 5-10% of construction
  gst: number;
  totalProjectCost: number;
  costPerSqFt: number;
  profitMargin: number;       // Percentage
  sellingPricePerSqFt: number;
  totalRevenue: number;
  netProfit: number;
}

export interface REUnit {
  id: string;
  projectId: string;
  unitNumber: string;
  floor: number;
  wing?: string;
  type: "1bhk" | "2bhk" | "3bhk" | "4bhk" | "villa" | "plot" | "shop" | "office";
  carpetArea: number;         // In sq ft
  builtUpArea: number;
  superBuiltUpArea: number;
  facing: "north" | "south" | "east" | "west" | "north-east" | "north-west" | "south-east" | "south-west";
  status: "available" | "blocked" | "booked" | "sold" | "registered" | "handed_over" | "under_construction";
  basePrice: number;
  pricePerSqFt: number;
  floorRise: number;          // Per floor premium
  facingPremium: number;
  totalPrice: number;
  negotiatedPrice?: number;
  discount?: number;
  bookedDate?: string;
  soldDate?: string;
  registeredDate?: string;
  customer?: CustomerInfo;
  paymentPlan?: PaymentPlan;
}

export interface CustomerInfo {
  id: string;
  name: string;
  phone: string;
  email?: string;
  alternatePhone?: string;
  address: string;
  aadhaarLast4?: string;
  panNumber?: string;
  source: "walk_in" | "referral" | "online" | "broker" | "advertisement";
  brokerName?: string;
  brokerCommission?: number;
  budget: number;
  preferredType: string;
  visitDate?: string;
  followUpDate?: string;
  notes?: string;
  status: "lead" | "visited" | "interested" | "negotiating" | "booked" | "registered" | "lost";
  lostReason?: string;
  createdAt: string;
}

export interface PaymentPlan {
  type: "construction_linked" | "possession_linked" | "down_payment" | "custom";
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  milestones: PaymentMilestone[];
  registrationAmount?: number;
  stampDuty?: number;
  gstAmount?: number;
}

export interface PaymentMilestone {
  id: string;
  name: string;               // e.g. "On Booking", "At Plinth", "At 1st Floor"
  percentage: number;         // Of total amount
  amount: number;
  dueDate: string;
  paidDate?: string;
  paidAmount: number;
  status: "upcoming" | "due" | "overdue" | "paid";
}

export interface Sale {
  id: string;
  projectId: string;
  unitId: string;
  customerId: string;
  customerName: string;
  saleDate: string;
  saleType: "new" | "resale";
  basePrice: number;
  totalPrice: number;
  discount: number;
  finalPrice: number;
  paymentReceived: number;
  paymentPending: number;
  registrationDone: boolean;
  handoverDone: boolean;
  brokeragePaid: number;
  source: string;
}

export interface Approval {
  id: string;
  name: string;
  authority: string;          // e.g. "BBMP", "BDA", "RERA", "Fire Department"
  type: "plan_approval" | "environmental" | "fire_safety" | "rera" | "occupancy" | "completion" | "other";
  applicationDate: string;
  expectedDate: string;
  receivedDate?: string;
  status: "not_applied" | "applied" | "under_review" | "queries" | "received" | "expired" | "rejected";
  fee: number;
  feePaid: boolean;
  documents: string[];
  remarks?: string;
  validityMonths?: number;
  expiryDate?: string;
}

export interface Milestone {
  id: string;
  name: string;
  plannedDate: string;
  actualDate?: string;
  status: "upcoming" | "in_progress" | "completed" | "delayed";
  progress: number;           // 0-100
  dependencies?: string[];
}

export interface SalesPipeline {
  projectId: string;
  totalLeads: number;
  totalVisited: number;
  totalInterested: number;
  totalNegotiating: number;
  totalBooked: number;
  totalRegistered: number;
  conversionRate: number;     // Leads to bookings
  averageDecisionTime: number; // Days
  revenueBooked: number;
  revenueTarget: number;
  pipeline: {
    stage: string;
    count: number;
    value: number;
    color: string;
  }[];
}

export interface CashFlowEntry {
  date: string;
  type: "income" | "expense";
  category: string;
  description: string;
  amount: number;
  projectId?: string;
  vendor?: string;
  paymentMode: "cash" | "cheque" | "upi" | "bank_transfer" | "loan";
  reference?: string;
}

export interface CashFlowReport {
  projectId: string;
  period: string;
  openingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  closingBalance: number;
  netCashFlow: number;
  categoryBreakdown: { category: string; inflow: number; outflow: number; net: number }[];
  monthlyProjection: { month: string; inflow: number; outflow: number; balance: number }[];
}

export interface ProfitabilityReport {
  projectId: string;
  projectName: string;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
  roi: number;                // Return on investment
  irr: number;                // Internal rate of return
  paybackPeriod: number;      // Months
  costBreakdown: { category: string; amount: number; percentage: number }[];
  revenueBreakdown: { unit: string; amount: number; status: string }[];
}

// ─── Project Management ──────────────────────────────────────────────────────

/**
 * Create a new real estate project with full cost estimation.
 */
export function createProject(params: {
  name: string;
  location: string;
  city: string;
  state: string;
  type: REProject["type"];
  landAreaAcres: number;
  floors: number;
  towers?: number;
  configuration: string;
  expectedCompletion: string;
  reraNumber?: string;
  landCost: number;
  constructionCostPerSqFt: number;
  sellingPricePerSqFt: number;
}): REProject {
  const landAreaSqFt = params.landAreaAcres * 43560;
  const totalSqFt = landAreaSqFt * params.floors * (params.towers || 1) * 0.65; // 65% FSI utilization
  const totalUnits = Math.floor(totalSqFt / 1200); // Average 1200 sq ft per unit

  const landCostPerSqFt = params.landCost / landAreaSqFt;
  const constructionCost = totalSqFt * params.constructionCostPerSqFt;
  const totalRevenue = totalSqFt * params.sellingPricePerSqFt;

  const costs: ProjectCosts = {
    landCost: params.landCost,
    landCostPerSqFt,
    constructionCost,
    constructionCostPerSqFt: params.constructionCostPerSqFt,
    approvalCosts: Math.ceil(totalRevenue * 0.02), // ~2% of revenue
    approvalBreakdown: [
      { name: "RERA Registration", amount: 50000, status: "pending" },
      { name: "Plan Approval (BBMP/BDA)", amount: 200000, status: "pending" },
      { name: "Environmental Clearance", amount: 100000, status: "pending" },
      { name: "Fire NOC", amount: 50000, status: "pending" },
      { name: "Other Approvals", amount: 100000, status: "pending" },
    ],
    marketingCost: Math.ceil(totalRevenue * 0.03), // 3% of revenue
    financeCost: Math.ceil(constructionCost * 0.12), // 12% interest on construction loan
    professionalFees: Math.ceil(constructionCost * 0.03), // 3% for architect, etc.
    infrastructure: Math.ceil(constructionCost * 0.08), // 8% for roads, drainage
    contingency: Math.ceil(constructionCost * 0.05), // 5% contingency
    gst: Math.ceil(totalRevenue * 0.05), // 5% GST on under-construction
    totalProjectCost: 0,
    costPerSqFt: 0,
    profitMargin: 0,
    sellingPricePerSqFt: params.sellingPricePerSqFt,
    totalRevenue,
    netProfit: 0,
  };

  costs.totalProjectCost = costs.landCost + costs.constructionCost + costs.approvalCosts +
    costs.marketingCost + costs.financeCost + costs.professionalFees +
    costs.infrastructure + costs.contingency + costs.gst;
  costs.costPerSqFt = costs.totalProjectCost / totalSqFt;
  costs.netProfit = totalRevenue - costs.totalProjectCost;
  costs.profitMargin = (costs.netProfit / totalRevenue) * 100;

  return {
    id: `PROJ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    name: params.name,
    location: params.location,
    city: params.city,
    state: params.state,
    pincode: "",
    type: params.type,
    status: "land_acquisition",
    totalUnits,
    totalSqFt,
    landArea: landAreaSqFt,
    landAreaAcres: params.landAreaAcres,
    floors: params.floors,
    towers: params.towers,
    configuration: params.configuration,
    expectedCompletion: params.expectedCompletion,
    reraNumber: params.reraNumber,
    reraRegistered: !!params.reraNumber,
    costs,
    units: [],
    sales: [],
    approvals: [],
    milestones: [],
    createdAt: new Date().toISOString(),
  };
}

// ─── Cost Estimation ─────────────────────────────────────────────────────────

/**
 * Generate detailed cost breakdown for a project.
 */
export function estimateProjectCosts(
  landAreaAcres: number,
  floors: number,
  constructionCostPerSqFt: number,
  sellingPricePerSqFt: number,
  state: string,
): {
  totalSqFt: number;
  totalUnits: number;
  landCost: number;
  constructionCost: number;
  approvalCosts: number;
  marketingCost: number;
  financeCost: number;
  totalCost: number;
  totalRevenue: number;
  netProfit: number;
  profitMargin: number;
  costPerSqFt: number;
  breakevenUnits: number;
  breakevenPercent: number;
} {
  const landAreaSqFt = landAreaAcres * 43560;
  const totalSqFt = landAreaSqFt * floors * 0.65;
  const totalUnits = Math.floor(totalSqFt / 1200);

  // Land cost varies by state/city
  const landRates: Record<string, number> = {
    "bangalore": 8000, "mumbai": 25000, "chennai": 6000,
    "hyderabad": 5000, "pune": 7000, "delhi": 15000,
    "kolkata": 4000, "jaipur": 3000, "ahmedabad": 4000,
  };
  const landCostPerSqFt = landRates[state.toLowerCase()] || 5000;
  const landCost = landAreaSqFt * landCostPerSqFt;

  const constructionCost = totalSqFt * constructionCostPerSqFt;
  const approvalCosts = Math.ceil(totalSqFt * sellingPricePerSqFt * 0.02);
  const marketingCost = Math.ceil(totalSqFt * sellingPricePerSqFt * 0.03);
  const financeCost = Math.ceil(constructionCost * 0.12);

  const totalCost = landCost + constructionCost + approvalCosts + marketingCost + financeCost;
  const totalRevenue = totalSqFt * sellingPricePerSqFt;
  const netProfit = totalRevenue - totalCost;

  // Breakeven: how many units at what % of total need to sell
  const revenuePerUnit = totalRevenue / totalUnits;
  const breakevenUnits = Math.ceil(totalCost / revenuePerUnit);

  return {
    totalSqFt,
    totalUnits,
    landCost,
    constructionCost,
    approvalCosts,
    marketingCost,
    financeCost,
    totalCost,
    totalRevenue,
    netProfit,
    profitMargin: (netProfit / totalRevenue) * 100,
    costPerSqFt: totalCost / totalSqFt,
    breakevenUnits,
    breakevenPercent: (breakevenUnits / totalUnits) * 100,
  };
}

// ─── Sales Pipeline ──────────────────────────────────────────────────────────

/**
 * Generate sales pipeline report for a project.
 */
export function generateSalesPipeline(project: REProject): SalesPipeline {
  const leads = project.units.filter((u) => u.customer?.status === "lead").length;
  const visited = project.units.filter((u) => u.customer?.status === "visited").length;
  const interested = project.units.filter((u) => u.customer?.status === "interested").length;
  const negotiating = project.units.filter((u) => u.customer?.status === "negotiating").length;
  const booked = project.units.filter((u) => u.status === "booked").length;
  const registered = project.units.filter((u) => u.status === "registered").length;

  const totalLeads = project.sales.length + leads + visited + interested + negotiating;
  const conversionRate = totalLeads > 0 ? (booked / totalLeads) * 100 : 0;

  const revenueBooked = project.sales.reduce((sum, s) => sum + s.finalPrice, 0);
  const revenueTarget = project.costs.totalRevenue;

  return {
    projectId: project.id,
    totalLeads,
    totalVisited: visited,
    totalInterested: interested,
    totalNegotiating: negotiating,
    totalBooked: booked,
    totalRegistered: registered,
    conversionRate,
    averageDecisionTime: 45, // Estimate
    revenueBooked,
    revenueTarget,
    pipeline: [
      { stage: "Leads", count: leads, value: leads * project.costs.sellingPricePerSqFt * 1200, color: "#94a3b8" },
      { stage: "Visited", count: visited, value: visited * project.costs.sellingPricePerSqFt * 1200, color: "#60a5fa" },
      { stage: "Interested", count: interested, value: interested * project.costs.sellingPricePerSqFt * 1200, color: "#fbbf24" },
      { stage: "Negotiating", count: negotiating, value: negotiating * project.costs.sellingPricePerSqFt * 1200, color: "#f97316" },
      { stage: "Booked", count: booked, value: booked * project.costs.sellingPricePerSqFt * 1200, color: "#22c55e" },
      { stage: "Registered", count: registered, value: registered * project.costs.sellingPricePerSqFt * 1200, color: "#10b981" },
    ],
  };
}

// ─── Cash Flow Management ────────────────────────────────────────────────────

/**
 * Generate cash flow report for a project.
 */
export function generateCashFlowReport(
  project: REProject,
  entries: CashFlowEntry[],
  period: string,
): CashFlowReport {
  const projectEntries = entries.filter((e) => e.projectId === project.id);
  const inflows = projectEntries.filter((e) => e.type === "income");
  const outflows = projectEntries.filter((e) => e.type === "expense");

  const totalInflow = inflows.reduce((sum, e) => sum + e.amount, 0);
  const totalOutflow = outflows.reduce((sum, e) => sum + e.amount, 0);

  // Category breakdown
  const categories = [...new Set(projectEntries.map((e) => e.category))];
  const categoryBreakdown = categories.map((cat) => {
    const catInflow = inflows.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0);
    const catOutflow = outflows.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0);
    return { category: cat, inflow: catInflow, outflow: catOutflow, net: catInflow - catOutflow };
  });

  // Monthly projection (next 12 months)
  const monthlyProjection = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() + i);
    const monthStr = date.toISOString().slice(0, 7);

    const monthInflow = inflows
      .filter((e) => e.date.startsWith(monthStr))
      .reduce((s, e) => s + e.amount, 0);
    const monthOutflow = outflows
      .filter((e) => e.date.startsWith(monthStr))
      .reduce((s, e) => s + e.amount, 0);

    return {
      month: monthStr,
      inflow: monthInflow,
      outflow: monthOutflow,
      balance: monthInflow - monthOutflow,
    };
  });

  return {
    projectId: project.id,
    period,
    openingBalance: 0,
    totalInflow,
    totalOutflow,
    closingBalance: totalInflow - totalOutflow,
    netCashFlow: totalInflow - totalOutflow,
    categoryBreakdown,
    monthlyProjection,
  };
}

// ─── Profitability Analysis ──────────────────────────────────────────────────

/**
 * Calculate project profitability with ROI and IRR.
 */
export function calculateProfitability(project: REProject): ProfitabilityReport {
  const { costs } = project;
  const soldUnits = project.units.filter((u) => u.status === "sold" || u.status === "registered");

  const totalRevenue = soldUnits.reduce((sum, u) => sum + (u.negotiatedPrice || u.totalPrice), 0);
  const totalCost = costs.totalProjectCost;
  const grossProfit = totalRevenue - totalCost;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Net profit (after all expenses)
  const brokerage = project.sales.reduce((sum, s) => sum + s.brokeragePaid, 0);
  const netProfit = grossProfit - brokerage;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // ROI = Net Profit / Total Investment * 100
  const roi = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

  // IRR approximation (simplified)
  const yearsToComplete = 3; // Assume 3-year project
  const irr = netProfit > 0
    ? (Math.pow(1 + roi / 100, 1 / yearsToComplete) - 1) * 100
    : -10;

  // Payback period in months
  const monthlyRevenue = totalRevenue / (yearsToComplete * 12);
  const paybackPeriod = monthlyRevenue > 0 ? totalCost / monthlyRevenue : Infinity;

  const costBreakdown = [
    { category: "Land", amount: costs.landCost, percentage: (costs.landCost / totalCost) * 100 },
    { category: "Construction", amount: costs.constructionCost, percentage: (costs.constructionCost / totalCost) * 100 },
    { category: "Approvals", amount: costs.approvalCosts, percentage: (costs.approvalCosts / totalCost) * 100 },
    { category: "Marketing", amount: costs.marketingCost, percentage: (costs.marketingCost / totalCost) * 100 },
    { category: "Finance", amount: costs.financeCost, percentage: (costs.financeCost / totalCost) * 100 },
    { category: "Professional Fees", amount: costs.professionalFees, percentage: (costs.professionalFees / totalCost) * 100 },
    { category: "Infrastructure", amount: costs.infrastructure, percentage: (costs.infrastructure / totalCost) * 100 },
    { category: "Contingency", amount: costs.contingency, percentage: (costs.contingency / totalCost) * 100 },
    { category: "GST", amount: costs.gst, percentage: (costs.gst / totalCost) * 100 },
  ];

  const revenueBreakdown = project.units.map((u) => ({
    unit: u.unitNumber,
    amount: u.negotiatedPrice || u.totalPrice,
    status: u.status,
  }));

  return {
    projectId: project.id,
    projectName: project.name,
    totalRevenue,
    totalCost,
    grossProfit,
    grossMargin,
    netProfit,
    netMargin,
    roi,
    irr,
    paybackPeriod,
    costBreakdown,
    revenueBreakdown,
  };
}

// ─── Compliance Tracker ──────────────────────────────────────────────────────

/**
 * Track RERA and other regulatory approvals.
 */
export function trackCompliance(project: REProject): {
  reraRegistered: boolean;
  reraValid: boolean;
  totalApprovals: number;
  receivedApprovals: number;
  pendingApprovals: number;
  upcomingExpiries: { name: string; expiryDate: string; daysLeft: number }[];
  complianceScore: number;
  violations: string[];
  checklist: { approval: string; status: string; date?: string }[];
} {
  const totalApprovals = project.approvals.length;
  const receivedApprovals = project.approvals.filter((a) => a.status === "received").length;
  const pendingApprovals = totalApprovals - receivedApprovals;

  const upcomingExpiries = project.approvals
    .filter((a) => a.expiryDate)
    .map((a) => ({
      name: a.name,
      expiryDate: a.expiryDate!,
      daysLeft: Math.ceil(
        (new Date(a.expiryDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      ),
    }))
    .filter((e) => e.daysLeft < 90 && e.daysLeft > 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const violations: string[] = [];
  if (!project.reraRegistered) violations.push("RERA registration not done");
  if (project.approvals.some((a) => a.status === "rejected")) violations.push("Some approvals rejected");
  if (project.approvals.some((a) => a.status === "expired")) violations.push("Some approvals expired");

  const complianceScore = totalApprovals > 0
    ? (receivedApprovals / totalApprovals) * 100
    : (project.reraRegistered ? 50 : 0);

  const checklist = project.approvals.map((a) => ({
    approval: a.name,
    status: a.status,
    date: a.receivedDate,
  }));

  return {
    reraRegistered: project.reraRegistered,
    reraValid: project.reraRegistered && !violations.some((v) => v.includes("RERA")),
    totalApprovals,
    receivedApprovals,
    pendingApprovals,
    upcomingExpiries,
    complianceScore,
    violations,
    checklist,
  };
}

// ─── CRM & Follow-up ────────────────────────────────────────────────────────

/**
 * Generate follow-up list for sales team.
 */
export function generateFollowUpList(project: REProject): {
  today: CustomerInfo[];
  overdue: CustomerInfo[];
  upcoming: CustomerInfo[];
  hotLeads: CustomerInfo[];
  lostRecovery: CustomerInfo[];
  summary: {
    totalLeads: number;
    followUpDue: number;
    hotLeads: number;
    conversionRate: number;
  };
} {
  const today = new Date().toISOString().split("T")[0];
  const allCustomers = project.units
    .filter((u) => u.customer)
    .map((u) => u.customer!);

  const todayFollowUp = allCustomers.filter((c) => c.followUpDate === today);
  const overdue = allCustomers.filter(
    (c) => c.followUpDate && c.followUpDate < today && c.status !== "booked" && c.status !== "registered",
  );
  const upcoming = allCustomers.filter(
    (c) => c.followUpDate && c.followUpDate > today && c.followUpDate <= new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
  );

  const hotLeads = allCustomers.filter(
    (c) => c.status === "interested" || c.status === "negotiating",
  );

  const lostRecovery = allCustomers.filter(
    (c) => c.status === "lost" && c.lostReason !== "budget",
  );

  const totalLeads = allCustomers.length;
  const bookedCount = allCustomers.filter((c) => c.status === "booked" || c.status === "registered").length;

  return {
    today: todayFollowUp,
    overdue,
    upcoming,
    hotLeads,
    lostRecovery,
    summary: {
      totalLeads,
      followUpDue: overdue.length + todayFollowUp.length,
      hotLeads: hotLeads.length,
      conversionRate: totalLeads > 0 ? (bookedCount / totalLeads) * 100 : 0,
    },
  };
}

// ─── Revenue Forecasting ─────────────────────────────────────────────────────

/**
 * Forecast revenue based on current sales velocity.
 */
export function forecastRevenue(
  project: REProject,
  monthsAhead: number = 12,
): {
  forecast: { month: string; unitsSold: number; revenue: number; cumulative: number }[];
  targetDate: string;
  projectedCompletionPercent: number;
  confidenceLevel: "high" | "medium" | "low";
} {
  const soldUnits = project.units.filter((u) => u.status === "sold" || u.status === "registered" || u.status === "booked");
  const availableUnits = project.units.filter((u) => u.status === "available");

  // Average sales velocity (units per month)
  const monthsSinceLaunch = project.launchDate
    ? Math.max(1, (Date.now() - new Date(project.launchDate).getTime()) / (30 * 86400000))
    : 1;
  const velocity = soldUnits.length / monthsSinceLaunch;

  const avgPrice = soldUnits.length > 0
    ? soldUnits.reduce((sum, u) => sum + (u.negotiatedPrice || u.totalPrice), 0) / soldUnits.length
    : project.costs.sellingPricePerSqFt * 1200;

  let cumulative = soldUnits.reduce((sum, u) => sum + (u.negotiatedPrice || u.totalPrice), 0);
  const forecast = [];

  for (let i = 1; i <= monthsAhead; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() + i);
    const monthStr = date.toISOString().slice(0, 7);

    // Velocity with slight decay as inventory depletes
    const remainingPercent = availableUnits.length / project.totalUnits;
    const adjustedVelocity = Math.max(0, velocity * remainingPercent);
    const unitsSold = Math.round(adjustedVelocity);
    const revenue = unitsSold * avgPrice;
    cumulative += revenue;

    forecast.push({ month: monthStr, unitsSold, revenue, cumulative });
  }

  const totalTarget = project.costs.totalRevenue;
  const projectedCompletionPercent = (cumulative / totalTarget) * 100;

  // Confidence based on data availability
  let confidenceLevel: "high" | "medium" | "low" = "low";
  if (monthsSinceLaunch >= 6) confidenceLevel = "high";
  else if (monthsSinceLaunch >= 3) confidenceLevel = "medium";

  // Target date when all units will be sold
  const remainingUnits = availableUnits.length;
  const monthsToComplete = velocity > 0 ? remainingUnits / velocity : Infinity;
  const targetDate = new Date(Date.now() + monthsToComplete * 30 * 86400000).toISOString().split("T")[0];

  return {
    forecast,
    targetDate,
    projectedCompletionPercent: Math.min(100, projectedCompletionPercent),
    confidenceLevel,
  };
}

// ─── Dashboard Summary ───────────────────────────────────────────────────────

/**
 * Generate complete dashboard data for a real estate company.
 */
export function generateREDashboard(projects: REProject[]): {
  totalProjects: number;
  activeProjects: number;
  totalUnits: number;
  totalSold: number;
  totalRevenue: number;
  totalCost: number;
  overallProfit: number;
  overallMargin: number;
  salesVelocity: number;       // Units per month across all projects
  inventoryValue: number;       // Value of unsold units
  approvalsPending: number;
  projectSummaries: {
    name: string;
    status: string;
    unitsSold: number;
    totalUnits: number;
    revenue: number;
    profit: number;
    completionPercent: number;
  }[];
} {
  const activeProjects = projects.filter((p) => p.status !== "completed" && p.status !== "handover");

  const totalSold = projects.reduce(
    (sum, p) => sum + p.units.filter((u) => u.status === "sold" || u.status === "registered").length, 0,
  );

  const totalRevenue = projects.reduce(
    (sum, p) => sum + p.sales.reduce((s, sale) => s + sale.finalPrice, 0), 0,
  );

  const totalCost = projects.reduce((sum, p) => sum + p.costs.totalProjectCost, 0);
  const overallProfit = totalRevenue - totalCost;

  const inventoryValue = projects.reduce((sum, p) => {
    const unsoldUnits = p.units.filter((u) => u.status === "available");
    return sum + unsoldUnits.reduce((s, u) => s + u.totalPrice, 0);
  }, 0);

  const projectSummaries = projects.map((p) => ({
    name: p.name,
    status: p.status,
    unitsSold: p.units.filter((u) => u.status === "sold" || u.status === "registered").length,
    totalUnits: p.totalUnits,
    revenue: p.sales.reduce((s, sale) => s + sale.finalPrice, 0),
    profit: p.sales.reduce((s, sale) => s + sale.finalPrice, 0) - p.costs.totalProjectCost,
    completionPercent: p.status === "completed" ? 100
      : p.status === "handover" ? 100
        : p.status === "sales" ? 80
          : p.status === "construction" ? 40
            : p.status === "approval" ? 15
              : 5,
  }));

  return {
    totalProjects: projects.length,
    activeProjects: activeProjects.length,
    totalUnits: projects.reduce((sum, p) => sum + p.totalUnits, 0),
    totalSold,
    totalRevenue,
    totalCost,
    overallProfit,
    overallMargin: totalRevenue > 0 ? (overallProfit / totalRevenue) * 100 : 0,
    salesVelocity: 0, // Calculate from historical data
    inventoryValue,
    approvalsPending: projects.reduce(
      (sum, p) => sum + p.approvals.filter((a) => a.status !== "received").length, 0,
    ),
    projectSummaries,
  };
}
