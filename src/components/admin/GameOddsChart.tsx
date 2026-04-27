import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  parseNBAGameUrl,
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
import { Loader2, Download, Copy, Image as ImageIcon, AlertCircle } from "lucide-react";

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

export function GameOddsChart() {
  const { toast } = useToast();
  const chartRef = useRef<HTMLDivElement>(null);
  
  const [gameUrl, setGameUrl] = useState("");
  const [winningTeam, setWinningTeam] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [storyData, setStoryData] = useState<GameOddsStory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"feed" | "story">("feed");

  const handleUrlChange = (url: string) => {
    setGameUrl(url);
    setError(null);

    // Try to parse and show preview
    const parsed = parseNBAGameUrl(url);
    if (url && !parsed) {
      setError("Please paste a valid NBA.com game URL");
    }
  };

  const handleGenerate = async () => {
    const parsed = parseNBAGameUrl(gameUrl);
    if (!parsed) {
      setError("Please paste a valid NBA.com game URL");
      return;
    }

    if (!winningTeam.trim()) {
      setError("Please enter the winning team name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const story = await generateGameOddsStory(gameUrl, winningTeam);
      setStoryData(story);
      
      toast({
        title: "Chart Generated",
        description: `Found ${story.snapshots.length} odds snapshots`,
      });
    } catch (err) {
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
            <Label htmlFor="game-url">NBA.com Game URL</Label>
            <Input
              id="game-url"
              placeholder="https://www.nba.com/game/sas-vs-por-0042500153/box-score"
              value={gameUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
            />
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="winning-team">Winning Team (full name)</Label>
            <Input
              id="winning-team"
              placeholder="e.g. San Antonio Spurs"
              value={winningTeam}
              onChange={(e) => setWinningTeam(e.target.value)}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isLoading || !gameUrl || !winningTeam}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching Odds Data...
              </>
            ) : (
              <>
                <ImageIcon className="mr-2 h-4 w-4" />
                Generate Chart
              </>
            )}
          </Button>
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