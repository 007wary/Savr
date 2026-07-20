import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const CRON_SECRET = Deno.env.get("BACKUP_REMINDER_CRON_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const FIREBASE_SERVICE_ACCOUNT_RAW = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

    if (!CRON_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FIREBASE_SERVICE_ACCOUNT_RAW) {
      console.error("send-backup-reminder misconfigured: missing required secret(s)");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const providedSecret = req.headers.get("x-cron-secret");
    if (providedSecret !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const FIREBASE_SERVICE_ACCOUNT = JSON.parse(FIREBASE_SERVICE_ACCOUNT_RAW);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: users, error } = await supabase
      .from("user_profiles")
      .select("id, fcm_token")
      .not("fcm_token", "is", null);

    if (error) throw new Error(`Supabase error: ${JSON.stringify(error)}`);

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ message: "No users found" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build Firebase JWT
    const now = Math.floor(Date.now() / 1000);
    const encode = (obj: object) =>
      btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const headerB64 = encode({ alg: "RS256", typ: "JWT" });
    const payloadB64 = encode({
      iss: FIREBASE_SERVICE_ACCOUNT.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });
    const signingInput = `${headerB64}.${payloadB64}`;

    const pemContents = FIREBASE_SERVICE_ACCOUNT.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\n/g, "");

    const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(signingInput)
    );

    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const firebaseJwt = `${signingInput}.${signatureB64}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${firebaseJwt}`,
    });

    if (!tokenResponse.ok) {
      const tokenErr = await tokenResponse.text();
      throw new Error(`Firebase token exchange failed: ${tokenErr}`);
    }

    const { access_token: accessToken } = await tokenResponse.json();
    const projectId = FIREBASE_SERVICE_ACCOUNT.project_id;

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      if (!user.fcm_token) continue;
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: user.fcm_token,
              data: { type: "silent_backup" },
              android: { priority: "normal" },
            },
          }),
        }
      );
      if (res.ok) successCount++;
      else failCount++;
    }

    return new Response(
      JSON.stringify({ message: "Done", successCount, failCount, totalUsers: users.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-backup-reminder error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
