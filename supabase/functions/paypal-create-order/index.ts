import {
  getPayPalAccessToken,
  corsHeaders,
  isAllowedOrigin,
  isUuid,
  jsonResponse,
  paypalApiBase,
  requiredEnv,
  supabaseRestHeaders
} from "../_shared/paypal.ts";

type CartItem = { id: string; quantity: number };
type Product = { id: string; name: string; price: number; is_free: boolean; is_published: boolean };

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return isUuid(item.id) && Number.isInteger(item.quantity) &&
    Number(item.quantity) >= 1 && Number(item.quantity) <= 20;
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
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 25 || !body.items.every(isCartItem)) {
      return jsonResponse({ error: "El carrito no tiene un formato válido." }, 400, origin);
    }
    const items = body.items as CartItem[];
    if (new Set(items.map(item => item.id)).size !== items.length) {
      return jsonResponse({ error: "El carrito contiene productos repetidos." }, 400, origin);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
    const productUrl = new URL(`${supabaseUrl}/rest/v1/products`);
    productUrl.searchParams.set("select", "id,name,price,is_free,is_published");
    productUrl.searchParams.set("id", `in.(${items.map(item => item.id).join(",")})`);
    productUrl.searchParams.set("is_published", "eq.true");
    productUrl.searchParams.set("is_free", "eq.false");
    const productResponse = await fetch(productUrl, { headers: supabaseRestHeaders() });
    const productRows = await productResponse.json().catch(() => []);
    if (!productResponse.ok || !Array.isArray(productRows)) {
      console.error("No se pudieron verificar los productos del pedido.", productRows);
      throw new Error("No se pudo verificar el catálogo. Inténtalo más tarde.");
    }

    const products = productRows as Product[];
    if (products.length !== items.length) {
      return jsonResponse({ error: "Uno o más productos ya no están disponibles." }, 409, origin);
    }
    const verifiedItems = items.map(item => {
      const product = products.find(entry => entry.id === item.id);
      const unitCents = Math.round(Number(product?.price) * 100);
      if (!product || product.is_free || !product.is_published || !Number.isSafeInteger(unitCents) || unitCents <= 0) {
        throw new Error("Hay un producto inválido o no disponible en el carrito.");
      }
      return {
        product_id: product.id,
        name: product.name.slice(0, 127),
        quantity: item.quantity,
        unit_cents: unitCents
      };
    });
    const totalCents = verifiedItems.reduce((sum, item) => sum + item.unit_cents * item.quantity, 0);
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > 99_999_999) {
      return jsonResponse({ error: "El importe del pedido no es válido." }, 400, origin);
    }

    const referenceId = crypto.randomUUID();
    const accessToken = await getPayPalAccessToken();
    const paypalResponse = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": referenceId
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: referenceId,
          custom_id: referenceId,
          amount: {
            currency_code: "USD",
            value: (totalCents / 100).toFixed(2),
            breakdown: {
              item_total: { currency_code: "USD", value: (totalCents / 100).toFixed(2) }
            }
          },
          items: verifiedItems.map(item => ({
            name: item.name,
            quantity: String(item.quantity),
            unit_amount: { currency_code: "USD", value: (item.unit_cents / 100).toFixed(2) }
          }))
        }]
      })
    });
    const paypalOrder = await paypalResponse.json().catch(() => ({}));
    if (!paypalResponse.ok || typeof paypalOrder.id !== "string") {
      console.error("PayPal no creó el pedido.", paypalOrder);
      throw new Error("PayPal no pudo iniciar el pago. Inténtalo de nuevo.");
    }

    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/payment_orders`, {
      method: "POST",
      headers: { ...supabaseRestHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({
        order_id: paypalOrder.id,
        reference_id: referenceId,
        expected_amount: (totalCents / 100).toFixed(2),
        currency: "USD",
        items: verifiedItems.map(({ product_id, quantity }) => ({ product_id, quantity }))
      })
    });
    if (!saveResponse.ok) {
      const error = await saveResponse.text();
      console.error("No se pudo registrar el pedido pendiente.", error);
      throw new Error("No se pudo guardar el pedido para verificar el pago.");
    }
    return jsonResponse({ orderId: paypalOrder.id }, 200, origin);
  } catch (error) {
    console.error("Error al crear pedido PayPal.", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "No se pudo iniciar el pago." }, 500, origin);
  }
});
