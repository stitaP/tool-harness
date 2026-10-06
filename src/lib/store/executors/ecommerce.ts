/**
 * Executors for e-commerce operations.
 *
 * Remote mode — when ECOM_BASE_URL (+ ECOM_API_KEY) is set, every tool calls
 * the store backend through lib/integrations/ecommerce.
 * Local mode — otherwise the tools run against a persisted store on this
 * machine (products, orders, tickets, reviews, returns, shipments), filled
 * with ecom.import_data / ecom.create_order / ecom.upsert_product. All
 * business logic (classification, fraud scoring, reorder points, pricing
 * guards, reports) is computed here; notifications, refunds and shipments go
 * to real providers when their credentials exist, otherwise they are recorded
 * and returned as ready-to-send drafts/links.
 */
import * as E from "@/lib/integrations/ecommerce";
import type { Order, Product, CustomerTicket, Review, ReturnRequest, Shipment, TicketCategory, TicketPriority, OrderStatus } from "@/lib/integrations/ecommerce";
import { callLlm, hasLlm, llmJson } from "./hooks";
import { execs, json, num, str, bool, list, persisted, secret, uid, r2, type ExecMap } from "./util";

// ─── state ───────────────────────────────────────────────────────────────────

interface InvLog { productId: string; delta: number; reason: string; notes?: string; at: string; stockAfter: number }
interface Refund { id: string; orderId: string; ticketId?: string; amount: number; reason: string; status: "processed" | "pending_manual"; provider?: string; providerRef?: string; at: string }
interface Note { id: string; orderId?: string; to: string; channel: string; subject: string; body: string; sent: boolean; link?: string; providerRef?: string; at: string }
interface Store {
  products: Product[]; orders: (Order & { holds?: { id: string; reason: string; score: number; flags: string[]; at: string }[]; paymentRef?: string; history?: { status: string; at: string; note?: string }[] })[];
  tickets: (CustomerTicket & { confidence?: number })[]; reviews: Review[]; returns: ReturnRequest[]; shipments: Shipment[];
  inventory: InvLog[]; refunds: Refund[]; notifications: Note[]; priceHistory: { productId: string; from: number; to: number; reason: string; at: string }[]; purchaseOrders: { id: string; productId: string; qty: number; supplier: string; cost: number; at: string; status: string }[];
}
const db = persisted<Store>("ecommerce", () => ({ products: [], orders: [], tickets: [], reviews: [], returns: [], shipments: [], inventory: [], refunds: [], notifications: [], priceHistory: [], purchaseOrders: [] }));
const S = () => db.get();
const save = () => db.save();
const now = () => new Date().toISOString();
const CUR = () => secret("ECOM_CURRENCY") ?? "INR";
const money = (n: number) => new Intl.NumberFormat(CUR() === "INR" ? "en-IN" : "en-US", { style: "currency", currency: CUR() }).format(n);

const remote = (): E.EcomConfig | null => { const baseUrl = secret("ECOM_BASE_URL"); return baseUrl ? { platform: secret("ECOM_PLATFORM") ?? "custom", baseUrl: baseUrl.replace(/\/+$/, ""), apiKey: secret("ECOM_API_KEY") ?? "", currency: CUR() } : null; };

const findProduct = (id: string) => { const p = S().products.find((x) => x.id === id || x.sku === id || x.name.toLowerCase() === id.toLowerCase()); if (!p) throw new Error(`product ${id} not found (ecom.upsert_product or ecom.import_data first)`); return p; };
const findOrder = (id: string) => { const o = S().orders.find((x) => x.id === id); if (!o) throw new Error(`order ${id} not found (ecom.create_order or ecom.import_data first)`); return o; };
const findTicket = (id: string) => { const t = S().tickets.find((x) => x.id === id); if (!t) throw new Error(`ticket ${id} not found — create it with ecom.classify_ticket`); return t; };
const days = (a: string, b = now()) => (Date.parse(b) - Date.parse(a)) / 86400000;

// ─── notifications (real provider when configured) ───────────────────────────

async function deliver(to: { email?: string; phone?: string; name?: string }, subject: string, body: string, orderId?: string): Promise<Note> {
  const n: Note = { id: uid("NTF"), orderId, to: to.email ?? to.phone ?? "", channel: "draft", subject, body, sent: false, at: now() };
  try {
    if (to.email && secret("RESEND_API_KEY")) {
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${secret("RESEND_API_KEY")}`, "content-type": "application/json" }, body: JSON.stringify({ from: secret("EMAIL_FROM") ?? "store@example.com", to: [to.email], subject, text: body }) });
      if (!r.ok) throw new Error(`Resend ${r.status}`);
      Object.assign(n, { channel: "email:resend", sent: true, providerRef: (await r.json()).id });
    } else if (to.email && secret("SENDGRID_API_KEY")) {
      const r = await fetch("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { authorization: `Bearer ${secret("SENDGRID_API_KEY")}`, "content-type": "application/json" }, body: JSON.stringify({ personalizations: [{ to: [{ email: to.email }] }], from: { email: secret("EMAIL_FROM") ?? "store@example.com" }, subject, content: [{ type: "text/plain", value: body }] }) });
      if (!r.ok) throw new Error(`SendGrid ${r.status}`);
      Object.assign(n, { channel: "email:sendgrid", sent: true });
    } else if (to.phone && secret("WHATSAPP_CLOUD_TOKEN") && secret("WHATSAPP_PHONE_NUMBER_ID")) {
      const r = await fetch(`https://graph.facebook.com/v20.0/${secret("WHATSAPP_PHONE_NUMBER_ID")}/messages`, { method: "POST", headers: { authorization: `Bearer ${secret("WHATSAPP_CLOUD_TOKEN")}`, "content-type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: to.phone.replace(/\D/g, ""), type: "text", text: { body: `${subject}\n\n${body}` } }) });
      if (!r.ok) throw new Error(`WhatsApp ${r.status}`);
      Object.assign(n, { channel: "whatsapp", sent: true });
    } else if (to.phone && secret("TWILIO_ACCOUNT_SID") && secret("TWILIO_AUTH_TOKEN") && secret("TWILIO_FROM")) {
      const sid = secret("TWILIO_ACCOUNT_SID")!;
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST", headers: { authorization: `Basic ${btoa(`${sid}:${secret("TWILIO_AUTH_TOKEN")}`)}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: to.phone, From: secret("TWILIO_FROM")!, Body: `${subject}: ${body}`.slice(0, 1500) }) });
      if (!r.ok) throw new Error(`Twilio ${r.status}`);
      Object.assign(n, { channel: "sms:twilio", sent: true });
    }
  } catch (e: any) { n.channel = `failed:${e.message}`; }
  if (!n.sent) n.link = to.email ? `mailto:${to.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : to.phone ? `https://wa.me/${to.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`${subject}\n\n${body}`)}` : undefined;
  S().notifications.push(n); save();
  return n;
}
const customerOf = (o: Order) => ({ email: o.customerEmail, phone: o.shippingAddress?.phone, name: o.customerName });

// ─── ticket classification ───────────────────────────────────────────────────

const RULES: [TicketCategory, RegExp][] = [
  ["refund_request", /\b(refund|money back|reimburse|chargeback)\b/i],
  ["return_request", /\b(return|send (it )?back|exchange)\b/i],
  ["damaged_item", /\b(damag|broken|crack|defect|not working|stopped working|scratch)/i],
  ["wrong_item", /\b(wrong (item|product|size|colou?r)|different (item|product)|not what i ordered|incorrect item)\b/i],
  ["shipping_delay", /\b(where is|not (yet )?(arrived|received|delivered)|late|delay|tracking|still waiting)\b/i],
  ["payment_issue", /\b(charged twice|double charge|payment (failed|declined)|upi|card (declined|charged)|deducted)\b/i],
  ["account_issue", /\b(login|log in|password|account|otp|sign ?in)\b/i],
  ["complaint", /\b(terrible|worst|disappointed|unacceptable|angry|complain|fraud|scam|rude)\b/i],
  ["product_question", /\b(does it|is it|compatible|size chart|warranty|how (do|to)|specification|available in)\b|\?$/i],
  ["order_issue", /\b(order|cancel|modify|change (my )?address)\b/i],
];
function classify(subject: string, message: string, orderTotal?: number) {
  const text = `${subject}\n${message}`;
  const hits = RULES.filter(([, re]) => re.test(text)).map(([c]) => c);
  const category: TicketCategory = hits[0] ?? "other";
  const urgent = /\b(urgent|asap|immediately|legal|lawyer|consumer (court|forum)|police|chargeback|fraud|scam)\b/i.test(text);
  const angry = /\b(terrible|worst|unacceptable|angry|disgusted)\b|!!/i.test(text) || (text.replace(/[^A-Z]/g, "").length > 20 && text.replace(/[^A-Z]/g, "").length / text.replace(/[^A-Za-z]/g, "").length > 0.5);
  const priority: TicketPriority = urgent ? "urgent" : angry || category === "payment_issue" || (orderTotal ?? 0) > num(secret("ECOM_HIGH_VALUE"), 10000) ? "high" : ["damaged_item", "wrong_item", "refund_request", "shipping_delay"].includes(category) ? "medium" : "low";
  const ACTION: Record<TicketCategory, string> = { refund_request: "refund", return_request: "replace", damaged_item: "replace", wrong_item: "replace", shipping_delay: "reply", payment_issue: "escalate", account_issue: "reply", complaint: "escalate", product_question: "reply", order_issue: "reply", other: "escalate" };
  const confidence = r2(hits.length === 0 ? 0.3 : hits.length === 1 ? 0.9 : 0.75, 2);
  return { category, priority, suggestedAction: urgent ? "escalate" : ACTION[category], confidence, signals: hits };
}

function replyTemplate(t: CustomerTicket, action: string, o?: Order, extra: { refundAmount?: number } = {}): string {
  const first = (t.customerName || "there").split(" ")[0];
  const ref = o ? ` for order ${o.id}` : "";
  const track = o?.trackingNumber ? ` It is with ${o.carrier ?? "the courier"} (tracking ${o.trackingNumber})${o.estimatedDelivery ? `, expected by ${o.estimatedDelivery.slice(0, 10)}` : ""}.` : o ? ` Its current status is "${o.status.replace(/_/g, " ")}".` : "";
  const body: Record<string, string> = {
    refund: `We've processed a refund of ${money(extra.refundAmount ?? 0)}${ref}. It usually reaches your account in 5–7 business days.`,
    replace: `We're sorry about this. We've arranged a replacement${ref} and a pickup for the original item — you'll receive the pickup details shortly.`,
    escalate: `Thanks for your patience. Your request${ref} has been passed to a senior specialist who will contact you within 24 hours.`,
    close: `We're glad this is resolved. If anything else comes up, just reply to this message.`,
    reply: t.category === "shipping_delay" ? `Thanks for checking in${ref}.${track || " We're looking into the delivery now."}` : t.category === "account_issue" ? `You can reset your password from the login page using "Forgot password". If the OTP doesn't arrive, reply here and we'll verify your account manually.` : t.category === "product_question" ? `Thanks for your question. Our product team will confirm the details shortly; meanwhile the full specifications are on the product page.` : `Thanks for reaching out${ref}. We're on it and will update you shortly.${track}`,
  };
  return `Hi ${first},\n\n${body[action] ?? body.reply}\n\n— ${secret("ECOM_STORE_NAME") ?? "Customer Care"}`;
}

// ─── refunds (real gateway when the order has a payment reference) ───────────

async function refund(o: Order & { paymentRef?: string }, amount: number, reason: string, ticketId?: string): Promise<Refund> {
  const already = S().refunds.filter((r) => r.orderId === o.id).reduce((s, r) => s + r.amount, 0);
  const max = r2(o.total - already);
  if (amount <= 0) throw new Error("refund amount must be positive");
  if (amount > max + 0.001) throw new Error(`refund ${money(amount)} exceeds refundable balance ${money(max)}`);
  const windowDays = num(secret("ECOM_REFUND_WINDOW_DAYS"), 30);
  if (days(o.createdAt) > windowDays && !/defect|damag|wrong/i.test(reason)) throw new Error(`order is ${Math.floor(days(o.createdAt))} days old — outside the ${windowDays}-day refund window (damaged/defective/wrong items are exempt)`);
  const r: Refund = { id: uid("RF"), orderId: o.id, ticketId, amount: r2(amount), reason, status: "pending_manual", at: now() };
  const ref = o.paymentRef;
  if (ref && /^pi_|^ch_/.test(ref) && secret("STRIPE_SECRET_KEY")) {
    const res = await fetch("https://api.stripe.com/v1/refunds", { method: "POST", headers: { authorization: `Bearer ${secret("STRIPE_SECRET_KEY")}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ [ref.startsWith("pi_") ? "payment_intent" : "charge"]: ref, amount: String(Math.round(amount * 100)), reason: "requested_by_customer" }) });
    const j = await res.json(); if (!res.ok) throw new Error(`Stripe refund failed: ${j.error?.message ?? res.status}`);
    Object.assign(r, { status: "processed", provider: "stripe", providerRef: j.id });
  } else if (ref && /^pay_/.test(ref) && secret("RAZORPAY_KEY_ID") && secret("RAZORPAY_KEY_SECRET")) {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${ref}/refund`, { method: "POST", headers: { authorization: `Basic ${btoa(`${secret("RAZORPAY_KEY_ID")}:${secret("RAZORPAY_KEY_SECRET")}`)}`, "content-type": "application/json" }, body: JSON.stringify({ amount: Math.round(amount * 100), notes: { reason } }) });
    const j = await res.json(); if (!res.ok) throw new Error(`Razorpay refund failed: ${j.error?.description ?? res.status}`);
    Object.assign(r, { status: "processed", provider: "razorpay", providerRef: j.id });
  }
  S().refunds.push(r);
  if (r2(already + amount) >= o.total) { o.paymentStatus = "refunded"; o.status = o.status === "delivered" || o.status === "returned" ? "refunded" : o.status; }
  o.updatedAt = now(); save();
  return r;
}

// ─── fraud scoring ───────────────────────────────────────────────────────────

const DISPOSABLE = /@(mailinator|guerrillamail|10minutemail|tempmail|trashmail|yopmail|getnada|sharklasers|dispostable)\./i;
function fraudCheck(o: Order): E.FraudCheck {
  const all = S().orders, factors: { factor: string; weight: number; value: string }[] = [];
  const add = (factor: string, weight: number, value: string) => factors.push({ factor, weight, value });
  const prior = all.filter((x) => x.id !== o.id && x.customerEmail === o.customerEmail && Date.parse(x.createdAt) < Date.parse(o.createdAt));
  const avg = all.length > 1 ? all.filter((x) => x.id !== o.id).reduce((s, x) => s + x.total, 0) / (all.length - 1) : o.total;
  if (o.total > avg * 3 && o.total > 2000) add("order value far above store average", 25, `${money(o.total)} vs avg ${money(avg)}`);
  if (!prior.length && o.total > num(secret("ECOM_HIGH_VALUE"), 10000)) add("first order is high value", 15, money(o.total));
  if (DISPOSABLE.test(o.customerEmail)) add("disposable email domain", 25, o.customerEmail);
  const b = o.billingAddress, s = o.shippingAddress;
  if (b && s && b.country && s.country && b.country !== s.country) add("billing and shipping countries differ", 20, `${b.country} → ${s.country}`);
  else if (b && s && b.postalCode && s.postalCode && b.postalCode !== s.postalCode) add("billing and shipping postcodes differ", 8, `${b.postalCode} → ${s.postalCode}`);
  const day = all.filter((x) => x.id !== o.id && Math.abs(Date.parse(x.createdAt) - Date.parse(o.createdAt)) < 86400000 && (x.customerEmail === o.customerEmail || (s?.phone && x.shippingAddress?.phone === s.phone) || (s?.line1 && x.shippingAddress?.line1 === s.line1)));
  if (day.length >= 2) add("velocity: several orders from same email/phone/address in 24h", 20, `${day.length + 1} orders`);
  const qty = o.items.reduce((a, it) => a + it.quantity, 0);
  if (o.items.some((it) => it.quantity >= 5)) add("bulk quantity of one item", 10, `max qty ${Math.max(...o.items.map((it) => it.quantity))}`);
  if (/cod|cash/i.test(o.paymentMethod) && o.total > num(secret("ECOM_COD_LIMIT"), 5000)) add("high-value cash on delivery", 15, money(o.total));
  if (o.paymentStatus === "failed") add("payment failed previously", 10, o.paymentStatus);
  if (s?.name && o.customerName && !s.name.toLowerCase().includes(o.customerName.split(" ")[0].toLowerCase())) add("recipient name differs from customer", 5, `${o.customerName} → ${s.name}`);
  const returnsBy = S().returns.filter((r) => all.find((x) => x.id === r.orderId)?.customerEmail === o.customerEmail).length;
  if (returnsBy >= 3) add("serial returner", 10, `${returnsBy} returns`);
  const score = Math.min(100, factors.reduce((a, f) => a + f.weight, 0));
  const riskLevel = score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : "low";
  void qty;
  return { orderId: o.id, score, riskLevel, flags: factors.map((f) => f.factor), recommendation: score >= 70 ? "decline" : score >= 35 ? "review" : "approve", factors };
}

// ─── sentiment / reviews ─────────────────────────────────────────────────────

const POS = /\b(love|great|excellent|perfect|amazing|good|awesome|happy|recommend|fast|best|value|nice|super|worth)\b/gi;
const NEG = /\b(bad|poor|terrible|broken|worst|slow|late|cheap|fake|damaged|refund|return|disappoint|waste|defect|small|large|wrong|missing|stopped)\b/gi;
const ASPECTS: Record<string, RegExp> = { quality: /\b(quality|build|material|durable|broke|defect|stitch)/i, delivery: /\b(deliver|shipping|courier|arriv|late|package|packing|packaging)/i, price: /\b(price|value|worth|expensive|cheap|cost)/i, size_fit: /\b(size|fit|small|large|tight|loose)/i, support: /\b(support|service|response|refund|return|helpful)/i, accuracy: /\b(as described|different|wrong|fake|original|genuine|picture)/i };
function sentiment(r: { rating: number; title?: string; body: string }) {
  const t = `${r.title ?? ""} ${r.body}`;
  const s = (t.match(POS)?.length ?? 0) - (t.match(NEG)?.length ?? 0) + (r.rating - 3) * 1.5;
  return s > 0.5 ? "positive" : s < -0.5 ? "negative" : "neutral";
}

// ─── local operations ────────────────────────────────────────────────────────

function velocity(productId: string, windowDays: number): number {
  const since = Date.now() - windowDays * 86400000;
  const fromOrders = S().orders.filter((o) => Date.parse(o.createdAt) >= since && !["cancelled"].includes(o.status)).flatMap((o) => o.items).filter((it) => it.productId === productId).reduce((a, it) => a + it.quantity, 0);
  const fromLog = S().inventory.filter((l) => l.productId === productId && l.reason === "sale" && Date.parse(l.at) >= since && !l.notes?.startsWith("order ")).reduce((a, l) => a - l.delta, 0);
  return (fromOrders + fromLog) / windowDays;
}
function changeStock(p: Product, delta: number, reason: string, notes?: string) {
  p.stock = Math.max(0, p.stock + delta); p.updatedAt = now();
  S().inventory.push({ productId: p.id, delta, reason, notes, at: now(), stockAfter: p.stock });
}
const TRANSITIONS: Record<string, OrderStatus[]> = { pending: ["confirmed", "cancelled"], confirmed: ["processing", "packed", "shipped", "cancelled"], processing: ["packed", "shipped", "cancelled"], packed: ["shipped", "cancelled"], shipped: ["out_for_delivery", "delivered", "returned"], out_for_delivery: ["delivered", "returned"], delivered: ["returned", "refunded"], cancelled: [], returned: ["refunded"], refunded: [], on_hold: ["confirmed", "cancelled"] } as any;

function addressOf(v: unknown, name: string): E.Address {
  const a = json<any>(v, null);
  if (a && typeof a === "object") return { name: str(a.name, name), line1: str(a.line1 ?? a.address ?? a.street), line2: a.line2, city: str(a.city), state: str(a.state), postalCode: str(a.postalCode ?? a.pincode ?? a.zip), country: str(a.country, "IN"), phone: a.phone ? str(a.phone) : undefined };
  return { name, line1: str(v), city: "", state: "", postalCode: /\b\d{5,6}\b/.exec(str(v))?.[0] ?? "", country: secret("ECOM_COUNTRY") ?? "IN" };
}

function csvRows(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const split = (l: string) => { const out: string[] = []; let cur = "", q = false; for (let k = 0; k < l.length; k++) { const ch = l[k]; if (q) { if (ch === '"' && l[k + 1] === '"') { cur += '"'; k++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = split(lines[0] ?? "");
  return lines.slice(1).map((l) => { const v = split(l); return Object.fromEntries(head.map((h, k) => [h, v[k] ?? ""])); });
}

function newProduct(i: Record<string, any>): Product {
  return { id: str(i.id, uid("P")), sku: str(i.sku, `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`), name: str(i.name), description: str(i.description), category: str(i.category, "general"), price: num(i.price), compareAtPrice: i.compareAtPrice ? num(i.compareAtPrice) : undefined, costPrice: i.costPrice ?? i.cost ? num(i.costPrice ?? i.cost) : undefined, currency: CUR(), images: list(i.images), stock: num(i.stock, 0), lowStockThreshold: num(i.lowStockThreshold, 5), tags: list(i.tags), status: (i.status ?? "active") as any, supplier: i.supplier ? (typeof i.supplier === "string" ? { name: i.supplier, contactEmail: str(i.supplierEmail), leadTimeDays: num(i.leadTimeDays, 7), minOrderQty: num(i.minOrderQty, 1) } : i.supplier) : undefined, createdAt: now(), updatedAt: now() };
}

function createOrder(i: Record<string, any>): Order {
  const items = (json<any[]>(i.items, []) as any[]).map((it) => {
    const p = it.productId || it.sku || it.name ? S().products.find((x) => x.id === it.productId || x.sku === it.sku || x.sku === it.productId || x.name === it.name) : undefined;
    const qty = num(it.quantity ?? it.qty, 1), price = num(it.unitPrice ?? it.price, p?.price ?? 0);
    if (!p && !price) throw new Error(`item ${JSON.stringify(it)}: unknown product and no price`);
    return { productId: p?.id ?? str(it.productId, uid("P")), productName: p?.name ?? str(it.name ?? it.productName), sku: p?.sku ?? str(it.sku), quantity: qty, unitPrice: price, totalPrice: r2(qty * price) };
  });
  if (!items.length) throw new Error("order needs items [{productId|sku, quantity}]");
  const subtotal = r2(items.reduce((s, it) => s + it.totalPrice, 0));
  const taxRate = num(i.taxRate ?? secret("ECOM_TAX_RATE"), 0), ship = num(i.shippingCost, 0), discount = num(i.discount, 0);
  const name = str(i.customerName, "Customer");
  const o: Order & { paymentRef?: string; history?: any[] } = {
    id: str(i.id, uid("ORD")), customerId: str(i.customerId, str(i.customerEmail ?? i.customerPhone, uid("C")).toLowerCase()), customerName: name, customerEmail: str(i.customerEmail).toLowerCase(),
    items, subtotal, tax: r2(subtotal * taxRate), shippingCost: ship, discount, total: r2(subtotal * (1 + taxRate) + ship - discount),
    status: (i.status ?? "confirmed") as OrderStatus, shippingAddress: addressOf(i.shippingAddress ?? i.address, name), billingAddress: addressOf(i.billingAddress ?? i.shippingAddress ?? i.address, name),
    paymentMethod: str(i.paymentMethod, "upi"), paymentStatus: (i.paymentStatus ?? (/cod|cash/i.test(str(i.paymentMethod)) ? "pending" : "paid")) as any, paymentRef: i.paymentRef ? str(i.paymentRef) : undefined,
    createdAt: i.createdAt ? new Date(str(i.createdAt)).toISOString() : now(), updatedAt: now(), history: [{ status: str(i.status, "confirmed"), at: now() }],
  };
  if (i.customerPhone) o.shippingAddress.phone = str(i.customerPhone);
  if (S().orders.some((x) => x.id === o.id)) throw new Error(`order ${o.id} already exists`);
  for (const it of items) { const p = S().products.find((x) => x.id === it.productId); if (p && !bool(i.imported)) { if (p.stock < it.quantity) throw new Error(`insufficient stock for ${p.name}: ${p.stock} left`); changeStock(p, -it.quantity, "sale", `order ${o.id}`); } }
  S().orders.push(o);
  return o;
}

// ─── executors ───────────────────────────────────────────────────────────────

/** Tools whose remote call needs a non-default argument shape. */
const REMOTE: Record<string, (c: E.EcomConfig, i: any) => Promise<unknown>> = {
  "ecom.classify_ticket": (c, i) => E.classifyTicket(c, i), "ecom.auto_reply": (c, i) => E.autoReplyTicket(c, i), "ecom.process_refund": (c, i) => E.processRefund(c, i),
  "ecom.bulk_process_tickets": (c, i) => E.bulkProcessTickets(c, { maxTickets: num(i.maxTickets, 50), autoReplyThreshold: num(i.autoReplyThreshold, 0.8) }), "ecom.update_order_status": (c, i) => E.updateOrderStatus(c, i),
  "ecom.cancel_order": (c, i) => E.cancelOrder(c, { ...i, refundFull: bool(i.refundFull, true) }), "ecom.process_return": (c, i) => E.processReturn(c, i), "ecom.send_notification": (c, i) => E.sendOrderNotification(c, i),
  "ecom.update_inventory": (c, i) => E.updateInventory(c, { ...i, quantity: num(i.quantity) }), "ecom.auto_reorder": (c, i) => E.autoReorder(c, i), "ecom.prevent_stockout": (c) => E.preventStockout(c), "ecom.upsert_product": (c, i) => E.upsertProduct(c, i),
  "ecom.optimize_listing": (c, i) => E.optimizeListing(c, i), "ecom.adjust_price": (c, i) => E.adjustPrice(c, i), "ecom.create_shipment": (c, i) => E.createShipment(c, i), "ecom.track_shipment": (c, i) => E.trackShipment(c, i),
  "ecom.respond_to_review": (c, i) => E.respondToReview(c, i), "ecom.analyze_reviews": (c, i) => E.analyzeReviews(c, i), "ecom.check_fraud": (c, i) => E.checkFraud(c, { orderId: i.orderId, order: S().orders.find((o) => o.id === i.orderId) ?? ({ id: i.orderId } as any) }),
  "ecom.hold_order": (c, i) => E.holdOrder(c, { ...i, flags: list(i.flags) }), "ecom.daily_report": (c, i) => E.dailySalesReport(c, i), "ecom.at_risk_customers": (c) => E.identifyAtRiskCustomers(c),
};

const LOCAL: Record<string, (i: Record<string, any>) => unknown> = {
  "ecom.import_data": (i) => {
    const kind = str(i.kind, "auto").toLowerCase();
    const raw = str(i.data).trim();
    const data = raw.startsWith("{") || raw.startsWith("[") ? json<any>(raw) : csvRows(raw);
    const sets: Record<string, any[]> = Array.isArray(data) ? { [kind === "auto" ? "products" : kind]: data } : data;
    const counts: Record<string, number> = {};
    for (const [k, rows] of Object.entries(sets)) {
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        if (k === "products") { const ex = S().products.find((p) => (r.sku && p.sku === r.sku) || (r.id && p.id === r.id)); if (ex) Object.assign(ex, { ...newProduct({ ...ex, ...r }), id: ex.id, createdAt: ex.createdAt }); else S().products.push(newProduct(r)); }
        else if (k === "orders") { if (!S().orders.some((o) => o.id === r.id)) createOrder({ ...r, imported: true }); }
        else if (k === "tickets") { const c = classify(str(r.subject), str(r.message)); S().tickets.push({ id: str(r.id, uid("TKT")), customerId: str(r.customerId ?? r.customerEmail), customerName: str(r.customerName), customerEmail: str(r.customerEmail), subject: str(r.subject), message: str(r.message), category: r.category ?? c.category, priority: r.priority ?? c.priority, status: r.status ?? "open", orderId: r.orderId, messages: [{ sender: "customer", message: str(r.message), timestamp: str(r.createdAt, now()) }], createdAt: str(r.createdAt, now()), updatedAt: now(), confidence: c.confidence }); }
        else if (k === "reviews") S().reviews.push({ id: str(r.id, uid("REV")), productId: str(r.productId), customerId: str(r.customerId ?? r.customerName), customerName: str(r.customerName, "Customer"), rating: num(r.rating, 5), title: str(r.title), body: str(r.body ?? r.text), verified: bool(r.verified, true), helpful: num(r.helpful, 0), createdAt: str(r.createdAt, now()) });
        else if (k === "returns") S().returns.push({ id: str(r.id, uid("RET")), orderId: str(r.orderId), customerId: str(r.customerId), items: r.items ?? [], returnReason: str(r.returnReason ?? r.reason), refundType: r.refundType ?? "full", refundAmount: r.refundAmount, status: r.status ?? "requested", createdAt: str(r.createdAt, now()) });
        else continue;
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
    save();
    return { imported: counts, totals: { products: S().products.length, orders: S().orders.length, tickets: S().tickets.length, reviews: S().reviews.length, returns: S().returns.length } };
  },
  "ecom.create_order": async (i) => {
    const o = createOrder(i);
    const f = fraudCheck(o);
    if (f.recommendation !== "approve") { (o as any).holds = [{ id: uid("HOLD"), reason: "automatic fraud screen", score: f.score, flags: f.flags, at: now() }]; o.status = "on_hold" as any; }
    save();
    const n = bool(i.notify, true) && f.recommendation === "approve" ? await deliver(customerOf(o), `Order ${o.id} confirmed`, `Thanks ${o.customerName.split(" ")[0]}! We received your order of ${o.items.length} item(s) totalling ${money(o.total)}.`, o.id) : undefined;
    return { order: o, fraud: { score: f.score, riskLevel: f.riskLevel, recommendation: f.recommendation }, notification: n };
  },
  "ecom.classify_ticket": async (i) => {
    const o = i.orderId ? S().orders.find((x) => x.id === str(i.orderId)) : undefined;
    let c = classify(str(i.subject), str(i.message), o?.total);
    if (c.confidence < 0.6 && hasLlm()) {
      try { const r = llmJson<any>((await callLlm({ system: `Classify an e-commerce support ticket. Categories: ${RULES.map((x) => x[0]).join(", ")}, other. Priorities: low, medium, high, urgent. Reply JSON {category, priority, suggestedAction (reply|refund|replace|escalate|close)}.`, prompt: `Subject: ${str(i.subject)}\n\n${str(i.message)}`, json: true })).text); if (r.category) c = { ...c, ...r, confidence: 0.8, signals: [...c.signals, "llm"] }; } catch { /* keep rules */ }
    }
    const t: CustomerTicket & { confidence?: number } = { id: uid("TKT"), customerId: str(i.customerEmail ?? o?.customerId, "unknown"), customerName: str(i.customerName, o?.customerName ?? ""), customerEmail: str(i.customerEmail, o?.customerEmail ?? ""), subject: str(i.subject), message: str(i.message), category: c.category, priority: c.priority, status: "open", orderId: o?.id ?? (i.orderId ? str(i.orderId) : undefined), messages: [{ sender: "customer", message: str(i.message), timestamp: now() }], createdAt: now(), updatedAt: now(), confidence: c.confidence };
    S().tickets.push(t); save();
    return { ticketId: t.id, ...c, orderFound: !!o };
  },
  "ecom.auto_reply": async (i) => {
    const t = findTicket(str(i.ticketId)), action = str(i.action, "reply");
    const o = t.orderId ? S().orders.find((x) => x.id === t.orderId) : undefined;
    const actions: string[] = [];
    let refundRec: Refund | undefined;
    if (action === "refund") { if (!o) throw new Error("ticket has no order to refund"); refundRec = await refund(o, i.refundAmount ? num(i.refundAmount) : o.total - S().refunds.filter((r) => r.orderId === o.id).reduce((s, r) => s + r.amount, 0), `ticket ${t.id}: ${t.category}`, t.id); actions.push(`refund ${refundRec.status} ${money(refundRec.amount)}`); }
    if (action === "replace" && o) { S().returns.push({ id: uid("RET"), orderId: o.id, customerId: o.customerId, items: o.items.map((it) => ({ productId: it.productId, productName: it.productName, quantity: it.quantity, reason: t.category, condition: t.category === "damaged_item" ? "damaged" : "opened" })), returnReason: t.message.slice(0, 200), refundType: "exchange", status: "approved", createdAt: now() }); actions.push("exchange return created"); }
    let message = i.message ? str(i.message) : replyTemplate(t, action, o, { refundAmount: refundRec?.amount });
    if (!i.message && hasLlm() && action === "reply") {
      try { message = (await callLlm({ system: "You are a concise, warm e-commerce support agent. Reply in the customer's language. Never promise anything not stated in the facts.", prompt: `Customer wrote:\n${t.message}\n\nFacts: ${o ? JSON.stringify({ order: o.id, status: o.status, tracking: o.trackingNumber, carrier: o.carrier, eta: o.estimatedDelivery, total: o.total }) : "no order linked"}\n\nDraft reply (sign as ${secret("ECOM_STORE_NAME") ?? "Customer Care"}):` })).text.trim(); actions.push("llm-drafted"); } catch { /* template */ }
    }
    t.messages.push({ sender: "agent", message, timestamp: now() });
    t.status = action === "close" || action === "refund" ? "resolved" : action === "escalate" ? "in_progress" : "waiting_customer";
    if (action === "escalate") { t.assignedTo = secret("ECOM_ESCALATION_TEAM") ?? "senior-support"; t.priority = t.priority === "low" ? "medium" : t.priority; actions.push(`escalated to ${t.assignedTo}`); }
    t.updatedAt = now(); save();
    const n = t.customerEmail ? await deliver({ email: t.customerEmail, name: t.customerName }, `Re: ${t.subject}`, message, t.orderId) : undefined;
    return { ticketId: t.id, status: t.status, reply: message, actions, refund: refundRec, delivery: n && { sent: n.sent, channel: n.channel, link: n.link } };
  },
  "ecom.process_refund": async (i) => { const o = findOrder(str(i.orderId)); const r = await refund(o, i.amount ? num(i.amount) : o.total - S().refunds.filter((x) => x.orderId === o.id).reduce((s, x) => s + x.amount, 0), str(i.reason), i.ticketId ? str(i.ticketId) : undefined); return { refundId: r.id, status: r.status, refundAmount: r.amount, provider: r.provider ?? "manual", note: r.status === "pending_manual" ? "no gateway payment reference on this order (or keys missing) — refund recorded for manual payout" : undefined }; },
  "ecom.bulk_process_tickets": async (i) => {
    const max = num(i.maxTickets, 50), th = num(i.autoReplyThreshold, 0.8), out: any[] = [];
    for (const t of S().tickets.filter((x) => x.status === "open").slice(0, max)) {
      const c = classify(t.subject, t.message, S().orders.find((o) => o.id === t.orderId)?.total);
      t.category = c.category; t.priority = c.priority;
      const auto = c.confidence >= th && c.priority !== "urgent" && ["reply", "close"].includes(c.suggestedAction);
      const r: any = await LOCAL["ecom.auto_reply"]({ ticketId: t.id, action: auto ? c.suggestedAction : "escalate" });
      out.push({ ticketId: t.id, category: c.category, priority: c.priority, confidence: c.confidence, action: auto ? c.suggestedAction : "escalate", status: r.status });
    }
    return { processed: out.length, autoResolved: out.filter((x) => x.action !== "escalate").length, escalated: out.filter((x) => x.action === "escalate").length, tickets: out };
  },
  "ecom.update_order_status": async (i) => {
    const o = findOrder(str(i.orderId)), to = str(i.status) as OrderStatus;
    if (!(TRANSITIONS[o.status] ?? []).includes(to) && o.status !== to) throw new Error(`cannot move order from ${o.status} to ${to} (allowed: ${(TRANSITIONS[o.status] ?? []).join(", ") || "none"})`);
    o.status = to; if (i.trackingNumber) o.trackingNumber = str(i.trackingNumber); if (i.carrier) o.carrier = str(i.carrier);
    if (to === "delivered") { const s = S().shipments.find((x) => x.orderId === o.id); if (s) { s.status = "delivered"; s.actualDelivery = now(); } if (/cod|cash/i.test(o.paymentMethod)) o.paymentStatus = "paid"; }
    (o as any).history?.push({ status: to, at: now() }); o.updatedAt = now(); save();
    const type = to === "shipped" || to === "out_for_delivery" ? "shipping_update" : to === "delivered" ? "delivery" : null;
    const n = type && bool(i.notify, true) ? await LOCAL["ecom.send_notification"]({ orderId: o.id, type }) : undefined;
    return { orderId: o.id, newStatus: to, notificationSent: !!(n as any)?.sent, notification: n };
  },
  "ecom.cancel_order": async (i) => {
    const o = findOrder(str(i.orderId));
    if (["shipped", "out_for_delivery", "delivered"].includes(o.status)) throw new Error(`order already ${o.status} — create a return instead`);
    if (o.status === "cancelled") throw new Error("order is already cancelled");
    for (const it of o.items) { const p = S().products.find((x) => x.id === it.productId); if (p) changeStock(p, it.quantity, "return", `cancel ${o.id}`); }
    o.status = "cancelled"; o.notes = str(i.reason); o.updatedAt = now(); save();
    const rf = o.paymentStatus === "paid" && bool(i.refundFull, true) ? await refund(o, o.total, `cancelled: ${str(i.reason)}`) : undefined;
    const n = await deliver(customerOf(o), `Order ${o.id} cancelled`, `Your order ${o.id} has been cancelled (${str(i.reason)}).${rf ? ` A refund of ${money(rf.amount)} is on its way.` : ""}`, o.id);
    return { orderId: o.id, cancelled: true, restocked: o.items.length, refund: rf, notification: { sent: n.sent, link: n.link } };
  },
  "ecom.process_return": async (i) => {
    const r = S().returns.find((x) => x.id === str(i.returnId));
    if (!r) throw new Error(`return ${str(i.returnId)} not found`);
    const o = findOrder(r.orderId);
    if (str(i.decision) === "reject") { r.status = "rejected"; save(); const n = await deliver(customerOf(o), `Return ${r.id} update`, `We couldn't approve the return for order ${o.id}${i.reason ? `: ${str(i.reason)}` : "."}`, o.id); return { returnId: r.id, status: r.status, notification: { sent: n.sent, link: n.link } }; }
    r.status = "approved"; r.refundType = (str(i.refundType, r.refundType) as any);
    let rf: Refund | undefined;
    if (r.refundType === "full" || r.refundType === "partial") { const amt = r.refundType === "full" ? r.items.reduce((s, it) => s + (o.items.find((x) => x.productId === it.productId)?.unitPrice ?? 0) * it.quantity, 0) || o.total : num(i.refundAmount ?? r.refundAmount); rf = await refund(o, amt, `return ${r.id}`); r.refundAmount = rf.amount; r.status = "processed"; }
    for (const it of r.items) { const p = S().products.find((x) => x.id === it.productId); if (p && (it.condition === "unopened" || it.condition === "opened")) changeStock(p, it.quantity, "return", `return ${r.id}`); }
    if (r.refundType === "exchange") { r.status = "approved"; }
    if (r.refundType === "store_credit") r.returnLabel = `CREDIT-${uid("SC")}`;
    o.status = "returned"; o.updatedAt = now(); save();
    return { returnId: r.id, status: r.status, refundType: r.refundType, refund: rf, storeCredit: r.refundType === "store_credit" ? r.returnLabel : undefined };
  },
  "ecom.send_notification": async (i) => {
    const o = findOrder(str(i.orderId)), type = str(i.type);
    const T: Record<string, [string, string]> = {
      confirmation: [`Order ${o.id} confirmed`, `Thanks for your order! ${o.items.map((it) => `${it.quantity}× ${it.productName}`).join(", ")} — total ${money(o.total)}.`],
      shipping_update: [`Order ${o.id} is on its way`, `Your order has shipped${o.carrier ? ` with ${o.carrier}` : ""}${o.trackingNumber ? ` (tracking ${o.trackingNumber})` : ""}.${o.estimatedDelivery ? ` Expected by ${o.estimatedDelivery.slice(0, 10)}.` : ""}`],
      delivery: [`Order ${o.id} delivered`, `Your order was delivered. We'd love your feedback — just reply with a rating from 1 to 5.`],
      delay_alert: [`Update on order ${o.id}`, `Your order is running a little late. We're sorry — we're working with the courier and will keep you posted.`],
    };
    const [subject, body] = T[type] ?? [`Order ${o.id}`, ""];
    const n = await deliver(customerOf(o), subject, i.customMessage ? `${body}\n\n${str(i.customMessage)}` : body, o.id);
    return { notificationId: n.id, sent: n.sent, channel: n.channel, to: n.to, link: n.link, subject, body: n.body };
  },
  "ecom.update_inventory": (i) => {
    const p = findProduct(str(i.productId)), reason = str(i.reason), q = num(i.quantity), prev = p.stock;
    const delta = reason === "adjustment" ? (str(i.mode) === "set" ? q - p.stock : q) : ["sale", "damage", "theft"].includes(reason) ? -Math.abs(q) : Math.abs(q);
    changeStock(p, delta, reason, i.notes ? str(i.notes) : undefined); save();
    return { productId: p.id, previousStock: prev, newStock: p.stock, delta, lowStockAlert: p.stock <= p.lowStockThreshold };
  },
  "ecom.auto_reorder": async (i) => {
    const p = findProduct(str(i.productId)), win = num(i.salesVelocityDays, 30);
    const v = velocity(p.id, win), lead = p.supplier?.leadTimeDays ?? num(secret("ECOM_LEAD_TIME_DAYS"), 7), safety = Math.ceil(v * lead * 0.5);
    const reorderPoint = Math.ceil(v * lead + safety), target = Math.ceil(v * (lead + num(i.coverDays, 30)) + safety);
    const qty = Math.max(0, Math.max(target - p.stock, p.stock <= reorderPoint ? p.supplier?.minOrderQty ?? 1 : 0));
    if (!qty) return { productId: p.id, reordered: false, stock: p.stock, reorderPoint, dailyVelocity: r2(v, 2), reason: "stock above reorder point" };
    const po = { id: uid("PO"), productId: p.id, qty: Math.max(qty, p.supplier?.minOrderQty ?? 1), supplier: p.supplier?.name ?? "unassigned", cost: r2((p.costPrice ?? p.price * 0.6) * Math.max(qty, p.supplier?.minOrderQty ?? 1)), at: now(), status: "draft" };
    S().purchaseOrders.push(po); save();
    const n = p.supplier?.contactEmail ? await deliver({ email: p.supplier.contactEmail }, `Purchase order ${po.id}`, `Please supply ${po.qty} × ${p.name} (SKU ${p.sku}). Ship to our warehouse.`) : undefined;
    if (n?.sent) { po.status = "sent"; save(); }
    return { productId: p.id, reordered: true, purchaseOrder: po, stock: p.stock, reorderPoint, dailyVelocity: r2(v, 2), daysOfCover: v ? r2(p.stock / v, 1) : null, supplierNotified: n ? { sent: n.sent, link: n.link } : "no supplier email on product" };
  },
  "ecom.prevent_stockout": () => {
    const pending = (pid: string) => S().orders.filter((o) => ["pending", "confirmed", "processing", "on_hold"].includes(o.status)).flatMap((o) => o.items).filter((it) => it.productId === pid).reduce((a, it) => a + it.quantity, 0);
    const atRisk = S().products.filter((p) => p.status === "active").map((p) => { const v = velocity(p.id, 30), pend = pending(p.id), lead = p.supplier?.leadTimeDays ?? 7; const daysLeft = v ? r2((p.stock - pend) / v, 1) : p.stock - pend <= 0 ? 0 : Infinity; return { productId: p.id, productName: p.name, stock: p.stock, pendingOrders: pend, dailyVelocity: r2(v, 2), daysUntilStockout: daysLeft, leadTimeDays: lead, action: daysLeft <= 0 ? "pause listing / backorder" : daysLeft <= lead ? "reorder now (expedite)" : daysLeft <= lead * 2 ? "reorder this week" : "ok" }; }).filter((x) => x.action !== "ok").sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
    return { atRisk, count: atRisk.length, checked: S().products.length };
  },
  "ecom.upsert_product": (i) => {
    const ex = S().products.find((p) => (i.sku && p.sku === str(i.sku)) || (i.id && p.id === str(i.id)) || p.name.toLowerCase() === str(i.name).toLowerCase());
    if (ex) { const prevStock = ex.stock; Object.assign(ex, Object.fromEntries(Object.entries({ name: i.name, price: i.price !== undefined ? num(i.price) : undefined, description: i.description, category: i.category, sku: i.sku, costPrice: i.costPrice !== undefined ? num(i.costPrice) : undefined, lowStockThreshold: i.lowStockThreshold !== undefined ? num(i.lowStockThreshold) : undefined }).filter(([, v]) => v !== undefined))); if (i.stock !== undefined && num(i.stock) !== prevStock) changeStock(ex, num(i.stock) - prevStock, "adjustment", "upsert"); ex.updatedAt = now(); save(); return { productId: ex.id, action: "updated", product: ex }; }
    const p = newProduct(i); S().products.push(p); if (p.stock) S().inventory.push({ productId: p.id, delta: p.stock, reason: "restock", notes: "initial stock", at: now(), stockAfter: p.stock }); save();
    return { productId: p.id, action: "created", product: p };
  },
  "ecom.optimize_listing": async (i) => {
    const p = findProduct(str(i.productId)), focus = str(i.focus, "both"), changes: { field: string; before: string; after: string; reason: string }[] = [];
    const words = [...new Set(`${p.category} ${p.tags.join(" ")}`.toLowerCase().split(/\W+/).filter((w) => w.length > 2))];
    if (hasLlm()) {
      const r = llmJson<any>((await callLlm({ system: `Optimise an e-commerce listing for ${focus === "both" ? "SEO and conversion" : focus}. Keep facts; do not invent specs. Reply JSON {title, description, tags[], bullets[], reasons{title,description}}.`, prompt: JSON.stringify({ name: p.name, description: p.description, category: p.category, tags: p.tags, price: p.price }), json: true })).text);
      if (r.title && r.title !== p.name) changes.push({ field: "name", before: p.name, after: r.title, reason: r.reasons?.title ?? "clearer, keyword-rich title" });
      const desc = [r.description, ...(r.bullets ?? []).map((b: string) => `• ${b}`)].filter(Boolean).join("\n");
      if (desc && desc !== p.description) changes.push({ field: "description", before: p.description, after: desc, reason: r.reasons?.description ?? "benefit-led copy" });
      if (Array.isArray(r.tags)) changes.push({ field: "tags", before: p.tags.join(", "), after: r.tags.join(", "), reason: "search keywords" });
    } else {
      if (p.name.length < 25 && words.length) changes.push({ field: "name", before: p.name, after: `${p.name} – ${words.slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}`.slice(0, 70), reason: "titles of 25–70 chars with the category keyword rank and convert better" });
      if (p.name.length > 80) changes.push({ field: "name", before: p.name, after: p.name.slice(0, 77).replace(/\s+\S*$/, "") + "…", reason: "marketplaces truncate titles over ~80 chars" });
      if (p.description.length < 120) changes.push({ field: "description", before: p.description, after: `${p.description || p.name}\n\n• Category: ${p.category}\n• SKU: ${p.sku}${p.weight ? `\n• Weight: ${p.weight}` : ""}\n• Ships in 1–2 days`.trim(), reason: "short descriptions convert poorly; add scannable bullets (add materials/dimensions)" });
      if (!p.images.length) changes.push({ field: "images", before: "0", after: "add ≥ 4 images (white background, lifestyle, scale, detail)", reason: "listings without images rarely convert" });
      if (p.tags.length < 3) changes.push({ field: "tags", before: p.tags.join(", "), after: [...new Set([...p.tags, ...words])].slice(0, 8).join(", "), reason: "more search keywords" });
      if (!p.compareAtPrice && focus !== "seo") changes.push({ field: "compareAtPrice", before: "", after: String(r2(p.price * 1.15)), reason: "showing a reference price lifts conversion (only if it is a genuine prior price)" });
    }
    if (bool(i.apply)) { for (const c of changes) { if (c.field === "name") p.name = c.after; else if (c.field === "description") p.description = c.after; else if (c.field === "tags") p.tags = list(c.after); } p.updatedAt = now(); save(); }
    const avgRating = S().reviews.filter((r) => r.productId === p.id).reduce((s, r, _k, a) => s + r.rating / a.length, 0);
    return { productId: p.id, changes, applied: bool(i.apply), generator: hasLlm() ? "llm" : "rules", estimatedImpact: `${changes.length} improvements${avgRating ? `; avg rating ${r2(avgRating, 1)}` : ""} — re-run with apply=true to save` };
  },
  "ecom.adjust_price": (i) => {
    const p = findProduct(str(i.productId)), np = num(i.newPrice), minMargin = num(secret("ECOM_MIN_MARGIN"), 0.1), maxChange = num(secret("ECOM_MAX_PRICE_CHANGE"), 0.5);
    if (np <= 0) throw new Error("price must be positive");
    if (p.costPrice && np < p.costPrice * (1 + minMargin)) throw new Error(`blocked: ${money(np)} is below cost ${money(p.costPrice)} + ${minMargin * 100}% minimum margin`);
    if (Math.abs(np - p.price) / p.price > maxChange && !bool(i.force)) throw new Error(`blocked: ${r2(Math.abs(np - p.price) / p.price * 100, 1)}% change exceeds the ${maxChange * 100}% guard (pass force=true after review)`);
    S().priceHistory.push({ productId: p.id, from: p.price, to: np, reason: str(i.reason), at: now() });
    const old = p.price; p.price = np; p.updatedAt = now(); save();
    return { productId: p.id, oldPrice: old, newPrice: np, changePct: r2(((np - old) / old) * 100, 1), margin: p.costPrice ? r2(((np - p.costPrice) / np) * 100, 1) : undefined };
  },
  "ecom.create_shipment": async (i) => {
    const o = findOrder(str(i.orderId));
    if (["cancelled", "delivered"].includes(o.status)) throw new Error(`order is ${o.status}`);
    const ep = secret("EASYPOST_API_KEY");
    let s: Shipment;
    if (ep) {
      const from = json<any>(secret("ECOM_WAREHOUSE_ADDRESS") ?? "", null);
      if (!from) throw new Error("set ECOM_WAREHOUSE_ADDRESS (JSON {name, street1, city, state, zip, country, phone}) to buy labels");
      const a = o.shippingAddress, weight = num(i.weightOz, o.items.reduce((w, it) => w + it.quantity * (S().products.find((p) => p.id === it.productId)?.weight ?? 16), 0));
      const auth = { authorization: `Basic ${btoa(`${ep}:`)}`, "content-type": "application/json" };
      const sh = await (await fetch("https://api.easypost.com/v2/shipments", { method: "POST", headers: auth, body: JSON.stringify({ shipment: { to_address: { name: a.name, street1: a.line1, street2: a.line2, city: a.city, state: a.state, zip: a.postalCode, country: a.country, phone: a.phone }, from_address: from, parcel: { weight } } }) })).json();
      if (sh.error) throw new Error(`EasyPost: ${sh.error.message}`);
      const rates = (sh.rates ?? []).filter((r: any) => !i.carrier || r.carrier.toLowerCase() === str(i.carrier).toLowerCase()).filter((r: any) => !i.service || r.service === str(i.service)).sort((a: any, b: any) => Number(a.rate) - Number(b.rate));
      if (!rates.length) throw new Error("no matching carrier rates");
      const bought = await (await fetch(`https://api.easypost.com/v2/shipments/${sh.id}/buy`, { method: "POST", headers: auth, body: JSON.stringify({ rate: { id: rates[0].id } }) })).json();
      if (bought.error) throw new Error(`EasyPost buy: ${bought.error.message}`);
      s = { orderId: o.id, trackingNumber: bought.tracking_code, carrier: rates[0].carrier, service: rates[0].service, status: "label_created", estimatedDelivery: new Date(Date.now() + num(rates[0].delivery_days, 5) * 86400000).toISOString(), events: [{ timestamp: now(), location: "warehouse", status: "label_created", details: `label ${bought.postage_label?.label_url ?? ""}` }] };
      (s as any).labelUrl = bought.postage_label?.label_url; (s as any).cost = Number(rates[0].rate);
    } else {
      const carrier = str(i.carrier, secret("ECOM_DEFAULT_CARRIER") ?? "manual");
      s = { orderId: o.id, trackingNumber: str(i.trackingNumber, `${carrier.slice(0, 3).toUpperCase()}${Date.now().toString().slice(-9)}`), carrier, service: str(i.service, "standard"), status: "label_created", estimatedDelivery: new Date(Date.now() + num(i.etaDays, 5) * 86400000).toISOString(), events: [{ timestamp: now(), location: "warehouse", status: "label_created", details: "shipment recorded locally — book the pickup with your courier and update tracking with ecom.update_order_status" }] };
    }
    S().shipments.push(s);
    o.trackingNumber = s.trackingNumber; o.carrier = s.carrier; o.estimatedDelivery = s.estimatedDelivery;
    if (["confirmed", "processing", "packed"].includes(o.status)) { o.status = "shipped"; (o as any).history?.push({ status: "shipped", at: now() }); }
    o.updatedAt = now(); save();
    return { shipment: s, provider: ep ? "easypost" : "manual" };
  },
  "ecom.track_shipment": async (i) => {
    const tn = str(i.trackingNumber), carrier = str(i.carrier);
    const ep = secret("EASYPOST_API_KEY");
    if (ep && carrier.toLowerCase() !== "manual") {
      const t = await (await fetch("https://api.easypost.com/v2/trackers", { method: "POST", headers: { authorization: `Basic ${btoa(`${ep}:`)}`, "content-type": "application/json" }, body: JSON.stringify({ tracker: { tracking_code: tn, carrier } }) })).json();
      if (t.error) throw new Error(`EasyPost: ${t.error.message}`);
      return { trackingNumber: tn, carrier, status: t.status, estimatedDelivery: t.est_delivery_date, events: (t.tracking_details ?? []).map((d: any) => ({ timestamp: d.datetime, status: d.status, details: d.message, location: [d.tracking_location?.city, d.tracking_location?.state].filter(Boolean).join(", ") })), provider: "easypost" };
    }
    const s = S().shipments.find((x) => x.trackingNumber === tn);
    if (!s) throw new Error(`no shipment ${tn} on record — set EASYPOST_API_KEY to track any carrier`);
    const o = S().orders.find((x) => x.id === s.orderId);
    return { ...s, orderStatus: o?.status, provider: "local", overdue: s.status !== "delivered" && Date.parse(s.estimatedDelivery) < Date.now() };
  },
  "ecom.respond_to_review": async (i) => {
    const r = S().reviews.find((x) => x.id === str(i.reviewId) && (!i.productId || x.productId === str(i.productId)));
    if (!r) throw new Error(`review ${str(i.reviewId)} not found`);
    const tone = str(i.tone, r.rating <= 2 ? "apologetic" : "friendly"), first = r.customerName.split(" ")[0];
    let msg = i.response ? str(i.response) : "";
    if (!msg && hasLlm()) msg = (await callLlm({ system: `Write a short public reply to a product review in a ${tone} tone. Address specific points. No discounts or promises unless stated. 2–4 sentences.`, prompt: `Rating ${r.rating}/5. ${r.title}\n${r.body}` })).text.trim();
    if (!msg) msg = r.rating >= 4 ? `Thank you, ${first}! We're thrilled you're enjoying it — reviews like yours help other shoppers decide.` : r.rating === 3 ? `Thanks for the honest feedback, ${first}. We'd love to know what would make this a 5-star experience — please reach out to our support team.` : `We're sorry, ${first} — this isn't the experience we want for you. Please contact our support team with your order number and we'll make it right.`;
    r.response = { message: msg, respondedAt: now(), respondedBy: secret("ECOM_STORE_NAME") ?? "store" };
    r.sentiment = sentiment(r); save();
    const ticket = r.rating <= 2 ? await LOCAL["ecom.classify_ticket"]({ subject: `Negative review: ${r.title}`, message: r.body, customerName: r.customerName }) : undefined;
    return { reviewId: r.id, response: msg, tone, published: false, note: "saved on the review; publish through your storefront/marketplace", followUpTicket: (ticket as any)?.ticketId };
  },
  "ecom.analyze_reviews": (i) => {
    const rs = S().reviews.filter((r) => !i.productId || r.productId === str(i.productId)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, num(i.limit, 500));
    if (!rs.length) throw new Error("no reviews (import with ecom.import_data kind=reviews)");
    for (const r of rs) r.sentiment = sentiment(r);
    const dist = [1, 2, 3, 4, 5].map((s) => ({ stars: s, count: rs.filter((r) => Math.round(r.rating) === s).length }));
    const aspects = Object.entries(ASPECTS).map(([k, re]) => { const m = rs.filter((r) => re.test(`${r.title} ${r.body}`)); return { aspect: k, mentions: m.length, negative: m.filter((r) => r.sentiment === "negative").length, positive: m.filter((r) => r.sentiment === "positive").length }; }).filter((a) => a.mentions).sort((a, b) => b.negative - a.negative);
    const neg = rs.filter((r) => r.sentiment === "negative");
    save();
    return { reviews: rs.length, averageRating: r2(rs.reduce((s, r) => s + r.rating, 0) / rs.length, 2), distribution: dist, sentiment: { positive: rs.filter((r) => r.sentiment === "positive").length, neutral: rs.filter((r) => r.sentiment === "neutral").length, negative: neg.length }, aspects, topComplaints: aspects.filter((a) => a.negative).slice(0, 3).map((a) => `${a.aspect} (${a.negative} negative)`), unanswered: rs.filter((r) => !r.response && r.rating <= 3).map((r) => r.id), samples: neg.slice(0, 3).map((r) => ({ id: r.id, rating: r.rating, text: `${r.title} ${r.body}`.slice(0, 160) })) };
  },
  "ecom.check_fraud": (i) => fraudCheck(findOrder(str(i.orderId))),
  "ecom.hold_order": async (i) => {
    const o = findOrder(str(i.orderId));
    if (["shipped", "delivered", "cancelled"].includes(o.status)) throw new Error(`cannot hold an order that is ${o.status}`);
    const h = { id: uid("HOLD"), reason: str(i.reason), score: num(i.fraudScore), flags: list(i.flags), at: now() };
    (o.holds ??= []).push(h); o.status = "on_hold" as any; (o as any).history?.push({ status: "on_hold", at: now(), note: h.reason }); o.updatedAt = now(); save();
    const team = secret("ECOM_SECURITY_EMAIL");
    const n = team ? await deliver({ email: team }, `Order ${o.id} held (risk ${h.score})`, `${h.reason}\nFlags: ${h.flags.join(", ")}\nTotal ${money(o.total)} — ${o.customerEmail}`) : undefined;
    return { held: true, holdId: h.id, notifySent: !!n?.sent, release: `ecom.update_order_status orderId=${o.id} status=confirmed` };
  },
  "ecom.daily_report": (i) => {
    const d = str(i.date, now().slice(0, 10));
    const day = S().orders.filter((o) => o.createdAt.slice(0, 10) === d);
    const valid = day.filter((o) => o.status !== "cancelled");
    const rev = r2(valid.reduce((s, o) => s + o.total, 0));
    const firstOrder = new Map<string, string>(); for (const o of [...S().orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) if (!firstOrder.has(o.customerEmail)) firstOrder.set(o.customerEmail, o.id);
    const prodMap = new Map<string, { productId: string; name: string; unitsSold: number; revenue: number }>();
    for (const it of valid.flatMap((o) => o.items)) { const p = prodMap.get(it.productId) ?? { productId: it.productId, name: it.productName, unitsSold: 0, revenue: 0 }; p.unitsSold += it.quantity; p.revenue = r2(p.revenue + it.totalPrice); prodMap.set(it.productId, p); }
    const issues = [
      { type: "cancellations", count: day.length - valid.length, details: "orders cancelled today" },
      { type: "on_hold", count: S().orders.filter((o) => (o.status as string) === "on_hold").length, details: "orders awaiting fraud review" },
      { type: "open_tickets", count: S().tickets.filter((t) => t.status === "open").length, details: "unanswered support tickets" },
      { type: "low_stock", count: S().products.filter((p) => p.stock <= p.lowStockThreshold).length, details: "products at or below threshold" },
      { type: "late_shipments", count: S().shipments.filter((s) => s.status !== "delivered" && Date.parse(s.estimatedDelivery) < Date.now()).length, details: "past estimated delivery" },
    ].filter((x) => x.count);
    return { date: d, totalOrders: valid.length, totalRevenue: rev, averageOrderValue: valid.length ? r2(rev / valid.length) : 0, returns: S().returns.filter((r) => r.createdAt.slice(0, 10) === d).length, refunds: r2(S().refunds.filter((r) => r.at.slice(0, 10) === d).reduce((s, r) => s + r.amount, 0)), newCustomers: valid.filter((o) => firstOrder.get(o.customerEmail) === o.id).length, repeatCustomers: valid.filter((o) => firstOrder.get(o.customerEmail) !== o.id).length, topProducts: [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5), issues, currency: CUR() };
  },
  "ecom.at_risk_customers": () => {
    const by = new Map<string, Order[]>();
    for (const o of S().orders) by.set(o.customerEmail || o.customerId, [...(by.get(o.customerEmail || o.customerId) ?? []), o]);
    const atRisk: any[] = [];
    for (const [key, os] of by) {
      const sorted = [...os].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), last = sorted[sorted.length - 1];
      const gaps = sorted.slice(1).map((o, k) => days(sorted[k].createdAt, o.createdAt)), avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 45;
      const since = days(last.createdAt), ltv = r2(os.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0));
      const reasons: string[] = [];
      if (since > Math.max(30, avgGap * 2)) reasons.push(`no order for ${Math.floor(since)} days (usual gap ${Math.round(avgGap)})`);
      const tix = S().tickets.filter((t) => t.customerEmail === key || os.some((o) => o.id === t.orderId));
      if (tix.some((t) => t.status !== "resolved" && t.status !== "closed")) reasons.push("unresolved support ticket");
      if (tix.some((t) => t.category === "complaint" || t.priority === "urgent")) reasons.push("filed a complaint");
      const rets = S().returns.filter((r) => os.some((o) => o.id === r.orderId)); if (rets.length >= 2) reasons.push(`${rets.length} returns`);
      if (S().reviews.some((r) => r.rating <= 2 && (r.customerId === key || r.customerName === last.customerName))) reasons.push("left a negative review");
      if (S().shipments.some((s) => os.some((o) => o.id === s.orderId) && s.status !== "delivered" && Date.parse(s.estimatedDelivery) < Date.now())) reasons.push("delivery is late");
      if (!reasons.length) continue;
      atRisk.push({ customerId: last.customerId, name: last.customerName, email: last.customerEmail, riskReasons: reasons, lastOrderDaysAgo: Math.floor(since), lifetimeValue: ltv, orders: os.length, suggestedAction: reasons.some((r) => /ticket|complaint|late|review/.test(r)) ? "personal outreach from support + resolve open issue" : ltv > num(secret("ECOM_HIGH_VALUE"), 10000) ? "win-back offer (VIP)" : "win-back email with recommendations" });
    }
    atRisk.sort((a, b) => b.lifetimeValue - a.lifetimeValue);
    return { atRisk, totalAtRisk: atRisk.length, potentialRevenueLoss: r2(atRisk.reduce((s, c) => s + c.lifetimeValue / Math.max(1, c.orders), 0)) };
  },
};

export const ECOMMERCE_EXECUTORS: ExecMap = execs(Object.fromEntries(Object.entries(LOCAL).map(([id, fn]) => [id, async (i: Record<string, any>) => {
  const c = remote();
  if (c && REMOTE[id] && !bool(i.local)) return { mode: "remote", platform: c.platform, result: await REMOTE[id](c, i) };
  return fn(i);
}])));
