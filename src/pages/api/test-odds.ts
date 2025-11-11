
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const apiKey = "8fd23ab732557e3db9238fc571eddbbe";
    const baseUrl = "https://api.the-odds-api.com/v4";
    
    // Test 1: Get NBA sport info
    console.log("=== Test 1: Fetching NBA sport info ===");
    const sportsUrl = `${baseUrl}/sports?apiKey=${apiKey}`;
    const sportsResponse = await fetch(sportsUrl);
    const sports = await sportsResponse.json();
    const nbaSport = sports.find((s: any) => s.key === "basketball_nba");
    
    console.log("NBA Sport:", nbaSport);
    
    // Test 2: Get live NBA scores
    console.log("\n=== Test 2: Fetching live NBA scores ===");
    const scoresUrl = `${baseUrl}/sports/basketball_nba/scores/?apiKey=${apiKey}`;
    const scoresResponse = await fetch(scoresUrl);
    const scores = await scoresResponse.json();
    
    console.log(`Found ${scores.length} games`);
    
    // Find Milwaukee Bucks game
    const bucksGame = scores.find((game: any) => 
      game.home_team.includes("Milwaukee") || game.away_team.includes("Milwaukee")
    );
    
    console.log("Bucks game:", bucksGame);
    
    if (!bucksGame) {
      return res.status(200).json({
        success: false,
        message: "No Milwaukee Bucks game found",
        allGames: scores
      });
    }
    
    // Test 3: Get odds for the Bucks game
    console.log("\n=== Test 3: Fetching odds for Bucks game ===");
    const oddsUrl = `${baseUrl}/sports/basketball_nba/odds/?apiKey=${apiKey}&regions=us&markets=h2h&eventIds=${bucksGame.id}`;
    const oddsResponse = await fetch(oddsUrl);
    const odds = await oddsResponse.json();
    
    console.log("Odds data:", JSON.stringify(odds, null, 2));
    
    return res.status(200).json({
      success: true,
      message: "Successfully fetched Bucks game data",
      game: bucksGame,
      odds: odds,
      testResults: {
        sportsApiWorking: sportsResponse.ok,
        scoresApiWorking: scoresResponse.ok,
        oddsApiWorking: oddsResponse.ok,
        bucksGameFound: !!bucksGame,
        oddsDataReceived: odds.length > 0
      }
    });
    
  } catch (error: any) {
    console.error("Test error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
