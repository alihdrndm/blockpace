# Demo GIF

The README has no screenshots because they cannot be produced automatically. Please record one short GIF (about 20 seconds, under 5 MB) and save it here as `docs/media/demo.gif`.

## What to record

1. Start the stack: `docker compose up --build`, and wait until the `seed` container exits.
2. In a second terminal, run `docker compose logs -f webhook-sink` and keep it visible next to the browser (a split screen works well).
3. Open http://localhost:3020. The dashboard shows three blocks with their risk badges.
4. Open the "Harborview Hotel" block (it starts "On track"). Show the tiles and the pickup chart.
5. In "Record snapshot", enter pickup numbers that change the risk level (for example 10 rooms on every night, so it drops from "On track" to "At risk") and submit. A webhook is only sent when an alert is raised. If nothing is sent, open `/webhooks` and press "Send test" instead.
6. Watch the sink terminal. Within a few seconds a line ending in `signature OK` appears. That is the signed webhook arriving. Stop the recording there.

## Tips

- Use a window about 1200 px wide so the text stays readable.
- Tools such as ScreenToGif (Windows), Kap (macOS) or Peek (Linux) work fine.
- Then add `![blockpace demo](docs/media/demo.gif)` to the README, under the pitch.
