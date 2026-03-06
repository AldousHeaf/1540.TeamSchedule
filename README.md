# 1540 Schedule

1. Put form responses in **responses.csv** (or set `csvPath` in config).
2. Edit **config.js**: `competitionStartTime`, `competitionEndTime`, `blockDurationMinutes`, `numberOfDays`, `columnMap` (must match your CSV headers).
3. Edit **requirements.js**: `min` and `max` per role (Drive, Pits, Journalist, Photography, Strategy, Media). Use a number for every block or an array per block.

Run: `npm install` then `npm start`. Open http://localhost:3000. After changing config or CSV, open http://localhost:3000/api/regenerate.

Fake data: `node tester.js` or `node tester.js 50`.
