/**
 * stitaP Financial Agent Engine
 *
 * Multi-agent system that monitors:
 * - News articles (press releases, breaking news)
 * - Quarterly/annual reports (earnings, guidance)
 * - Customer complaints (SEC filings, BBB, social)
 * - SEC filings (10-K, 10-Q, 8-K, insider trades)
 *
 * Each data source has a specialized agent that performs sentiment analysis,
 * extracts key metrics, and correlates events with stock price movements.
 *
 * The system uses the observe → plan → act loop:
 *   1. OBSERVE: Ingest data from sources
 *   2. PLAN: Classify, extract, score sentiment
 *   3. ACT: Correlate with price, generate alerts, update dashboard
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type DataSource =
  | "news"
  | "earnings"
  | "complaints"
  | "sec_filings"
  | "insider_trades"
  | "social";

export type SentimentLabel = "very_negative" | "negative" | "neutral" | "positive" | "very_positive";

export type ImpactSeverity = "critical" | "high" | "medium" | "low" | "negligible";

export type AgentState =
  | "idle"
  | "fetching"
  | "analyzing"
  | "correlating"
  | "alerting"
  | "error";

export interface FinancialAgent {
  id: string;
  name: string;
  source: DataSource;
  icon: string;
  color: string;
  description: string;
  state: AgentState;
  lastFetchedAt: number | null;
  itemCount: number;
  errorCount: number;
  avgLatencyMs: number;
}

export interface NewsItem {
  id: string;
  source: "reuters" | "bloomberg" | "cnbc" | "wsj" | "sec" | "company" | "social";
  ticker: string;
  title: string;
  summary: string;
  url?: string;
  publishedAt: number;
  sentiment: SentimentLabel;
  sentimentScore: number; // -1.0 to 1.0
  keyPhrases: string[];
  entities: string[];
  impactEstimate: ImpactSeverity;
}

export interface EarningsReport {
  id: string;
  ticker: string;
  period: string; // "Q1 2025", "FY 2024"
  reportedAt: number;
  revenue: number;
  revenueGrowth: number; // percent
  eps: number;
  epsGrowth: number;
  guidance: "raised" | "maintained" | "lowered";
  guidanceDetail: string;
  beatEstimates: boolean;
  sentiment: SentimentLabel;
  sentimentScore: number;
  keyHighlights: string[];
  risks: string[];
}

export interface Complaint {
  id: string;
  ticker: string;
  source: "sec" | "bbb" | "consumer_financial" | "social" | "class_action";
  category: string;
  title: string;
  description: string;
  filedAt: number;
  severity: ImpactSeverity;
  volume: number; // number of similar complaints
  sentiment: SentimentLabel;
  sentimentScore: number;
  trend: "rising" | "stable" | "falling";
}

export interface StockEvent {
  id: string;
  ticker: string;
  eventType: "news" | "earnings" | "complaint" | "sec_filing" | "insider_trade";
  title: string;
  sentiment: SentimentLabel;
  sentimentScore: number;
  severity: ImpactSeverity;
  timestamp: number;
  priceAtEvent: number;
  priceChange1h: number; // percent
  priceChange1d: number;
  priceChange1w: number;
  volumeAtEvent: number;
  volumeChange: number; // percent vs avg
  correlated: boolean;
}

export interface StockTicker {
  symbol: string;
  name: string;
  price: number;
  change: number; // percent
  changeAbsolute: number;
  volume: number;
  marketCap: number;
  sentiment: SentimentLabel;
  sentimentScore: number;
  alertCount: number;
  eventCount: number;
  riskScore: number; // 0-100
}

export interface SentimentTrend {
  timestamp: number;
  score: number;
  label: SentimentLabel;
  source: DataSource;
}

export interface AlertRule {
  id: string;
  name: string;
  ticker: string;
  condition: string;
  threshold: number;
  enabled: boolean;
  triggeredAt: number | null;
  triggeredCount: number;
}

export interface DashboardState {
  tickers: StockTicker[];
  news: NewsItem[];
  earnings: EarningsReport[];
  complaints: Complaint[];
  events: StockEvent[];
  agents: FinancialAgent[];
  alerts: AlertRule[];
  sentimentTrends: SentimentTrend[];
  selectedTicker: string | null;
  selectedTimeRange: "1h" | "1d" | "1w" | "1m" | "3m" | "1y";
  totalEventsAnalyzed: number;
  totalAlertsTriggered: number;
}

// ─── Agent Definitions ──────────────────────────────────────────────────────

export const FINANCIAL_AGENTS: FinancialAgent[] = [
  {
    id: "news-agent",
    name: "News Monitor",
    source: "news",
    icon: "📰",
    color: "#3B82F6",
    description: "Scans Reuters, Bloomberg, CNBC, WSJ for breaking news affecting tracked tickers",
    state: "idle",
    lastFetchedAt: null,
    itemCount: 0,
    errorCount: 0,
    avgLatencyMs: 0,
  },
  {
    id: "earnings-agent",
    name: "Earnings Analyzer",
    source: "earnings",
    icon: "📊",
    color: "#10B981",
    description: "Tracks quarterly/annual earnings, compares against estimates, analyzes guidance",
    state: "idle",
    lastFetchedAt: null,
    itemCount: 0,
    errorCount: 0,
    avgLatencyMs: 0,
  },
  {
    id: "complaint-agent",
    name: "Complaint Tracker",
    source: "complaints",
    icon: "⚠️",
    color: "#EF4444",
    description: "Monitors SEC complaints, BBB filings, class actions, and consumer complaints",
    state: "idle",
    lastFetchedAt: null,
    itemCount: 0,
    errorCount: 0,
    avgLatencyMs: 0,
  },
  {
    id: "sec-agent",
    name: "SEC Filing Watcher",
    source: "sec_filings",
    icon: "📋",
    color: "#8B5CF6",
    description: "Watches 10-K, 10-Q, 8-K filings and insider trading disclosures",
    state: "idle",
    lastFetchedAt: null,
    itemCount: 0,
    errorCount: 0,
    avgLatencyMs: 0,
  },
  {
    id: "social-agent",
    name: "Social Sentiment",
    source: "social",
    icon: "💬",
    color: "#F59E0B",
    description: "Monitors social media, Reddit, StockTwits for retail investor sentiment",
    state: "idle",
    lastFetchedAt: null,
    itemCount: 0,
    errorCount: 0,
    avgLatencyMs: 0,
  },
  {
    id: "correlation-agent",
    name: "Impact Correlator",
    source: "news",
    icon: "🔗",
    color: "#EC4899",
    description: "Correlates events with stock price movements and calculates impact scores",
    state: "idle",
    lastFetchedAt: null,
    itemCount: 0,
    errorCount: 0,
    avgLatencyMs: 0,
  },
];

// ─── Sentiment Scoring ──────────────────────────────────────────────────────

const POSITIVE_WORDS = new Set([
  "beat", "exceeds", "surpasses", "upgrade", "buy", "outperform",
  "growth", "profit", "revenue", "gain", "rise", "surge", "soar",
  "bullish", "strong", "record", "innovative", "partnership", "expansion",
  "dividend", "buyback", "approval", "launch", "breakthrough", "optimistic",
]);

const NEGATIVE_WORDS = new Set([
  "miss", "below", "downgrade", "sell", "underperform", "loss", "decline",
  "drop", "fall", "crash", "plunge", "bearish", "weak", "lawsuit",
  "investigation", "fraud", "recall", "bankruptcy", "default", "debt",
  "complaint", "penalty", "fine", "warning", "risk", "concern", "layoff",
  "restructure", "impairment", "restate", "delay", "scandal", "breach",
]);

export function scoreSentiment(text: string): { score: number; label: SentimentLabel } {
  const words = text.toLowerCase().split(/\s+/);
  let score = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) score += 0.15;
    if (NEGATIVE_WORDS.has(word)) score -= 0.15;
  }

  // Normalize to -1..1
  score = Math.max(-1, Math.min(1, score));

  let label: SentimentLabel;
  if (score >= 0.5) label = "very_positive";
  else if (score >= 0.15) label = "positive";
  else if (score >= -0.15) label = "neutral";
  else if (score >= -0.5) label = "negative";
  else label = "very_negative";

  return { score, label };
}

export function sentimentColor(label: SentimentLabel): string {
  switch (label) {
    case "very_positive": return "#10B981";
    case "positive": return "#34D399";
    case "neutral": return "#9CA3AF";
    case "negative": return "#F87171";
    case "very_negative": return "#EF4444";
  }
}

export function sentimentEmoji(label: SentimentLabel): string {
  switch (label) {
    case "very_positive": return "🟢🟢";
    case "positive": return "🟢";
    case "neutral": return "⚪";
    case "negative": return "🔴";
    case "very_negative": return "🔴🔴";
  }
}

// ─── Impact Estimation ──────────────────────────────────────────────────────

export function estimateImpact(
  sentimentScore: number,
  source: DataSource,
  volume?: number,
): ImpactSeverity {
  const absScore = Math.abs(sentimentScore);
  let weight = 1.0;

  // Weight by source reliability
  switch (source) {
    case "sec_filings": weight = 1.5; break;
    case "earnings": weight = 1.4; break;
    case "news": weight = 1.2; break;
    case "complaints": weight = 1.1; break;
    case "insider_trades": weight = 1.3; break;
    case "social": weight = 0.7; break;
  }

  const adjusted = absScore * weight;
  const volumeBoost = volume ? Math.min(0.2, volume / 10000) : 0;
  const total = adjusted + volumeBoost;

  if (total >= 0.8) return "critical";
  if (total >= 0.5) return "high";
  if (total >= 0.3) return "medium";
  if (total >= 0.1) return "low";
  return "negligible";
}

export function severityColor(severity: ImpactSeverity): string {
  switch (severity) {
    case "critical": return "#DC2626";
    case "high": return "#EF4444";
    case "medium": return "#F59E0B";
    case "low": return "#3B82F6";
    case "negligible": return "#9CA3AF";
  }
}

// ─── Simulated Data Generator ───────────────────────────────────────────────

const TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM"];
const TICKER_NAMES: Record<string, string> = {
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corp.",
  GOOGL: "Alphabet Inc.",
  AMZN: "Amazon.com Inc.",
  TSLA: "Tesla Inc.",
  NVDA: "NVIDIA Corp.",
  META: "Meta Platforms Inc.",
  JPM: "JPMorgan Chase",
};

const NEWS_TITLES: Record<string, string[]> = {
  AAPL: [
    "Apple Reports Record Q4 Revenue, Beats Estimates",
    "Apple Vision Pro Sales Disappoint, Shares Slip",
    "Apple Announces $110B Stock Buyback Program",
    "EU Fines Apple $2B Over App Store Practices",
    "Apple Intelligence Feature Delayed Until 2026",
  ],
  MSFT: [
    "Microsoft Azure Growth Accelerates, Stock Surges",
    "Microsoft Copilot Adoption Exceeds Expectations",
    "Microsoft Acquires Cybersecurity Startup for $1.2B",
    "Regulators Review Microsoft-OpenAI Partnership",
    "Microsoft Layoffs Hit 1,500 Workers in Azure Division",
  ],
  TSLA: [
    "Tesla Delivers Record Vehicles, Stock Soars 8%",
    "Tesla Recalls 2M Vehicles Over Autopilot Concerns",
    "Tesla Cybertruck Faces Production Delays",
    "Elon Musk Sells $4B Tesla Shares",
    "Tesla FSD V13 Gets Regulatory Approval in Europe",
  ],
  NVDA: [
    "NVIDIA Revenue Doubles on AI Chip Demand",
    "NVIDIA Announces Next-Gen Blackwell Ultra GPU",
    "China Export Controls Threaten NVIDIA Sales",
    "NVIDIA Becomes Most Valuable Company Briefly",
    "AI Bubble Concerns Weigh on NVIDIA Valuation",
  ],
};

const COMPLAINT_TITLES: string[] = [
  "Consumer Product Defect Reported to BBB",
  "Data Privacy Breach Class Action Filed",
  "Hidden Fees Complaint with CFPB",
  "Warranty Claim Denial Investigation",
  "Misleading Advertising FTC Complaint",
  "Product Safety Recall Petition",
  "Discriminatory Practice Complaint Filed",
  "Environmental Violation Notice",
];

function generateId(): string {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function generateMockNews(ticker: string): NewsItem {
  const titles = NEWS_TITLES[ticker] ?? NEWS_TITLES["AAPL"] ?? ["Market Update"];
  const title = pick(titles);
  const sentiment = scoreSentiment(title);

  return {
    id: generateId(),
    source: pick(["reuters", "bloomberg", "cnbc", "wsj"]),
    ticker,
    title,
    summary: `${title}. Analysts are monitoring the situation closely for potential stock price impact.`,
    publishedAt: Date.now() - Math.floor(Math.random() * 3_600_000),
    sentiment: sentiment.label,
    sentimentScore: sentiment.score,
    keyPhrases: title.split(" ").slice(0, 3),
    entities: [ticker, TICKER_NAMES[ticker] ?? ticker],
    impactEstimate: estimateImpact(sentiment.score, "news"),
  };
}

export function generateMockEarnings(ticker: string): EarningsReport {
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const quarter = pick(quarters);
  const beat = Math.random() > 0.35;
  const revenue = randomBetween(10, 120) * 1e9;
  const eps = randomBetween(0.5, 5.0);
  const guidance = pick(["raised", "maintained", "lowered"] as const);
  const sentimentScore = beat
    ? randomBetween(0.2, 0.8)
    : randomBetween(-0.7, -0.1);

  return {
    id: generateId(),
    ticker,
    period: `${quarter} 2025`,
    reportedAt: Date.now() - Math.floor(Math.random() * 86_400_000),
    revenue,
    revenueGrowth: randomBetween(-5, 25),
    eps,
    epsGrowth: randomBetween(-10, 30),
    guidance,
    guidanceDetail: guidance === "raised"
      ? "Management raised full-year guidance citing strong demand"
      : guidance === "lowered"
        ? "Management lowered guidance due to macro headwinds"
        : "Management maintained current guidance",
    beatEstimates: beat,
    sentiment: beat && guidance !== "lowered" ? "positive" : "negative",
    sentimentScore,
    keyHighlights: [
      beat ? "Beat revenue estimates" : "Missed revenue estimates",
      `${guidance} guidance`,
      `Revenue: $${(revenue / 1e9).toFixed(1)}B`,
    ],
    risks: guidance === "lowered" ? ["Lowered guidance", "Margin compression"] : [],
  };
}

export function generateMockComplaint(ticker: string): Complaint {
  const title = pick(COMPLAINT_TITLES);
  const sentiment = scoreSentiment(title);
  const volume = Math.floor(randomBetween(5, 500));
  const trend = pick(["rising", "stable", "falling"] as const);

  return {
    id: generateId(),
    ticker,
    source: pick(["sec", "bbb", "consumer_financial", "social", "class_action"]),
    category: title.split(" ").slice(0, 3).join(" "),
    title,
    description: `${title} against ${TICKER_NAMES[ticker] ?? ticker}. ${volume} similar complaints reported.`,
    filedAt: Date.now() - Math.floor(Math.random() * 604_800_000),
    severity: estimateImpact(sentiment.score, "complaints", volume),
    volume,
    sentiment: sentiment.label,
    sentimentScore: sentiment.score,
    trend,
  };
}

export function generateMockStockEvent(ticker: string): StockEvent {
  const sentiment = pick(["very_positive", "positive", "neutral", "negative", "very_negative"] as const);
  const sentimentScore = sentiment === "very_positive" ? randomBetween(0.5, 1)
    : sentiment === "positive" ? randomBetween(0.15, 0.5)
    : sentiment === "neutral" ? randomBetween(-0.15, 0.15)
    : sentiment === "negative" ? randomBetween(-0.5, -0.15)
    : randomBetween(-1, -0.5);

  const priceAtEvent = randomBetween(50, 800);
  const priceChange1h = sentimentScore * randomBetween(0.5, 3);
  const priceChange1d = sentimentScore * randomBetween(1, 5);
  const priceChange1w = sentimentScore * randomBetween(2, 10);

  return {
    id: generateId(),
    ticker,
    eventType: pick(["news", "earnings", "complaint", "sec_filing", "insider_trade"]),
    title: `${ticker} ${sentiment.replace("_", " ")} event`,
    sentiment,
    sentimentScore,
    severity: estimateImpact(sentimentScore, "news"),
    timestamp: Date.now() - Math.floor(Math.random() * 86_400_000),
    priceAtEvent,
    priceChange1h,
    priceChange1d,
    priceChange1w,
    volumeAtEvent: Math.floor(randomBetween(1e6, 100e6)),
    volumeChange: randomBetween(-50, 200),
    correlated: Math.random() > 0.3,
  };
}

// ─── Dashboard State Generator ──────────────────────────────────────────────

export function generateDashboardData(): DashboardState {
  const tickers: StockTicker[] = TICKERS.map((symbol) => {
    const price = randomBetween(50, 800);
    const change = randomBetween(-8, 8);
    const sentimentScore = randomBetween(-0.5, 0.5);
    const sentiment: SentimentLabel = sentimentScore > 0.3 ? "positive"
      : sentimentScore < -0.3 ? "negative" : "neutral";

    return {
      symbol,
      name: TICKER_NAMES[symbol] ?? symbol,
      price,
      change,
      changeAbsolute: price * (change / 100),
      volume: Math.floor(randomBetween(5e6, 80e6)),
      marketCap: price * randomBetween(1e9, 3e12),
      sentiment,
      sentimentScore,
      alertCount: Math.floor(randomBetween(0, 5)),
      eventCount: Math.floor(randomBetween(3, 20)),
      riskScore: Math.floor(Math.abs(sentimentScore) * 100),
    };
  });

  const news: NewsItem[] = TICKERS.flatMap((t) =>
    Array.from({ length: Math.floor(randomBetween(2, 5)) }, () => generateMockNews(t)),
  ).sort((a, b) => b.publishedAt - a.publishedAt);

  const earnings: EarningsReport[] = pick(TICKERS)
    .split("")
    .filter((c) => c.length === 1 && TICKERS.includes(c))
    .length > 0
    ? TICKERS.slice(0, 4).map((t) => generateMockEarnings(t))
    : TICKERS.slice(0, 4).map((t) => generateMockEarnings(t));

  const complaints: Complaint[] = TICKERS.flatMap((t) =>
    Array.from({ length: Math.floor(randomBetween(1, 3)) }, () => generateMockComplaint(t)),
  ).sort((a, b) => b.filedAt - a.filedAt);

  const events: StockEvent[] = TICKERS.flatMap((t) =>
    Array.from({ length: Math.floor(randomBetween(2, 6)) }, () => generateMockStockEvent(t)),
  ).sort((a, b) => b.timestamp - a.timestamp);

  const agents = FINANCIAL_AGENTS.map((a) => ({
    ...a,
    state: pick(["idle", "idle", "idle", "fetching", "analyzing"] as const),
    lastFetchedAt: Date.now() - Math.floor(Math.random() * 300_000),
    itemCount: Math.floor(randomBetween(10, 200)),
    avgLatencyMs: Math.floor(randomBetween(100, 2000)),
  }));

  return {
    tickers,
    news,
    earnings,
    complaints,
    events,
    agents,
    alerts: [],
    sentimentTrends: [],
    selectedTicker: null,
    selectedTimeRange: "1d",
    totalEventsAnalyzed: events.length + news.length + complaints.length + earnings.length,
    totalAlertsTriggered: Math.floor(randomBetween(0, 12)),
  };
}
