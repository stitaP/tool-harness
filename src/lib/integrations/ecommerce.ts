/**
 * E-Commerce Operations Tools
 * ────────────────────────────
 * Real operational tools for running an online store.
 * Agents use these to handle customer service, orders, inventory,
 * products, shipping, reviews, and fraud — not dashboards.
 *
 * These are ACTION tools: each one does something, not just displays data.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EcomConfig {
  /** Store platform: "custom" | "shopify" | "woocommerce" | "medusa" */
  platform: string;
  /** API base URL */
  baseUrl: string;
  /** API key or session token */
  apiKey: string;
  /** Store currency (ISO 4217) */
  currency: string;
}

// ── Customer Service ──

export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
export type TicketCategory =
  | "order_issue"
  | "return_request"
  | "refund_request"
  | "product_question"
  | "complaint"
  | "shipping_delay"
  | "wrong_item"
  | "damaged_item"
  | "payment_issue"
  | "account_issue"
  | "other";

export interface CustomerTicket {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  message: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  orderId?: string;
  assignedTo?: string;
  messages: Array<{
    sender: "customer" | "agent" | "system";
    message: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface TicketResolution {
  ticketId: string;
  action: "reply" | "refund" | "replace" | "escalate" | "close" | "assign";
  message?: string;
  refundAmount?: number;
  refundReason?: string;
  escalateTo?: string;
  assignTo?: string;
  internalNotes?: string;
}

// ── Orders ──

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "packed"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned"
  | "refunded";

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    image?: string;
  }>;
  subtotal: number;
  tax: number;
  shippingCost: number;
  discount: number;
  total: number;
  status: OrderStatus;
  shippingAddress: Address;
  billingAddress: Address;
  paymentMethod: string;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export interface OrderUpdate {
  orderId: string;
  status?: OrderStatus;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
  notes?: string;
  refundAmount?: number;
  refundReason?: string;
}

// ── Inventory ──

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  currency: string;
  images: string[];
  stock: number;
  lowStockThreshold: number;
  weight?: number;
  dimensions?: { length: number; width: number; height: number };
  tags: string[];
  status: "active" | "draft" | "archived";
  variants?: Array<{
    id: string;
    name: string;
    sku: string;
    price: number;
    stock: number;
    options: Record<string, string>;
  }>;
  supplier?: {
    name: string;
    contactEmail: string;
    leadTimeDays: number;
    minOrderQty: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface InventoryUpdate {
  productId: string;
  variantId?: string;
  quantity: number;
  reason: "sale" | "return" | "adjustment" | "restock" | "damage" | "theft";
  notes?: string;
}

export interface ReorderAlert {
  productId: string;
  productName: string;
  currentStock: number;
  threshold: number;
  suggestedReorderQty: number;
  supplier: string;
  estimatedCost: number;
}

// ── Shipping & Returns ──

export interface Shipment {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  service: string;
  status: "label_created" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered" | "exception";
  estimatedDelivery: string;
  actualDelivery?: string;
  events: Array<{
    timestamp: string;
    location: string;
    status: string;
    details: string;
  }>;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  customerId: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    reason: string;
    condition: "unopened" | "opened" | "damaged" | "defective";
  }>;
  returnReason: string;
  refundType: "full" | "partial" | "exchange" | "store_credit";
  refundAmount?: number;
  status: "requested" | "approved" | "rejected" | "received" | "processed";
  returnLabel?: string;
  createdAt: string;
}

// ── Reviews ──

export interface Review {
  id: string;
  productId: string;
  customerId: string;
  customerName: string;
  rating: number; // 1-5
  title: string;
  body: string;
  images?: string[];
  verified: boolean;
  helpful: number;
  sentiment?: "positive" | "neutral" | "negative";
  response?: {
    message: string;
    respondedAt: string;
    respondedBy: string;
  };
  createdAt: string;
}

// ── Fraud Detection ──

export interface FraudCheck {
  orderId: string;
  score: number; // 0-100
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: string[];
  recommendation: "approve" | "review" | "decline";
  factors: Array<{
    factor: string;
    weight: number;
    value: string;
  }>;
}

// ─── Customer Service Operations ───────────────────────────────────────────

/**
 * Classify and prioritize an incoming customer ticket.
 * Agent reads the message, detects intent, assigns category and priority.
 */
export async function classifyTicket(
  config: EcomConfig,
  ticket: { subject: string; message: string; orderId?: string },
): Promise<{ category: TicketCategory; priority: TicketPriority; suggestedAction: string }> {
  const response = await fetch(`${config.baseUrl}/api/tickets/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(ticket),
  });
  if (!response.ok) throw new Error(`classifyTicket failed: ${response.statusText}`);
  return response.json();
}

/**
 * Auto-reply to a customer ticket based on category and history.
 * Agent generates contextual response, attaches order data if available.
 */
export async function autoReplyTicket(
  config: EcomConfig,
  resolution: TicketResolution,
): Promise<{ reply: string; actions: string[] }> {
  const response = await fetch(`${config.baseUrl}/api/tickets/${resolution.ticketId}/auto-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(resolution),
  });
  if (!response.ok) throw new Error(`autoReplyTicket failed: ${response.statusText}`);
  return response.json();
}

/**
 * Process a refund for a ticket.
 * Agent calculates refund amount, applies policy, processes payment reversal.
 */
export async function processRefund(
  config: EcomConfig,
  params: { orderId: string; ticketId: string; amount: number; reason: string },
): Promise<{ refundId: string; status: string; refundAmount: number }> {
  const response = await fetch(`${config.baseUrl}/api/refunds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`processRefund failed: ${response.statusText}`);
  return response.json();
}

/**
 * Escalate a ticket to a human agent or specialized team.
 * Agent determines when automation can't handle the issue.
 */
export async function escalateTicket(
  config: EcomConfig,
  params: { ticketId: string; escalateTo: string; reason: string; urgency: TicketPriority },
): Promise<{ escalated: boolean; assignedTo: string }> {
  const response = await fetch(`${config.baseUrl}/api/tickets/${params.ticketId}/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`escalateTicket failed: ${response.statusText}`);
  return response.json();
}

/**
 * Bulk-process tickets: auto-reply to simple ones, escalate complex ones.
 * Agent processes queue autonomously.
 */
export async function bulkProcessTickets(
  config: EcomConfig,
  params: { maxTickets: number; autoReplyThreshold: number },
): Promise<{
  processed: number;
  autoReplied: number;
  escalated: number;
  skipped: number;
  results: Array<{ ticketId: string; action: string; summary: string }>;
}> {
  const response = await fetch(`${config.baseUrl}/api/tickets/bulk-process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`bulkProcessTickets failed: ${response.statusText}`);
  return response.json();
}

// ── Order Operations ──

/**
 * Update order status (confirmed → processing → packed → shipped → delivered).
 * Agent handles the full lifecycle without human intervention.
 */
export async function updateOrderStatus(
  config: EcomConfig,
  update: OrderUpdate,
): Promise<{ orderId: string; newStatus: OrderStatus; notificationSent: boolean }> {
  const response = await fetch(`${config.baseUrl}/api/orders/${update.orderId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error(`updateOrderStatus failed: ${response.statusText}`);
  return response.json();
}

/**
 * Cancel order and process automatic refund.
 * Agent checks cancellation policy, processes refund, notifies customer.
 */
export async function cancelOrder(
  config: EcomConfig,
  params: { orderId: string; reason: string; refundFull: boolean },
): Promise<{ cancelled: boolean; refundAmount: number; refundId: string }> {
  const response = await fetch(`${config.baseUrl}/api/orders/${params.orderId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`cancelOrder failed: ${response.statusText}`);
  return response.json();
}

/**
 * Process a return: approve/reject, generate return label, track return shipment.
 * Agent handles the entire return flow end-to-end.
 */
export async function processReturn(
  config: EcomConfig,
  params: {
    returnId: string;
    decision: "approve" | "reject";
    reason: string;
    refundType?: "full" | "partial" | "exchange" | "store_credit";
    refundAmount?: number;
  },
): Promise<{ returnId: string; status: string; returnLabel?: string; refundAmount?: number }> {
  const response = await fetch(`${config.baseUrl}/api/returns/${params.returnId}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`processReturn failed: ${response.statusText}`);
  return response.json();
}

/**
 * Send order confirmation, shipping update, or delivery notification.
 * Agent composes personalized message with order details.
 */
export async function sendOrderNotification(
  config: EcomConfig,
  params: {
    orderId: string;
    type: "confirmation" | "shipping_update" | "delivery" | "delay_alert";
    customMessage?: string;
  },
): Promise<{ sent: boolean; channel: string }> {
  const response = await fetch(`${config.baseUrl}/api/orders/${params.orderId}/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`sendOrderNotification failed: ${response.statusText}`);
  return response.json();
}

// ── Inventory Operations ──

/**
 * Update stock levels after sale, return, or adjustment.
 * Agent manages inventory without manual counting.
 */
export async function updateInventory(
  config: EcomConfig,
  update: InventoryUpdate,
): Promise<{ productId: string; previousStock: number; newStock: number; lowStockAlert: boolean }> {
  const response = await fetch(`${config.baseUrl}/api/inventory/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error(`updateInventory failed: ${response.statusText}`);
  return response.json();
}

/**
 * Auto-reorder when stock drops below threshold.
 * Agent calculates reorder quantity based on sales velocity and lead time.
 */
export async function autoReorder(
  config: EcomConfig,
  params: { productId: string; salesVelocityDays?: number },
): Promise<{
  reorderPlaced: boolean;
  quantity: number;
  estimatedCost: number;
  estimatedArrival: string;
  supplier: string;
}> {
  const response = await fetch(`${config.baseUrl}/api/inventory/auto-reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`autoReorder failed: ${response.statusText}`);
  return response.json();
}

/**
 * Detect and prevent stockout: cross-reference pending orders with available stock.
 * Agent proactively halts sales or triggers rush orders.
 */
export async function preventStockout(
  config: EcomConfig,
): Promise<{
  atRisk: Array<{ productId: string; productName: string; stock: number; pendingOrders: number; daysUntilStockout: number }>;
  actions: Array<{ productId: string; action: string; details: string }>;
}> {
  const response = await fetch(`${config.baseUrl}/api/inventory/stockout-check`, {
    method: "GET",
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (!response.ok) throw new Error(`preventStockout failed: ${response.statusText}`);
  return response.json();
}

// ── Product Operations ──

/**
 * Add or update product listing.
 * Agent creates optimized titles, descriptions, and tags from product data.
 */
export async function upsertProduct(
  config: EcomConfig,
  product: Partial<Product> & { name: string; price: number },
): Promise<{ productId: string; action: "created" | "updated"; listingUrl: string }> {
  const response = await fetch(`${config.baseUrl}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(product),
  });
  if (!response.ok) throw new Error(`upsertProduct failed: ${response.statusText}`);
  return response.json();
}

/**
 * Optimize product listing for SEO and conversion.
 * Agent rewrites titles, descriptions, and tags based on search data.
 */
export async function optimizeListing(
  config: EcomConfig,
  params: { productId: string; focus?: "seo" | "conversion" | "both" },
): Promise<{
  productId: string;
  changes: Array<{ field: string; before: string; after: string; reason: string }>;
  estimatedImpact: string;
}> {
  const response = await fetch(`${config.baseUrl}/api/products/${params.productId}/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`optimizeListing failed: ${response.statusText}`);
  return response.json();
}

/**
 * Dynamic pricing: adjust prices based on demand, competition, and inventory.
 * Agent monitors market and adjusts prices within configured bounds.
 */
export async function adjustPrice(
  config: EcomConfig,
  params: {
    productId: string;
    newPrice: number;
    reason: string;
    effectiveUntil?: string;
  },
): Promise<{ productId: string; oldPrice: number; newPrice: number; change: string }> {
  const response = await fetch(`${config.baseUrl}/api/products/${params.productId}/price`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`adjustPrice failed: ${response.statusText}`);
  return response.json();
}

// ── Shipping Operations ──

/**
 * Generate shipping label and calculate rates.
 * Agent compares carriers, picks cheapest/fastest option.
 */
export async function createShipment(
  config: EcomConfig,
  params: {
    orderId: string;
    carrier?: string;
    service?: string;
    origin: Address;
    destination: Address;
    packages: Array<{ weight: number; dimensions: { l: number; w: number; h: number } }>;
  },
): Promise<{
  trackingNumber: string;
  carrier: string;
  service: string;
  cost: number;
  estimatedDelivery: string;
  labelUrl: string;
}> {
  const response = await fetch(`${config.baseUrl}/api/shipments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`createShipment failed: ${response.statusText}`);
  return response.json();
}

/**
 * Track shipment and detect delivery exceptions.
 * Agent monitors transit, proactively notifies customers of delays.
 */
export async function trackShipment(
  config: EcomConfig,
  params: { trackingNumber: string; carrier: string },
): Promise<Shipment> {
  const response = await fetch(`${config.baseUrl}/api/shipments/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`trackShipment failed: ${response.statusText}`);
  return response.json();
}

// ── Review Operations ──

/**
 * Auto-respond to reviews based on sentiment and content.
 * Agent generates personalized responses to positive and negative reviews.
 */
export async function respondToReview(
  config: EcomConfig,
  params: {
    reviewId: string;
    productId: string;
    response: string;
    tone: "professional" | "friendly" | "apologetic";
  },
): Promise<{ reviewId: string; responsePosted: boolean; response: string }> {
  const response_ = await fetch(`${config.baseUrl}/api/reviews/${params.reviewId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response_.ok) throw new Error(`respondToReview failed: ${response_.statusText}`);
  return response_.json();
}

/**
 * Analyze review sentiment and extract actionable insights.
 * Agent reads reviews, detects issues, suggests product improvements.
 */
export async function analyzeReviews(
  config: EcomConfig,
  params: { productId?: string; limit?: number; since?: string },
): Promise<{
  totalReviews: number;
  averageRating: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  topIssues: Array<{ issue: string; count: number; severity: string }>;
  topPraises: Array<{ praise: string; count: number }>;
  actionableInsights: string[];
  responseRate: number;
}> {
  const response = await fetch(`${config.baseUrl}/api/reviews/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`analyzeReviews failed: ${response.statusText}`);
  return response.json();
}

// ── Fraud Detection ──

/**
 * Check order for fraud indicators.
 * Agent analyzes address, payment, velocity, and behavioral signals.
 */
export async function checkFraud(
  config: EcomConfig,
  params: { orderId: string; order: Order },
): Promise<FraudCheck> {
  const response = await fetch(`${config.baseUrl}/api/fraud/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`checkFraud failed: ${response.statusText}`);
  return response.json();
}

/**
 * Auto-hold suspicious orders for review.
 * Agent places hold, notifies security team, preserves evidence.
 */
export async function holdOrder(
  config: EcomConfig,
  params: { orderId: string; reason: string; fraudScore: number; flags: string[] },
): Promise<{ held: boolean; holdId: string; notifySent: boolean }> {
  const response = await fetch(`${config.baseUrl}/api/orders/${params.orderId}/hold`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`holdOrder failed: ${response.statusText}`);
  return response.json();
}

// ── Analytics (Operational, Not Dashboard) ──

/**
 * Calculate daily sales metrics.
 * Agent produces actionable numbers, not charts.
 */
export async function dailySalesReport(
  config: EcomConfig,
  params: { date?: string },
): Promise<{
  date: string;
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  returns: number;
  refunds: number;
  newCustomers: number;
  repeatCustomers: number;
  topProducts: Array<{ productId: string; name: string; unitsSold: number; revenue: number }>;
  issues: Array<{ type: string; count: number; details: string }>;
}> {
  const response = await fetch(`${config.baseUrl}/api/analytics/daily-sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`dailySalesReport failed: ${response.statusText}`);
  return response.json();
}

/**
 * Identify at-risk customers (likely to churn or complain).
 * Agent proactively reaches out before issues escalate.
 */
export async function identifyAtRiskCustomers(
  config: EcomConfig,
): Promise<{
  atRisk: Array<{
    customerId: string;
    name: string;
    email: string;
    riskReasons: string[];
    lastOrderDaysAgo: number;
    lifetimeValue: number;
    suggestedAction: string;
  }>;
  totalAtRisk: number;
  potentialRevenueLoss: number;
}> {
  const response = await fetch(`${config.baseUrl}/api/analytics/at-risk-customers`, {
    method: "GET",
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (!response.ok) throw new Error(`identifyAtRiskCustomers failed: ${response.statusText}`);
  return response.json();
}
