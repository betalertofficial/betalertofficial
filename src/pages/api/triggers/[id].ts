import type { NextApiRequest, NextApiResponse } from "next";
import { serviceClient, sessionUserId } from "@/lib/serverAuth";

/**
 * PATCH  /api/triggers/:id  { status: "active" | "paused" }
 * DELETE /api/triggers/:id
 *
 * Only the trigger's owner (via profile_triggers) can change or delete it.
 */
const STATUSES = new Set(["active", "paused"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Not signed in" });
  const triggerId = String(req.query.id || "");
  if (!triggerId) return res.status(400).json({ error: "Missing trigger id" });

  let supabase;
  try {
    supabase = serviceClient();
  } catch {
    return res.status(500).json({ error: "Server not configured" });
  }

  const { data: owned } = await supabase
    .from("profile_triggers")
    .select("id")
    .eq("profile_id", userId)
    .eq("trigger_id", triggerId)
    .maybeSingle();
  if (!owned) return res.status(404).json({ error: "Trigger not found" });

  if (req.method === "PATCH") {
    const status = req.body?.status;
    if (typeof status !== "string" || !STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const { data, error } = await supabase
      .from("triggers")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", triggerId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: "Failed to update trigger" });
    return res.status(200).json({ data });
  }

  if (req.method === "DELETE") {
    // Remove the owner link (same behavior as before), and stop the trigger so
    // it can never be polled as an orphan.
    const { error } = await supabase
      .from("profile_triggers")
      .delete()
      .eq("profile_id", userId)
      .eq("trigger_id", triggerId);
    if (error) return res.status(500).json({ error: "Failed to delete trigger" });
    await supabase.from("triggers").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", triggerId);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
