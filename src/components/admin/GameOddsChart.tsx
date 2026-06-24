import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

/**
 * Historical odds charts are DISABLED.
 *
 * This admin tool previously generated shareable "odds story" graphics by
 * pulling The Odds API /historical endpoint, which costs 10x the credits of a
 * normal /odds call and was the single largest source of quota burn. The
 * feature has been turned off to preserve the monthly Odds API budget.
 *
 * The live cron already persists an intraday odds time-series in the
 * `odds_snapshots` table (free), so this chart can be rebuilt from our own DB
 * later without any paid historical calls.
 *
 * The named export `GameOddsChart` is preserved so admin.tsx keeps compiling.
 */
export function GameOddsChart() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Game Odds Story Chart</CardTitle>
          <CardDescription>
            Generate shareable social media images showing odds movement throughout a game
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Historical odds charts are disabled</AlertTitle>
            <AlertDescription>
              This tool relied on The Odds API historical endpoint (10x credit cost per
              call) and has been turned off to preserve the monthly API budget. The live
              poller still records an intraday odds time-series in the database, so charts
              can be rebuilt from our own data later — at no extra API cost.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
