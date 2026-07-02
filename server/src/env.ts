import { config } from "dotenv";

// The .env lives at the repo root; workspace scripts run with cwd=server/.
// Load both candidates — dotenv never overrides variables already set.
config();
config({ path: "../.env" });
