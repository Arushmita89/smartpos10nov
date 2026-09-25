import { formatCurrency } from "./utils";

export interface ReceiptOrder {
  id: number;
  created_at: string;
  items: { name: string; price: number; quantity: number; options?: string[]; notes?: string }[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod?: "online" | "cash";
  cashReceived?: number;
  change?: number;
  currency?: string;
  restaurantName?: string;
  customerInfo?: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  orderType?: string;
  estimatedDeliveryTime?: number;
  discountAmount?: number;
  promoCode?: string;
  loyaltyPointsRedeemed?: number;
  loyaltyPointsEarned?: number;
}

export function buildReceiptText(order: ReceiptOrder): string {
  const lines: string[] = [];
  const currency = order.currency || 'INR';
  lines.push(order.restaurantName || "SmartPOS Receipt");
  lines.push(`Order #${order.id}`);
  lines.push(`Date: ${new Date(order.created_at).toLocaleString()}`);
  lines.push("----------------------");
  if (order.customerInfo?.name) {
    lines.push(`Customer: ${order.customerInfo.name}`);
  }
  if (order.customerInfo?.phone) {
    lines.push(`Phone: ${order.customerInfo.phone}`);
  }
  if (order.customerInfo?.address && order.orderType === "Delivery") {
    lines.push(`Address: ${order.customerInfo.address}`);
  }
  if (order.orderType) {
    lines.push(`Order Type: ${order.orderType}`);
  }
  if (order.estimatedDeliveryTime) {
    lines.push(`Est. Delivery: ${order.estimatedDeliveryTime} min`);
  }
  lines.push("----------------------");
  lines.push("Items:");
  order.items.forEach((item) => {
    lines.push(`${item.name} x${item.quantity} = ${formatCurrency(item.price * item.quantity, currency)}`);
    if (item.options && item.options.length > 0) {
      lines.push(`   Options: ${item.options.join(", ")}`);
    }
    if (item.notes) {
      lines.push(`   Note: ${item.notes}`);
    }
  });
  lines.push("----------------------");
  lines.push(`Subtotal: ${formatCurrency(order.subtotal, currency)}`);
  if (order.discountAmount && order.discountAmount > 0) {
    lines.push(
      `Discount${order.promoCode ? ` (${order.promoCode})` : ""}: -${formatCurrency(order.discountAmount, currency)}`
    );
  }
  lines.push(`Tax (${18}%): ${formatCurrency(order.tax, currency)}`);
  if (order.loyaltyPointsRedeemed && order.loyaltyPointsRedeemed > 0) {
    lines.push(`Loyalty Points Redeemed: ${order.loyaltyPointsRedeemed} pts`);
  }
  lines.push(`Total: ${formatCurrency(order.total, currency)}`);
  if (order.loyaltyPointsEarned && order.loyaltyPointsEarned > 0) {
    lines.push(`Loyalty Points Earned: ${order.loyaltyPointsEarned} pts`);
  }
  lines.push(`Payment: ${order.paymentMethod === "cash" ? "Cash" : "Online"}`);
  if (order.paymentMethod === "cash" && order.cashReceived !== undefined) {
    lines.push(`Cash Received: ${formatCurrency(order.cashReceived, currency)}`);
    if (order.change && order.change > 0) {
      lines.push(`Change: ${formatCurrency(order.change, currency)}`);
    }
  }
  lines.push("----------------------");
  lines.push("Thank you for visiting!");
  return lines.join("\n");
}

export function toWhatsAppNumber(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

export function openWhatsAppReceipt(phone: string, message: string) {
  const number = toWhatsAppNumber(phone);
  if (!number) return;
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  const win = window.open(url, "_blank");
  if (!win) {
    window.location.href = url;
  }
}

export async function sendReceiptEmail(
  to: string,
  subject: string,
  text: string
): Promise<void> {
  const res = await fetch("/api/send-receipt-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, text }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Email failed");
  }
}
