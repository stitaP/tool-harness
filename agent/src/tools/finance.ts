/**
 * finance_calc: loan arithmetic done exactly, so a small model never computes EMIs or interest in its head.
 * Same formulas as the lending-portal template's calculators.
 */
import { type Tool, obj, num, int, enm } from "./types.js";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function emi(principal: number, annualRatePct: number, months: number): number {
  const r = annualRatePct / 12 / 100;
  if (months <= 0) return 0;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export function schedule(principal: number, annualRatePct: number, months: number) {
  const r = annualRatePct / 12 / 100, e = emi(principal, annualRatePct, months);
  const rows: { month: number; emi: number; principal: number; interest: number; balance: number }[] = [];
  let bal = principal;
  for (let m = 1; m <= months; m++) {
    const interest = bal * r, princ = m === months ? bal : e - interest;
    bal = Math.max(0, bal - princ);
    rows.push({ month: m, emi: r2(princ + interest), principal: r2(princ), interest: r2(interest), balance: r2(bal) });
  }
  return rows;
}

/** Annual rate (%) that makes `emiAmount` repay `principal` in `months` (bisection). */
export function rateFor(principal: number, emiAmount: number, months: number): number {
  if (emiAmount * months <= principal) return 0;
  let lo = 0, hi = 200;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (emi(principal, mid, months) > emiAmount) hi = mid; else lo = mid; }
  return r2((lo + hi) / 2);
}

export const financeTool: Tool = {
  name: "finance_calc", toolset: "files", tier: "slm", deferred: true, parallelSafe: true,
  description: "Exact loan maths (never compute these yourself): emi (reducing-balance EMI, total interest), schedule (amortization table), flat (flat-rate EMI vs reducing), " +
    "prepay (part prepayment: months or interest saved), eligibility (max loan from income by FOIR), rate (interest rate implied by an EMI), simple / compound interest. Rates are % per year.",
  parameters: obj({
    kind: enm(["emi", "schedule", "flat", "prepay", "eligibility", "rate", "simple", "compound"], "calculation"),
    principal: num("loan / deposit amount"),
    rate: num("interest rate, % per year"),
    months: int("tenure in months"),
    emi: num("rate: the instalment amount"),
    after_month: int("prepay: prepayment made after this many EMIs"),
    amount: num("prepay: prepayment amount"),
    income: num("eligibility: monthly income"),
    existing_emis: num("eligibility: existing monthly EMIs"),
    foir: num("eligibility: max share of income for EMIs, % (default 50)"),
    compounding: int("compound: times per year (default 4 = quarterly)"),
  }, ["kind"]),
  async handler(a) {
    const P = Number(a.principal ?? 0), R = Number(a.rate ?? 0), N = Math.round(Number(a.months ?? 0));
    const need = (...k: [string, unknown][]) => { const miss = k.filter(([, v]) => !(Number(v) > 0) && v !== 0).map(([n]) => n); if (miss.length) throw new Error(`needs ${miss.join(", ")}`); };
    switch (a.kind) {
      case "emi": { need(["principal", a.principal], ["months", a.months]); const e = emi(P, R, N), total = e * N; return JSON.stringify({ emi: r2(e), total_interest: r2(total - P), total_paid: r2(total) }); }
      case "schedule": { need(["principal", a.principal], ["months", a.months]); const rows = schedule(P, R, N); return JSON.stringify({ emi: rows[0]?.emi, rows: rows.length > 120 ? [...rows.slice(0, 60), ...rows.slice(-12)] : rows }); }
      case "flat": { need(["principal", a.principal], ["months", a.months]); const interest = P * R / 100 * N / 12; return JSON.stringify({ flat_emi: r2((P + interest) / N), flat_total_interest: r2(interest), reducing_emi: r2(emi(P, R, N)), reducing_total_interest: r2(emi(P, R, N) * N - P), note: "a flat rate costs more than the same reducing rate" }); }
      case "prepay": {
        need(["principal", a.principal], ["months", a.months], ["after_month", a.after_month], ["amount", a.amount]);
        const k = Number(a.after_month), rows = schedule(P, R, N), e = emi(P, R, N), r = R / 1200;
        const bal = Math.max(0, (rows[k - 1]?.balance ?? P) - Number(a.amount)), left = N - k;
        const newN = bal <= 0 ? 0 : r === 0 ? Math.ceil(bal / e) : Math.ceil(-Math.log(1 - (bal * r) / e) / Math.log(1 + r));
        const paidInt = rows.slice(0, k).reduce((s, x) => s + x.interest, 0), before = rows.reduce((s, x) => s + x.interest, 0);
        const sum = (rs: { interest: number }[]) => rs.reduce((s, x) => s + x.interest, 0);
        return JSON.stringify({ balance_after: r2(bal), keep_emi: { months_saved: left - newN, interest_saved: r2(before - paidInt - sum(schedule(bal, R, newN))) }, keep_tenure: { new_emi: r2(emi(bal, R, left)), interest_saved: r2(before - paidInt - sum(schedule(bal, R, left))) } });
      }
      case "eligibility": { need(["income", a.income], ["months", a.months]); const room = Math.max(0, Number(a.income) * Number(a.foir ?? 50) / 100 - Number(a.existing_emis ?? 0)); const per = emi(1, R, N); return JSON.stringify({ max_emi: r2(room), max_loan: r2(per ? room / per : 0) }); }
      case "rate": { need(["principal", a.principal], ["months", a.months], ["emi", a.emi]); return JSON.stringify({ annual_rate_pct: rateFor(P, Number(a.emi), N) }); }
      case "simple": { need(["principal", a.principal], ["months", a.months]); const i = P * R / 100 * N / 12; return JSON.stringify({ interest: r2(i), maturity: r2(P + i) }); }
      case "compound": { need(["principal", a.principal], ["months", a.months]); const n = Number(a.compounding ?? 4), m = P * Math.pow(1 + R / 100 / n, n * N / 12); return JSON.stringify({ interest: r2(m - P), maturity: r2(m) }); }
      default: return "error: unknown kind";
    }
  },
};
