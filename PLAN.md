# Project Plan: Manual Odds Polling &amp; Trigger Check

This document outlines the plan to implement a manual polling button on the admin page.

## 1. Goal

Create a button on the `/admin` page that allows an administrator to manually trigger the odds polling and trigger evaluation process. The result of the poll (number of triggers checked, number of triggers that hit) should be displayed in a toast notification.

## 2. Implementation Phases

### Phase 1: Enhance Supabase Edge Function

- **File to Modify:** `supabase/functions/evaluate-triggers/index.ts`
- **Objective:** Update the function to return a count of total triggers evaluated and triggers that "hit".
- **Steps:**
  1. Initialize two counters: `checkedCount` and `hitCount`.
  2. Increment `checkedCount` for each trigger processed.
  3. Increment `hitCount` for each trigger that meets its condition (a "hit").
  4. Modify the function's final return statement to send a JSON object containing the counts: `{ "checked": checkedCount, "hit": hitCount }`.

### Phase 2: Create a Dedicated API Endpoint

- **File to Create:** `src/pages/api/admin/manual-poll.ts`
- **Objective:** Create a secure endpoint that frontend can call to initiate the manual poll.
- **Steps:**
  1. Create a new API route that only accepts `POST` requests.
  2. Implement admin-only security. The request must come from a logged-in administrator.
  3. Use the Supabase Admin client to invoke the `evaluate-triggers` Edge Function.
  4. Receive the result from the Edge Function and forward it as the API response.

### Phase 3: Implement Frontend Logic

- **File to Modify:** `src/services/adminService.ts`
  - **Objective:** Add a service function to communicate with the new API endpoint.
  - **Steps:**
    1. Create a new async function, `manualPollAndCheckTriggers()`.
    2. This function will make a `POST` call to `/api/admin/manual-poll`.
    3. It will return the JSON response from the API.

- **File to Modify:** `src/pages/admin.tsx`
  - **Objective:** Add the UI button and wire up the functionality.
  - **Steps:**
    1. Add a state variable `isPolling` to manage the button's loading state.
    2. Import `useToast` and the new `manualPollAndCheckTriggers` service function.
    3. Add a new `Button` component labeled "Run Manual Poll".
    4. Disable the button and show a loading indicator when `isPolling` is `true`.
    5. In the button's `onClick` handler:
       - Set `isPolling` to `true`.
       - Call the service function within a `try/catch/finally` block.
       - On success, use the `toast` function to display the results: `Checked ${data.checked} triggers, and ${data.hit} hit.`
       - On error, display an error toast.
       - In the `finally` block, set `isPolling` to `false`.
