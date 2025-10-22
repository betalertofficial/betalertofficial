
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { alertService } from "@/services/alertService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2 } from "lucide-react";
import type { Alert } from "@/types/database";

export function History() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAlerts = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const data = await alertService.getUserAlerts(user.id);
      setAlerts(data);
    } catch (error) {
      console.error("Error loading alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [user]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  };

  const formatOdds = (value: number) => {
    return value > 0 ? `+${value}` : value.toString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Alert History</h2>

      {alerts.length === 0 ? (
        <div className="text-center py-12 glass-panel rounded-lg">
          <p className="text-muted-foreground">No alerts yet. Create triggers to start receiving alerts!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const trigger = alert.trigger_match?.trigger;
            const snapshot = alert.trigger_match?.odds_snapshot;
            
            return (
              <div key={alert.id} className="glass-panel rounded-lg p-4 animate-slide-in">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold">{trigger?.team_or_player}</h3>
                      <Badge 
                        className={
                          alert.delivery_status === "sent" 
                            ? "bg-primary text-primary-foreground" 
                            : alert.delivery_status === "failed"
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {alert.delivery_status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{trigger?.sport}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(alert.created_at)}</p>
                </div>

                <div className="bg-muted/30 rounded-lg p-3 mb-3">
                  <p className="text-sm">{alert.message}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Bet Type</p>
                    <p className="font-semibold capitalize">{trigger?.bet_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Matched Odds</p>
                    <p className="font-semibold">{formatOdds(Number(alert.trigger_match?.matched_value))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Bookmaker</p>
                    <p className="font-semibold">{snapshot?.bookmaker}</p>
                  </div>
                  {snapshot?.deep_link_url && (
                    <div className="col-span-2 md:col-span-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => window.open(snapshot.deep_link_url, "_blank")}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Place Bet
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
