/**
 * Financial Scenario Calculator Engine
 *
 * Universal calculator for any financial scenario:
 * - Loan amortization (home, car, personal, gold)
 * - SIP / Mutual Fund returns
 * - Fixed Deposit / Recurring Deposit
 * - PPF / EPF / NPS
 * - Tax calculation (old vs new regime)
 * - Inflation-adjusted returns
 * - What-if scenario modeling
 * - Goal-based financial planning
 *
 * All pure functions — zero dependencies, runs in-browser.
 */

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface LoanInput {
  principal: number;
  annualRate: number;        // e.g. 8.5 for 8.5%
  tenureMonths: number;
  emi?: number;              // Optional: override auto-calculated EMI
  prepayments?: Prepayment[];
  processingFee?: number;    // Flat fee or percentage
  processingFeeType?: "flat" | "percentage";
  insurance?: number;
  taxBenefit?: boolean;      // Section 24 / 80C eligibility
}

export interface Prepayment {
  month: number;
  amount: number;
  type: "principal" | "full"; // "full" = full remaining balance
}

export interface LoanResult {
  emi: number;
  totalPayment: number;
  totalInterest: number;
  totalCost: number;         // Including fees, insurance
  interestSavingVsMaxTenure: number;
  schedule: AmortizationRow[];
  prepaymentImpact?: PrepaymentImpact;
  taxBenefit?: TaxBenefit;
}

export interface AmortizationRow {
  month: number;
  emi: number;
  principal: number;
  interest: number;
  balance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
  effectiveRate?: number;    // After prepayment adjustment
}

export interface PrepaymentImpact {
  originalTenure: number;
  newTenure: number;
  monthsSaved: number;
  originalInterest: number;
  newInterest: number;
  interestSaved: number;
  newPayoffDate: string;
}

export interface TaxBenefit {
  section80C: number;        // Max ₹1.5L (PPF + principal)
  section24: number;         // Max ₹2L (interest on home loan)
  section80EEA: number;      // Additional ₹1.5L (affordable housing)
  totalSaving: number;
  taxSlab: number;           // Applicable tax rate
  netBenefit: number;
}

export interface SIPInput {
  monthlyAmount: number;
  annualReturnRate: number;  // e.g. 12 for 12%
  durationYears: number;
  stepUpPercent?: number;    // Annual step-up
  inflationRate?: number;
  taxOnGains?: boolean;      // LTCG 10% above ₹1L
}

export interface SIPResult {
  totalInvested: number;
  futureValue: number;
  wealthGained: number;
  xirr?: number;
  inflationAdjustedValue: number;
  realReturn: number;        // After inflation
  taxOnGains: number;
  postTaxValue: number;
  yearWiseBreakdown: YearWiseRow[];
}

export interface YearWiseRow {
  year: number;
  invested: number;
  totalInvested: number;
  returns: number;
  totalValue: number;
  cumulativeWealth: number;
}

export interface FDInput {
  principal: number;
  annualRate: number;
  tenureYears: number;
  compounding: "quarterly" | "monthly" | "yearly";
  taxOnInterest?: boolean;
  taxSlab?: number;
  inflationRate?: number;
}

export interface FDResult {
  maturityAmount: number;
  totalInterest: number;
  effectiveRate: number;     // Effective annual rate
  taxOnInterest: number;
  postTaxMaturity: number;
  inflationAdjustedMaturity: number;
  realReturn: number;
}

export interface RDInput {
  monthlyDeposit: number;
  annualRate: number;
  tenureMonths: number;
  compounding?: "quarterly" | "monthly";
}

export interface RDResult {
  totalDeposited: number;
  maturityAmount: number;
  totalInterest: number;
  effectiveRate: number;
}

export interface TaxInput {
  grossIncome: number;
  deductions?: {
    section80C?: number;     // Max 1.5L
    section80D?: number;     // Health insurance
    section24?: number;      // Home loan interest
    section80E?: number;     // Education loan interest
    section80G?: number;     // Donations
    section80TTA?: number;   // Savings interest
    hra?: number;
    other?: number;
  };
  regime?: "old" | "new";
  FY?: string;               // e.g. "2025-26"
}

export interface TaxResult {
  regime: string;
  taxableIncome: number;
  taxPayable: number;
  effectiveTaxRate: number;
  cess: number;
  totalTax: number;
  takeHome: number;
  monthlyTakeHome: number;
  oldRegime?: { regime: string; taxableIncome: number; taxPayable: number; effectiveTaxRate: number; cess: number; totalTax: number; takeHome: number; monthlyTakeHome: number };
  newRegime?: { regime: string; taxableIncome: number; taxPayable: number; effectiveTaxRate: number; cess: number; totalTax: number; takeHome: number; monthlyTakeHome: number };
  recommendedRegime: "old" | "new";
  savingsWithRecommendation: number;
  regimeWiseComparison: { old: number; new: number; diff: number };
}

export interface GoalInput {
  goalName: string;
  targetAmount: number;
  targetDate: string;        // YYYY-MM-DD
  currentAge: number;
  riskProfile: "conservative" | "moderate" | "aggressive";
  currentSavings?: number;
  monthlyIncome?: number;
}

export interface GoalResult {
  monthlyInvestmentNeeded: number;
  assetAllocation: { equity: number; debt: number; gold: number };
  expectedReturn: number;
  totalInvested: number;
  totalGrowth: number;
  feasibility: "easy" | "possible" | "stretch" | "impossible";
  alternatives: { monthlyAmount: number; duration: number; return: number }[];
}

export interface WhatIfScenario {
  name: string;
  variables: Record<string, number>;
  outcomes: Record<string, number>;
}

export interface ComparisonResult {
  scenarios: WhatIfScenario[];
  bestByMetric: Record<string, string>;
  riskAdjusted: Record<string, number>;
}

// ─── Loan Calculator ─────────────────────────────────────────────────────────

/**
 * Calculate EMI and full amortization schedule.
 * Supports prepayment modeling and tax benefits.
 */
export function calculateLoan(input: LoanInput): LoanResult {
  const { principal, annualRate, tenureMonths, prepayments } = input;
  const monthlyRate = annualRate / 12 / 100;

  // Standard EMI calculation
  const emi = input.emi || (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
    (Math.pow(1 + monthlyRate, tenureMonths) - 1);

  // Build amortization schedule
  let balance = principal;
  const schedule: AmortizationRow[] = [];
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  const prepaidMonths = new Map<number, number>();

  if (prepayments) {
    for (const pp of prepayments) {
      prepaidMonths.set(pp.month, (prepaidMonths.get(pp.month) || 0) + pp.amount);
    }
  }

  for (let month = 1; month <= tenureMonths && balance > 0; month++) {
    const interest = balance * monthlyRate;
    let principalPaid = emi - interest;

    // Apply prepayment
    const prepayAmount = prepaidMonths.get(month) || 0;
    if (prepayAmount > 0) {
      principalPaid += Math.min(prepayAmount, balance - principalPaid);
    }

    principalPaid = Math.min(principalPaid, balance);
    balance -= principalPaid;
    cumulativeInterest += interest;
    cumulativePrincipal += principalPaid;

    schedule.push({
      month,
      emi: interest + principalPaid,
      principal: principalPaid,
      interest,
      balance: Math.max(0, balance),
      cumulativeInterest,
      cumulativePrincipal,
    });
  }

  const totalPayment = schedule.reduce((sum, r) => sum + r.emi, 0);
  const totalInterest = cumulativeInterest;

  // Calculate processing fee
  let processingCost = 0;
  if (input.processingFee) {
    processingCost = input.processingFeeType === "percentage"
      ? principal * input.processingFee / 100
      : input.processingFee;
  }
  const totalCost = totalPayment + processingCost + (input.insurance || 0);

  // Prepayment impact
  let prepaymentImpact: PrepaymentImpact | undefined;
  if (prepayments && prepayments.length > 0) {
    const resultWithoutPrepay = calculateLoan({ ...input, prepayments: [] });
    const lastMonth = schedule[schedule.length - 1];
    prepaymentImpact = {
      originalTenure: resultWithoutPrepay.schedule.length,
      newTenure: schedule.length,
      monthsSaved: resultWithoutPrepay.schedule.length - schedule.length,
      originalInterest: resultWithoutPrepay.totalInterest,
      newInterest: totalInterest,
      interestSaved: resultWithoutPrepay.totalInterest - totalInterest,
      newPayoffDate: getPayoffDate(schedule.length),
    };
  }

  // Tax benefit (home loan)
  let taxBenefit: TaxBenefit | undefined;
  if (input.taxBenefit) {
    const annualInterest = schedule.slice(0, 12).reduce((s, r) => s + r.interest, 0);
    const annualPrincipal = schedule.slice(0, 12).reduce((s, r) => s + r.principal, 0);
    const section80C = Math.min(annualPrincipal, 150000);
    const section24 = Math.min(annualInterest, 200000);
    const totalSaving = section80C + section24;
    const taxSlab = 0.3; // Assume 30% slab
    taxBenefit = {
      section80C,
      section24,
      section80EEA: 0,
      totalSaving,
      taxSlab,
      netBenefit: totalSaving * taxSlab,
    };
  }

  return {
    emi,
    totalPayment,
    totalInterest,
    totalCost,
    interestSavingVsMaxTenure: 0,
    schedule,
    prepaymentImpact,
    taxBenefit,
  };
}

// ─── SIP Calculator ──────────────────────────────────────────────────────────

/**
 * Calculate SIP returns with step-up, inflation, and tax.
 */
export function calculateSIP(input: SIPInput): SIPResult {
  const { monthlyAmount, annualReturnRate, durationYears, stepUpPercent = 0 } = input;
  const monthlyRate = annualReturnRate / 12 / 100;
  const inflationRate = input.inflationRate || 6;
  const yearWiseBreakdown: YearWiseRow[] = [];

  let totalInvested = 0;
  let futureValue = 0;
  let currentMonthly = monthlyAmount;

  for (let year = 1; year <= durationYears; year++) {
    const yearInvested = currentMonthly * 12;
    // Future value of SIP for this year's contributions
    const yearFV = currentMonthly * ((Math.pow(1 + monthlyRate, (durationYears - year + 1) * 12) - 1) / monthlyRate) * (1 + monthlyRate);

    totalInvested += yearInvested;
    futureValue += currentMonthly * ((Math.pow(1 + monthlyRate, (durationYears - year + 1) * 12) - 1) / monthlyRate);

    const returns = futureValue - totalInvested;

    yearWiseBreakdown.push({
      year,
      invested: yearInvested,
      totalInvested,
      returns,
      totalValue: futureValue,
      cumulativeWealth: futureValue - totalInvested,
    });

    currentMonthly *= (1 + stepUpPercent / 100);
  }

  const wealthGained = futureValue - totalInvested;

  // Inflation adjustment
  const inflationFactor = Math.pow(1 + inflationRate / 100, durationYears);
  const inflationAdjustedValue = futureValue / inflationFactor;
  const realReturn = ((1 + annualReturnRate / 100) / (1 + inflationRate / 100) - 1) * 100;

  // Tax on gains (LTCG: 10% above ₹1L exemption)
  let taxOnGains = 0;
  if (input.taxOnGains && wealthGained > 100000) {
    taxOnGains = (wealthGained - 100000) * 0.10;
  }
  const postTaxValue = futureValue - taxOnGains;

  return {
    totalInvested,
    futureValue,
    wealthGained,
    inflationAdjustedValue,
    realReturn,
    taxOnGains,
    postTaxValue,
    yearWiseBreakdown,
  };
}

// ─── FD Calculator ───────────────────────────────────────────────────────────

/**
 * Calculate Fixed Deposit maturity with compounding and tax.
 */
export function calculateFD(input: FDInput): FDResult {
  const { principal, annualRate, tenureYears, compounding } = input;

  const compoundingFreq = compounding === "quarterly" ? 4 : compounding === "monthly" ? 12 : 1;
  const ratePerPeriod = annualRate / 100 / compoundingFreq;
  const totalPeriods = tenureYears * compoundingFreq;

  const maturityAmount = principal * Math.pow(1 + ratePerPeriod, totalPeriods);
  const totalInterest = maturityAmount - principal;
  const effectiveRate = (Math.pow(1 + annualRate / 100 / compoundingFreq, compoundingFreq) - 1) * 100;

  // TDS on interest > ₹40,000/year (₹50,000 for seniors)
  const annualInterest = totalInterest / tenureYears;
  const taxOnInterest = annualInterest > 40000 ? (annualInterest - 40000) * (input.taxSlab || 0.3) * tenureYears : 0;
  const postTaxMaturity = maturityAmount - taxOnInterest;

  // Inflation adjustment
  const inflationRate = input.inflationRate || 6;
  const inflationAdjustedMaturity = maturityAmount / Math.pow(1 + inflationRate / 100, tenureYears);
  const realReturn = ((1 + effectiveRate / 100) / (1 + inflationRate / 100) - 1) * 100;

  return {
    maturityAmount,
    totalInterest,
    effectiveRate,
    taxOnInterest,
    postTaxMaturity,
    inflationAdjustedMaturity,
    realReturn,
  };
}

// ─── RD Calculator ───────────────────────────────────────────────────────────

/**
 * Calculate Recurring Deposit maturity.
 */
export function calculateRD(input: RDInput): RDResult {
  const { monthlyDeposit, annualRate, tenureMonths } = input;
  const compounding = input.compounding || "quarterly";
  const compoundingFreq = compounding === "quarterly" ? 4 : 12;
  const monthlyRate = annualRate / 100 / 12;

  // Future value of RD
  let maturityAmount = 0;
  for (let i = 0; i < tenureMonths; i++) {
    const remainingMonths = tenureMonths - i;
    maturityAmount += monthlyDeposit * Math.pow(1 + monthlyRate, remainingMonths);
  }

  const totalDeposited = monthlyDeposit * tenureMonths;
  const totalInterest = maturityAmount - totalDeposited;
  const effectiveRate = (Math.pow(1 + annualRate / 100 / compoundingFreq, compoundingFreq) - 1) * 100;

  return {
    totalDeposited,
    maturityAmount,
    totalInterest,
    effectiveRate,
  };
}

// ─── Tax Calculator ──────────────────────────────────────────────────────────

/**
 * Calculate income tax under old and new regime.
 * FY 2025-26 slabs.
 */
export function calculateTax(input: TaxInput): TaxResult {
  const grossIncome = input.grossIncome;
  const deductions = input.deductions || {};

  // Old regime slabs (FY 2025-26)
  const oldRegimeSlabs = [
    { limit: 250000, rate: 0 },
    { limit: 500000, rate: 0.05 },
    { limit: 1000000, rate: 0.20 },
    { limit: Infinity, rate: 0.30 },
  ];

  // New regime slabs (FY 2025-26)
  const newRegimeSlabs = [
    { limit: 300000, rate: 0 },
    { limit: 700000, rate: 0.05 },
    { limit: 1000000, rate: 0.10 },
    { limit: 1200000, rate: 0.15 },
    { limit: 1500000, rate: 0.20 },
    { limit: Infinity, rate: 0.30 },
  ];

  function computeTax(income: number, slabs: { limit: number; rate: number }[]): number {
    let tax = 0;
    let prevLimit = 0;
    for (const slab of slabs) {
      const taxableInSlab = Math.min(income, slab.limit) - prevLimit;
      if (taxableInSlab > 0) {
        tax += taxableInSlab * slab.rate;
      }
      prevLimit = slab.limit;
      if (income <= slab.limit) break;
    }
    return tax;
  }

  // Old regime
  const totalDeductions80C = Math.min(deductions.section80C || 0, 150000);
  const totalDeductions24 = Math.min(deductions.section24 || 0, 200000);
  const otherDeductions = (deductions.section80D || 0) + (deductions.section80E || 0) +
    (deductions.section80G || 0) + (deductions.section80TTA || 0) + (deductions.hra || 0) +
    (deductions.other || 0);
  const totalOldDeductions = totalDeductions80C + totalDeductions24 + otherDeductions;
  const oldTaxableIncome = Math.max(0, grossIncome - totalOldDeductions);
  const oldTax = computeTax(oldTaxableIncome, oldRegimeSlabs);
  const oldCess = oldTax * 0.04;
  const oldTotalTax = oldTax + oldCess;

  // New regime (no deductions except standard deduction ₹75,000)
  const newTaxableIncome = Math.max(0, grossIncome - 75000);
  const newTax = computeTax(newTaxableIncome, newRegimeSlabs);
  const newCess = newTax * 0.04;
  const newTotalTax = newTax + newCess;

  // New regime rebate: up to ₹7L → zero tax
  const newTotalTaxAfterRebate = newTaxableIncome <= 700000 ? 0 : newTotalTax;

  const recommendedRegime = oldTotalTax < newTotalTaxAfterRebate ? "old" : "new";
  const savingsWithRecommendation = Math.abs(oldTotalTax - newTotalTaxAfterRebate);

  const finalTax = recommendedRegime === "old" ? oldTotalTax : newTotalTaxAfterRebate;

  return {
    regime: recommendedRegime,
    taxableIncome: recommendedRegime === "old" ? oldTaxableIncome : newTaxableIncome,
    taxPayable: finalTax,
    effectiveTaxRate: (finalTax / grossIncome) * 100,
    cess: recommendedRegime === "old" ? oldCess : newCess,
    totalTax: finalTax,
    takeHome: grossIncome - finalTax,
    monthlyTakeHome: (grossIncome - finalTax) / 12,
    oldRegime: {
      regime: "old",
      taxableIncome: oldTaxableIncome,
      taxPayable: oldTotalTax,
      effectiveTaxRate: (oldTotalTax / grossIncome) * 100,
      cess: oldCess,
      totalTax: oldTotalTax,
      takeHome: grossIncome - oldTotalTax,
      monthlyTakeHome: (grossIncome - oldTotalTax) / 12,
    },
    newRegime: {
      regime: "new",
      taxableIncome: newTaxableIncome,
      taxPayable: newTotalTaxAfterRebate,
      effectiveTaxRate: (newTotalTaxAfterRebate / grossIncome) * 100,
      cess: newCess,
      totalTax: newTotalTaxAfterRebate,
      takeHome: grossIncome - newTotalTaxAfterRebate,
      monthlyTakeHome: (grossIncome - newTotalTaxAfterRebate) / 12,
    },
    recommendedRegime,
    savingsWithRecommendation,
    regimeWiseComparison: { old: oldTotalTax, new: newTotalTaxAfterRebate, diff: oldTotalTax - newTotalTaxAfterRebate },
  };
}

// ─── Goal-Based Planning ─────────────────────────────────────────────────────

/**
 * Calculate monthly investment needed to reach a financial goal.
 */
export function calculateGoal(input: GoalInput): GoalResult {
  const { targetAmount, targetDate, riskProfile } = input;
  const today = new Date();
  const target = new Date(targetDate);
  const yearsLeft = Math.max(1, (target.getTime() - today.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

  // Risk-based asset allocation and expected return
  const allocations = {
    conservative: { equity: 30, debt: 60, gold: 10, returnRate: 8 },
    moderate: { equity: 60, debt: 30, gold: 10, returnRate: 12 },
    aggressive: { equity: 80, debt: 15, gold: 5, returnRate: 15 },
  };

  const alloc = allocations[riskProfile];
  const monthlyRate = alloc.returnRate / 12 / 100;
  const monthsLeft = Math.ceil(yearsLeft * 12);

  // FV of SIP formula: FV = P × [((1+r)^n - 1) / r] × (1+r)
  const monthlyInvestment = targetAmount / (((Math.pow(1 + monthlyRate, monthsLeft) - 1) / monthlyRate) * (1 + monthlyRate));
  const totalInvested = monthlyInvestment * monthsLeft;

  // Feasibility
  let feasibility: GoalResult["feasibility"] = "easy";
  if (monthlyInvestment > (input.monthlyIncome || 100000) * 0.5) feasibility = "impossible";
  else if (monthlyInvestment > (input.monthlyIncome || 100000) * 0.3) feasibility = "stretch";
  else if (monthlyInvestment > (input.monthlyIncome || 100000) * 0.15) feasibility = "possible";

  // Alternatives
  const alternatives = [
    { monthlyAmount: monthlyInvestment, duration: yearsLeft, return: alloc.returnRate },
    { monthlyAmount: monthlyInvestment * 0.8, duration: yearsLeft + 2, return: alloc.returnRate },
    { monthlyAmount: monthlyInvestment * 1.2, duration: Math.max(1, yearsLeft - 1), return: alloc.returnRate + 2 },
  ];

  return {
    monthlyInvestmentNeeded: Math.ceil(monthlyInvestment),
    assetAllocation: { equity: alloc.equity, debt: alloc.debt, gold: alloc.gold },
    expectedReturn: alloc.returnRate,
    totalInvested,
    totalGrowth: targetAmount - totalInvested,
    feasibility,
    alternatives,
  };
}

// ─── What-If Scenario Engine ─────────────────────────────────────────────────

/**
 * Run multiple what-if scenarios and compare outcomes.
 */
export function runWhatIfScenarios(
  scenarios: {
    name: string;
    calculate: () => Record<string, number>;
  }[],
): ComparisonResult {
  const results: WhatIfScenario[] = scenarios.map((s) => ({
    name: s.name,
    variables: {},
    outcomes: s.calculate(),
  }));

  // Find best by each metric
  const allMetrics = [...new Set(results.flatMap((r) => Object.keys(r.outcomes)))];
  const bestByMetric: Record<string, string> = {};

  for (const metric of allMetrics) {
    let bestName = "";
    let bestValue = -Infinity;
    for (const r of results) {
      const val = r.outcomes[metric] || 0;
      if (val > bestValue) {
        bestValue = val;
        bestName = r.name;
      }
    }
    bestByMetric[metric] = bestName;
  }

  // Risk-adjusted scores (higher return = more risk)
  const riskAdjusted: Record<string, number> = {};
  for (const r of results) {
    const returnRate = r.outcomes["returnRate"] || 10;
    const volatility = r.outcomes["volatility"] || 5;
    riskAdjusted[r.name] = returnRate / Math.max(volatility, 1);
  }

  return { scenarios: results, bestByMetric, riskAdjusted };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function getPayoffDate(monthsFromNow: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsFromNow);
  return date.toISOString().split("T")[0];
}

/**
 * Compare two investment options side-by-side.
 */
export function compareInvestments(
  options: { name: string; calculate: () => Record<string, number> }[],
): {
  options: { name: string; metrics: Record<string, number> }[];
  winner: string;
  metrics: string[];
} {
  const results = options.map((o) => ({ name: o.name, metrics: o.calculate() }));
  const allMetrics = [...new Set(results.flatMap((r) => Object.keys(r.metrics)))];

  // Winner is the one with highest totalValue or futureValue
  const valueKey = allMetrics.find((m) => m === "futureValue" || m === "maturityAmount" || m === "totalValue") || allMetrics[0];
  let winner = results[0].name;
  let maxValue = -Infinity;
  for (const r of results) {
    const val = r.metrics[valueKey] || 0;
    if (val > maxValue) {
      maxValue = val;
      winner = r.name;
    }
  }

  return { options: results, winner, metrics: allMetrics };
}

/**
 * Calculate SWP (Systematic Withdrawal Plan) from a corpus.
 */
export function calculateSWP(
  corpus: number,
  monthlyWithdrawal: number,
  annualReturnRate: number,
  inflationRate: number,
): {
  durationMonths: number;
  durationYears: number;
  totalWithdrawn: number;
  totalGrowth: number;
  inflationAdjustedCorpus: number;
  monthlySchedule: { month: number; withdrawal: number; interest: number; balance: number }[];
} {
  const monthlyRate = annualReturnRate / 12 / 100;
  let balance = corpus;
  const schedule: { month: number; withdrawal: number; interest: number; balance: number }[] = [];
  let totalWithdrawn = 0;
  let month = 0;

  while (balance > 0 && month < 600) { // Max 50 years
    month++;
    const interest = balance * monthlyRate;
    const withdrawal = Math.min(monthlyWithdrawal, balance + interest);
    balance = balance + interest - withdrawal;
    totalWithdrawn += withdrawal;

    schedule.push({
      month,
      withdrawal,
      interest,
      balance: Math.max(0, balance),
    });
  }

  return {
    durationMonths: month,
    durationYears: month / 12,
    totalWithdrawn,
    totalGrowth: totalWithdrawn - corpus,
    inflationAdjustedCorpus: corpus,
    monthlySchedule: schedule,
  };
}

/**
 * Calculate stamp duty and registration costs.
 */
export function calculateStampDuty(
  propertyValue: number,
  state: string,
): {
  stampDuty: number;
  registrationFee: number;
  total: number;
  stampDutyRate: number;
} {
  // State-wise stamp duty rates (approximate)
  const stateRates: Record<string, { stampDuty: number; registration: number }> = {
    "karnataka": { stampDuty: 5.6, registration: 1 },       // Bangalore
    "maharashtra": { stampDuty: 6, registration: 1 },         // Mumbai
    "tamil nadu": { stampDuty: 7, registration: 1 },
    "telangana": { stampDuty: 6, registration: 0.5 },
    "andhra pradesh": { stampDuty: 5, registration: 0.5 },
    "delhi": { stampDuty: 4, registration: 1 },
    "kerala": { stampDuty: 8, registration: 2 },
    "west bengal": { stampDuty: 6, registration: 1 },
    "uttar pradesh": { stampDuty: 5, registration: 1 },
    "rajasthan": { stampDuty: 5, registration: 1 },
    "gujarat": { stampDuty: 4.9, registration: 1 },
    "madhya pradesh": { stampDuty: 5, registration: 1 },
    "punjab": { stampDuty: 5, registration: 1 },
    "haryana": { stampDuty: 5, registration: 1 },
    "odisha": { stampDuty: 5, registration: 1 },
    "assam": { stampDuty: 5, registration: 1 },
    "goa": { stampDuty: 3.5, registration: 1 },
    "jharkhand": { stampDuty: 4, registration: 1 },
    "chhattisgarh": { stampDuty: 5, registration: 1 },
    "bihar": { stampDuty: 5, registration: 2 },
  };

  const rate = stateRates[state.toLowerCase()] || { stampDuty: 5, registration: 1 };
  const stampDuty = propertyValue * rate.stampDuty / 100;
  const registrationFee = propertyValue * rate.registration / 100;

  return {
    stampDuty,
    registrationFee,
    total: stampDuty + registrationFee,
    stampDutyRate: rate.stampDuty,
  };
}
