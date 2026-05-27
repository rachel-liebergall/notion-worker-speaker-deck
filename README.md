# Notion Worker — Speaker Deck (Test)

A Notion Worker that triggers instantly when a speaker deck task is created in the NTN Tasks database. Pre-populates Granola meeting context from the Team Granola Capture database, then fires the Claude speaker deck routine immediately via the Anthropic API.

## What It Does

1. Receives a webhook from a Notion Automation when a deck/speaker/presentation task is created
2. Finds relevant meetings in the Team Granola Capture Notion database (already synced from Granola every 2h)
3. Writes a context callout to the task page body for the Claude routine to read
4. Triggers the Claude create-speaker-deck routine immediately — no waiting for the 9am/1pm cron

## Architecture

```
Notion Automation (task created)
    → POST to Worker webhook URL
        → query Team Granola Capture
        → write context callout to task
        → POST https://api.anthropic.com/v1/code/triggers/trig_01YPMLFnticN545GzH7ssfFh/run
            → Claude routine runs immediately
```

## Setup

1. Install: npm install
2. Set secret: ntn workers secrets set ANTHROPIC_API_KEY
3. Deploy: npx ntn workers deploy worker.ts
4. Copy the webhook URL from the deploy output
5. In Notion Tasks DB: create an Automation — trigger: page added where Name contains "deck" OR "speaker" OR "presentation" — action: Send webhook → paste URL

## Key IDs

| Resource | ID |
|---|---|
| Tasks DB | 36e56cd2373b8325939281a80a6cb5d9 |
| Team Granola Capture DB | 46756cd2-373b-8263-a24d-01539a3d97cf |
| Claude routine | trig_01YPMLFnticN545GzH7ssfFh |

## Notes

- The Claude routine still runs on its 9am/1pm cron as fallback if the Worker fails
- If the Worker callout is present on the task, the routine uses it and skips querying Granola directly
- The Anthropic trigger endpoint may need verification — test with a real task and check Worker logs
