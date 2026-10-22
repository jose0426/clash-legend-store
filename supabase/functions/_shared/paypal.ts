const allowedOrigins = (Deno.env.get("PAYPAL_ALLOWED_ORIGINS") || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

export function isAllowedOrigin(origin: string | null): origin is string {
  return Boolean(origin && allowedOrigins.includes(origin));
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    ...(isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

export function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" }
  });
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta configurar el secreto del servidor ${name}.`);
  return value;
}

export function paypalApiBase(): string {
  return (Deno.env.get("PAYPAL_API_BASE") || "https://api-m.paypal.com").replace(/\/+$/, "");
}

export async function getPayPalAccessToken(): Promise<string> {
  const clientId = requiredEnv("PAYPAL_CLIENT_ID");
  const clientSecret = requiredEnv("PAYPAL_CLIENT_SECRET");
  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    console.error("PayPal OAuth falló.", result);
    throw new Error("PayPal no autorizó el checkout. Revisa las credenciales de la aplicación.");
  }
  return result.access_token;
}

export function supabaseRestHeaders(): Record<string, string> {
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
