import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { triggerService } from "@/services/triggerService";
import { TriggerStats } from "./TriggerStats";
import { TriggerCard } from "./TriggerCard";
import { CreateTrigger } from "./CreateTrigger";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import type { ProfileTrigger } from "@/types/database";

export function MyTriggers() {
  const { user, profile, loading: authLoading } = useAuth();
  const [triggers, setTriggers] = useState<ProfileTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ active: 0, completed: 0, paused: 0, total: 0 });
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const loadTriggers = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      console.log("[MyTriggers] Loading triggers for user:", user.id);
      const data = await triggerService.getUserTriggers(user.id);
      console.log("[MyTriggers] Triggers loaded:", data.length);
      setTriggers(data);
      
      const statsData = await triggerService.getTriggerStats(user.id);
      console.log("[MyTriggers] Stats loaded:", statsData);
      setStats(statsData);
    } catch (error) {
      console.error("[MyTriggers] Error loading triggers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTriggers();
  }, [user]);

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

  // Calculate remaining triggers with proper null checking
  const remaining = profile?.trigger_limit ? profile.trigger_limit - stats.active : 0;
  
  console.log("[MyTriggers] Profile:", profile);
  console.log("[MyTriggers] Stats:", stats);
  console.log("[MyTriggers] Remaining triggers:", remaining);

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

      <TriggerStats 
        active={stats.active} 
        completed={stats.completed} 
        remaining={remaining}
      />

      {remaining <= 0 && (
        <div className="bg-accent/10 border border-accent/20 text-accent px-4 py-3 rounded-lg">
          You have reached your trigger limit. Pause or delete existing triggers to create new ones.
        </div>
      )}

      {triggers.length === 0 ? (
        <div className="text-center py-12 glass-panel rounded-lg">
          <p className="text-muted-foreground mb-4">No triggers yet. Create your first trigger to get started!</p>
          <Button onClick={() => setCreateModalOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Trigger
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {triggers.map((pt) => (
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

      <CreateTrigger 
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={loadTriggers}
      />
    </div>
  );
}
