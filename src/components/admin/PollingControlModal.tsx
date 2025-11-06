import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface PollingControlModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function PollingControlModal({ isOpen, onOpenChange }: PollingControlModalProps) {
  const [isPollingEnabled, setIsPollingEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchPollingStatus();
    }
  }, [isOpen]);

  const fetchPollingStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/polling");
      if (!response.ok) {
        throw new Error("Failed to fetch status");
      }
      const data = await response.json();
      setIsPollingEnabled(data.polling_enabled);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not fetch API polling status.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePolling = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/polling", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ polling_enabled: !isPollingEnabled }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }
      const data = await response.json();
      setIsPollingEnabled(data.setting.value);
      toast({
        title: "Success",
        description: `API polling has been ${data.setting.value ? "enabled" : "disabled"}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not update API polling status.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>API Polling Control</DialogTitle>
          <DialogDescription>
            Manually turn the 1-minute odds API polling on or off. This affects the `evaluate-triggers` function.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <p>Loading status...</p>
          ) : (
            <div className="flex items-center space-x-2">
              <Switch
                id="polling-switch"
                checked={isPollingEnabled}
                onCheckedChange={handleTogglePolling}
                disabled={isLoading}
              />
              <Label htmlFor="polling-switch">
                {isPollingEnabled ? "Polling is ON" : "Polling is OFF"}
              </Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}