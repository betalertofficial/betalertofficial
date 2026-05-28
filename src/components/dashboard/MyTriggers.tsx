import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { triggerService } from "@/services/triggerService";
import { CreateTrigger } from "./CreateTrigger";
import { ActiveTriggerRow } from "./ActiveTriggerRow";
import { CompletedTriggerRow } from "./CompletedTriggerRow";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, RefreshCw } from "lucide-react";
import type { ProfileTrigger } from "@/types/database";

export function MyTriggers() {
  const { user, profile, loading: authLoading } = useAuth();
  const [triggers, setTriggers] = useState<ProfileTrigger[]>([]);
  const [completedTriggers, setCompletedTriggers] = useState<ProfileTrigger[]>([]);
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
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
  }, [user?.id, authLoading]);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">My Triggers</h2>
        <Button
          onClick={() => setCreateModalOpen(true)}
          disabled={remaining <= 0}
          className="btn-primary"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Trigger
        </Button>
      </div>

      {remaining <= 0 && (
        <div className="bg-accent/10 border border-accent/20 text-accent px-4 py-3 rounded-lg">
          You have reached your trigger limit. Pause or delete existing triggers to create new ones.
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "active" | "completed")}
        className="w-full"
      >
        <div className="flex items-center gap-2">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="active">Active ({activeTriggers.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedTriggers.length})</TabsTrigger>
          </TabsList>
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            title="Refresh"
            disabled={loading}
            onClick={loadTriggers}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        <TabsContent value="active" className="mt-6">
          {activeTriggers.length === 0 ? (
            <div className="text-center py-12 glass-panel rounded-lg">
              <p className="text-muted-foreground mb-4">
                No active triggers yet. Create your first trigger to get started!
              </p>
              <Button onClick={() => setCreateModalOpen(true)} className="btn-primary">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Trigger
              </Button>
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

        <TabsContent value="completed" className="mt-6">
          {completedTriggers.length === 0 ? (
            <div className="text-center py-12 glass-panel rounded-lg">
              <p className="text-muted-foreground">No completed triggers yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {completedTriggers.map((pt) => (
                <CompletedTriggerRow
                  key={pt.id}
                  profileTrigger={pt}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateTrigger
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={loadTriggers}
      />
    </div>
  );
}
