
import { Activity, CheckCircle2, Pause } from "lucide-react";

interface TriggerStatsProps {
  active: number;
  completed: number;
  remaining: number;
}

export function TriggerStats({ active, completed, remaining }: TriggerStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="stat-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Active</p>
            <p className="text-3xl font-bold text-primary mt-1">{active}</p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Activity className="h-6 w-6 text-primary" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Completed</p>
            <p className="text-3xl font-bold text-muted-foreground mt-1">{completed}</p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Remaining</p>
            <p className="text-3xl font-bold text-foreground mt-1">{remaining}</p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-card flex items-center justify-center">
            <Pause className="h-6 w-6 text-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}
