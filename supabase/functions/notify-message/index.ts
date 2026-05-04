// Supabase Edge Function: notify-message
// Sends an Expo push notification to the other members of a chat when an admin sends a new message.
//
// Deploy (example):
//   supabase functions deploy notify-message
//
// Expected body:
//   { chatId: string; senderId: string; preview?: string }
//
// This function verifies the caller via the JWT (Authorization header), then uses the service role
// to look up recipient tokens and send via Expo Push API.

import { createClient } from "jsr:@supabase/supabase-js@2";

type NotifyBody = {
  chatId?: string;
  senderId?: string;
  preview?: string;
};

function getAllowedOrigins(): string[] {
  const raw =
    Deno.env.get("ALLOWED_ORIGINS") ??
    [
      "https://chatsantanita.com",
      "https://www.chatsantanita.com",
      "https://app.chatsantanita.com",
      "https://reportes.chatsantanita.com",
      "http://localhost:3000",
      "http://localhost:19006",
    ].join(",");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string) {
  const allowed = getAllowedOrigins();
  const allowOrigin = origin && allowed.includes(origin) ? origin : "";
  return {
    "access-control-allow-origin": allowOrigin || "null",
    "vary": "Origin",
  };
}

function json(status: number, body: unknown, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function noContent(origin = "") {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function safePreview(text: string) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "Mensaje nuevo";
  // Keep it short for notifications.
  return trimmed.length > 120 ? trimmed.slice(0, 117) + "..." : trimmed;
}

Deno.serve(async (req) => {
  try {
    const origin = req.headers.get("origin") ?? "";
    const allowed = getAllowedOrigins();
    if (origin && !allowed.includes(origin)) {
      return json(403, { error: "Origin not allowed" }, origin);
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      return noContent(origin);
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" }, origin);
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const apiKeyHeader = req.headers.get("apikey") ?? "";

    const url = getEnv("SUPABASE_URL");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authedClient = createClient(url, anonKey, {
      global: {
        headers: {
          authorization: authHeader,
          apikey: anonKey,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authedClient.auth.getUser();

    if (userError || !user) {
      console.log("[notify-message] unauthorized", {
        hasAuthHeader: Boolean(authHeader),
        authHeaderPrefix: authHeader ? authHeader.slice(0, 24) : "",
        hasApiKeyHeader: Boolean(apiKeyHeader),
        apiKeyHeaderPrefix: apiKeyHeader ? apiKeyHeader.slice(0, 16) : "",
        userError: userError?.message ?? null,
      });
      return json(401, {
        error: "Unauthorized",
        debug: {
          hasAuthHeader: Boolean(authHeader),
          authHeaderPrefix: authHeader ? authHeader.slice(0, 16) : "",
          hasApiKeyHeader: Boolean(apiKeyHeader),
        },
      }, origin);
    }

    const body = (await req.json().catch(() => ({}))) as NotifyBody;
    const chatId = (body.chatId ?? "").trim();
    const senderId = (body.senderId ?? "").trim();

    if (!chatId || !senderId) {
      return json(400, { error: "Missing chatId/senderId" }, origin);
    }

    if (senderId !== user.id) {
      return json(403, { error: "senderId mismatch" }, origin);
    }

    // Require sender to be an approved admin.
    const adminCheck = await authedClient
      .from("profiles")
      .select("id, role, status, full_name")
      .eq("id", senderId)
      .maybeSingle();

    if (adminCheck.error) {
      return json(400, { error: adminCheck.error.message }, origin);
    }

    if (!adminCheck.data || adminCheck.data.role !== "admin" || adminCheck.data.status !== "approved") {
      // Only admin messages create push notifications (as requested).
      return json(200, { ok: true, skipped: "not-admin" }, origin);
    }

    // Ensure sender is a member of chat.
    const membership = await authedClient
      .from("chat_members")
      .select("chat_id,user_id")
      .eq("chat_id", chatId)
      .eq("user_id", senderId)
      .maybeSingle();

    if (membership.error) {
      return json(400, { error: membership.error.message }, origin);
    }
    if (!membership.data) {
      return json(403, { error: "Sender is not a chat member" }, origin);
    }

    // Use service role for token lookup (bypasses RLS).
    const service = createClient(url, serviceRoleKey);

    const recipients = await service
      .from("chat_members")
      .select("user_id, profiles:profiles(id, role, status, full_name)")
      .eq("chat_id", chatId)
      .neq("user_id", senderId);

    if (recipients.error) {
      return json(400, { error: recipients.error.message }, origin);
    }

    const recipientIds = (recipients.data ?? [])
      .map((row: any) => row.user_id as string)
      .filter(Boolean);

    if (recipientIds.length === 0) {
      return json(200, { ok: true, sent: 0 }, origin);
    }

    const tokens = await service
      .from("push_tokens")
      .select("user_id, expo_push_token")
      .in("user_id", recipientIds);

    if (tokens.error) {
      return json(400, { error: tokens.error.message }, origin);
    }

    const expoTokens = (tokens.data ?? [])
      .map((row: any) => row.expo_push_token as string)
      // Expo formats: "ExpoPushToken[...]" or legacy "ExponentPushToken[...]"
      .filter((t) => typeof t === "string" && /^(Expo|Exponent)PushToken\[/.test(t));

    if (expoTokens.length === 0) {
      return json(200, { ok: true, sent: 0, reason: "no-tokens" }, origin);
    }

    const title = "Chat Santanita";
    const messageBody = safePreview(body.preview ?? "Mensaje nuevo");

    const payload = expoTokens.map((to) => ({ 
      to, 
      title, 
      body: messageBody, 
      sound: "default", 
      channelId: "messages_v2", 
      data: { chatId }, 
    })); 

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return json(502, { error: "Expo push send failed", status: response.status, body: text }, origin);
    }

    const result = await response.json().catch(() => ({}));
    return json(200, { ok: true, sent: expoTokens.length, result }, origin);
  } catch (error) {
    const origin = req.headers.get("origin") ?? "";
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" }, origin);
  }
});
