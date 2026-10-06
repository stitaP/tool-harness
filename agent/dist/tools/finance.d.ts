/**
 * finance_calc: loan arithmetic done exactly, so a small model never computes EMIs or interest in its head.
 * Same formulas as the lending-portal template's calculators.
 */
import { type Tool } from "./types.js";
export declare function emi(principal: number, annualRatePct: number, months: number): number;
export declare function schedule(principal: number, annualRatePct: number, months: number): {
    month: number;
    emi: number;
    principal: number;
    interest: number;
    balance: number;
}[];
/** Annual rate (%) that makes `emiAmount` repay `principal` in `months` (bisection). */
export declare function rateFor(principal: number, emiAmount: number, months: number): number;
export declare const financeTool: Tool;
