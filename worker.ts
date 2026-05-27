import { Worker } from "@notionhq/workers";

/**
 * Speaker Deck Context Worker
 *
 * Triggered by a Notion Automation webhook when a speaker deck task is created.
 * 1. Finds relevant meetings in Team Granola Capture (already synced from Granola)
 * 2. Writes a context callout to the task page body
 * 3. Fires the Claude speaker deck routine immediately via the Anthropic API
 */

const worker = new Worker();

worker.webhook("onSpeakerDeckCreated", {
  title: "Speaker Deck Task Created",
  description:
    "Fired by Notion Automation when a deck/speaker/presentation task is added to the Tasks database. Pre-populates Granola context and triggers the Claude deck-creation routine immediately.",

  execute: async (event, { notion }) => {
    // ── 1. Parse the task page ID from the Notion Automation webhook payload ──
    // Notion Automations send the page as: { "page": { "id": "..." } }
    const body = event.body as Record<string, any>;
    const pageId: string = body?.page?.id ?? body?.page_id ?? "";
    if (!pageId) {
      console.error("No page ID in webhook payload:", JSON.stringify(body));
      return;
    }

    // ── 2. Retrieve the task page ──
    const page = await notion.pages.retrieve({ page_id: pageId }) as any;
    const titleProp = page.properties?.Name ?? page.properties?.title;
    const rawTitle: string =
      titleProp?.title?.[0]?.plain_text ?? "";

    // ── 3. Derive a search key from the linked project or task title ──
    let searchKey = deriveSearchKey(rawTitle);
    const projectRelations: any[] =
      page.properties?.Project?.relation ?? [];
    if (projectRelations.length > 0) {
      try {
        const project = await notion.pages.retrieve({
          page_id: projectRelations[0].id,
        }) as any;
        const projectName: string =
          project.properties?.["Project Name"]?.title?.[0]?.plain_text ??
          project.properties?.Name?.title?.[0]?.plain_text ??
          "";
        if (projectName) searchKey = projectName;
      } catch {
        // fall back to title-derived key
      }
    }

    console.log(`Speaker deck task detected. Search key: "${searchKey}"`);

    // ── 4. Query Team Granola Capture for relevant meetings ──
    // Database ID: 46756cd2-373b-8263-a24d-01539a3d97cf
    // Searches Title and Sub-folder columns for the search key
    const granolaDb = await notion.databases.query({
      database_id: "46756cd2-373b-8263-a24d-01539a3d97cf",
      filter: {
        or: [
          {
            property: "Title",
            rich_text: { contains: searchKey },
          },
          {
            property: "Sub-folder",
            rich_text: { contains: searchKey },
          },
        ],
      },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 10,
    }) as any;

    // ── 5. Compile the context text ──
    const meetings: string[] = (granolaDb.results ?? []).map(
      (row: any): string => {
        const p = row.properties;
        const title =
          p.Title?.title?.[0]?.plain_text ?? "Untitled";
        const date = p.Date?.date?.start ?? "unknown date";
        const attendees =
          p.Attendees?.multi_select?.map((a: any) => a.name).join(", ") ||
          "none listed";
        const summary =
          p.Summary?.rich_text?.map((t: any) => t.plain_text).join("") ||
          "no summary";
        const todos =
          p["To-dos"]?.rich_text?.map((t: any) => t.plain_text).join("") ||
          "none";
        return [
          `### ${title} — ${date}`,
          `Attendees: ${attendees}`,
          `Summary: ${summary}`,
          `To-dos: ${todos}`,
        ].join("\n");
      }
    );

    const contextBody =
      meetings.length > 0
        ? `Granola context pre-loaded by Worker (${meetings.length} meeting${meetings.length > 1 ? "s" : ""} found for "${searchKey}"):\n\n${meetings.join("\n\n")}`
        : `Granola context pre-loaded by Worker: no meetings found for "${searchKey}". Claude routine will query Granola directly.`;

    // ── 6. Write context callout to the task page body ──
    await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          type: "callout",
          callout: {
            rich_text: [
              { type: "text", text: { content: contextBody } },
            ],
            icon: { type: "emoji", emoji: "🤖" },
            color: "blue_background",
          },
        },
      ],
    });

    console.log(`Wrote context callout to task ${pageId}`);

    // ── 7. Trigger the Claude speaker deck routine immediately ──
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      console.error("ANTHROPIC_API_KEY secret not set — skipping routine trigger");
      return;
    }

    const routineId = "trig_01YPMLFnticN545GzH7ssfFh";

    // Note: verify the exact base URL for your Anthropic account.
    // Claude Code remote triggers are typically at api.anthropic.com.
    const triggerUrl = `https://api.anthropic.com/v1/code/triggers/${routineId}/run`;

    const res = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
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

// ── Helper ──
function deriveSearchKey(title: string): string {
  return title
    .replace(/\b(deck|speaker|presentation|create|build|make|for|the|a|an)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default worker;
