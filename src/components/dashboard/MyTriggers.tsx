import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { triggerService } from "@/services/triggerService";
import { ActiveTriggerRow } from "./ActiveTriggerRow";
import { CompletedTriggerRow } from "./CompletedTriggerRow";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw } from "lucide-react";
import type { ProfileTrigger } from "@/types/database";

export function MyTriggers({ refreshSignal }: { refreshSignal?: number } = {}) {
  const { user, profile, loading: authLoading } = useAuth();
  const [triggers, setTriggers] = useState<ProfileTrigger[]>([]);
  const [completedTriggers, setCompletedTriggers] = useState<ProfileTrigger[]>([]);
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  const loadTriggers = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [activeData, completedRes, pollRes] = await Promise.all([
        triggerService.getUserTriggers(user.id),
        fetch("/api/user/completed-triggers", { credentials: "include" }),
        fetch("/api/user/poll-status"),
      ]);
      const completedJson = await completedRes.json();
      const pollJson = await pollRes.json();
      setTriggers(activeData.filter((t) => t.trigger?.status !== "completed"));
      setCompletedTriggers(completedJson.data ?? []);
      setLastPollAt(pollJson.last_poll_at ?? null);
    } catch (error) {
      console.error("[MyTriggers] Error loading triggers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadTriggers();
    } else if (!authLoading) {
      setTriggers([]);
      setLoading(false);
    }
    // Reload when a trigger is created elsewhere (the dashboard quick-create).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, refreshSignal]);

  const handlePause = async (triggerId: string) => {
    try {
      await triggerService.updateTrigger(triggerId, { status: "paused" });
      loadTriggers();
    } catch (error) {
      console.error("Error pausing trigger:", error);
    }
  };

  const handleResume = async (triggerId: string) => {
    try {
      await triggerService.updateTrigger(triggerId, { status: "active" });
      loadTriggers();
    } catch (error) {
      console.error("Error resuming trigger:", error);
    }
  };

  const handleDelete = async (triggerId: string) => {
    if (!user) return;
    if (!confirm("Are you sure you want to delete this trigger?")) return;
    try {
      await triggerService.deleteTrigger(user.id, triggerId);
      loadTriggers();
    } catch (error) {
      console.error("Error deleting trigger:", error);
    }
  };

  const activeTriggers = triggers.filter(
    (t) => t.trigger?.status === "active" || t.trigger?.status === "paused"
  );
  const activeCount = triggers.filter((t) => t.trigger?.status === "active").length;
  const remaining = profile?.trigger_limit ? profile.trigger_limit - activeCount : 3;

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — triggers are created from the dashboard (tap a team/game). */}
      <h2 className="text-lg font-bold">My Triggers</h2>

      {remaining <= 0 && (
        <div className="rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent">
          You've hit your trigger limit. Pause or delete one to add more.
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "completed")} className="w-full">
        <div className="flex items-center gap-2">
          <TabsList className="grid flex-1 grid-cols-2">
            <TabsTrigger value="active">Active ({activeTriggers.length})</TabsTrigger>
            <TabsTrigger value="completed">Done ({completedTriggers.length})</TabsTrigger>
          </TabsList>
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            title="Refresh"
            disabled={loading}
            onClick={loadTriggers}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <TabsContent value="active" className="mt-4">
          {activeTriggers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-8 px-4 text-center">
              <p className="text-sm text-muted-foreground">No active triggers yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a team or tap a game on the left to create one.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {activeTriggers.map((pt) => (
                <ActiveTriggerRow
                  key={pt.id}
                  profileTrigger={pt}
                  lastPollAt={lastPollAt}
                  onPause={handlePause}
                  onResume={handleResume}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {completedTriggers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-8 px-4 text-center">
              <p className="text-sm text-muted-foreground">No completed triggers yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {completedTriggers.map((pt) => (
                <CompletedTriggerRow key={pt.id} profileTrigger={pt} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
