import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Bell, TrendingUp, Calendar, X, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { oddsApiService, type OddsApiEvent } from "@/services/oddsApiService";
import { triggerService } from "@/services/triggerService";
import { teamsService, type Team } from "@/services/teamsService";
import type { BetType, TriggerFrequency } from "@/types/database";
import { GameCard, type GameCardData } from "./GameCard";

export interface CreateTriggerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onBack?: () => void;
  onSuccess?: () => void;
  initialSport?: string;
  initialTeam?: string;
  initialTeamId?: string;
  initialEvent?: any;
  initialCard?: GameCardData;
}

interface TeamOdds {
  moneyline?: number;
  spread?: { point: number; odds: number };
}

interface GameScore {
  home_score?: string;
  away_score?: string;
}

interface ESPNSituation {
  balls: number;
  strikes: number;
  outs: number;
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
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

// Soccer leagues (key prefix "soccer_*") share the same in-game minute thresholds.
const SOCCER_GAME_TIME_CONTEXT = [
  { value: "anytime", label: "Anytime" },
  { value: "pregame", label: "Pre-game" },
  { value: "live", label: "Live only" },
  { value: "m15_or_later", label: "15 min or later" },
  { value: "m30_or_later", label: "30 min or later" },
  { value: "m45_or_later", label: "45 min or later" },
  { value: "m60_or_later", label: "60 min or later" },
  { value: "m75_or_later", label: "75 min or later" }
];

const SPORT_DISPLAY_NAMES: Record<string, string> = {
  "basketball_nba": "NBA",
  "americanfootball_nfl": "NFL",
  "icehockey_nhl": "NHL",
  "baseball_mlb": "MLB"
};

export function CreateTrigger({ open, onOpenChange, onBack, onSuccess, initialSport, initialTeam, initialTeamId, initialEvent, initialCard }: CreateTriggerProps) {
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
  // The dashboard game card the user tapped (renders as the modal header).
  const [selectedCard, setSelectedCard] = useState<GameCardData | null>(null);
  const [teamOdds, setTeamOdds] = useState<TeamOdds | null>(null);
  const [gameScores, setGameScores] = useState<Map<string, GameScore>>(new Map());
  // Maps odds event.id → ESPN live period string, e.g. "Q3 10:15" or "Top 4th"
  const [espnGameDetails, setEspnGameDetails] = useState<Map<string, string>>(new Map());
  // Maps odds event.id → live baseball situation (BSO + bases)
  const [espnSituations, setEspnSituations] = useState<Map<string, ESPNSituation>>(new Map());
  const [showNextDay, setShowNextDay] = useState(false);
  const [gameFilterQuery, setGameFilterQuery] = useState("");

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

  const gameTimeOptions = selectedSport.startsWith("soccer")
    ? SOCCER_GAME_TIME_CONTEXT
    : (GAME_TIME_CONTEXTS[selectedSport as keyof typeof GAME_TIME_CONTEXTS] || GAME_TIME_CONTEXTS.default);
  // When opened pre-filled (dashboard quick-create), skip league/team pickers.
  const isPrefilled = Boolean(initialTeam);

  // Seed selection state when opened pre-filled (dashboard quick-create)
  useEffect(() => {
    if (!open) return;
    if (initialSport !== undefined) {
      setSelectedSport(initialSport);
      if (typeof SPORT_DISPLAY_NAMES !== "undefined") setSelectedSportTitle(SPORT_DISPLAY_NAMES[initialSport] || initialSport);
    }
    if (initialTeam !== undefined) setSelectedTeam(initialTeam);
    if (initialTeamId !== undefined) setSelectedTeamId(initialTeamId);
    if (initialEvent !== undefined) setSelectedEvent(initialEvent ?? null);
    // Reset each open: present only when launched from an Active Games card.
    setSelectedCard(initialCard ?? null);
    // Fresh threshold defaults each open (live odds prefill overrides below).
    setOddsSign("+");
    setOddsValue("200");
    setOddsDirection("higher");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      const situationsMap = new Map<string, ESPNSituation>();

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

        // MLB live situation: balls, strikes, outs, bases
        const sit = competition.situation;
        const situation: ESPNSituation | null = sit
          ? {
              balls:    sit.balls    ?? 0,
              strikes:  sit.strikes  ?? 0,
              outs:     sit.outs     ?? 0,
              onFirst:  sit.onFirst  ?? false,
              onSecond: sit.onSecond ?? false,
              onThird:  sit.onThird  ?? false,
            }
          : null;

        for (const oddsEvent of oddsEvents) {
          const homeMatch =
            oddsEvent.home_team.toLowerCase().includes(espnHomeName.toLowerCase()) ||
            espnHomeName.toLowerCase().includes(oddsEvent.home_team.toLowerCase());
          const awayMatch =
            oddsEvent.away_team.toLowerCase().includes(espnAwayName.toLowerCase()) ||
            espnAwayName.toLowerCase().includes(oddsEvent.away_team.toLowerCase());

          if (homeMatch && awayMatch) {
            detailsMap.set(oddsEvent.id, detail);
            if (situation) situationsMap.set(oddsEvent.id, situation);
            break;
          }
        }
      }

      setEspnGameDetails(detailsMap);
      setEspnSituations(situationsMap);
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

          // Soccer leagues (key prefix "soccer_*") use in-game minute thresholds.
          const sportMap = selectedSport.startsWith("soccer")
            ? { m: "minute" }
            : periodTypeMap[selectedSport];
          if (sportMap && sportMap[periodPrefix]) {
            timePeriodType = sportMap[periodPrefix];
          }
        }
      }

      // Event-bind "once" triggers created from a game card to THAT exact game,
      // so the alert means "just this game" (not the team's next game). Pick the
      // Odds API event whose team matches and whose commence is closest to the
      // tapped card's start (handles same-day doubleheaders / next-day dupes).
      // Falls back to team-level "once" when no confident game match is found.
      let boundEventId: string | null = null;
      let boundEventCommence: string | null = null;
      if (frequency === "once" && selectedCard) {
        const cardMs = selectedCard.commenceTime ? new Date(selectedCard.commenceTime).getTime() : NaN;
        const team = selectedTeam.toLowerCase();
        let best: { e: OddsApiEvent; d: number } | null = null;
        for (const e of events) {
          const home = e.home_team.toLowerCase();
          const away = e.away_team.toLowerCase();
          const teamMatch = home.includes(team) || away.includes(team) || team.includes(home) || team.includes(away);
          if (!teamMatch) continue;
          const d = Number.isNaN(cardMs) ? 0 : Math.abs(new Date(e.commence_time).getTime() - cardMs);
          if (!best || d < best.d) best = { e, d };
        }
        if (best && best.d <= 6 * 60 * 60 * 1000) {
          boundEventId = best.e.id;
          boundEventCommence = best.e.commence_time;
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
        bookmaker: null,
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
        bookmaker: null,
        time_period_type: timePeriodType,
        time_period_min: timePeriodMin,
        event_id: boundEventId,
        event_commence: boundEventCommence
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

  // Live context for the selected game — shown in the form after team selection
  const selectedLiveDetail = selectedEvent ? espnGameDetails.get(selectedEvent.id) : undefined;
  const selectedLiveScore = selectedEvent ? gameScores.get(selectedEvent.id) : undefined;
  const selectedGameIsLive = selectedEvent ? isGameLive(selectedEvent.commence_time) : false;
  const selectedSituation = selectedEvent ? espnSituations.get(selectedEvent.id) : undefined;

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

  // Select bet type and pre-fill odds threshold from current live odds
  const handleBetTypeSelect = (type: BetType) => {
    setBetType(type);
    // Threshold pre-fill from current live odds is handled by the effect below
    // (keyed on [teamOdds, betType]) so it also fires on initial team selection.
  };

  // The current live odds for the selected team + bet type (null if unavailable).
  const currentLiveOdds =
    betType === "spread" ? teamOdds?.spread?.odds ?? null : teamOdds?.moneyline ?? null;

  // Pre-fill the Odds Threshold with the team's CURRENT live odds, rounded to the
  // nearest 10 (the picker steps by 10), whenever live odds load or bet type changes.
  useEffect(() => {
    if (currentLiveOdds === null || currentLiveOdds === undefined) return;
    setOddsSign(currentLiveOdds >= 0 ? "+" : "-");
    setOddsValue(String(Math.min(2500, Math.max(100, Math.round(Math.abs(currentLiveOdds) / 10) * 10))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLiveOdds]);

  const getTeamOddsForGame = (event: OddsApiEvent, teamName: string): number | null => {
    const bookmakerKey = sportsbook === "fanduel" ? "fanduel" : "draftkings";
    const bookmaker = event.bookmakers.find(b => b.key === bookmakerKey);
    if (!bookmaker) return null;
    const h2hMarket = bookmaker.markets.find(m => m.key === "h2h");
    if (!h2hMarket) return null;
    const outcome = h2hMarket.outcomes.find(o => o.name === teamName);
    return outcome ? outcome.price : null;
  };

  const getTeamSpreadForGame = (event: OddsApiEvent, teamName: string): { point: number; odds: number } | null => {
    const bookmakerKey = sportsbook === "fanduel" ? "fanduel" : "draftkings";
    const bookmaker = event.bookmakers.find(b => b.key === bookmakerKey);
    if (!bookmaker) return null;
    const spreadMarket = bookmaker.markets.find(m => m.key === "spreads");
    if (!spreadMarket) return null;
    const outcome = spreadMarket.outcomes.find(o => o.name === teamName);
    return outcome && outcome.point !== undefined ? { point: outcome.point, odds: outcome.price } : null;
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
            {!isPrefilled && (
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
            )}

            {/* Game Selection Grid */}
            {selectedSport && events.length > 0 && !selectedTeam && !isPrefilled && (
              <div className="space-y-3">
                {/* Header: label + refresh */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    <Label className="text-sm font-medium text-foreground">
                      Available Games ({
                        (() => {
                          const base = showNextDay ? events : todayEvents;
                          return gameFilterQuery
                            ? base.filter(e =>
                                e.away_team.toLowerCase().includes(gameFilterQuery.toLowerCase()) ||
                                e.home_team.toLowerCase().includes(gameFilterQuery.toLowerCase())
                              ).length
                            : base.length;
                        })()
                      })
                    </Label>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Refresh odds & game data"
                    disabled={loading}
                    onClick={loadOddsForSport}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Search filter */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter by team…"
                    value={gameFilterQuery}
                    onChange={(e) => setGameFilterQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-md text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className={`grid gap-3 max-h-[400px] overflow-y-auto ${selectedSport === "baseball_mlb" ? "grid-cols-1" : "grid-cols-3"}`}>
                  {(showNextDay ? events : todayEvents)
                    .filter(event =>
                      !gameFilterQuery ||
                      event.away_team.toLowerCase().includes(gameFilterQuery.toLowerCase()) ||
                      event.home_team.toLowerCase().includes(gameFilterQuery.toLowerCase())
                    )
                    .map((event) => {
                    const gameTime = formatGameTime(event.commence_time);
                    const isLive = isGameLive(event.commence_time);
                    const score = gameScores.get(event.id);
                    const awayOdds = getTeamOddsForGame(event, event.away_team);
                    const homeOdds = getTeamOddsForGame(event, event.home_team);
                    const awaySpread = getTeamSpreadForGame(event, event.away_team);
                    const homeSpread = getTeamSpreadForGame(event, event.home_team);
                    const espnDetail = espnGameDetails.get(event.id);
                    const situation = espnSituations.get(event.id);

                    // ── Wide baseball card ──────────────────────────────────────
                    if (selectedSport === "baseball_mlb") {
                      return (
                        <div key={event.id} className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary transition-colors">
                          {/* Header: inning + LIVE */}
                          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border/40">
                            <span className={`text-sm font-semibold ${isLive && espnDetail ? "text-orange-500" : "text-muted-foreground"}`}>
                              {isLive && espnDetail ? espnDetail : gameTime}
                            </span>
                            {isLive && <Badge className="bg-red-600 text-white text-xs">LIVE</Badge>}
                          </div>

                          {/* Away | Home two-column */}
                          <div className="grid grid-cols-2 divide-x divide-border/40">
                            <button
                              type="button"
                              className="text-left p-4 hover:bg-muted/40 transition-colors"
                              onClick={() => handleGameSelect(event, event.away_team)}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-semibold text-foreground truncate pr-2">{event.away_team}</span>
                                {score?.away_score && (
                                  <span className="text-2xl font-bold text-foreground shrink-0">{score.away_score}</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                {awayOdds !== null && (
                                  <div>{formatOdds(awayOdds)} <span className="opacity-50">ML</span></div>
                                )}
                                {awaySpread && (
                                  <div>{formatOdds(awaySpread.odds)} <span className="opacity-50">({formatOdds(awaySpread.point)})</span></div>
                                )}
                              </div>
                            </button>
                            <button
                              type="button"
                              className="text-left p-4 hover:bg-muted/40 transition-colors"
                              onClick={() => handleGameSelect(event, event.home_team)}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-semibold text-foreground truncate pr-2">{event.home_team}</span>
                                {score?.home_score && (
                                  <span className="text-2xl font-bold text-foreground shrink-0">{score.home_score}</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                {homeOdds !== null && (
                                  <div>{formatOdds(homeOdds)} <span className="opacity-50">ML</span></div>
                                )}
                                {homeSpread && (
                                  <div>{formatOdds(homeSpread.odds)} <span className="opacity-50">({formatOdds(homeSpread.point)})</span></div>
                                )}
                              </div>
                            </button>
                          </div>

                          {/* Live situation strip: bases diamond + BSO */}
                          {isLive && situation && (
                            <div className="border-t border-border/40 px-4 py-2.5 flex items-center gap-5">
                              {/* Base diamond */}
                              <div className="relative shrink-0" style={{ width: 30, height: 24 }}>
                                {/* 2B - top center */}
                                <div
                                  style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 10, height: 10 }}
                                  className={`rounded-sm ${situation.onSecond ? "bg-yellow-400" : "border border-muted-foreground/40"}`}
                                />
                                {/* 3B - middle left */}
                                <div
                                  style={{ position: "absolute", top: "50%", left: 0, transform: "translateY(-50%) rotate(45deg)", width: 10, height: 10 }}
                                  className={`rounded-sm ${situation.onThird ? "bg-yellow-400" : "border border-muted-foreground/40"}`}
                                />
                                {/* 1B - middle right */}
                                <div
                                  style={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%) rotate(45deg)", width: 10, height: 10 }}
                                  className={`rounded-sm ${situation.onFirst ? "bg-yellow-400" : "border border-muted-foreground/40"}`}
                                />
                              </div>

                              {/* Balls (max 3) */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">B</span>
                                <div className="flex gap-0.5">
                                  {[0,1,2,3].map(i => (
                                    <div key={i} className={`w-2 h-2 rounded-full ${i < situation.balls ? "bg-green-400" : "bg-muted-foreground/25"}`} />
                                  ))}
                                </div>
                              </div>

                              {/* Strikes (max 2) */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">S</span>
                                <div className="flex gap-0.5">
                                  {[0,1,2].map(i => (
                                    <div key={i} className={`w-2 h-2 rounded-full ${i < situation.strikes ? "bg-yellow-400" : "bg-muted-foreground/25"}`} />
                                  ))}
                                </div>
                              </div>

                              {/* Outs (max 2) */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">O</span>
                                <div className="flex gap-0.5">
                                  {[0,1,2].map(i => (
                                    <div key={i} className={`w-2 h-2 rounded-full ${i < situation.outs ? "bg-red-400" : "bg-muted-foreground/25"}`} />
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // ── Compact card (NBA / other sports) ───────────────────────
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
                              <div className="text-sm font-medium text-foreground truncate">{event.away_team}</div>
                              {score?.away_score && (
                                <div className="text-sm font-bold text-foreground ml-2">{score.away_score}</div>
                              )}
                            </div>
                            {awayOdds !== null && (
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                <div>{formatOdds(awayOdds)} <span className="opacity-50">ML</span></div>
                                {awaySpread && (
                                  <div>{formatOdds(awaySpread.odds)} <span className="opacity-50">({formatOdds(awaySpread.point)})</span></div>
                                )}
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
                              <div className="text-sm font-medium text-foreground truncate">{event.home_team}</div>
                              {score?.home_score && (
                                <div className="text-sm font-bold text-foreground ml-2">{score.home_score}</div>
                              )}
                            </div>
                            {homeOdds !== null && (
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                <div>{formatOdds(homeOdds)} <span className="opacity-50">ML</span></div>
                                {homeSpread && (
                                  <div>{formatOdds(homeSpread.odds)} <span className="opacity-50">({formatOdds(homeSpread.point)})</span></div>
                                )}
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

            {!selectedTeam && !isPrefilled && (
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
              </div>
            )}

            {/* Game card matching the dashboard — shown when opened from a game card. */}
            {selectedCard && (
              <div className="space-y-2">
                <GameCard data={selectedCard} selectedTeam={selectedTeam} onSelectTeam={(t) => setSelectedTeam(t)} />
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSelectedTeam("");
                    setSelectedTeamId("");
                    setSelectedEvent(null);
                    setSelectedCard(null);
                    setTeamOdds(null);
                  }}
                >
                  Change game
                </button>
              </div>
            )}

            {/* ── Persistent game card (manual flow: team picked via search/odds) ── */}
            {!selectedCard && selectedTeam && selectedEvent && (
              <div className="bg-card border-2 border-primary/30 rounded-lg overflow-hidden">
                {/* Header */}
                <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border/40">
                  <span className={`text-sm font-semibold ${selectedGameIsLive && selectedLiveDetail ? "text-orange-500" : "text-muted-foreground"}`}>
                    {selectedGameIsLive && selectedLiveDetail ? selectedLiveDetail : formatGameTime(selectedEvent.commence_time)}
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedGameIsLive && <Badge className="bg-red-600 text-white text-xs">LIVE</Badge>}
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Change selection"
                      onClick={() => { setSelectedTeam(""); setSelectedTeamId(""); setSelectedEvent(null); setTeamOdds(null); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Teams — 2-col for baseball, vertical for others */}
                {selectedSport === "baseball_mlb" ? (
                  <div className="grid grid-cols-2 divide-x divide-border/40">
                    {[
                      { name: selectedEvent.away_team, score: selectedLiveScore?.away_score },
                      { name: selectedEvent.home_team, score: selectedLiveScore?.home_score },
                    ].map(({ name, score }) => (
                      <div key={name} className={`p-4 ${selectedTeam === name ? "bg-primary/5" : ""}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-semibold truncate pr-2 ${selectedTeam === name ? "text-primary" : "text-foreground"}`}>
                            {name}
                          </span>
                          {score && <span className="text-2xl font-bold text-foreground shrink-0">{score}</span>}
                        </div>
                        {selectedTeam === name && (
                          <p className="text-xs text-primary/70 font-medium">your pick</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 space-y-1">
                    {[
                      { name: selectedEvent.away_team, score: selectedLiveScore?.away_score },
                      null,
                      { name: selectedEvent.home_team, score: selectedLiveScore?.home_score },
                    ].map((item, i) =>
                      item === null ? (
                        <div key="sep" className="text-xs text-muted-foreground text-center py-0.5">@</div>
                      ) : (
                        <div key={item.name} className={`flex items-center justify-between px-2 py-1.5 rounded ${selectedTeam === item.name ? "bg-primary/5" : ""}`}>
                          <span className={`font-semibold ${selectedTeam === item.name ? "text-primary" : "text-foreground"}`}>
                            {item.name}
                            {selectedTeam === item.name && <span className="text-xs text-primary/70 font-normal ml-2">your pick</span>}
                          </span>
                          {item.score && <span className="text-xl font-bold text-foreground">{item.score}</span>}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Live situation strip (baseball) */}
                {selectedGameIsLive && selectedSituation && (
                  <div className="border-t border-border/40 px-4 py-2.5 flex items-center gap-5">
                    <div className="relative shrink-0" style={{ width: 30, height: 24 }}>
                      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 10, height: 10 }}
                           className={`rounded-sm ${selectedSituation.onSecond ? "bg-yellow-400" : "border border-muted-foreground/40"}`} />
                      <div style={{ position: "absolute", top: "50%", left: 0, transform: "translateY(-50%) rotate(45deg)", width: 10, height: 10 }}
                           className={`rounded-sm ${selectedSituation.onThird ? "bg-yellow-400" : "border border-muted-foreground/40"}`} />
                      <div style={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%) rotate(45deg)", width: 10, height: 10 }}
                           className={`rounded-sm ${selectedSituation.onFirst ? "bg-yellow-400" : "border border-muted-foreground/40"}`} />
                    </div>
                    {[
                      { label: "B", max: 4, count: selectedSituation.balls,   color: "bg-green-400" },
                      { label: "S", max: 3, count: selectedSituation.strikes, color: "bg-yellow-400" },
                      { label: "O", max: 3, count: selectedSituation.outs,    color: "bg-red-400" },
                    ].map(({ label, max, count, color }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: max }).map((_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full ${i < count ? color : "bg-muted-foreground/25"}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fallback pill when team was selected via search (no event context) */}
            {!selectedCard && selectedTeam && !selectedEvent && (
              <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Selected team</p>
                  <p className="font-semibold text-foreground">{selectedTeam}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => { setSelectedTeam(""); setSelectedTeamId(""); setSelectedEvent(null); setTeamOdds(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Bet Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`flex flex-col items-start p-4 rounded-lg border-2 transition-all ${
                    betType === "moneyline" ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
                  }`}
                  onClick={() => handleBetTypeSelect("moneyline")}
                >
                  <p className="text-sm font-semibold text-foreground">Moneyline</p>
                  {teamOdds?.moneyline !== undefined && (
                    <p className="text-xl font-bold text-primary mt-0.5">{formatOdds(teamOdds.moneyline)}</p>
                  )}
                </button>
                <button
                  type="button"
                  className={`flex flex-col items-start p-4 rounded-lg border-2 transition-all ${
                    betType === "spread" ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
                  }`}
                  onClick={() => handleBetTypeSelect("spread")}
                >
                  <p className="text-sm font-semibold text-foreground">Spread</p>
                  {teamOdds?.spread && (
                    <div className="mt-0.5">
                      <span className="text-xl font-bold text-primary">{formatOdds(teamOdds.spread.odds)}</span>
                      <span className="text-sm text-muted-foreground ml-1.5">({formatOdds(teamOdds.spread.point)})</span>
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-foreground">Odds Threshold</Label>
                {currentLiveOdds !== null && currentLiveOdds !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    now <span className="font-semibold text-foreground">{formatOdds(currentLiveOdds)}</span>
                  </span>
                )}
              </div>

              {/* iOS-style vertical wheel picker in one container:
                  [ +/- ] [ number (steps of 10) ] [ Higher / Lower ] */}
              <OddsPicker
                sign={oddsSign}
                onSign={setOddsSign}
                magnitude={oddsValue || "200"}
                onMagnitude={setOddsValue}
                direction={oddsDirection}
                onDirection={setOddsDirection}
              />
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
                  <p className="font-semibold text-foreground mb-1">Just this game</p>
                  <p className="text-sm text-muted-foreground text-left">
                    Alert fires once for the current game
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
                  <p className="font-semibold text-foreground mb-1">This game and future games</p>
                  <p className="text-sm text-muted-foreground text-left">
                    Alert fires each game the threshold is met
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

// ── iOS-style vertical wheel odds picker ────────────────────────────────────
const ODDS_MIN = 100;
const ODDS_MAX = 2500;
const ODDS_STEP = 10;
const ROW_H = 36; // px per row
const VISIBLE = 5; // rows shown (odd → the middle row is the selection)
const WHEEL_PAD = ((VISIBLE - 1) / 2) * ROW_H; // top/bottom spacer

interface WheelOption {
  value: string;
  label: string;
}

/**
 * One vertical scroll-snap wheel column (iOS picker style). The row centered in
 * the selection band is the selected value; neighbours fade with distance.
 */
function Wheel({ options, value, onChange }: { options: WheelOption[]; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);

  let idx = options.findIndex((o) => o.value === value);
  if (idx < 0) idx = 0;

  // Center the column on the current value (mount + external changes).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = idx * ROW_H;
    if (Math.abs(el.scrollTop - target) > 2) {
      programmatic.current = true;
      el.scrollTop = target;
      window.setTimeout(() => {
        programmatic.current = false;
      }, 60);
    }
  }, [idx]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el || programmatic.current) return;
    const i = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ROW_H)));
    const v = options[i]?.value;
    if (v !== undefined && v !== value) onChange(v);
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="h-full overflow-y-auto snap-y snap-mandatory [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      <div style={{ height: WHEEL_PAD }} />
      {options.map((o, i) => {
        const dist = Math.abs(i - idx);
        const opacity = dist === 0 ? 1 : dist === 1 ? 0.4 : dist === 2 ? 0.18 : 0.08;
        return (
          <div
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex cursor-pointer snap-center items-center justify-center tabular-nums text-foreground ${dist === 0 ? "text-lg font-bold" : "text-base"}`}
            style={{ height: ROW_H, opacity }}
          >
            {o.label}
          </div>
        );
      })}
      <div style={{ height: WHEEL_PAD }} />
    </div>
  );
}

const SIGN_OPTIONS: WheelOption[] = [
  { value: "+", label: "+" },
  { value: "-", label: "−" },
];
const DIRECTION_OPTIONS: WheelOption[] = [
  { value: "higher", label: "Higher" },
  { value: "lower", label: "Lower" },
];

/**
 * Odds Threshold picker: one container with three vertical wheels —
 * sign (+/−) · magnitude (steps of 10) · direction (Higher/Lower) — with a
 * center selection band, mirroring an iOS date/time picker.
 */
function OddsPicker({
  sign,
  onSign,
  magnitude,
  onMagnitude,
  direction,
  onDirection,
}: {
  sign: "+" | "-";
  onSign: (v: "+" | "-") => void;
  magnitude: string;
  onMagnitude: (v: string) => void;
  direction: "higher" | "lower";
  onDirection: (v: "higher" | "lower") => void;
}) {
  const magnitudeOptions = useMemo<WheelOption[]>(() => {
    const arr: WheelOption[] = [];
    for (let v = ODDS_MIN; v <= ODDS_MAX; v += ODDS_STEP) arr.push({ value: String(v), label: String(v) });
    return arr;
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card" style={{ height: VISIBLE * ROW_H }}>
      {/* center selection band */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-y border-primary/40 bg-primary/5"
        style={{ height: ROW_H }}
      />
      <div className="flex h-full">
        <div className="w-16 shrink-0 border-r border-border/50">
          <Wheel options={SIGN_OPTIONS} value={sign} onChange={(v) => onSign(v as "+" | "-")} />
        </div>
        <div className="min-w-0 flex-1">
          <Wheel options={magnitudeOptions} value={magnitude} onChange={onMagnitude} />
        </div>
        <div className="w-28 shrink-0 border-l border-border/50">
          <Wheel options={DIRECTION_OPTIONS} value={direction} onChange={(v) => onDirection(v as "higher" | "lower")} />
        </div>
      </div>
    </div>
  );
}
