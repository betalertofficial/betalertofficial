import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { triggerService } from "@/services/triggerService";
import { CreateTrigger } from "./CreateTrigger";
import { TriggerCard } from "./TriggerCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2 } from "lucide-react";
import type { ProfileTrigger } from "@/types/database";

export function MyTriggers() {
  const { user, profile, loading: authLoading } = useAuth();
  const [triggers, setTriggers] = useState<ProfileTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  const loadTriggers = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      console.log("[MyTriggers] Loading triggers for user:", user.id);
      const data = await triggerService.getUserTriggers(user.id);
      console.log("[MyTriggers] Triggers loaded:", data.length);
      setTriggers(data);
    } catch (error) {
      console.error("[MyTriggers] Error loading triggers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only reload triggers when the user's ID changes (on login/logout),
    // not when the session token is refreshed in the background.
    if (user?.id) {
      loadTriggers();
    } else if (!authLoading) {
      // If auth has loaded and there's no user, clear the state.
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

  const handleEdit = (triggerId: string) => {
    console.log("Edit trigger:", triggerId);
  };

  // Filter triggers based on active tab
  const activeTriggers = triggers.filter(t => t.trigger?.status === "active" || t.trigger?.status === "paused");
  const completedTriggers = triggers.filter(t => t.trigger?.status === "completed");

  // Calculate active triggers count for the limit check
  const activeCount = triggers.filter(t => t.trigger?.status === "active").length;
  const remaining = profile?.trigger_limit ? profile.trigger_limit - activeCount : 0;

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show warning if profile isn't loaded yet
  if (!profile) {
    return (
      <div className="space-y-6">
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 px-4 py-3 rounded-lg">
          <p className="font-semibold">Loading your profile...</p>
          <p className="text-sm mt-1">If this persists, try refreshing the page.</p>
        </div>
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "completed")} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="active">
            Active ({activeTriggers.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedTriggers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          {activeTriggers.length === 0 ? (
            <div className="text-center py-12 glass-panel rounded-lg">
              <p className="text-muted-foreground mb-4">No active triggers yet. Create your first trigger to get started!</p>
              <Button onClick={() => setCreateModalOpen(true)} className="btn-primary">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Trigger
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeTriggers.map((pt) => (
                <TriggerCard
                  key={pt.id}
                  profileTrigger={pt}
                  onPause={handlePause}
                  onResume={handleResume}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedTriggers.map((pt) => (
                <TriggerCard
                  key={pt.id}
                  profileTrigger={pt}
                  onPause={handlePause}
                  onResume={handleResume}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
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