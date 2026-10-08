# Media

- `demo.gif`: the README demo (about 20 seconds, 880 px wide).
- `social-preview.png`: the repository social preview, rendered from `social-preview.html` by `render-social-preview.mjs`.

## What the demo shows

1. The dashboard with three seeded blocks and their risk badges. "Harborview Hotel" starts "On track".
2. On the Harborview block, "Record snapshot" with 10 rooms picked up on every night.
3. The snapshot is saved and a "Risk level changed" alert appears.
4. Back on the dashboard, Harborview is now "At risk" and owes $21,138.00.
5. `/webhooks` lists the alert deliveries as delivered with status 204.

## Re-recording it

1. Start the stack: `docker compose up --build`, and wait until the `seed` container exits. Start from a fresh seed (`docker compose down -v` first) so Harborview is "On track" again.
2. Walk through the steps above in a window about 1100 px wide.
3. The current GIF was captured as Playwright screenshots of those steps and joined into a GIF with Pillow (64 colours, no dithering). A screen recorder such as ScreenToGif, Kap or Peek works too; keep the file under 5 MB.
