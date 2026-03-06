const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const { buildSchedule } = require('./scheduler.js');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.static('public'));

let cachedSchedule = null;

async function loadOrBuild() {
  delete require.cache[require.resolve('./config.js')];
  try { delete require.cache[require.resolve('./requirements.js')]; } catch (_) {}
  const config = require('./config.js');
  if (config.useCachedSchedule) {
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      cachedSchedule = data.schedule || data;
      return cachedSchedule;
    } catch (_) {
      cachedSchedule = await buildSchedule(config);
      await fs.writeFile(DATA_FILE, JSON.stringify({ schedule: cachedSchedule }, null, 2));
      return cachedSchedule;
    }
  }
  cachedSchedule = await buildSchedule(config);
  await fs.writeFile(DATA_FILE, JSON.stringify({ schedule: cachedSchedule }, null, 2));
  return cachedSchedule;
}

app.use(async (req, res, next) => {
  if (cachedSchedule === null) await loadOrBuild();
  next();
});

app.get('/api/schedule', (req, res) => {
  try {
    const config = require('./config.js');
    res.json({ useCachedSchedule: !!config.useCachedSchedule, ...cachedSchedule });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load schedule' });
  }
});

app.get('/api/regenerate', async (req, res) => {
  try {
    cachedSchedule = await loadOrBuild();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, async () => {
  await loadOrBuild();
  console.log(`http://localhost:${PORT}`);
});
