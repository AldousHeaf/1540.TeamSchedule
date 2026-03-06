const fs = require('fs').promises;
const path = require('path');

const ROLES = ['Drive', 'Mech Pit', 'Ctrls Pit', 'Pit Lead', 'Journalist', 'Strategy', 'Media'];
const PIT_LEAD_NAMES = ['Audrey Tsai', 'Zachary Rutman']; // Both are Pit Lead only (not Mech Pit)
const SCOUT_START_MINUTES = 11 * 60; // Scouting starts at 11:00
const CANNOT_SCOUT_NAMES = [];
const NO_MECH_PIT_NAMES = ['Zachary Rutman', 'Audrey Tsai'];
const NO_CTRLS_PIT_NAMES = ['Sienna Cooper', 'Zachary Rutman'];
const NO_STRATEGY_NAMES = ['Brian Chai', 'Miranda'];
const ALLOW_MECH_PIT_NAMES = ['Miranda', 'Blaze Annison'];

function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(arr, seed) {
  const rng = seededRandom(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function range(values) {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max - min;
}

function evaluateGoodness(people, submissions) {
  const cannotScoutPerson = (p) => {
    if (CANNOT_SCOUT_NAMES.includes(p.name)) return true;
    const sub = submissions.find((s) => s.email === p.email);
    return sub && sub.cannotScout;
  };
  let score = 0;

  const eligibleScouts = people.filter((p) => {
    const sub = submissions.find((s) => s.email === p.email);
    return sub && !sub.driveTeam && !cannotScoutPerson(p);
  });
  const scoutCounts = eligibleScouts.map((p) =>
    (p.schedule || []).filter((r) => r === 'Scouting!').length
  );
  if (scoutCounts.length > 0) {
    const scoutRange = range(scoutCounts);
    score += 150 / (1 + scoutRange);
    const totalScoutBlocks = scoutCounts.reduce((a, b) => a + b, 0);
    score += totalScoutBlocks * 2;
  }

  const balanceRoles = ['Strategy', 'Media', 'Journalist', 'Mech Pit', 'Ctrls Pit', 'Pit Lead'];
  balanceRoles.forEach((role) => {
    const counts = people
      .map((p) => (p.schedule || []).filter((r) => r === role).length)
      .filter((c) => c > 0);
    if (counts.length > 1) {
      const roleRange = range(counts);
      score += 80 / (1 + roleRange);
    }
  });

  const totalOpen = people.reduce((sum, p) => sum + (p.schedule || []).filter((r) => r === 'Open').length, 0);
  score += totalOpen * 1.5;

  return score;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q;
      else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  });
}

function generateTimeBlocks(startTime, endTime, blockMinutes) {
  const [sH, sM] = startTime.split(':').map(Number);
  const [eH, eM] = endTime.split(':').map(Number);
  let m = sH * 60 + sM;
  const end = eH * 60 + eM;
  const blocks = [];
  while (m < end) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const h2 = Math.floor((m + blockMinutes) / 60);
    const min2 = (m + blockMinutes) % 60;
    blocks.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}-${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')}`);
    m += blockMinutes;
  }
  return blocks;
}

function parseSubmissions(csvRows, columnMap) {
  if (csvRows.length < 2) return [];
  const headers = csvRows[0].map((h) => (h || '').trim());
  const keyToIndex = {};
  for (const [key, headerText] of Object.entries(columnMap)) {
    const idx = headers.findIndex((h) => h === headerText || h === key);
    if (idx >= 0) keyToIndex[key] = idx;
  }
  const get = (row, key) => (keyToIndex[key] != null ? (row[keyToIndex[key]] || '').trim() : '');
  const out = [];
  for (let i = 1; i < csvRows.length; i++) {
    const row = csvRows[i];
    const id = get(row, 'email');
    if (!id) continue;
    if (/^\d+$/.test(id)) continue;
    const name = id;
    const email = (id || '').toLowerCase();
    const wantsPits =
      /yes|true|1/i.test(get(row, 'wantsPits')) || /true|1/i.test(get(row, 'pit'));
    const wantsMechPit = /true|1/i.test(get(row, 'mechPit'));
    const wantsCtrlsPit = /true|1/i.test(get(row, 'ctrlsPit'));
    const wantsSwPit = /true|1/i.test(get(row, 'swPit'));
    const wantsJournalism = /true|1/i.test(get(row, 'journalism'));
    const wantsStrategy = /true|1/i.test(get(row, 'strategy'));
    const wantsMedia = /true|1/i.test(get(row, 'media'));
    const driveTeam = /yes|true|1/i.test(get(row, 'driveTeam'));
    const friday = /true|yes|1/i.test(get(row, 'friday'));
    const saturday = /true|yes|1/i.test(get(row, 'saturday'));
    if (!friday && !saturday) continue;
    let cannotScout = /yes|true|1/i.test(get(row, 'cannotScout'));
    if (CANNOT_SCOUT_NAMES.includes(name)) cannotScout = true;
    out.push({
      name: name || 'Unknown',
      email,
      wantsPits,
      wantsMechPit,
      wantsCtrlsPit,
      wantsSwPit,
      wantsJournalism,
      wantsStrategy,
      wantsMedia,
      driveTeam,
      cannotScout,
      unavailableTimes: get(row, 'unavailableTimes') || get(row, 'timesOfDay'),
      conventionTalks: get(row, 'conventionTalks'),
      friday,
      saturday,
    });
  }
  return out;
}

function parseTimeRange(s) {
  const t = s.trim().toLowerCase().replace(/\s/g, '');
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let startH = parseInt(m[1], 10);
  let startM = parseInt(m[2] || '0', 10);
  let endH = parseInt(m[4], 10);
  let endM = parseInt(m[5] || '0', 10);
  if (m[3] === 'pm' && startH !== 12) startH += 12;
  if (m[3] === 'am' && startH === 12) startH = 0;
  if (m[6] === 'pm' && endH !== 12) endH += 12;
  if (m[6] === 'am' && endH === 12) endH = 0;
  const startMin = startH * 60 + startM;
  let endMin = endH * 60 + endM;
  if (endMin <= startMin) endMin += 24 * 60;
  return [startMin, endMin];
}

function parseConventionTalks(str) {
  if (!str || !str.trim()) return [];
  const ranges = [];
  str.split(/[,;]/).forEach((part) => {
    const r = parseTimeRange(part);
    if (r) ranges.push(r);
  });
  return ranges;
}

function blockStartMinutes(blockStr) {
  const start = blockStr.split('-')[0].trim();
  const [h, m] = start.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isInRanges(blockStartMin, ranges) {
  return ranges.some(([s, e]) => blockStartMin >= s && blockStartMin < e);
}

function loadRequirements(numBlocks) {
  let raw = {};
  try {
    raw = require('./requirements.js');
  } catch (e) {}
  const fill = (val, len) => {
    if (val == null) return new Array(len).fill(0);
    if (Array.isArray(val)) return val.length >= len ? val.slice(0, len) : val.concat(new Array(len - val.length).fill(val[val.length - 1] ?? 0));
    return new Array(len).fill(val);
  };
  const req = {};
  ROLES.forEach((role) => {
    const r = raw[role];
    req[role] = { min: fill(r?.min, numBlocks), max: fill(r?.max, numBlocks) };
  });
  return req;
}

function runScheduling(submissions, timeBlocks, req, blockDurationMinutes) {
  const numBlocks = timeBlocks.length;
  const people = submissions.map((s) => ({
    name: s.name,
    email: s.email,
    schedule: new Array(numBlocks).fill('Open'),
  }));

  const getMin = (role, i) => {
    const r = req[role];
    if (!r) return 0;
    const m = r.min;
    return Array.isArray(m) ? (m[i] ?? 0) : (m ?? 0);
  };
  const getMax = (role, i) => {
    const r = req[role];
    if (!r) return 0;
    const m = r.max;
    return Array.isArray(m) ? (m[i] ?? 0) : (m ?? 0);
  };

  const driveTeamPeople = submissions.filter((s) => s.driveTeam);

  for (let timeIdx = 0; timeIdx < numBlocks; timeIdx++) {
    const block = timeBlocks[timeIdx];
    const getAvailable = () =>
      people.filter((p) => {
        if (p.schedule[timeIdx] !== 'Open') return false;
        const sub = submissions.find((s) => s.email === p.email);
        if (sub && sub.driveTeam) return false;
        if (sub && sub.unavailableTimes) {
          const u = sub.unavailableTimes.toLowerCase();
          const start = block.split('-')[0].replace(':', '');
          if (u.includes(start)) return false;
        }
        return true;
      });

    const countRoleSoFar = (p, role) => {
      let c = 0;
      for (let b = 0; b <= timeIdx; b++) if (p.schedule[b] === role) c++;
      return c;
    };
    const runLengthAtPrev = (p, r) => {
      if (timeIdx <= 0) return 0;
      let len = 0;
      for (let b = timeIdx - 1; b >= 0 && p.schedule[b] === r; b--) len++;
      return len;
    };
    const preferExtendRun = (p, r) => {
      if (timeIdx <= 0 || p.schedule[timeIdx - 1] !== r) return false;
      return runLengthAtPrev(p, r) < 2;
    };
    const assignUpTo = (role, maxN, preferOrOnlyIf, spread = true, onlyIf = false) => {
      let n = 0;
      let available = getAvailable();
      if (preferOrOnlyIf) {
        const matching = available.filter((p) => preferOrOnlyIf(people.indexOf(p), p));
        if (onlyIf) {
          available = matching;
        } else {
          const rest = available.filter((p) => !matching.includes(p));
          available = [...matching, ...rest];
        }
      }
      if (spread) {
        available = [...available].sort((a, b) => {
          const aExtend = preferExtendRun(a, role) ? 1 : 0;
          const bExtend = preferExtendRun(b, role) ? 1 : 0;
          if (aExtend !== bExtend) return bExtend - aExtend;
          return countRoleSoFar(a, role) - countRoleSoFar(b, role);
        });
      }
      available.forEach((p) => {
        if (n >= maxN) return;
        p.schedule[timeIdx] = role;
        n++;
      });
    };

    const driveMax = Math.min(5, Math.max(0, getMax('Drive', timeIdx)));
    let d = 0;
    for (let k = 0; k < driveTeamPeople.length && d < driveMax; k++) {
      const idx = (timeIdx + k) % driveTeamPeople.length;
      const person = people.find((p) => p.email === driveTeamPeople[idx].email);
      if (person && person.schedule[timeIdx] === 'Open') {
        person.schedule[timeIdx] = 'Drive';
        d++;
      }
    }

    const canCtrlsPit = (p) => {
      if (NO_CTRLS_PIT_NAMES.includes(p.name)) return false;
      const sub = submissions.find((s) => s.email === p.email);
      return sub && (sub.wantsPits && sub.wantsCtrlsPit || sub.wantsSwPit);
    };
    const mechMax = Math.max(0, getMax('Mech Pit', timeIdx));
    assignUpTo('Mech Pit', mechMax, (_, p) => {
      if (NO_MECH_PIT_NAMES.includes(p.name)) return false;
      const sub = submissions.find((s) => s.email === p.email);
      const canMech = sub && (sub.wantsPits && sub.wantsMechPit || sub.wantsSwPit || ALLOW_MECH_PIT_NAMES.includes(p.name));
      return canMech;
    }, true, true);

    assignUpTo('Ctrls Pit', Math.max(0, getMax('Ctrls Pit', timeIdx)), (_, p) => canCtrlsPit(p), true, true);

    const isPitLead = (p) => PIT_LEAD_NAMES.includes(p.name);
    const pitLeadMax = Math.max(0, getMax('Pit Lead', timeIdx));
    let pitLeadCount = 0;
    for (const name of PIT_LEAD_NAMES) {
      if (pitLeadCount >= pitLeadMax) break;
      const person = people.find((p) => p.name === name && p.schedule[timeIdx] === 'Open');
      if (person) {
        person.schedule[timeIdx] = 'Pit Lead';
        pitLeadCount++;
      }
    }

    const journalistBlocks = [];
    const mid = Math.floor(numBlocks / 2);
    journalistBlocks.push(mid - 1, mid);
    journalistBlocks.push(numBlocks - 2, numBlocks - 1);
    const assignJournalistThisBlock = journalistBlocks.includes(timeIdx);
    if (assignJournalistThisBlock) {
      const jMax = getMax('Journalist', timeIdx);
      assignUpTo('Journalist', Math.max(0, jMax), (_, p) => {
        const sub = submissions.find((s) => s.email === p.email);
        return sub && sub.wantsJournalism;
      }, true, true);
    }

    const reserveForPhotoMediaScout = 7;
    const strategyMax = getMax('Strategy', timeIdx);
    const strategyMin = Math.max(0, getMin('Strategy', timeIdx));
    const strategyCap = Math.min(
      strategyMax,
      Math.max(strategyMin, getAvailable().length - reserveForPhotoMediaScout)
    );
    assignUpTo('Strategy', Math.max(strategyMin, Math.min(strategyMax, strategyCap)), (_, p) => {
      if (NO_STRATEGY_NAMES.includes(p.name)) return false;
      const sub = submissions.find((s) => s.email === p.email);
      return sub && sub.wantsStrategy;
    }, true, true);

    const assignMediaThisBlock = timeIdx % 2 === 0;
    if (assignMediaThisBlock) {
      assignUpTo('Media', Math.max(0, getMax('Media', timeIdx)), (_, p) => {
        const sub = submissions.find((s) => s.email === p.email);
        return sub && sub.wantsMedia;
      }, true, true);
    }
  }

  const MIN_SCOUTS = 5;
  const MAX_SCOUTS = 5;
  const cannotScoutPerson = (p) => {
    if (CANNOT_SCOUT_NAMES.includes(p.name)) return true;
    const sub = submissions.find((s) => s.email === p.email);
    return sub && sub.cannotScout;
  };
  const eligibleForScout = (p) => !cannotScoutPerson(p);
  const scoutAvailablePerBlock = [];
  for (let t = 0; t < numBlocks; t++) {
    const openNow = people.filter((p) => {
      if (p.schedule[t] !== 'Open') return false;
      const sub = submissions.find((s) => s.email === p.email);
      if (sub && sub.driveTeam) return false;
      return true;
    });
    scoutAvailablePerBlock.push(openNow.filter(eligibleForScout).length);
  }
  const consistentScoutTarget = Math.min(
    MAX_SCOUTS,
    Math.max(MIN_SCOUTS, Math.min(...scoutAvailablePerBlock))
  );

  for (let timeIdx = 0; timeIdx < numBlocks; timeIdx++) {
    if (blockStartMinutes(timeBlocks[timeIdx]) < SCOUT_START_MINUTES) continue; // Scouting starts at 11:00
    const openNow = people.filter((p) => {
      if (p.schedule[timeIdx] !== 'Open') return false;
      const sub = submissions.find((s) => s.email === p.email);
      if (sub && sub.driveTeam) return false;
      return true;
    });
    let canScoutRemaining = openNow.filter(eligibleForScout);
    const scoutCountSoFar = (p) => {
      let c = 0;
      for (let b = 0; b < timeIdx; b++) if (p.schedule[b] === 'Scouting!') c++;
      return c;
    };
    const scoutRunLengthAtPrev = (p) => {
      if (timeIdx <= 0) return 0;
      let len = 0;
      for (let b = timeIdx - 1; b >= 0 && p.schedule[b] === 'Scouting!'; b--) len++;
      return len;
    };
    const preferExtendScout = (p) =>
      timeIdx > 0 && p.schedule[timeIdx - 1] === 'Scouting!' && scoutRunLengthAtPrev(p) < 2;
    canScoutRemaining.sort((a, b) => {
      const aExtend = preferExtendScout(a) ? 1 : 0;
      const bExtend = preferExtendScout(b) ? 1 : 0;
      if (aExtend !== bExtend) return bExtend - aExtend;
      return scoutCountSoFar(a) - scoutCountSoFar(b);
    });
    const target = Math.min(consistentScoutTarget, canScoutRemaining.length);
    let n = 0;
    canScoutRemaining.forEach((p) => {
      if (n >= target) return;
      p.schedule[timeIdx] = 'Scouting!';
      n++;
    });
  }

  const MAX_CONSECUTIVE_OPEN = 1;
  people.forEach((p) => {
    const sub = submissions.find((s) => s.email === p.email);
    if (sub && sub.driveTeam) return;
    if (cannotScoutPerson(p)) return;
    let b = 0;
    while (b < numBlocks) {
      if (p.schedule[b] !== 'Open') { b++; continue; }
      let runEnd = b;
      while (runEnd < numBlocks && p.schedule[runEnd] === 'Open') runEnd++;
      const runLen = runEnd - b;
      if (runLen > MAX_CONSECUTIVE_OPEN) {
        const step = MAX_CONSECUTIVE_OPEN + 1;
        for (let k = 1; k < runLen; k += step) {
          const idx = b + k;
          if (blockStartMinutes(timeBlocks[idx]) < SCOUT_START_MINUTES) continue; // Scouting starts at 11:00
          const scoutCount = people.filter((q) => q.schedule[idx] === 'Scouting!').length;
          if (scoutCount < MAX_SCOUTS) {
            p.schedule[idx] = 'Scouting!';
          }
        }
      }
      b = runEnd;
    }
  });

  return people;
}

async function buildSchedule(config) {
  const {
    csvPath,
    competitionStartTime,
    competitionEndTime,
    blockDurationMinutes,
    columnMap,
    numberOfDays,
    optimizationIterations = 1,
  } = config;
  const blockMins = Number(blockDurationMinutes) || 30;
  const daysCount = Math.max(1, Number(numberOfDays) || 1);
  const blocksPerDay = generateTimeBlocks(competitionStartTime, competitionEndTime, blockMins);
  const numBlocks = blocksPerDay.length;
  const req = loadRequirements(numBlocks);

  let submissions = [];
  try {
    const csv = await fs.readFile(csvPath, 'utf8');
    submissions = parseSubmissions(parseCSV(csv), columnMap);
  } catch (e) {
    console.warn('no csv', csvPath, e.message);
  }

  const dayFilters = [
    (s) => s.friday === true,
    (s) => s.saturday === true,
  ];
  const dayLabels = ['Friday', 'Saturday'];

  const iterations = Math.max(1, Number(optimizationIterations) || 1);
  let bestDays = null;
  let bestScore = -Infinity;

  for (let iter = 0; iter < iterations; iter++) {
    const days = [];
    for (let d = 0; d < daysCount; d++) {
      const filter = dayFilters[d];
      let daySubmissions = filter ? submissions.filter(filter) : submissions;
      if (iterations > 1) {
        daySubmissions = shuffleWithSeed(daySubmissions, iter * 1000 + d);
      }
      const timeBlocks = blocksPerDay.slice();
      const people = runScheduling(daySubmissions, timeBlocks, req, blockMins);
      const scoutCheck = people.map((p) => {
        const sub = daySubmissions.find((s) => s.email === p.email);
        const shouldScout = !sub || !sub.cannotScout;
        const scoutingBlocks = (p.schedule || []).filter((s) => s === 'Scouting!').length;
        let status = 'ok';
        if (!shouldScout) status = 'exempt';
        else if (scoutingBlocks === 0) status = 'none';
        else if (scoutingBlocks < 2) status = 'low';
        return { name: p.name, scoutingBlocks, shouldScout, status };
      });
      days.push({
        day: d + 1,
        label: dayLabels[d] || `Day ${d + 1}`,
        timeBlocks,
        people,
        scoutCheck,
        _daySubmissions: daySubmissions,
      });
    }
    const totalScore = days.reduce(
      (sum, day) => sum + evaluateGoodness(day.people, day._daySubmissions),
      0
    );
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestDays = days.map(({ _daySubmissions, ...rest }) => rest);
    }
  }

  return { days: bestDays };
}

module.exports = { buildSchedule, generateTimeBlocks, parseCSV, parseSubmissions };
