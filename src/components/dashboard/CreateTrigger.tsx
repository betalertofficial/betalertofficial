import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Bell, TrendingUp, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { oddsApiService, type OddsApiEvent } from "@/services/oddsApiService";
import { triggerService } from "@/services/triggerService";
import { teamsService, type Team } from "@/services/teamsService";
import type { BetType, TriggerFrequency } from "@/types/database";

export interface CreateTriggerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onBack?: () => void;
  onSuccess?: () => void;
}

interface TeamOdds {
  moneyline?: number;
  spread?: { point: number; odds: number };
}

interface GameScore {
  home_score?: string;
  away_score?: string;
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

const SPORT_DISPLAY_NAMES: Record<string, string> = {
  "basketball_nba": "NBA",
  "americanfootball_nfl": "NFL",
  "icehockey_nhl": "NHL",
  "baseball_mlb": "MLB"
};

export function CreateTrigger({ open, onOpenChange, onBack, onSuccess }: CreateTriggerProps) {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [subjectType, setSubjectType] = useState<"team" | "player">("team");
  const [sports, setSports] = useState<any[]>([]);
  const [selectedSport, setSelectedSport] = useState("basketball_nba");
  const [selectedSportTitle, setSelectedSportTitle] = useState("");
  
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sportsbook, setSportsbook] = useState<"fanduel" | "draftkings">("fanduel");
  const [events, setEvents] = useState<OddsApiEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<OddsApiEvent | null>(null);
  const [teamOdds, setTeamOdds] = useState<TeamOdds | null>(null);
  const [gameScores, setGameScores] = useState<Map<string, GameScore>>(new Map());
  // Maps odds event.id → ESPN live period string, e.g. "Q3 10:15" or "Top 4th"
  const [espnGameDetails, setEspnGameDetails] = useState<Map<string, string>>(new Map());
  const [showNextDay, setShowNextDay] = useState(false);

  // ESPN public scoreboard URLs (no auth, CORS-friendly)
  const ESPN_SPORT_URLS: Record<string, string> = {
    basketball_nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
    baseball_mlb:   "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
  };
  
  const [betType, setBetType] = useState<BetType>("moneyline");
  const [oddsSign, setOddsSign] = useState<"+" | "-">("+");
  const [oddsValue, setOddsValue] = useState("");
  const [oddsDirection, setOddsDirection] = useState<"higher" | "lower">("higher");
  const [gameTimeContext, setGameTimeContext] = useState("anytime");
  const [frequency, setFrequency] = useState<TriggerFrequency>("once");

  const gameTimeOptions = GAME_TIME_CONTEXTS[selectedSport as keyof typeof GAME_TIME_CONTEXTS] || GAME_TIME_CONTEXTS.default;

  useEffect(() => {
    loadSports();
  }, []);

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

  // Load teams when sport changes
  useEffect(() => {
    const loadTeamsForLeague = async () => {
      if (!selectedSport) return;
      
      try {
        setLoading(true);
        // Map sport key to league name in database
        const leagueMap: Record<string, string> = {
          "basketball_nba": "nba",
          "baseball_mlb": "mlb"
        };
        
        const league = leagueMap[selectedSport];
        if (!league) {
          console.warn(`No league mapping found for sport: ${selectedSport}`);
          setTeams([]);
          return;
        }

        console.log(`Loading teams for league: ${league}`);
        const fetchedTeams = await teamsService.getTeamsByLeague(league);
        console.log(`Loaded ${fetchedTeams.length} teams:`, fetchedTeams);
        setTeams(fetchedTeams);
      } catch (error) {
        console.error("Error loading teams:", error);
        toast({
          title: "Error loading teams",
          description: "Failed to load teams from database",
          variant: "destructive"
        });
        setTeams([]);
      } finally {
        setLoading(false);
      }
    };

    loadTeamsForLeague();
  }, [selectedSport, toast]);

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

  /**
   * Fetch ESPN scoreboard for the sport and match each live game to an
   * Odds API event by team-name substring. Stores period detail strings
   * (e.g. "Q3 10:15", "Top 4th") in espnGameDetails keyed by event.id.
   */
  const loadESPNGameTimes = async (sport: string, oddsEvents: OddsApiEvent[]) => {
    const espnUrl = ESPN_SPORT_URLS[sport];
    if (!espnUrl || oddsEvents.length === 0) return;

    try {
      const response = await fetch(espnUrl);
      if (!response.ok) return;
      const data = await response.json();

      const detailsMap = new Map<string, string>();

      for (const espnEvent of data.events || []) {
        const competition = espnEvent.competitions?.[0];
        if (!competition) continue;

        const status = competition.status;
        if (status?.type?.state !== "in") continue; // only care about in-progress games

        const espnHome = competition.competitors?.find((c: any) => c.homeAway === "home");
        const espnAway = competition.competitors?.find((c: any) => c.homeAway === "away");
        if (!espnHome || !espnAway) continue;

        const espnHomeName: string = espnHome.team.displayName;
        const espnAwayName: string = espnAway.team.displayName;
        // shortDetail is compact: "Q3 10:15", "Top 4th", "HT", etc.
        const detail: string = status.type.shortDetail || status.type.detail || "";

        for (const oddsEvent of oddsEvents) {
          const homeMatch =
            oddsEvent.home_team.toLowerCase().includes(espnHomeName.toLowerCase()) ||
            espnHomeName.toLowerCase().includes(oddsEvent.home_team.toLowerCase());
          const awayMatch =
            oddsEvent.away_team.toLowerCase().includes(espnAwayName.toLowerCase()) ||
            espnAwayName.toLowerCase().includes(oddsEvent.away_team.toLowerCase());

          if (homeMatch && awayMatch) {
            detailsMap.set(oddsEvent.id, detail);
            break;
          }
        }
      }

      setEspnGameDetails(detailsMap);
    } catch (err) {
      console.error("[CreateTrigger] ESPN game times error:", err);
    }
  };

  const loadOddsForSport = async () => {
    if (!selectedSport) return;

    try {
      setLoading(true);
      const data = await oddsApiService.getOddsForSport(selectedSport);
      setEvents(data);

      // Load scores + ESPN period info in parallel (both non-critical)
      const [, scores] = await Promise.allSettled([
        loadESPNGameTimes(selectedSport, data),
        oddsApiService.getScores(selectedSport),
      ]);

      if (scores.status === "fulfilled") {
        const scoresMap = new Map<string, GameScore>();
        scores.value.forEach(scoreData => {
          if (scoreData.scores && Array.isArray(scoreData.scores)) {
            const homeScore = scoreData.scores.find(s => s.name === scoreData.home_team);
            const awayScore = scoreData.scores.find(s => s.name === scoreData.away_team);
            scoresMap.set(scoreData.id, {
              home_score: homeScore?.score,
              away_score: awayScore?.score,
            });
          }
        });
        setGameScores(scoresMap);
      }
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
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
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

      // Parse time period from gameTimeContext
      let timePeriodType: string | null = null;
      let timePeriodMin: number | null = null;

      if (gameTimeContext !== "anytime" && gameTimeContext !== "pregame" && gameTimeContext !== "live") {
        // Parse formats like "q1_or_later", "i3_or_later", "p2_or_later"
        const match = gameTimeContext.match(/^([a-z])(\d+)_or_later$/);
        if (match) {
          const periodPrefix = match[1];
          timePeriodMin = parseInt(match[2], 10);

          // Map prefix to period type based on sport
          const periodTypeMap: Record<string, Record<string, string>> = {
            basketball_nba: { q: "quarter" },
            americanfootball_nfl: { q: "quarter" },
            icehockey_nhl: { p: "period" },
            baseball_mlb: { i: "inning" }
          };

          const sportMap = periodTypeMap[selectedSport];
          if (sportMap && sportMap[periodPrefix]) {
            timePeriodType = sportMap[periodPrefix];
          }
        }
      }

      console.log("Creating trigger with data:", {
        sport: selectedSport,
        team_or_player: selectedTeam,
        team_id: selectedTeamId || null,
        bet_type: betType,
        odds_comparator: oddsComparator,
        odds_value: finalOddsValue,
        frequency,
        status: "active",
        vendor_id: oddsApiVendor.id,
        bookmaker: sportsbook,
        time_period_type: timePeriodType,
        time_period_min: timePeriodMin
      });

      const trigger = await triggerService.createTrigger(user.id, {
        sport: selectedSport,
        team_or_player: selectedTeam,
        team_id: selectedTeamId || null,
        bet_type: betType,
        odds_comparator: oddsComparator,
        odds_value: finalOddsValue,
        frequency,
        status: "active",
        vendor_id: oddsApiVendor.id,
        bookmaker: sportsbook,
        time_period_type: timePeriodType,
        time_period_min: timePeriodMin
      });

      toast({
        title: "Success!",
        description: "Trigger created successfully",
      });

      if (onSuccess) {
        onSuccess();
      }
      
      setSearchQuery("");
      setSelectedTeam("");
      setSelectedTeamId("");
      setSelectedEvent(null);
      setTeamOdds(null);
      setOddsValue("");
      setGameTimeContext("anytime");
    } catch (error: any) {
      console.error("Error creating trigger:", error);
      toast({
        title: "Error Creating Trigger",
        description: error.message || "Failed to create trigger. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredTeams = teams.filter(team => 
    team.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatOdds = (odds: number) => {
    return odds > 0 ? `+${odds}` : odds.toString();
  };

  const isGameLive = (commenceTime: string) => {
    const gameTime = new Date(commenceTime);
    const now = new Date();
    const diffHours = (now.getTime() - gameTime.getTime()) / (1000 * 60 * 60);
    return diffHours > 0 && diffHours < 3;
  };

  const isGameToday = (commenceTime: string) => {
    const gameTime = new Date(commenceTime);
    const now = new Date();
    return gameTime.toDateString() === now.toDateString();
  };

  const isGameTomorrow = (commenceTime: string) => {
    const gameTime = new Date(commenceTime);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return gameTime.toDateString() === tomorrow.toDateString();
  };

  const formatGameTime = (commenceTime: string) => {
    const gameTime = new Date(commenceTime);
    const now = new Date();
    const diffHours = (now.getTime() - gameTime.getTime()) / (1000 * 60 * 60);
    
    if (diffHours > 0 && diffHours < 3) {
      return "LIVE";
    }
    
    const today = new Date();
    const isToday = gameTime.toDateString() === today.toDateString();
    
    if (isToday) {
      return gameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    
    return gameTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + 
           gameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const handleGameSelect = (event: OddsApiEvent, team: string) => {
    const selectedTeamData = teams.find(t => t.name === team);
    setSelectedTeam(team);
    setSelectedTeamId(selectedTeamData?.id || "");
    setSearchQuery("");
  };

  const getTeamOddsForGame = (event: OddsApiEvent, teamName: string): number | null => {
    const bookmakerKey = sportsbook === "fanduel" ? "fanduel" : "draftkings";
    const bookmaker = event.bookmakers.find(b => b.key === bookmakerKey);
    
    if (!bookmaker) return null;
    
    const h2hMarket = bookmaker.markets.find(m => m.key === "h2h");
    if (!h2hMarket) return null;
    
    const outcome = h2hMarket.outcomes.find(o => o.name === teamName);
    return outcome ? outcome.price : null;
  };

  // Filter events into today's and tomorrow's games
  const todayEvents = events.filter(event => {
    const gameTime = new Date(event.commence_time);
    const now = new Date();
    const diffHours = (now.getTime() - gameTime.getTime()) / (1000 * 60 * 60);
    const isLive = diffHours > 0 && diffHours < 3;
    return isLive || isGameToday(event.commence_time);
  });

  const tomorrowEvents = events.filter(event => isGameTomorrow(event.commence_time));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-foreground">Create Trigger</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Subject Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={subjectType === "team" ? "default" : "outline"}
                  className={subjectType === "team" ? "btn-primary" : "bg-card hover:bg-muted"}
                  onClick={() => setSubjectType("team")}
                >
                  Team
                </Button>
                <Button
                  type="button"
                  variant={subjectType === "player" ? "default" : "outline"}
                  className={subjectType === "player" ? "btn-primary" : "bg-card hover:bg-muted"}
                  onClick={() => setSubjectType("player")}
                  disabled
                >
                  Player
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">League</Label>
              <Select value={selectedSport} onValueChange={(v) => {
                setSelectedSport(v);
                const sport = sports.find(s => s.key === v);
                setSelectedSportTitle(sport?.title || v);
                setSelectedTeam("");
                setSearchQuery("");
              }}>
                <SelectTrigger className="w-full bg-card border-border text-foreground">
                  <SelectValue placeholder="Select league" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="basketball_nba" className="text-foreground hover:bg-muted">
                    NBA
                  </SelectItem>
                  <SelectItem value="baseball_mlb" className="text-foreground hover:bg-muted">
                    MLB
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Sportsbook</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={sportsbook === "fanduel" ? "default" : "outline"}
                  className={sportsbook === "fanduel" ? "btn-primary" : "bg-card hover:bg-muted"}
                  onClick={() => setSportsbook("fanduel")}
                >
                  FanDuel
                </Button>
                <Button
                  type="button"
                  variant={sportsbook === "draftkings" ? "default" : "outline"}
                  className={sportsbook === "draftkings" ? "btn-primary" : "bg-card hover:bg-muted"}
                  onClick={() => setSportsbook("draftkings")}
                >
                  DraftKings
                </Button>
              </div>
            </div>

            {/* Game Selection Grid */}
            {selectedSport && events.length > 0 && !selectedTeam && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <Label className="text-sm font-medium text-foreground">
                    Available Games ({showNextDay ? events.length : todayEvents.length})
                  </Label>
                </div>
                <div className="grid grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
                  {(showNextDay ? events : todayEvents).map((event) => {
                    const gameTime = formatGameTime(event.commence_time);
                    const isLive = isGameLive(event.commence_time);
                    const score = gameScores.get(event.id);
                    const awayOdds = getTeamOddsForGame(event, event.away_team);
                    const homeOdds = getTeamOddsForGame(event, event.home_team);
                    
                    const espnDetail = espnGameDetails.get(event.id);

                    return (
                      <div key={event.id} className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary transition-colors">
                        <div className="p-3 space-y-2">
                          <div className="flex items-center justify-between mb-1">
                            {isLive && espnDetail ? (
                              <span className="text-xs font-semibold text-orange-500">{espnDetail}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">{gameTime}</span>
                            )}
                            {isLive && (
                              <Badge className="bg-red-600 text-white text-xs">LIVE</Badge>
                            )}
                          </div>
                          
                          <button
                            type="button"
                            className="w-full text-left hover:bg-muted/50 p-2 rounded transition-colors"
                            onClick={() => handleGameSelect(event, event.away_team)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-sm font-medium text-foreground truncate">
                                {event.away_team}
                              </div>
                              {score?.away_score && (
                                <div className="text-sm font-bold text-foreground ml-2">
                                  {score.away_score}
                                </div>
                              )}
                            </div>
                            {awayOdds !== null && (
                              <div className="text-xs text-muted-foreground">
                                {formatOdds(awayOdds)}
                              </div>
                            )}
                          </button>
                          
                          <div className="text-xs text-muted-foreground text-center">@</div>
                          
                          <button
                            type="button"
                            className="w-full text-left hover:bg-muted/50 p-2 rounded transition-colors"
                            onClick={() => handleGameSelect(event, event.home_team)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-sm font-medium text-foreground truncate">
                                {event.home_team}
                              </div>
                              {score?.home_score && (
                                <div className="text-sm font-bold text-foreground ml-2">
                                  {score.home_score}
                                </div>
                              )}
                            </div>
                            {homeOdds !== null && (
                              <div className="text-xs text-muted-foreground">
                                {formatOdds(homeOdds)}
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {!showNextDay && tomorrowEvents.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-card hover:bg-muted"
                    onClick={() => setShowNextDay(true)}
                  >
                    Show next day's available odds ({tomorrowEvents.length} games)
                  </Button>
                )}
                
                {showNextDay && tomorrowEvents.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-card hover:bg-muted"
                    onClick={() => setShowNextDay(false)}
                  >
                    Hide next day's games
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Team</Label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={loading ? "Loading teams..." : "Search teams..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={loading || !selectedSport}
                  className="w-full px-4 py-2 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                />
                {searchQuery && filteredTeams.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredTeams.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted rounded-md transition-colors"
                        onClick={() => {
                          setSelectedTeam(team.name);
                          setSelectedTeamId(team.id);
                          setSearchQuery("");
                        }}
                      >
                        <div className="font-medium text-foreground">{team.name}</div>
                        <div className="text-sm text-muted-foreground">{team.abbrev}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedTeam && (
                <div className="text-sm text-muted-foreground">
                  Selected: <span className="text-foreground font-medium">{selectedTeam}</span>
                </div>
              )}
            </div>

            {selectedEvent && teamOdds && (
              <div className="bg-card border border-border rounded-lg p-4 space-y-4">
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
                    <div className="bg-muted rounded-lg p-3">
                      <Badge className="bg-secondary text-secondary-foreground mb-2">
                        {sportsbook === "fanduel" ? "FanDuel" : "DraftKings"}: {formatOdds(teamOdds.moneyline)}
                      </Badge>
                      <p className="text-sm text-foreground">
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
                    <div className="bg-muted rounded-lg p-3">
                      <Badge className="bg-secondary text-secondary-foreground mb-2">
                        {sportsbook === "fanduel" ? "FanDuel" : "DraftKings"}: {formatOdds(teamOdds.spread.point)} ({formatOdds(teamOdds.spread.odds)})
                      </Badge>
                      <p className="text-sm text-foreground">
                        Current {sportsbook === "fanduel" ? "FanDuel" : "DraftKings"} odds:{" "}
                        <span className="text-primary font-bold">{formatOdds(teamOdds.spread.point)}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Bet Type</Label>
              <Select value={betType} onValueChange={(v) => setBetType(v as BetType)}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="moneyline">Moneyline</SelectItem>
                  <SelectItem value="spread">Spread</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Odds Threshold</Label>
              <div className="grid grid-cols-7 gap-3">
                <Select value={oddsSign} onValueChange={(v) => setOddsSign(v as "+" | "-")}>
                  <SelectTrigger className="col-span-1 bg-card border-border">
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
                  className="col-span-3 bg-card border-border"
                />
                <Select value={oddsDirection} onValueChange={(v) => setOddsDirection(v as "higher" | "lower")}>
                  <SelectTrigger className="col-span-3 bg-card border-border">
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
              <Label className="text-sm font-medium text-foreground">Game Time Context</Label>
              <Select value={gameTimeContext} onValueChange={setGameTimeContext}>
                <SelectTrigger className="bg-card border-border">
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
              <Label className="text-sm font-medium text-foreground">Notification Frequency</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`flex flex-col items-start p-4 rounded-lg border-2 transition-all ${
                    frequency === "once"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                  onClick={() => setFrequency("once")}
                >
                  <p className="font-semibold text-foreground mb-1">One Time</p>
                  <p className="text-sm text-muted-foreground text-left">
                    Get notified once when the threshold is met
                  </p>
                </button>
                <button
                  type="button"
                  className={`flex flex-col items-start p-4 rounded-lg border-2 transition-all ${
                    frequency === "recurring"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                  onClick={() => setFrequency("recurring")}
                >
                  <p className="font-semibold text-foreground mb-1">Once Per Game</p>
                  <p className="text-sm text-muted-foreground text-left">
                    Get notified each game the threshold is met
                  </p>
                </button>
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
    </>
  );
}