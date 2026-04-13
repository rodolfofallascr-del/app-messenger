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

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function noContent() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
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
    // CORS preflight
    if (req.method === "OPTIONS") {
      return noContent();
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
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
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authedClient.auth.getUser();

    if (userError || !user) {
      return json(401, {
        error: "Unauthorized",
        debug: {
          hasAuthHeader: Boolean(authHeader),
          authHeaderPrefix: authHeader ? authHeader.slice(0, 16) : "",
          hasApiKeyHeader: Boolean(apiKeyHeader),
        },
      });
    }

    const body = (await req.json().catch(() => ({}))) as NotifyBody;
    const chatId = (body.chatId ?? "").trim();
    const senderId = (body.senderId ?? "").trim();

    if (!chatId || !senderId) {
      return json(400, { error: "Missing chatId/senderId" });
    }

    if (senderId !== user.id) {
      return json(403, { error: "senderId mismatch" });
    }

    // Require sender to be an approved admin.
    const adminCheck = await authedClient
      .from("profiles")
      .select("id, role, status, full_name")
      .eq("id", senderId)
      .maybeSingle();

    if (adminCheck.error) {
      return json(400, { error: adminCheck.error.message });
    }

    if (!adminCheck.data || adminCheck.data.role !== "admin" || adminCheck.data.status !== "approved") {
      // Only admin messages create push notifications (as requested).
      return json(200, { ok: true, skipped: "not-admin" });
    }

    // Ensure sender is a member of chat.
    const membership = await authedClient
      .from("chat_members")
      .select("chat_id,user_id")
      .eq("chat_id", chatId)
      .eq("user_id", senderId)
      .maybeSingle();

    if (membership.error) {
      return json(400, { error: membership.error.message });
    }
    if (!membership.data) {
      return json(403, { error: "Sender is not a chat member" });
    }

    // Use service role for token lookup (bypasses RLS).
    const service = createClient(url, serviceRoleKey);

    const recipients = await service
      .from("chat_members")
      .select("user_id, profiles:profiles(id, role, status, full_name)")
      .eq("chat_id", chatId)
      .neq("user_id", senderId);

    if (recipients.error) {
      return json(400, { error: recipients.error.message });
    }

    const recipientIds = (recipients.data ?? [])
      .map((row: any) => row.user_id as string)
      .filter(Boolean);

    if (recipientIds.length === 0) {
      return json(200, { ok: true, sent: 0 });
    }

    const tokens = await service
      .from("push_tokens")
      .select("user_id, expo_push_token")
      .in("user_id", recipientIds);

    if (tokens.error) {
      return json(400, { error: tokens.error.message });
    }

    const expoTokens = (tokens.data ?? [])
      .map((row: any) => row.expo_push_token as string)
      // Expo formats: "ExpoPushToken[...]" or legacy "ExponentPushToken[...]"
      .filter((t) => typeof t === "string" && /^(Expo|Exponent)PushToken\[/.test(t));

    if (expoTokens.length === 0) {
      return json(200, { ok: true, sent: 0, reason: "no-tokens" });
    }

    const title = "Chat Santanita";
    const messageBody = safePreview(body.preview ?? "Mensaje nuevo");

    const payload = expoTokens.map((to) => ({
      to,
      title,
      body: messageBody,
      sound: "default",
      channelId: "messages",
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
      return json(502, { error: "Expo push send failed", status: response.status, body: text });
    }

    const result = await response.json().catch(() => ({}));
    return json(200, { ok: true, sent: expoTokens.length, result });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
