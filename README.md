# 1540 Schedule

Build a schedule from form responses and publish it as a static site (e.g. GitHub Pages).

## Update the live website

1. Put the latest form responses in **responses.csv** in this project (overwrite the file).
2. Run:
   ```bash
   npm run deploy
   git push teamschedule main
   ```
   `npm run deploy` rebuilds the schedule from responses and commits **docs/** and **schedule.csv**. Pushing updates the live site.

## Setup (first time)

- Edit **config.js** (times, days, `columnMap` to match your CSV headers).
- Edit **requirements.js** (min/max per role).
- `npm install`

## Build only (no commit)

```bash
npm run build
```

Writes **data.json**, **schedule.csv**, and **docs/** (static site). To update the live site you must then commit **docs/** and **schedule.csv** and push.

## GitHub Pages

Repo → Settings → Pages → Source: Deploy from branch → **main** → Folder: **/docs**. The site is then at `https://<username>.github.io/1540.TeamSchedule/` (or your repo name).
