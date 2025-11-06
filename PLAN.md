# Odds Polling Process Overview

This document outlines the automated, step-by-step process that runs every minute when odds polling is active.

1.  **Scheduled Invocation**:
    *   The `evaluate-triggers` function is automatically triggered by a cron job every minute.

2.  **Log Cron Invocation**:
    *   The function's *very first action* is to create a new record in the `evaluation_runs` table with a `running` status. This serves as a definitive log that the cron job has successfully triggered the function.

3.  **Polling Status Check**:
    *   The function then checks the `system_settings` table to see if the main polling switch is "On". If it's "Off", the process updates the log and stops.

4.  **Fetch Active Triggers**:
    *   The system queries the database for all user triggers that are currently `active`. If none are found, the process ends.

5.  **Fetch Live Games**:
    *   It identifies the unique sports from the active triggers (e.g., NBA, NFL).
    *   It then calls "The Odds API" to get a list of all games for those sports that are currently live (i.e., started but not finished).

6.  **Fetch Live Odds for Each Game**:
    *   For each live game that has at least one active trigger associated with it, the system makes another API call to get the latest betting odds from all available bookmakers.

7.  **Create an Odds Snapshot**:
    *   The raw odds data received from the API is immediately saved into the `odds_snapshots` table. This provides a historical record of market odds at that specific moment in time.

8.  **Evaluate Triggers Against Live Odds**:
    *   The system compares the live odds for each outcome (e.g., team to win) against the conditions set in the user's trigger (e.g., `odds > +150`).

9.  **Generate Alerts &amp; Notifications**:
    *   **If a condition is met:**
        *   A `trigger_matches` record is created to prevent duplicate alerts for the same event.
        *   An `alerts` record is created in the database with the user's notification message.
        *   If the user has configured a webhook, the alert data is sent to their specified URL.

10. **Finalize the Run**:
    *   After checking all live games, the `evaluation_runs` log is updated to `completed` with a summary of actions taken (e.g., "Checked 15 triggers, created 2 alerts.").

This cycle repeats every minute, ensuring timely evaluation of all active betting triggers against real-time market data.
