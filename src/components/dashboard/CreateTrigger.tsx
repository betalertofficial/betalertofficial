
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Bell } from "lucide-react";
import { oddsApiService, type OddsApiEvent } from "@/services/oddsApiService";
import { triggerService } from "@/services/triggerService";
import type { BetType, OddsComparator, TriggerFrequency } from "@/types/database";

interface CreateTriggerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateTrigger({ open, onOpenChange, onSuccess }: CreateTriggerProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [subjectType, setSubjectType] = useState<"team" | "player">("team");
  const [sports, setSports] = useState<any[]>([]);
  const [selectedSport, setSelectedSport] = useState("");
  const [selectedSportTitle, setSelectedSportTitle] = useState("");
  
  const [sportsbook, setSportsbook] = useState<"fanduel" | "draftkings">("fanduel");
  const [searchQuery, setSearchQuery] = useState("");
  const [events, setEvents] = useState<OddsApiEvent[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  
  const [betType, setBetType] = useState<BetType>("moneyline");
  const [oddsComparator, setOddsComparator] = useState<OddsComparator>("<=");
  const [oddsValue, setOddsValue] = useState("");
  const [gameTimeContext, setGameTimeContext] = useState("anytime");
  const [frequency, setFrequency] = useState<TriggerFrequency>("once");

  useEffect(() => {
    if (open) {
      loadSports();
    }
  }, [open]);

  useEffect(() => {
    if (selectedSport) {
      loadOddsForSport();
    }
  }, [selectedSport]);

  const loadSports = async () => {
    try {
      const data = await oddsApiService.getSports();
      const activeSports = data.filter((s: any) => s.active);
      setSports(activeSports);
      
      const nba = activeSports.find((s: any) => s.key === "basketball_nba");
      if (nba) {
        setSelectedSport(nba.key);
        setSelectedSportTitle(nba.title);
      }
    } catch (error) {
      console.error("Error loading sports:", error);
    }
  };

  const loadOddsForSport = async () => {
    if (!selectedSport) return;
    
    try {
      setLoading(true);
      const data = await oddsApiService.getOddsForSport(selectedSport);
      setEvents(data);
    } catch (error) {
      console.error("Error loading odds:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTrigger = async () => {
    if (!user || !selectedTeam || !oddsValue) {
      alert("Please fill in all required fields");
      return;
    }

    try {
      setLoading(true);
      
      const vendorResponse = await fetch("/api/vendors");
      if (!vendorResponse.ok) {
        throw new Error("Failed to fetch vendors");
      }
      
      const vendors = await vendorResponse.json();
      const oddsApiVendor = vendors.find((v: any) => v.name === "the_odds_api");

      if (!oddsApiVendor) {
        throw new Error("Odds API vendor not found. Please contact support.");
      }

      await triggerService.createTrigger(user.id, {
        sport: selectedSportTitle,
        team_or_player: selectedTeam,
        bet_type: betType,
        odds_comparator: oddsComparator,
        odds_value: parseFloat(oddsValue),
        frequency,
        status: "active",
        vendor_id: oddsApiVendor.id
      });

      onSuccess();
      onOpenChange(false);
      
      setSearchQuery("");
      setSelectedTeam("");
      setOddsValue("");
    } catch (error: any) {
      console.error("Error creating trigger:", error);
      alert(error.message || "Failed to create trigger");
    } finally {
      setLoading(false);
    }
  };

  const filteredTeams = events.reduce((acc, event) => {
    const homeTeam = event.home_team;
    const awayTeam = event.away_team;
    
    if (homeTeam.toLowerCase().includes(searchQuery.toLowerCase()) && !acc.includes(homeTeam)) {
      acc.push(homeTeam);
    }
    if (awayTeam.toLowerCase().includes(searchQuery.toLowerCase()) && !acc.includes(awayTeam)) {
      acc.push(awayTeam);
    }
    
    return acc;
  }, [] as string[]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#1B2229] border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground">Create Trigger</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Subject Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={subjectType === "team" ? "default" : "outline"}
                className={subjectType === "team" ? "btn-primary" : "bg-[#242B33] hover:bg-[#2A3139]"}
                onClick={() => setSubjectType("team")}
              >
                Team
              </Button>
              <Button
                type="button"
                variant={subjectType === "player" ? "default" : "outline"}
                className={subjectType === "player" ? "btn-primary" : "bg-[#242B33] hover:bg-[#2A3139]"}
                onClick={() => setSubjectType("player")}
                disabled
              >
                Player
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Sport</Label>
            <Select value={selectedSport} onValueChange={(v) => {
              setSelectedSport(v);
              const sport = sports.find(s => s.key === v);
              setSelectedSportTitle(sport?.title || v);
            }}>
              <SelectTrigger className="bg-[#242B33] border-border">
                <SelectValue placeholder="Select sport" />
              </SelectTrigger>
              <SelectContent>
                {sports.map((sport) => (
                  <SelectItem key={sport.key} value={sport.key}>
                    {sport.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Sportsbook</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={sportsbook === "fanduel" ? "default" : "outline"}
                className={sportsbook === "fanduel" ? "btn-primary" : "bg-[#242B33] hover:bg-[#2A3139]"}
                onClick={() => setSportsbook("fanduel")}
              >
                FanDuel
              </Button>
              <Button
                type="button"
                variant={sportsbook === "draftkings" ? "default" : "outline"}
                className={sportsbook === "draftkings" ? "btn-primary" : "bg-[#242B33] hover:bg-[#2A3139]"}
                onClick={() => setSportsbook("draftkings")}
              >
                DraftKings
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Team</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search for a team..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-[#242B33] border-border"
              />
            </div>
            {searchQuery && filteredTeams.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto bg-[#242B33] border border-border rounded-lg">
                {filteredTeams.slice(0, 5).map((team) => (
                  <button
                    key={team}
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-[#2A3139] transition-colors text-sm"
                    onClick={() => {
                      setSelectedTeam(team);
                      setSearchQuery(team);
                    }}
                  >
                    {team}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Bet Type</Label>
            <Select value={betType} onValueChange={(v) => setBetType(v as BetType)}>
              <SelectTrigger className="bg-[#242B33] border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="moneyline">Moneyline</SelectItem>
                <SelectItem value="spread">Spread</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Odds Threshold</Label>
            <div className="grid grid-cols-5 gap-3">
              <Select 
                value={oddsComparator} 
                onValueChange={(v) => setOddsComparator(v as OddsComparator)}
              >
                <SelectTrigger className="col-span-2 bg-[#242B33] border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=">=">Greater or equal</SelectItem>
                  <SelectItem value="<=">Less or equal</SelectItem>
                  <SelectItem value=">">Greater than</SelectItem>
                  <SelectItem value="<">Less than</SelectItem>
                  <SelectItem value="==">Equal to</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="200"
                value={oddsValue}
                onChange={(e) => setOddsValue(e.target.value)}
                className="col-span-3 bg-[#242B33] border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Game Time Context</Label>
            <Select value={gameTimeContext} onValueChange={setGameTimeContext}>
              <SelectTrigger className="bg-[#242B33] border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anytime">Anytime</SelectItem>
                <SelectItem value="pregame">Pre-game only</SelectItem>
                <SelectItem value="live">Live only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Notification Frequency</Label>
            <div className="bg-[#242B33] border border-border rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-foreground">Once</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You'll be notified the first time the odds threshold is met
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Button
            type="button"
            className="w-full btn-primary h-12 text-base"
            onClick={handleCreateTrigger}
            disabled={loading || !selectedTeam || !oddsValue}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Bell className="h-4 w-4 mr-2" />
                Create Trigger
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
