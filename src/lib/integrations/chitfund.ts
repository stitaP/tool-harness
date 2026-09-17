/**
 * Chit Fund Company Tools
 *
 * Complete toolkit for running a chit fund company:
 * - Chit group creation and management
 * - Monthly bid/auction tracking
 * - Dividend calculation and distribution
 * - Collection tracking and default detection
 * - Foreman commission calculation
 * - Regulatory compliance (Registrar of Chits)
 * - Member ledger and statement generation
 * - Prize money disbursement
 *
 * Chit fund basics:
 * - N members contribute ₹X/month for N months
 * - Each month, members bid (discount %)
 * - Lowest bidder wins the pot (prize money)
 * - Discount amount is shared as dividend among all members
 * - Foreman takes 5% commission from the pot
 */

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface ChitGroup {
  id: string;
  name: string;
  chitValue: number;           // Total monthly pot (e.g. ₹1,00,000)
  numberOfMembers: number;     // e.g. 25
  durationMonths: number;      // e.g. 25 months
  monthlyContribution: number; // chitValue / numberOfMembers
  startDate: string;
  currentRound: number;        // 1-based
  status: "upcoming" | "active" | "completed" | "defaulted";
  foremanCommission: number;   // Typically 5% of chitValue
  state: string;               // For regulatory compliance
  registrationNumber: string;
  members: ChitMember[];
  rounds: ChitRound[];
}

export interface ChitMember {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
  aadhaarLast4?: string;
  panNumber?: string;
  joinedDate: string;
  status: "active" | "defaulted" | "withdrawn" | "completed";
  totalContributed: number;
  totalDividends: number;
  totalPrizeWon: number;
  hasWonPrize: boolean;
  wonRound?: number;
  missedPayments: number[];
  groupId: string;
}

export interface ChitRound {
  roundNumber: number;
  date: string;
  groupId: string;
  potAmount: number;           // chitValue
  commission: number;          // foremanCommission
  distributableAmount: number; // potAmount - commission
  bids: ChitBid[];
  winner?: {
    memberId: string;
    memberName: string;
    bidAmount: number;         // Amount they offered to take
    discountPercent: number;   // (chitValue - bidAmount) / chitValue * 100
  };
  dividendPerMember: number;   // (distributableAmount - winnerBidAmount) / numberOfMembers
  status: "bidding" | "won" | "disbursed" | "defaulted";
  collections: ChitCollection[];
  totalCollected: number;
  totalPending: number;
  membersPaid: number;
  membersPending: number;
}

export interface ChitBid {
  memberId: string;
  memberName: string;
  bidAmount: number;
  discountPercent: number;
  timestamp: string;
  isWinner: boolean;
}

export interface ChitCollection {
  memberId: string;
  memberName: string;
  roundNumber: number;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: "paid" | "pending" | "overdue" | "waived";
  paymentMethod?: "cash" | "cheque" | "upi" | "bank_transfer";
  transactionRef?: string;
  collectedBy?: string;
}

export interface MemberStatement {
  memberId: string;
  memberName: string;
  groupId: string;
  groupName: string;
  totalContributed: number;
  totalDividendsReceived: number;
  totalPrizeWon: number;
  netPosition: number;         // (dividends + prize) - contributed
  paymentHistory: {
    round: number;
    contributed: number;
    dividendReceived: number;
    isWinner: boolean;
    prizeAmount: number;
  }[];
  currentStanding: "contributing" | "won" | "completed";
  missedPayments: number[];
  totalPenalty: number;
}

export interface ForemanReport {
  groupId: string;
  groupName: string;
  totalChitValue: number;
  totalCommission: number;
  totalCollected: number;
  totalDisbursed: number;
  activeMembers: number;
  defaultedMembers: number;
  completedRounds: number;
  remainingRounds: number;
  monthlyBreakdown: {
    round: number;
    commission: number;
    collected: number;
    disbursed: number;
    defaultCount: number;
  }[];
}

export interface RegulatoryCompliance {
  groupId: string;
  state: string;
  registrationValid: boolean;
  registrationExpiry?: string;
  maxChitValue: number;        // State-wise limit
  actualChitValue: number;
  withinLimit: boolean;
  requiredDocuments: string[];
  missingDocuments: string[];
  auditStatus: "current" | "overdue" | "never";
  lastAuditDate?: string;
  nextAuditDue?: string;
  bondsRequired: number;
  bondsDeposited: number;
  complianceScore: number;     // 0-100
  violations: string[];
}

export interface DefaultNotice {
  memberId: string;
  memberName: string;
  groupId: string;
  missedRounds: number[];
  totalOutstanding: number;
  noticeDate: string;
  noticeType: "warning" | "final" | "legal";
  legalDeadline?: string;
  penaltyAmount: number;
}

// ─── Chit Group Management ───────────────────────────────────────────────────

/**
 * Create a new chit group with member registration.
 */
export function createChitGroup(params: {
  name: string;
  chitValue: number;
  numberOfMembers: number;
  state: string;
  registrationNumber: string;
  startDate: string;
  members: { name: string; phone: string; address: string }[];
}): ChitGroup {
  const monthlyContribution = Math.ceil(params.chitValue / params.numberOfMembers);
  const foremanCommission = Math.ceil(params.chitValue * 0.05); // 5% standard

  const members: ChitMember[] = params.members.map((m, i) => ({
    id: `MEM-${Date.now()}-${String(i + 1).padStart(3, "0")}`,
    name: m.name,
    phone: m.phone,
    address: m.address,
    joinedDate: params.startDate,
    status: "active" as const,
    totalContributed: 0,
    totalDividends: 0,
    totalPrizeWon: 0,
    hasWonPrize: false,
    missedPayments: [],
    groupId: "",
  }));

  return {
    id: `CHIT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    name: params.name,
    chitValue: params.chitValue,
    numberOfMembers: params.numberOfMembers,
    durationMonths: params.numberOfMembers,
    monthlyContribution,
    startDate: params.startDate,
    currentRound: 1,
    status: "upcoming",
    foremanCommission,
    state: params.state,
    registrationNumber: params.registrationNumber,
    members,
    rounds: [],
  };
}

// ─── Bid Management ──────────────────────────────────────────────────────────

/**
 * Record a bid for the current round.
 * Returns validation errors if bid is invalid.
 */
export function recordBid(
  group: ChitGroup,
  memberId: string,
  bidAmount: number,
): {
  success: boolean;
  bid?: ChitBid;
  errors: string[];
} {
  const errors: string[] = [];
  const member = group.members.find((m) => m.id === memberId);

  if (!member) {
    errors.push("Member not found");
    return { success: false, errors };
  }

  if (member.status !== "active") {
    errors.push(`Member status is ${member.status}, cannot bid`);
  }

  if (member.hasWonPrize) {
    errors.push("Member has already won a prize — cannot bid again until all members have won");
  }

  // Bid validation
  const minBid = group.chitValue * 0.3; // Minimum 30% of chit value
  const maxBid = group.chitValue - group.foremanCommission;

  if (bidAmount < minBid) {
    errors.push(`Bid must be at least ₹${minBid} (30% of chit value)`);
  }
  if (bidAmount > maxBid) {
    errors.push(`Bid cannot exceed ₹${maxBid} (after commission)`);
  }

  // Check if member has outstanding payments
  const outstanding = group.rounds.filter(
    (r) => r.collections.some(
      (c) => c.memberId === memberId && c.status === "overdue",
    ),
  ).length;
  if (outstanding > 0) {
    errors.push(`Member has ${outstanding} overdue payment(s) — cannot bid`);
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const discountPercent = ((group.chitValue - bidAmount) / group.chitValue) * 100;

  const bid: ChitBid = {
    memberId,
    memberName: member.name,
    bidAmount,
    discountPercent,
    timestamp: new Date().toISOString(),
    isWinner: false,
  };

  return { success: true, bid, errors: [] };
}

/**
 * Close bidding for a round and determine winner.
 * Calculates dividend distribution.
 */
export function closeBidding(
  group: ChitGroup,
  bids: ChitBid[],
): {
  round: ChitRound;
  winnerBid: ChitBid;
  dividendPerMember: number;
  summary: string;
} {
  // Find lowest bid (highest discount)
  const sortedBids = [...bids].sort((a, b) => a.bidAmount - b.bidAmount);
  const winnerBid = { ...sortedBids[0], isWinner: true };

  const commission = group.foremanCommission;
  const distributable = group.chitValue - commission;
  const dividendPool = distributable - winnerBid.bidAmount;
  const dividendPerMember = dividendPool / group.numberOfMembers;

  // Build collections for all members
  const collections: ChitCollection[] = group.members.map((m) => ({
    memberId: m.id,
    memberName: m.name,
    roundNumber: group.currentRound,
    amount: group.monthlyContribution,
    dueDate: new Date().toISOString().split("T")[0],
    status: m.id === winnerBid.memberId ? "paid" as const : "pending" as const,
  }));

  const round: ChitRound = {
    roundNumber: group.currentRound,
    date: new Date().toISOString().split("T")[0],
    groupId: group.id,
    potAmount: group.chitValue,
    commission,
    distributableAmount: distributable,
    bids,
    winner: {
      memberId: winnerBid.memberId,
      memberName: winnerBid.memberName,
      bidAmount: winnerBid.bidAmount,
      discountPercent: winnerBid.discountPercent,
    },
    dividendPerMember,
    status: "won",
    collections,
    totalCollected: group.monthlyContribution, // Winner's contribution
    totalPending: group.monthlyContribution * (group.numberOfMembers - 1),
    membersPaid: 1,
    membersPending: group.numberOfMembers - 1,
  };

  const summary = [
    `Round ${group.currentRound} Result:`,
    `Winner: ${winnerBid.memberName} at ₹${winnerBid.bidAmount} (${winnerBid.discountPercent.toFixed(1)}% discount)`,
    `Prize Money: ₹${winnerBid.bidAmount}`,
    `Dividend per member: ₹${dividendPerMember.toFixed(2)}`,
    `Foreman Commission: ₹${commission}`,
  ].join("\n");

  return { round, winnerBid, dividendPerMember, summary };
}

// ─── Collection Tracking ─────────────────────────────────────────────────────

/**
 * Record a collection payment from a member.
 */
export function recordCollection(
  round: ChitRound,
  memberId: string,
  amount: number,
  paymentMethod: "cash" | "cheque" | "upi" | "bank_transfer",
  transactionRef?: string,
): {
  round: ChitRound;
  updated: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const collection = round.collections.find((c) => c.memberId === memberId);

  if (!collection) {
    warnings.push("Member not found in this round");
    return { round, updated: false, warnings };
  }

  if (collection.status === "paid") {
    warnings.push("Already paid — duplicate payment detected");
    return { round, updated: false, warnings };
  }

  if (amount < collection.amount) {
    warnings.push(`Partial payment: ₹${amount} against ₹${collection.amount} due`);
  }

  collection.status = amount >= collection.amount ? "paid" : "pending";
  collection.paidDate = new Date().toISOString().split("T")[0];
  collection.paymentMethod = paymentMethod;
  collection.transactionRef = transactionRef;

  // Update round totals
  round.totalCollected = round.collections
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + c.amount, 0);
  round.totalPending = round.collections
    .filter((c) => c.status !== "paid")
    .reduce((sum, c) => sum + c.amount, 0);
  round.membersPaid = round.collections.filter((c) => c.status === "paid").length;
  round.membersPending = round.collections.filter((c) => c.status !== "paid").length;

  return { round, updated: true, warnings };
}

/**
 * Auto-mark overdue collections based on due date.
 */
export function markOverdueCollections(
  rounds: ChitRound[],
  graceDays: number = 7,
): {
  updatedRounds: ChitRound[];
  newlyOverdue: { memberId: string; memberName: string; round: number; daysOverdue: number }[];
} {
  const today = new Date();
  const newlyOverdue: { memberId: string; memberName: string; round: number; daysOverdue: number }[] = [];

  const updatedRounds = rounds.map((round) => {
    if (round.status !== "won" && round.status !== "bidding") return round;

    const updatedCollections = round.collections.map((c) => {
      if (c.status === "pending") {
        const dueDate = new Date(c.dueDate);
        const graceDate = new Date(dueDate);
        graceDate.setDate(graceDate.getDate() + graceDays);

        if (today > graceDate) {
          const daysOverdue = Math.floor(
            (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          newlyOverdue.push({
            memberId: c.memberId,
            memberName: c.memberName,
            round: round.roundNumber,
            daysOverdue,
          });
          return { ...c, status: "overdue" as const };
        }
      }
      return c;
    });

    return { ...round, collections: updatedCollections };
  });

  return { updatedRounds, newlyOverdue };
}

// ─── Dividend Calculator ─────────────────────────────────────────────────────

/**
 * Calculate total dividends for a member across all rounds.
 */
export function calculateMemberDividends(
  member: ChitMember,
  rounds: ChitRound[],
): MemberStatement {
  const paymentHistory = rounds.map((round) => {
    const collection = round.collections.find((c) => c.memberId === member.id);
    const isWinner = round.winner?.memberId === member.id;

    return {
      round: round.roundNumber,
      contributed: collection?.amount || 0,
      dividendReceived: round.dividendPerMember,
      isWinner,
      prizeAmount: isWinner ? round.winner?.bidAmount || 0 : 0,
    };
  });

  const totalContributed = paymentHistory.reduce((s, p) => s + p.contributed, 0);
  const totalDividends = paymentHistory.reduce((s, p) => s + p.dividendReceived, 0);
  const totalPrizeWon = paymentHistory.reduce((s, p) => s + p.prizeAmount, 0);

  return {
    memberId: member.id,
    memberName: member.name,
    groupId: member.groupId,
    groupName: "",
    totalContributed,
    totalDividendsReceived: totalDividends,
    totalPrizeWon,
    netPosition: totalDividends + totalPrizeWon - totalContributed,
    paymentHistory,
    currentStanding: member.hasWonPrize ? "won" : "contributing",
    missedPayments: member.missedPayments,
    totalPenalty: member.missedPayments.length * 100, // ₹100 penalty per miss
  };
}

// ─── Foreman Report ──────────────────────────────────────────────────────────

/**
 * Generate foreman commission report.
 */
export function generateForemanReport(group: ChitGroup): ForemanReport {
  const completedRounds = group.rounds.filter((r) => r.status !== "bidding");
  const activeMembers = group.members.filter((m) => m.status === "active").length;
  const defaultedMembers = group.members.filter((m) => m.status === "defaulted").length;

  const monthlyBreakdown = completedRounds.map((round) => ({
    round: round.roundNumber,
    commission: round.commission,
    collected: round.totalCollected,
    disbursed: round.winner ? round.winner.bidAmount : 0,
    defaultCount: round.collections.filter((c) => c.status === "overdue").length,
  }));

  return {
    groupId: group.id,
    groupName: group.name,
    totalChitValue: group.chitValue * completedRounds.length,
    totalCommission: completedRounds.reduce((s, r) => s + r.commission, 0),
    totalCollected: completedRounds.reduce((s, r) => s + r.totalCollected, 0),
    totalDisbursed: completedRounds.reduce((s, r) => s + (r.winner?.bidAmount || 0), 0),
    activeMembers,
    defaultedMembers,
    completedRounds: completedRounds.length,
    remainingRounds: group.durationMonths - completedRounds.length,
    monthlyBreakdown,
  };
}

// ─── Regulatory Compliance ───────────────────────────────────────────────────

/**
 * Check regulatory compliance for a chit fund.
 * Based on Chit Funds Act, 1982 and state-specific rules.
 */
export function checkCompliance(group: ChitGroup): RegulatoryCompliance {
  const stateRules: Record<string, { maxValue: number; bondRequired: number }> = {
    "karnataka": { maxValue: 500000, bondRequired: 100000 },
    "tamil nadu": { maxValue: 1000000, bondRequired: 200000 },
    "andhra pradesh": { maxValue: 500000, bondRequired: 100000 },
    "telangana": { maxValue: 500000, bondRequired: 100000 },
    "kerala": { maxValue: 500000, bondRequired: 100000 },
    "maharashtra": { maxValue: 500000, bondRequired: 100000 },
    "delhi": { maxValue: 500000, bondRequired: 100000 },
  };

  const rules = stateRules[group.state.toLowerCase()] || { maxValue: 500000, bondRequired: 100000 };
  const withinLimit = group.chitValue <= rules.maxValue;

  const requiredDocuments = [
    "Registration Certificate",
    "Chit Agreement",
    "Surety Bond",
    "Member KYC Documents",
    "Annual Audit Report",
    "Bank Account Details",
    "Foreman License",
  ];

  const violations: string[] = [];
  if (!withinLimit) {
    violations.push(`Chit value ₹${group.chitValue} exceeds state limit ₹${rules.maxValue}`);
  }
  if (!group.registrationNumber) {
    violations.push("Registration number not provided");
  }

  // Calculate compliance score
  let score = 100;
  if (!withinLimit) score -= 30;
  if (!group.registrationNumber) score -= 20;
  if (violations.length > 0) score -= violations.length * 10;

  return {
    groupId: group.id,
    state: group.state,
    registrationValid: !!group.registrationNumber,
    maxChitValue: rules.maxValue,
    actualChitValue: group.chitValue,
    withinLimit,
    requiredDocuments,
    missingDocuments: [],
    auditStatus: "current",
    bondsRequired: rules.bondRequired,
    bondsDeposited: rules.bondRequired,
    complianceScore: Math.max(0, score),
    violations,
  };
}

// ─── Default Notice Generator ────────────────────────────────────────────────

/**
 * Generate default notice for a member.
 */
export function generateDefaultNotice(
  member: ChitMember,
  group: ChitGroup,
  missedRounds: number[],
): DefaultNotice {
  const totalOutstanding = missedRounds.length * group.monthlyContribution;
  const penaltyPerMiss = 100;
  const penaltyAmount = missedRounds.length * penaltyPerMiss;

  let noticeType: DefaultNotice["noticeType"] = "warning";
  if (missedRounds.length >= 3) noticeType = "legal";
  else if (missedRounds.length >= 2) noticeType = "final";

  return {
    memberId: member.id,
    memberName: member.name,
    groupId: group.id,
    missedRounds,
    totalOutstanding,
    noticeDate: new Date().toISOString().split("T")[0],
    noticeType,
    legalDeadline: noticeType === "legal"
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      : undefined,
    penaltyAmount,
  };
}

/**
 * Generate a formatted notice message (WhatsApp-ready).
 */
export function formatNoticeMessage(
  notice: DefaultNotice,
  group: ChitGroup,
): string {
  const emoji = notice.noticeType === "legal" ? "⚖️" : notice.noticeType === "final" ? "🔴" : "⚠️";

  return [
    `${emoji} *Chit Fund Payment Notice*`,
    ``,
    `Dear *${notice.memberName}*,`,
    ``,
    `Group: ${group.name}`,
    `Missed Rounds: ${notice.missedRounds.join(", ")}`,
    `Outstanding: ₹${notice.totalOutstanding}`,
    `Penalty: ₹${notice.penaltyAmount}`,
    notice.legalDeadline ? `\n📅 Legal deadline: ${notice.legalDeadline}` : "",
    notice.noticeType === "legal"
      ? `\n⚖️ This is a FINAL NOTICE. Failure to pay within 30 days may result in legal action under the Chit Funds Act, 1982.`
      : notice.noticeType === "final"
        ? `\n🔴 This is a FINAL WARNING. Please clear dues immediately.`
        : `\nPlease clear your dues at the earliest.`,
    ``,
    `— ${group.name} Foreman`,
  ].filter(Boolean).join("\n");
}

// ─── Summary Dashboard Data ──────────────────────────────────────────────────

/**
 * Generate dashboard summary data for a chit fund company.
 */
export function generateDashboardData(groups: ChitGroup[]): {
  totalGroups: number;
  activeGroups: number;
  totalChitValue: number;
  totalMembers: number;
  totalCollectionThisMonth: number;
  totalDisbursedThisMonth: number;
  totalCommissionThisMonth: number;
  overallDefaultRate: number;
  groupSummaries: {
    name: string;
    chitValue: number;
    currentRound: number;
    totalRounds: number;
    membersActive: number;
    collectionRate: number;
    status: string;
  }[];
} {
  const activeGroups = groups.filter((g) => g.status === "active");
  const currentMonth = new Date().getMonth();

  const totalCollectionThisMonth = activeGroups.reduce((sum, g) => {
    const currentRound = g.rounds.find((r) => r.roundNumber === g.currentRound);
    return sum + (currentRound?.totalCollected || 0);
  }, 0);

  const totalDisbursedThisMonth = activeGroups.reduce((sum, g) => {
    const currentRound = g.rounds.find((r) => r.roundNumber === g.currentRound);
    return sum + (currentRound?.winner?.bidAmount || 0);
  }, 0);

  const totalCommissionThisMonth = activeGroups.length * (activeGroups[0]?.foremanCommission || 0);

  const totalMembers = groups.reduce((sum, g) => sum + g.members.length, 0);
  const defaultedMembers = groups.reduce(
    (sum, g) => sum + g.members.filter((m) => m.status === "defaulted").length, 0,
  );

  const groupSummaries = groups.map((g) => ({
    name: g.name,
    chitValue: g.chitValue,
    currentRound: g.currentRound,
    totalRounds: g.durationMonths,
    membersActive: g.members.filter((m) => m.status === "active").length,
    collectionRate: g.rounds.length > 0
      ? (g.rounds[g.rounds.length - 1]?.membersPaid || 0) / g.numberOfMembers * 100
      : 0,
    status: g.status,
  }));

  return {
    totalGroups: groups.length,
    activeGroups: activeGroups.length,
    totalChitValue: groups.reduce((sum, g) => sum + g.chitValue, 0),
    totalMembers,
    totalCollectionThisMonth,
    totalDisbursedThisMonth,
    totalCommissionThisMonth,
    overallDefaultRate: totalMembers > 0 ? (defaultedMembers / totalMembers) * 100 : 0,
    groupSummaries,
  };
}
