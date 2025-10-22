
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pause, Play, Trash2, Edit } from "lucide-react";
import type { ProfileTrigger } from "@/types/database";

interface TriggerCardProps {
  profileTrigger: ProfileTrigger;
  onPause: (triggerId: string) => void;
  onResume: (triggerId: string) => void;
  onDelete: (triggerId: string) => void;
  onEdit: (triggerId: string) => void;
}

export function TriggerCard({ profileTrigger, onPause, onResume, onDelete, onEdit }: TriggerCardProps) {
  const trigger = profileTrigger.trigger;
  if (!trigger) return null;

  const isActive = trigger.status === "active";
  const isPaused = trigger.status === "paused";
  const isCompleted = trigger.status === "completed";

  const getStatusColor = () => {
    if (isActive) return "bg-primary text-primary-foreground";
    if (isPaused) return "bg-accent text-accent-foreground";
    if (isCompleted) return "bg-muted text-muted-foreground";
    return "bg-secondary text-secondary-foreground";
  };

  const formatOdds = (value: number) => {
    return value > 0 ? `+${value}` : value.toString();
  };

  const getComparatorLabel = (comparator: string) => {
    const labels: Record<string, string> = {
      ">=": "≥",
      "<=": "≤",
      ">": ">",
      "<": "<",
      "==": "="
    };
    return labels[comparator] || comparator;
  };

  return (
    <div className="trigger-card animate-slide-in">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-lg">{trigger.team_or_player}</h3>
            <Badge className={getStatusColor()}>
              {trigger.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{trigger.sport}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Bet Type</p>
          <p className="font-semibold capitalize">{trigger.bet_type}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Condition</p>
          <p className="font-semibold">
            {getComparatorLabel(trigger.odds_comparator)} {formatOdds(Number(trigger.odds_value))}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Frequency</p>
          <p className="font-semibold capitalize">{trigger.frequency}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Bookmakers</p>
          <p className="font-semibold text-xs">FanDuel, DraftKings</p>
        </div>
      </div>

      <div className="flex gap-2">
        {isActive && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 btn-accent"
            onClick={() => onPause(trigger.id)}
          >
            <Pause className="h-4 w-4 mr-1" />
            Pause
          </Button>
        )}
        {isPaused && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 btn-primary"
            onClick={() => onResume(trigger.id)}
          >
            <Play className="h-4 w-4 mr-1" />
            Resume
          </Button>
        )}
        {!isCompleted && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(trigger.id)}
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(trigger.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
