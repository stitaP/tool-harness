---
name: scheduled-reports
description: Set up recurring automated reports or checks (daily digest, weekly summary, monitoring) using the scheduler. Use when the user wants something done regularly.
version: 1.0.0
---

# Scheduled reports

1. Clarify: what to check/produce, how often, where to deliver (log file, Telegram/Discord/Slack chat, webhook).
2. Write the job prompt as a SELF-CONTAINED instruction — the job runs in a fresh session with no chat history. Include paths, URLs, thresholds, output format.
3. Test it once now (do the task manually or `cronjob_manage action=run` after creating).
4. Create: `cronjob_manage action=create schedule="weekdays at 9:00" prompt="…" deliver="telegram:<chat_id>"`.
5. Confirm the next run time to the user and how to pause (`/cron pause <id>`).
