/**
 * Edge Function: billing-history
 *
 * Returns the user's Stripe invoices and default payment method.
 *
 * Route:
 *   GET /functions/v1/billing-history
 *
 * Response (200):
 *   {
 *     invoices: [{ date, amount_paid, currency, status, invoice_url, description }],
 *     payment_method: { brand, last4, exp_month, exp_year } | null
 *   }
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";

function getStripe(): Stripe {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(secretKey, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

async function handleBillingHistory(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  // 1. Auth
  const { user, error: authError } = await verifyAuth(req);
  if (authError || !user) {
    return corsRes(
      { error: "unauthorized", error_description: authError ?? "Authentication required" },
      { status: 401 },
    );
  }

  const db = supabaseAdmin();

  // 2. Rate limit
  const rateLimitResult = await checkRateLimit(user.id, "billing-history", db);
  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({ error: "rate_limit_exceeded" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...getRateLimitHeaders(rateLimitResult),
          ...getCorsHeaders(origin),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  // 3. Look up stripe_customer_id
  const { data: subscription } = await db
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // No Stripe customer = free user, return empty (not an error)
  if (!subscription?.stripe_customer_id) {
    return corsRes({ invoices: [], payment_method: null });
  }

  const stripe = getStripe();
  const customerId = subscription.stripe_customer_id;

  // 4. Fetch subscription invoices, payment method, and PAYG credit purchases in parallel
  const [invoicesResult, customerResult, paygResult] = await Promise.all([
    stripe.invoices.list({ customer: customerId, limit: 20 }),
    stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    }),
    db
      .from("credit_transactions")
      .select("amount, description, created_at, metadata, type")
      .eq("user_id", user.id)
      .in("type", ["purchase_credit", "auto_topup_credit"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // 5. Map subscription invoices to safe response shape
  const subscriptionInvoices = invoicesResult.data.map((inv) => ({
    date: new Date(inv.created * 1000).toISOString(),
    amount_paid: (inv.amount_paid ?? 0) / 100,
    currency: inv.currency ?? "usd",
    status: inv.status ?? "unknown",
    invoice_url: inv.hosted_invoice_url ?? null,
    description:
      inv.description ??
      inv.lines?.data?.[0]?.description ??
      "Subscription",
    credits: null as number | null,
  }));

  // 6. Map PAYG credit purchases from credit_transactions ledger
  type CreditTxRow = {
    amount: number;
    description: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
    type: string;
  };
  const paygInvoices = ((paygResult.data ?? []) as CreditTxRow[]).map((tx) => {
    const isAuto = tx.type === "auto_topup_credit";
    const amountCents = Number(
      (tx.metadata as Record<string, unknown> | null)?.amount_cents ?? 0,
    );
    return {
      date: tx.created_at,
      amount_paid: amountCents > 0 ? amountCents / 100 : tx.amount / 100,
      currency: "usd",
      status: "paid",
      invoice_url: null,
      description:
        tx.description ??
        `${isAuto ? "Auto-recharge" : "Credit purchase"}: +${tx.amount.toLocaleString()} credits`,
      credits: tx.amount,
    };
  });

  // 7. Merge and sort by date descending
  const invoices = [...subscriptionInvoices, ...paygInvoices].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  // 6. Extract payment method (card only)
  let paymentMethod = null;
  if (typeof customerResult !== "string" && !customerResult.deleted) {
    const pm = customerResult.invoice_settings?.default_payment_method;
    if (pm && typeof pm === "object" && "card" in pm && pm.card) {
      const card = pm.card as { brand?: string; last4?: string; exp_month?: number; exp_year?: number };
      paymentMethod = {
        brand: card.brand ?? "unknown",
        last4: card.last4 ?? "****",
        exp_month: card.exp_month ?? 0,
        exp_year: card.exp_year ?? 0,
      };
    }
  }

  return corsRes({ invoices, payment_method: paymentMethod });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...getCorsHeaders(origin), ...getSecurityHeaders() },
    });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() },
      },
    );
  }

  try {
    const response = await handleBillingHistory(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in billing-history:", err);
    return new Response(
      JSON.stringify({
        error: "server_error",
        error_description: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() },
      },
    );
  }
});
