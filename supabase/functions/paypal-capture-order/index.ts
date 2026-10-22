import {
  corsHeaders,
  getPayPalAccessToken,
  isAllowedOrigin,
  jsonResponse,
  paypalApiBase,
  requiredEnv,
  supabaseRestHeaders
} from "../_shared/paypal.ts";

type StoredOrder = {
  order_id: string;
  reference_id: string;
  expected_amount: string | number;
  currency: string;
  items: unknown;
  status: string;
};

function isStoredOrder(value: unknown): value is StoredOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;
  return typeof order.order_id === "string" &&
    typeof order.reference_id === "string" &&
    (typeof order.expected_amount === "string" || typeof order.expected_amount === "number") &&
    Number.isFinite(Number(order.expected_amount)) && Number(order.expected_amount) > 0 &&
    order.currency === "USD" &&
    Array.isArray(order.items) &&
    (order.status === "created" || order.status === "captured");
}

function amountInCents(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,8}\.\d{2}$/.test(value)) return -1;
  return Math.round(Number(value) * 100);
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return isAllowedOrigin(origin)
      ? new Response("ok", { headers: { ...corsHeaders(origin), "Access-Control-Max-Age": "86400" } })
      : jsonResponse({ error: "Origen no autorizado." }, 403, origin);
  }
  if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405, origin);
  if (!isAllowedOrigin(origin)) return jsonResponse({ error: "Origen no autorizado." }, 403, origin);

  try {
    const body = await request.json();
    if (typeof body.orderId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(body.orderId)) {
      return jsonResponse({ error: "El número de pedido no es válido." }, 400, origin);
    }
    const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
    const query = new URL(`${supabaseUrl}/rest/v1/payment_orders`);
    query.searchParams.set("select", "order_id,reference_id,expected_amount,currency,items,status");
    query.searchParams.set("order_id", `eq.${body.orderId}`);
    const headers = supabaseRestHeaders();
    const storedResponse = await fetch(query, { headers });
    const storedRows = await storedResponse.json().catch(() => []);
    if (!storedResponse.ok || !Array.isArray(storedRows) || !storedRows.length || !isStoredOrder(storedRows[0])) {
      return jsonResponse({ error: "No se encontró un pedido válido para verificar." }, 404, origin);
    }
    const order = storedRows[0] as StoredOrder;
    if (order.status === "captured") {
      return jsonResponse({ orderId: order.order_id, status: "COMPLETED", items: order.items }, 200, origin);
    }
    if (order.status !== "created" || order.currency !== "USD") {
      return jsonResponse({ error: "El pedido no se puede capturar." }, 409, origin);
    }

    const accessToken = await getPayPalAccessToken();
    const captureResponse = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(order.order_id)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": crypto.randomUUID()
      },
      body: "{}"
    });
    const captured = await captureResponse.json().catch(() => ({}));
    if (!captureResponse.ok || captured.status !== "COMPLETED" || !Array.isArray(captured.purchase_units)) {
      console.error("PayPal no confirmó la captura.", captured);
      return jsonResponse({ error: "PayPal todavía no confirma el pago. No se entregó el diseño." }, 402, origin);
    }

    const purchaseUnit = captured.purchase_units[0];
    const captures = purchaseUnit?.payments?.captures;
    const validCaptures = Array.isArray(captures) && captures.length > 0 &&
      captures.every((capture: Record<string, unknown>) => {
        const amount = capture.amount as Record<string, unknown> | undefined;
        return capture.status === "COMPLETED" && amount?.currency_code === "USD" &&
          amountInCents(amount.value) >= 0;
      });
    const paidCents = validCaptures
      ? captures.reduce((sum: number, capture: Record<string, unknown>) => {
          const amount = capture.amount as Record<string, unknown>;
          return sum + amountInCents(amount.value);
        }, 0)
      : -1;
    if (purchaseUnit?.custom_id !== order.reference_id ||
        paidCents !== Math.round(Number(order.expected_amount) * 100) ||
        !Array.isArray(order.items)) {
      console.error("La captura de PayPal no coincide con el pedido esperado.", { orderId: order.order_id });
      return jsonResponse({ error: "El importe confirmado no coincide con el pedido. Contacta con la tienda." }, 409, origin);
    }

    const updateUrl = new URL(`${supabaseUrl}/rest/v1/payment_orders`);
    updateUrl.searchParams.set("order_id", `eq.${order.order_id}`);
    updateUrl.searchParams.set("status", "eq.created");
    const updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ status: "captured", captured_at: new Date().toISOString() })
    });
    const updated = await updateResponse.json().catch(() => []);
    if (!updateResponse.ok || !Array.isArray(updated) || !updated.length) {
      console.error("El pago se confirmó, pero no se pudo actualizar el pedido.", updated);
      return jsonResponse({ error: "PayPal confirmó el pago, pero no se pudo guardar la confirmación. Contacta con la tienda con tu número de pedido." }, 500, origin);
    }
    return jsonResponse({ orderId: order.order_id, status: "COMPLETED", items: order.items }, 200, origin);
  } catch (error) {
    console.error("Error al verificar captura PayPal.", error);
    return jsonResponse({ error: "No se pudo verificar el pago. Contacta con la tienda si PayPal mostró un cobro." }, 500, origin);
  }
});
