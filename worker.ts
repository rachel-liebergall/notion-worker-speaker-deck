import { Worker } from "@notionhq/workers";

/**
 * Speaker Deck Trigger Worker (TEST)
 *
 * Triggered by a Notion Automation webhook when a speaker/deck/presentation
 * task is created in the Tasks database. Immediately fires the Claude
 * create-speaker-deck routine via the Anthropic API instead of waiting
 * for the 9am/1pm cron schedule.
 *
 * All context gathering remains in the Claude routine — this Worker is
 * purely a trigger mechanism.
 */

const worker = new Worker();

worker.webhook("onSpeakerDeckCreated", {
  title: "Speaker Deck Task Created",
  description:
    "Fires the Claude speaker deck routine immediately when a deck/speaker/presentation task is added to the Notion Tasks database.",

  execute: async (event: any) => {
    const body = event.body as Record<string, any>;

    // Log the full payload so we can inspect it on first run
    console.log("Webhook payload received:", JSON.stringify(body));

    // Verify this looks like a Notion page event
    const pageId: string = body?.page?.id ?? body?.page_id ?? "";
    if (!pageId) {
      console.error("No page ID found in payload — check Notion Automation webhook format");
      return;
    }

    console.log(`Deck task created: page ${pageId} — triggering Claude routine`);

    // Trigger the Claude speaker deck routine immediately
    const routineToken = process.env.CLAUDE_ROUTINE_TOKEN;
    if (!routineToken) {
      console.error("CLAUDE_ROUTINE_TOKEN env var not set");
      return;
    }

    const routineId = "trig_01YPMLFnticN545GzH7ssfFh";
    const triggerUrl = `https://api.anthropic.com/v1/claude_code/routines/${routineId}/fire`;

    const res = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${routineToken}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Failed to trigger Claude routine (${res.status}): ${text}`);
    } else {
      console.log(`Claude routine ${routineId} triggered successfully`);
    }
  },
});

export default worker;
