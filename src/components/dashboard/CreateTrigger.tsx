
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Bell, TrendingUp } from "lucide-react";
import { oddsApiService, type OddsApiEvent } from "@/services/oddsApiService";
import { triggerService } from "@/services/triggerService";
import type { BetType, TriggerFrequency } from "@/types/database";

interface CreateTriggerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface TeamOdds {
  moneyline?: number;
  spread?: { point: number; odds: number };
}

const GAME_TIME_CONTEXTS = {
  basketball_nba: [
    { value: "anytime", label: "Anytime" },
    { value: "pregame", label: "Pre-game" },
    { value: "q1_or_later", label: "Q1 or later" },
    { value: "q2_or_later", label: "Q2 or later" },
    { value: "q3_or_later", label: "Q3 or later" },
    { value: "q4_or_later", label: "Q4 or later" }
  ],
  americanfootball_nfl: [
    { value: "anytime", label: "Anytime" },
    { value: "pregame", label: "Pre-game" },
    { value: "q1_or_later", label: "Q1 or later" },
    { value: "q2_or_later", label: "Q2 or later" },
    { value: "q3_or_later", label: "Q3 or later" },
    { value: "q4_or_later", label: "Q4 or later" }
  ],
  icehockey_nhl: [
    { value: "anytime", label: "Anytime" },
    { value: "pregame", label: "Pre-game" },
    { value: "p1_or_later", label: "1st period or later" },
    { value: "p2_or_later", label: "2nd period or later" },
    { value: "p3_or_later", label: "3rd period or later" }
  ],
  baseball_mlb: [
    { value: "anytime", label: "Anytime" },
    { value: "pregame", label: "Pre-game" },
    { value: "i1_or_later", label: "1st inning or later" },
    { value: "i2_or_later", label: "2nd inning or later" },
    { value: "i3_or_later", label: "3rd inning or later" },
    { value: "i4_or_later", label: "4th inning or later" },
    { value: "i5_or_later", label: "5th inning or later" },
    { value: "i6_or_later", label: "6th inning or later" },
    { value: "i7_or_later", label: "7th inning or later" },
    { value: "i8_or_later", label: "8th inning or later" },
    { value: "i9_or_later", label: "9th inning or later" }
  ],
  default: [
    { value: "anytime", label: "Anytime" },
    { value: "pregame", label: "Pre-game" },
    { value: "live", label: "Live only" }
  ]
};

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
  const [selectedEvent, setSelectedEvent] = useState<OddsApiEvent | null>(null);
  const [teamOdds, setTeamOdds] = useState<TeamOdds | null>(null);
  
  const [betType, setBetType] = useState<BetType>("moneyline");
  const [oddsSign, setOddsSign] = useState<"+" | "-">("+");
  const [oddsValue, setOddsValue] = useState("");
  const [oddsDirection, setOddsDirection] = useState<"higher" | "lower">("higher");
  const [gameTimeContext, setGameTimeContext] = useState("anytime");
  const [frequency, setFrequency] = useState<TriggerFrequency>("once");

  const gameTimeOptions = GAME_TIME_CONTEXTS[selectedSport as keyof typeof GAME_TIME_CONTEXTS] || GAME_TIME_CONTEXTS.default;

  useEffect(() => {
    if (open) {
      loadSports();
    }
  }, [open]);

  useEffect(() => {
    if (selectedSport) {
      loadOddsForSport();
      setGameTimeContext("anytime");
    }
  }, [selectedSport]);

  useEffect(() => {
    if (selectedTeam && events.length > 0) {
      loadTeamOdds();
    }
  }, [selectedTeam, sportsbook, events]);

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

  const loadTeamOdds = () => {
    const event = events.find(e => 
      e.home_team === selectedTeam || e.away_team === selectedTeam
    );

    if (!event) {
      setSelectedEvent(null);
      setTeamOdds(null);
      return;
    }

    setSelectedEvent(event);

    const bookmakerKey = sportsbook === "fanduel" ? "fanduel" : "draftkings";
    const bookmaker = event.bookmakers.find(b => b.key === bookmakerKey);

    if (!bookmaker) {
      setTeamOdds(null);
      return;
    }

    const odds: TeamOdds = {};

    const h2hMarket = bookmaker.markets.find(m => m.key === "h2h");
    if (h2hMarket) {
      const outcome = h2hMarket.outcomes.find(o => o.name === selectedTeam);
      if (outcome) {
        odds.moneyline = outcome.price;
      }
    }

    const spreadMarket = bookmaker.markets.find(m => m.key === "spreads");
    if (spreadMarket) {
      const outcome = spreadMarket.outcomes.find(o => o.name === selectedTeam);
      if (outcome && outcome.point !== undefined) {
        odds.spread = { point: outcome.point, odds: outcome.price };
      }
    }

    setTeamOdds(odds);
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

      const numericValue = parseFloat(oddsValue);
      const finalOddsValue = oddsSign === "-" ? -numericValue : numericValue;
      const oddsComparator = oddsDirection === "higher" ? ">=" : "<=";

      await triggerService.createTrigger(user.id, {
        sport: selectedSportTitle,
        team_or_player: selectedTeam,
        bet_type: betType,
        odds_comparator: oddsComparator,
        odds_value: finalOddsValue,
        frequency,
        status: "active",
        vendor_id: oddsApiVendor.id
      });

      onSuccess();
      onOpenChange(false);
      
      setSearchQuery("");
      setSelectedTeam("");
      setSelectedEvent(null);
      setTeamOdds(null);
      setOddsValue("");
      setGameTimeContext("anytime");
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

  const formatOdds = (odds: number) => {
    return odds > 0 ? `+${odds}` : odds.toString();
  };

  const isGameLive = (commenceTime: string) => {
    const gameTime = new Date(commenceTime);
    const now = new Date();
    const diffHours = (now.getTime() - gameTime.getTime()) / (1000 * 60 * 60);
    return diffHours > 0 && diffHours < 3;
  };

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
            {searchQuery && filteredTeams.length > 0 && !selectedTeam && (
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

          {selectedEvent && teamOdds && (
            <div className="bg-[#242B33] border border-border rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Current Market Context</h3>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <span>Current game:</span>
                <span className="text-foreground font-medium">
                  {selectedEvent.home_team} vs {selectedEvent.away_team}
                </span>
                {isGameLive(selectedEvent.commence_time) && (
                  <Badge className="bg-red-600 text-white">LIVE</Badge>
                )}
              </div>

              {teamOdds.moneyline !== undefined && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Live moneyline odds for {selectedTeam} on {sportsbook === "fanduel" ? "FanDuel" : "DraftKings"}:
                  </p>
                  <div className="bg-[#1B2229] rounded-lg p-3">
                    <Badge className="bg-[#2A3139] text-foreground mb-2">
                      {sportsbook === "fanduel" ? "FanDuel" : "DraftKings"}: {formatOdds(teamOdds.moneyline)}
                    </Badge>
                    <p className="text-sm">
                      Current {sportsbook === "fanduel" ? "FanDuel" : "DraftKings"} odds:{" "}
                      <span className="text-primary font-bold">{formatOdds(teamOdds.moneyline)}</span>
                    </p>
                  </div>
                </div>
              )}

              {teamOdds.spread && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Live spread odds for {selectedTeam} on {sportsbook === "fanduel" ? "FanDuel" : "DraftKings"}:
                  </p>
                  <div className="bg-[#1B2229] rounded-lg p-3">
                    <Badge className="bg-[#2A3139] text-foreground mb-2">
                      {sportsbook === "fanduel" ? "FanDuel" : "DraftKings"}: {formatOdds(teamOdds.spread.point)} ({formatOdds(teamOdds.spread.odds)})
                    </Badge>
                    <p className="text-sm">
                      Current {sportsbook === "fanduel" ? "FanDuel" : "DraftKings"} odds:{" "}
                      <span className="text-primary font-bold">{formatOdds(teamOdds.spread.point)}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

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
            <div className="grid grid-cols-7 gap-3">
              <Select value={oddsSign} onValueChange={(v) => setOddsSign(v as "+" | "-")}>
                <SelectTrigger className="col-span-1 bg-[#242B33] border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="+">+</SelectItem>
                  <SelectItem value="-">-</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="200"
                value={oddsValue}
                onChange={(e) => setOddsValue(e.target.value)}
                className="col-span-3 bg-[#242B33] border-border"
              />
              <Select value={oddsDirection} onValueChange={(v) => setOddsDirection(v as "higher" | "lower")}>
                <SelectTrigger className="col-span-3 bg-[#242B33] border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="higher">or higher</SelectItem>
                  <SelectItem value="lower">or lower</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Game Time Context</Label>
            <Select value={gameTimeContext} onValueChange={setGameTimeContext}>
              <SelectTrigger className="bg-[#242B33] border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {gameTimeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
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
