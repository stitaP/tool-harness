---
name: document-to-action-items
description: Turn meeting notes, emails, or documents into a clear list of decisions and action items with owners and dates.
version: 1.0.0
---

# Document → action items

1. Read the document(s) fully (`read_file`, `web_extract`, or the pasted text).
2. Extract: **Decisions** made, **Action items** (task, owner, due date if stated), **Open questions**, **Risks**.
3. Don't invent owners or dates — mark them "unassigned"/"no date".
4. Output a markdown table for actions; offer to save it to a file or schedule reminders with `cronjob_manage`.
