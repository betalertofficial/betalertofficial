
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { oddsApiService, type OddsApiEvent } from "@/services/oddsApiService";
import { triggerService } from "@/services/triggerService";
import type { BetType, OddsComparator, TriggerFrequency } from "@/types/database";

interface CreateTriggerProps {
  onBack: () => void;
  onSuccess: () => void;
}

export function CreateTrigger({ onBack, onSuccess }: CreateTriggerProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<"sport" | "team" | "odds" | "configure">("sport");
  const [loading, setLoading] = useState(false);
  
  const [sports, setSports] = useState<any[]>([]);
  const [selectedSport, setSelectedSport] = useState("");
  const [selectedSportTitle, setSelectedSportTitle] = useState("");
  
  const [events, setEvents] = useState<OddsApiEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<OddsApiEvent | null>(null);
  const [selectedTeam, setSelectedTeam] = useState("");
  
  const [betType, setBetType] = useState<BetType>("moneyline");
  const [oddsComparator, setOddsComparator] = useState<OddsComparator>("<=");
  const [oddsValue, setOddsValue] = useState("");
  const [frequency, setFrequency] = useState<TriggerFrequency>("once");

  useEffect(() => {
    loadSports();
  }, []);

  const loadSports = async () => {
    try {
      setLoading(true);
      const data = await oddsApiService.getSports();
      const activeSports = data.filter((s: any) => s.active);
      setSports(activeSports);
    } catch (error) {
      console.error("Error loading sports:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSport = async (sportKey: string) => {
    const sport = sports.find(s => s.key === sportKey);
    setSelectedSport(sportKey);
    setSelectedSportTitle(sport?.title || sportKey);
    
    try {
      setLoading(true);
      const data = await oddsApiService.getOddsForSport(sportKey);
      setEvents(data);
      setStep("team");
    } catch (error) {
      console.error("Error loading odds:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTeam = (event: OddsApiEvent, team: string) => {
    setSelectedEvent(event);
    setSelectedTeam(team);
    setStep("odds");
  };

  const handleCreateTrigger = async () => {
    if (!user || !selectedEvent) return;

    try {
      setLoading(true);
      
      const vendorResponse = await fetch("/api/vendors");
      const vendors = await vendorResponse.json();
      const oddsApiVendor = vendors.find((v: any) => v.name === "the_odds_api");

      await triggerService.createTrigger(user.id, {
        sport: selectedSportTitle,
        team_or_player: selectedTeam,
        bet_type: betType,
        odds_comparator: oddsComparator,
        odds_value: parseFloat(oddsValue),
        frequency,
        status: "active",
        vendor_id: oddsApiVendor?.id
      });

      onSuccess();
    } catch (error) {
      console.error("Error creating trigger:", error);
      alert("Failed to create trigger");
    } finally {
      setLoading(false);
    }
  };

  const formatOdds = (value: number) => {
    return value > 0 ? `+${value}` : value.toString();
  };

  if (step === "sport") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h2 className="text-2xl font-bold">Create Trigger - Select Sport</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sports.map((sport) => (
              <Card
                key={sport.key}
                className="glass-panel cursor-pointer hover:border-primary/50 transition-all"
                onClick={() => handleSelectSport(sport.key)}
              >
                <CardHeader>
                  <CardTitle className="text-lg">{sport.title}</CardTitle>
                  <CardDescription>{sport.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === "team") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setStep("sport")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h2 className="text-2xl font-bold">Select Team - {selectedSportTitle}</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 glass-panel rounded-lg">
            <p className="text-muted-foreground">No upcoming games found for this sport.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <Card key={event.id} className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-base">
                    {event.home_team} vs {event.away_team}
                  </CardTitle>
                  <CardDescription>
                    {new Date(event.commence_time).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button
                    className="flex-1 btn-primary"
                    onClick={() => handleSelectTeam(event, event.home_team)}
                  >
                    {event.home_team}
                  </Button>
                  <Button
                    className="flex-1 btn-primary"
                    onClick={() => handleSelectTeam(event, event.away_team)}
                  >
                    {event.away_team}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === "odds" && selectedEvent) {
    const moneylineOdds = oddsApiService.extractMoneylineOdds(selectedEvent, selectedTeam);
    const spreadOdds = oddsApiService.extractSpreadOdds(selectedEvent, selectedTeam);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setStep("team")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h2 className="text-2xl font-bold">Current Odds - {selectedTeam}</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Moneyline</CardTitle>
              <CardDescription>Win/Loss odds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {moneylineOdds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No moneyline odds available</p>
              ) : (
                moneylineOdds.map((odd, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-semibold">{odd.bookmaker}</span>
                    <Badge>{formatOdds(odd.odds)}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Spread</CardTitle>
              <CardDescription>Point spread odds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {spreadOdds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No spread odds available</p>
              ) : (
                spreadOdds.map((odd, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <span className="font-semibold">{odd.bookmaker}</span>
                      <p className="text-xs text-muted-foreground">
                        {odd.point > 0 ? `+${odd.point}` : odd.point}
                      </p>
                    </div>
                    <Badge>{formatOdds(odd.odds)}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Button className="w-full btn-primary" onClick={() => setStep("configure")}>
          Continue to Configure Trigger
        </Button>
      </div>
    );
  }

  if (step === "configure") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setStep("odds")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h2 className="text-2xl font-bold">Configure Trigger</h2>
        </div>

        <Card className="glass-panel max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{selectedTeam}</CardTitle>
            <CardDescription>{selectedSportTitle}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Bet Type</Label>
              <Select value={betType} onValueChange={(v) => setBetType(v as BetType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="moneyline">Moneyline</SelectItem>
                  <SelectItem value="spread">Spread</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Comparator</Label>
                <Select value={oddsComparator} onValueChange={(v) => setOddsComparator(v as OddsComparator)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=">=">Greater or Equal (≥)</SelectItem>
                    <SelectItem value="<=">Less or Equal (≤)</SelectItem>
                    <SelectItem value=">">Greater Than ({">"}) </SelectItem>
                    <SelectItem value="<">Less Than ({"<"})</SelectItem>
                    <SelectItem value="==">Equal (=)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Odds Value</Label>
                <Input
                  type="number"
                  placeholder="e.g., -200 or +150"
                  value={oddsValue}
                  onChange={(e) => setOddsValue(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as TriggerFrequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once (trigger completes after first match)</SelectItem>
                  <SelectItem value="recurring">Recurring (trigger stays active)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <p className="text-sm font-semibold mb-2">Trigger Summary</p>
              <p className="text-sm text-muted-foreground">
                Alert me when <span className="font-bold text-foreground">{selectedTeam}</span>{" "}
                <span className="font-bold text-foreground">{betType}</span> odds are{" "}
                <span className="font-bold text-foreground">
                  {oddsComparator} {oddsValue || "___"}
                </span>{" "}
                on FanDuel or DraftKings
              </p>
            </div>

            <Button
              className="w-full btn-primary"
              onClick={handleCreateTrigger}
              disabled={loading || !oddsValue}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Trigger"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
