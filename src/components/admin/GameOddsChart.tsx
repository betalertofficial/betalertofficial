import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  fetchGamesForDate,
  generateGameOddsStory,
  generateSocialCaption,
  type GameOddsStory
} from "@/services/historicalOddsService";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from "chart.js";
import { Line } from "react-chartjs-2";
import html2canvas from "html2canvas";
import { Loader2, Download, Copy, AlertCircle, Check } from "lucide-react";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface HistoricalEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

export function GameOddsChart() {
  const { toast } = useToast();
  const chartRef = useRef<HTMLDivElement>(null);
  
  const [gameDate, setGameDate] = useState("");
  const [availableGames, setAvailableGames] = useState<HistoricalEvent[]>([]);
  const [selectedGame, setSelectedGame] = useState<HistoricalEvent | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<"home" | "away" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [storyData, setStoryData] = useState<GameOddsStory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"feed" | "story">("feed");

  const handleDateChange = async (date: string) => {
    setGameDate(date);
    setError(null);
    setAvailableGames([]);
    setSelectedGame(null);
    setSelectedWinner(null);
    setStoryData(null);

    if (!date) return;

    setIsLoading(true);

    try {
      const games = await fetchGamesForDate(date);
      
      if (games.length === 0) {
        setError("No NBA games found for this date");
        toast({
          title: "No Games Found",
          description: "Try a different date",
          variant: "destructive",
        });
      } else {
        setAvailableGames(games);
        toast({
          title: "Games Loaded",
          description: `Found ${games.length} game${games.length > 1 ? "s" : ""}`,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch games";
      setError(errorMessage);
      toast({
        title: "Failed to Load Games",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGameSelect = (gameId: string) => {
    console.log("Selecting game with ID:", gameId);
    console.log("Available games:", availableGames);
    
    const game = availableGames.find(g => g.id === gameId);
    console.log("Found game:", game);
    
    if (game) {
      setSelectedGame(game);
      setStoryData(null);
      setError(null);
    } else {
      console.error("Could not find game with ID:", gameId);
      setError("Could not find the selected game");
    }
  };

  const handleGenerateChart = async (winner: "home" | "away") => {
    console.log("Generating chart for winner:", winner);
    console.log("Selected game:", selectedGame);
    
    if (!selectedGame) {
      setError("No game selected");
      return;
    }

    setSelectedWinner(winner);
    setIsLoading(true);
    setError(null);

    try {
      const story = await generateGameOddsStory(selectedGame, winner);
      setStoryData(story);
      
      toast({
        title: "Chart Generated",
        description: `Found ${story.snapshots.length} odds snapshots`,
      });
    } catch (err) {
      console.error("Error generating chart:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to generate chart";
      setError(errorMessage);
      toast({
        title: "Generation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!chartRef.current) return;

    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        width: exportFormat === "feed" ? 1080 : 1080,
        height: exportFormat === "feed" ? 1080 : 1920,
      });

      const url = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const fileName = storyData
        ? `${storyData.gameInfo.awayTeam}-${storyData.gameInfo.homeTeam}-odds.png`
            .toLowerCase()
            .replace(/\s+/g, "-")
        : "game-odds.png";
      
      link.download = fileName;
      link.href = url;
      link.click();

      toast({
        title: "Downloaded",
        description: `Saved as ${fileName}`,
      });
    } catch (err) {
      toast({
        title: "Export Failed",
        description: "Could not export chart",
        variant: "destructive",
      });
    }
  };

  const handleCopyImage = async () => {
    if (!chartRef.current) return;

    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        width: exportFormat === "feed" ? 1080 : 1080,
        height: exportFormat === "feed" ? 1080 : 1920,
      });

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob })
          ]);
          
          toast({
            title: "Copied to Clipboard",
            description: "Image ready to paste",
          });
        } catch (err) {
          toast({
            title: "Copy Failed",
            description: "Could not copy to clipboard",
            variant: "destructive",
          });
        }
      });
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Could not copy image",
        variant: "destructive",
      });
    }
  };

  const handleCopyCaption = () => {
    if (!storyData) return;
    
    const { caption } = generateSocialCaption(storyData);
    navigator.clipboard.writeText(caption);
    
    toast({
      title: "Caption Copied",
      description: "Ready to paste on social media",
    });
  };

  // Generate chart data
  const chartData = storyData ? {
    labels: storyData.snapshots.map((s, i) => {
      const elapsed = Math.floor(
        (new Date(s.timestamp).getTime() - new Date(storyData.gameInfo.commenceTime).getTime()) / 60000
      );
      if (elapsed <= 12) return "Q1";
      if (elapsed <= 24) return "Q2";
      if (elapsed <= 36) return "Half";
      if (elapsed <= 48) return "Q3";
      if (elapsed <= 60) return "Q4";
      return "Final";
    }),
    datasets: [
      {
        label: `${storyData.winningTeam} Moneyline`,
        data: storyData.snapshots.map(s => s.odds),
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: storyData.snapshots.map(s => 
          s.timestamp === storyData.peakOdds.timestamp ? 8 : 2
        ),
        pointBackgroundColor: storyData.snapshots.map(s =>
          s.timestamp === storyData.peakOdds.timestamp ? "#fbbf24" : "#10b981"
        ),
      }
    ]
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            return `Odds: ${context.parsed.y > 0 ? "+" : ""}${context.parsed.y}`;
          }
        }
      }
    },
    scales: {
      y: {
        ticks: {
          color: "#94a3b8",
          callback: (value: any) => (value > 0 ? `+${value}` : value),
        },
        grid: {
          color: "rgba(148, 163, 184, 0.1)",
        }
      },
      x: {
        ticks: {
          color: "#94a3b8",
        },
        grid: {
          color: "rgba(148, 163, 184, 0.1)",
        }
      }
    }
  };

  const socialContent = storyData ? generateSocialCaption(storyData) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Game Odds Story Chart</CardTitle>
          <CardDescription>
            Generate shareable social media images showing odds movement throughout a game
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="game-date">Game Date</Label>
            <Input
              id="game-date"
              type="date"
              value={gameDate}
              onChange={(e) => handleDateChange(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              disabled={isLoading}
            />
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {availableGames.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="game-select">Select Game</Label>
              <Select onValueChange={handleGameSelect}>
                <SelectTrigger id="game-select">
                  <SelectValue placeholder="Choose a game..." />
                </SelectTrigger>
                <SelectContent>
                  {availableGames.map((game) => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.away_team} @ {game.home_team}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedGame && !storyData && (
            <div className="space-y-3">
              <Label>Which team won?</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={selectedWinner === "away" ? "default" : "outline"}
                  onClick={() => handleGenerateChart("away")}
                  disabled={isLoading}
                  className="h-auto py-4"
                >
                  {isLoading && selectedWinner === "away" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  <div className="flex flex-col items-start">
                    <span className="text-xs text-muted-foreground">Away</span>
                    <span className="font-semibold">{selectedGame.away_team}</span>
                  </div>
                </Button>
                <Button
                  variant={selectedWinner === "home" ? "default" : "outline"}
                  onClick={() => handleGenerateChart("home")}
                  disabled={isLoading}
                  className="h-auto py-4"
                >
                  {isLoading && selectedWinner === "home" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  <div className="flex flex-col items-start">
                    <span className="text-xs text-muted-foreground">Home</span>
                    <span className="font-semibold">{selectedGame.home_team}</span>
                  </div>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {storyData && socialContent && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                {socialContent.headline}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                ref={chartRef}
                className="bg-slate-950 rounded-lg p-8"
                style={{
                  width: exportFormat === "feed" ? "540px" : "540px",
                  height: exportFormat === "feed" ? "540px" : "960px",
                  maxWidth: "100%",
                }}
              >
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {socialContent.headline}
                  </h2>
                  <p className="text-slate-400 text-sm">
                    {storyData.gameInfo.awayTeam} @ {storyData.gameInfo.homeTeam}
                  </p>
                  <p className="text-slate-500 text-xs">
                    {new Date(storyData.gameInfo.commenceTime).toLocaleDateString()}
                  </p>
                </div>

                {chartData && (
                  <div className="h-96">
                    <Line data={chartData} options={chartOptions} />
                  </div>
                )}

                <div className="mt-6 text-center">
                  <Badge className="bg-amber-500">
                    Peak: {storyData.peakOdds.odds > 0 ? "+" : ""}
                    {storyData.peakOdds.odds} ({storyData.peakOdds.bookmaker})
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={exportFormat === "feed" ? "default" : "outline"}
                  onClick={() => setExportFormat("feed")}
                >
                  Feed (1080x1080)
                </Button>
                <Button
                  variant={exportFormat === "story" ? "default" : "outline"}
                  onClick={() => setExportFormat("story")}
                >
                  Story (1080x1920)
                </Button>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleDownload} className="flex-1">
                  <Download className="mr-2 h-4 w-4" />
                  Download PNG
                </Button>
                <Button onClick={handleCopyImage} variant="outline" className="flex-1">
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Image
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Social Caption</Label>
                <div className="relative">
                  <Input
                    value={socialContent.caption}
                    readOnly
                    className="pr-20"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute right-1 top-1"
                    onClick={handleCopyCaption}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Alt Text (for accessibility)</Label>
                <Input value={socialContent.altText} readOnly />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}