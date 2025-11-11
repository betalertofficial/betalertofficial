
# Manual Polling Feature - Refactoring Plan

Based on user feedback and a provided blueprint of a working system, the `evaluate-triggers` Edge Function will be refactored to improve clarity, debugging, and reliability.

The current monolithic function will be broken down into a multi-step process orchestrated by a main function.

## 1. New Structure for `evaluate-triggers/index.ts`

The function will be decomposed into three internal helper functions, mirroring the user's provided blueprint.

### `determinePollingNeeds()`
- **Responsibility**: Identify which games require odds polling.
- **Steps**:
  1. Fetch all triggers with `status = 'active'`.
  2. Group triggers by sport.
  3. For each unique sport, call The Odds API `/scores` endpoint.
  4. Filter the live games to find ones that match teams in the active triggers.
  5. **Return**: A list of `pollingTargets` (games to be checked).

### `fetchAndStoreOdds()`
- **Responsibility**: Fetch detailed odds for the identified targets and store them.
- **Steps**:
  1. Take the list of `pollingTargets`.
  2. Construct and call The Odds API `/odds` endpoint with the relevant event IDs.
  3. For each game's odds data returned, create a single `odds_snapshots` record in the database containing the full event data.
  4. **Return**: The complete `oddsData` fetched from the API.

### `evaluateTriggersAndAlert()`
- **Responsibility**: Compare odds against trigger conditions and generate alerts.
- **Steps**:
  1. Take the active triggers and the fetched `oddsData`.
  2. For each trigger, find the corresponding odds in `oddsData`.
  3. **Filter Bookmakers**: Only consider odds from "FanDuel" and "DraftKings".
  4. Evaluate the trigger condition (e.g., `price > odds_value`).
  5. If the condition is met:
     - Create an `alerts` record.
     - **Update Trigger Status**: Mark "once" triggers as "expired".
  6. **Return**: A summary of triggers checked and hit.

## 2. Main Orchestrator `evaluateTriggers()`

This function will now be a clean wrapper that calls the helper functions in sequence and provides clear logging at each step's boundary. This is critical for debugging.

```javascript
// Pseudocode
async function evaluateTriggers() {
  log("Step 1: Determining polling needs...");
  const targets = await determinePollingNeeds();
  log("Step 1 Complete.");

  log("Step 2: Fetching odds...");
  const odds = await fetchAndStoreOdds(targets);
  log("Step 2 Complete.");

  log("Step 3: Evaluating triggers...");
  const results = await evaluateTriggersAndAlert(triggers, odds);
  log("Step 3 Complete.");

  return results;
}
```

This structured approach will allow us to pinpoint exactly where the process is failing and ensure the logic aligns with a proven, working model.
