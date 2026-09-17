import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled jobs (Phase 7 retention policy).
 *
 * The hourly retention job prunes library captures past each user's
 * `retentionDays` and caps the audit log — see `retention.runRetention`.
 */
const crons = cronJobs();

crons.interval("run-retention", { hours: 1 }, internal.retention.runRetention);

export default crons;
