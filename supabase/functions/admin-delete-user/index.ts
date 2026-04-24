// Supabase Edge Function: admin-delete-user
// Permanently deletes a user (Auth + public profile) after verifying the caller is an approved admin.
//
// Deploy:
//   supabase functions deploy admin-delete-user
//
// Expected body:
//   { target_user_id: string }

import { createClient } from "@supabase/supabase-js";

type DeleteBody = {
  target_user_id?: string;
  caller_access_token?: string;
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

function normalizeSupabaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  // Prevent common misconfig: pasting the REST endpoint instead of the project base URL.
  return trimmed.replace(/\/rest\/v1$/i, "");
}

function looksLikeUuid(value: string) {
  // Good enough for input validation.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function probeAuthUserEndpoint(url: string, anonKey: string, accessToken: string) {
  const endpoint = `${url}/auth/v1/user`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text().catch(() => "");
  return {
    endpoint,
    status: res.status,
    contentType,
    bodyPrefix: text.slice(0, 140),
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return noContent();
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const authHeader = req.headers.get("authorization") ?? "";

    const url = normalizeSupabaseUrl(getEnv("SUPABASE_URL"));
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    // Important: do NOT set a global Authorization header here.
    // The admin web may call this function with Authorization=Bearer <anon_key> to satisfy
    // the legacy JWT gateway, but we validate the real caller token via `getUser(callerToken)`.
    const authedClient = createClient(url, anonKey, {
      global: {
        headers: {
          apikey: anonKey,
        },
      },
    });

    const body = (await req.json().catch(() => ({}))) as DeleteBody;
    const targetUserId = (body.target_user_id ?? "").trim();
    const callerToken = (body.caller_access_token ?? "").trim();

    if (!targetUserId || !looksLikeUuid(targetUserId)) {
      return json(400, { error: "Invalid target_user_id" });
    }

    // Identify the caller. We accept either:
    // - a normal auth token in the Authorization header (preferred), OR
    // - a caller_access_token in the body (needed when the gateway enforces legacy JWT on Authorization).
    const tokenToCheck = callerToken || undefined;
    let user: { id: string } | null = null;
    let userError: { message?: string } | null = null;

    try {
      const result = await authedClient.auth.getUser(tokenToCheck);
      user = result.data.user ? { id: result.data.user.id } : null;
      userError = result.error ? { message: result.error.message } : null;
    } catch (err) {
      user = null;
      userError = { message: err instanceof Error ? err.message : "Unknown auth error" };
    }

    if (userError || !user) {
      // Help debug common misconfig where SUPABASE_URL includes /rest/v1 and GoTrue returns HTML.
      let probe: any = null;
      try {
        if (callerToken) {
          probe = await probeAuthUserEndpoint(url, anonKey, callerToken);
        }
      } catch (err) {
        probe = { error: err instanceof Error ? err.message : "Probe failed" };
      }
      return json(401, {
        error: "Unauthorized",
        debug: {
          url,
          hasAuthHeader: Boolean(authHeader),
          hasCallerToken: Boolean(callerToken),
          userError: userError?.message ?? null,
          probe,
        },
      });
    }

    // Prevent accidental lockout.
    if (targetUserId === user.id) {
      return json(400, { error: "No puedes eliminar tu propio usuario admin desde aqui." });
    }

    // Verify caller is an approved admin (via RLS-protected table).
    const adminCheck = await authedClient
      .from("profiles")
      .select("id, role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (adminCheck.error) {
      return json(400, { error: adminCheck.error.message });
    }

    if (!adminCheck.data || adminCheck.data.role !== "admin" || adminCheck.data.status !== "approved") {
      return json(403, { error: "Forbidden" });
    }

    const service = createClient(url, serviceRoleKey);

    // Remove public data first (cascades to chats/messages via FK ON DELETE CASCADE).
    const profileDelete = await service.from("profiles").delete().eq("id", targetUserId);
    if (profileDelete.error) {
      return json(400, { error: profileDelete.error.message });
    }

    // Remove Auth user (in case profile was already removed).
    const authDelete = await service.auth.admin.deleteUser(targetUserId);
    if (authDelete.error) {
      return json(400, { error: authDelete.error.message });
    }

    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
