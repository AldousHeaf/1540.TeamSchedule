const fs = require('fs').promises;
const path = require('path');

const ROLES = ['Drive', 'Pits', 'Pit Lead', 'Journalist', 'Strategy', 'Media'];
const PIT_LEAD_NAMES = ['Audrey Tsai', 'Zachary Rutman']; // Both Pit Lead all day (not Pits)
const SCOUT_START_MINUTES = 9 * 60; // Scouting starts at 09:00 (all day except lunch)
const CANNOT_SCOUT_NAMES = ['Crow Jahncke', 'Quinn Bartlo', 'Autumn Wilkes', 'Azalea Colburn']; // main strategy – no scouting
const PIT_PAIR_NAMES = ['Joseph Cole', 'Aldous Heaf']; // same schedule; together in Pits = 2
const NO_MECH_PIT_NAMES = ['Zachary Rutman', 'Audrey Tsai'];
const NO_CTRLS_PIT_NAMES = ['Sienna Cooper', 'Zachary Rutman', 'Brian Chai', 'James Rubenstein', 'Maddox Gumboc', 'Blaze Annison'];
const NO_STRATEGY_NAMES = ['Brian Chai', 'Miranda'];
const ALLOW_MECH_PIT_NAMES = ['Miranda', 'Blaze Annison'];
const EXCLUDED_FROM_SCHEDULE_NAMES = ['Mia Yasukawa'];

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

  const balanceRoles = ['Strategy', 'Media', 'Journalist', 'Pits', 'Pit Lead'];
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

function generateTimeBlocks(startTime, endTime, blockMinutes, excludeStart, excludeEnd) {
  const [sH, sM] = startTime.split(':').map(Number);
  const [eH, eM] = endTime.split(':').map(Number);
  let m = sH * 60 + sM;
  const end = eH * 60 + eM;
  const exclStart = excludeStart ? (() => { const [h, min] = excludeStart.split(':').map(Number); return h * 60 + min; })() : null;
  const exclEnd = excludeEnd ? (() => { const [h, min] = excludeEnd.split(':').map(Number); return h * 60 + min; })() : null;
  const blocks = [];
  while (m < end) {
    const blockEnd = m + blockMinutes;
    const inExclude = exclStart != null && exclEnd != null && m >= exclStart && blockEnd <= exclEnd;
    if (!inExclude) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const h2 = Math.floor(blockEnd / 60);
      const min2 = blockEnd % 60;
      blocks.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}-${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')}`);
    }
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

function runScheduling(submissions, timeBlocks, req, blockDurationMinutes, lunchStart, lunchEnd) {
  const numBlocks = timeBlocks.length;
  const people = submissions.map((s) => ({
    name: s.name,
    email: s.email,
    schedule: new Array(numBlocks).fill('Open'),
  }));

  const toMinutes = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const lunchStartMin = toMinutes(lunchStart);
  const lunchEndMin = toMinutes(lunchEnd);

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
    const blockStartMin = blockStartMinutes(block);
    const isLunchBlock = lunchStartMin != null && lunchEndMin != null &&
      blockStartMin >= lunchStartMin && blockStartMin + blockDurationMinutes <= lunchEndMin;
    if (isLunchBlock) {
      people.forEach((p) => { p.schedule[timeIdx] = 'Lunch'; });
      continue;
    }
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
    const assignUpTo = (role, maxN, preferOrOnlyIf, spread = true, onlyIf = false, pairFirst = null, assignPair = false) => {
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
      if (pairFirst && pairFirst.length >= 2) {
        const [a, b] = pairFirst;
        const ia = available.findIndex((p) => p.name === a);
        const ib = available.findIndex((p) => p.name === b);
        if (ia >= 0 && ib >= 0) {
          const pa = available[ia];
          const pb = available[ib];
          available = [pa, pb, ...available.filter((p, i) => i !== ia && i !== ib)];
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
        if (p.schedule[timeIdx] !== 'Open') return;
        const otherOfPair = assignPair && PIT_PAIR_NAMES.includes(p.name)
          ? people.find((q) => q !== p && PIT_PAIR_NAMES.includes(q.name))
          : null;
        const assignBoth = otherOfPair && otherOfPair.schedule[timeIdx] === 'Open' && (n + 2) <= maxN;
        p.schedule[timeIdx] = role;
        n++;
        if (assignBoth) {
          otherOfPair.schedule[timeIdx] = role;
          n++;
        }
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
    const pitsMax = Math.max(0, getMax('Pits', timeIdx));
    assignUpTo('Pits', pitsMax, (_, p) => {
      if (NO_MECH_PIT_NAMES.includes(p.name) && !canCtrlsPit(p)) return false;
      const sub = submissions.find((s) => s.email === p.email);
      const canMech = sub && (sub.wantsPits && sub.wantsMechPit || sub.wantsSwPit || ALLOW_MECH_PIT_NAMES.includes(p.name));
      return canMech || canCtrlsPit(p);
    }, true, true, ['Joseph Cole', 'Aldous Heaf'], true);

    const isPitLead = (p) => PIT_LEAD_NAMES.includes(p.name);
    const pitLeadMax = Math.max(0, getMax('Pit Lead', timeIdx));
    let pitLeadsAssigned = 0;
    for (const name of PIT_LEAD_NAMES) {
      if (pitLeadsAssigned >= pitLeadMax) break;
      const person = people.find((p) => p.name === name && p.schedule[timeIdx] === 'Open');
      if (person) {
        person.schedule[timeIdx] = 'Pit Lead';
        pitLeadsAssigned++;
      }
    }

    const jMin = Math.max(0, getMin('Journalist', timeIdx));
    const jMax = Math.max(0, getMax('Journalist', timeIdx));
    if (jMax >= 1) {
      assignUpTo('Journalist', Math.max(jMin, jMax), (_, p) => {
        if (PIT_PAIR_NAMES.includes(p.name)) return false;
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
    }, true, true, null, true);

    const mMin = Math.max(0, getMin('Media', timeIdx));
    const mMax = Math.max(0, getMax('Media', timeIdx));
    if (mMax >= 1) {
      assignUpTo('Media', Math.max(mMin, mMax), (_, p) => {
        if (PIT_PAIR_NAMES.includes(p.name)) return false;
        const sub = submissions.find((s) => s.email === p.email);
        return sub && sub.wantsMedia;
      }, true, true);
    }
  }

  const MIN_SCOUTS = 8;
  const MAX_SCOUTS = 8;
  const cannotScoutPerson = (p) => {
    if (CANNOT_SCOUT_NAMES.includes(p.name)) return true;
    const sub = submissions.find((s) => s.email === p.email);
    return sub && sub.cannotScout;
  };
  const eligibleForScout = (p) => !cannotScoutPerson(p);
  const scoutAvailablePerBlock = [];
  const lunchBlockSet = new Set();
  for (let t = 0; t < numBlocks; t++) {
    const blockStartMin = blockStartMinutes(timeBlocks[t]);
    const isLunch = lunchStartMin != null && lunchEndMin != null &&
      blockStartMin >= lunchStartMin && blockStartMin + blockDurationMinutes <= lunchEndMin;
    if (isLunch) lunchBlockSet.add(t);
    const openNow = people.filter((p) => {
      if (p.schedule[t] !== 'Open') return false;
      const sub = submissions.find((s) => s.email === p.email);
      if (sub && sub.driveTeam) return false;
      return true;
    });
    scoutAvailablePerBlock.push(openNow.filter(eligibleForScout).length);
  }
  const nonLunchAvailable = scoutAvailablePerBlock
    .map((n, t) => {
      if (lunchBlockSet.has(t)) return Infinity;
      if (lunchEndMin != null && blockStartMinutes(timeBlocks[t]) >= lunchEndMin) return Infinity; // no scouts after lunch
      return n;
    });
  const consistentScoutTarget = Math.min(
    MAX_SCOUTS,
    Math.max(MIN_SCOUTS, Math.min(...nonLunchAvailable))
  );

  for (let timeIdx = 0; timeIdx < numBlocks; timeIdx++) {
    if (blockStartMinutes(timeBlocks[timeIdx]) < SCOUT_START_MINUTES) continue;
    if (lunchBlockSet.has(timeIdx)) continue; // No scouts during lunch
    if (lunchEndMin != null && blockStartMinutes(timeBlocks[timeIdx]) >= lunchEndMin) continue; // No scouts after lunch
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
      const aPair = PIT_PAIR_NAMES.includes(a.name) ? 0 : 1;
      const bPair = PIT_PAIR_NAMES.includes(b.name) ? 0 : 1;
      if (aPair !== bPair) return aPair - bPair; // pair first
      const aExtend = preferExtendScout(a) ? 1 : 0;
      const bExtend = preferExtendScout(b) ? 1 : 0;
      if (aExtend !== bExtend) return bExtend - aExtend;
      return scoutCountSoFar(a) - scoutCountSoFar(b);
    });
    const target = Math.min(consistentScoutTarget, canScoutRemaining.length);
    let n = 0;
    canScoutRemaining.forEach((p) => {
      if (n >= target) return;
      if (p.schedule[timeIdx] !== 'Open') return;
      const otherOfPair = PIT_PAIR_NAMES.includes(p.name)
        ? people.find((q) => q !== p && PIT_PAIR_NAMES.includes(q.name))
        : null;
      const assignBoth = otherOfPair && otherOfPair.schedule[timeIdx] === 'Open' && (n + 2) <= target;
      p.schedule[timeIdx] = 'Scouting!';
      n++;
      if (assignBoth) {
        otherOfPair.schedule[timeIdx] = 'Scouting!';
        n++;
      }
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
          if (blockStartMinutes(timeBlocks[idx]) < SCOUT_START_MINUTES) continue;
          if (lunchBlockSet.has(idx)) continue; // No scouts during lunch
          if (lunchEndMin != null && blockStartMinutes(timeBlocks[idx]) >= lunchEndMin) continue; // No scouts after lunch
          const scoutCount = people.filter((q) => q.schedule[idx] === 'Scouting!').length;
          if (scoutCount < MAX_SCOUTS) {
            p.schedule[idx] = 'Scouting!';
            const otherOfPair = PIT_PAIR_NAMES.includes(p.name)
              ? people.find((q) => q !== p && PIT_PAIR_NAMES.includes(q.name))
              : null;
            if (otherOfPair && otherOfPair.schedule[idx] === 'Open') otherOfPair.schedule[idx] = 'Scouting!';
          }
        }
      }
      b = runEnd;
    }
  });

  PIT_PAIR_NAMES.forEach((name) => {
    const p = people.find((q) => q.name === name);
    if (p && p.schedule) {
      p.schedule[0] = 'Open';
      p.schedule[1] = 'Open';
    }
  });

  const validScoutBlockIndices = [];
  for (let t = 2; t < numBlocks; t++) {
    if (lunchBlockSet.has(t)) continue;
    const blockStartMin = blockStartMinutes(timeBlocks[t]);
    if (blockStartMin < SCOUT_START_MINUTES) continue;
    if (lunchEndMin != null && blockStartMin >= lunchEndMin) continue;
    validScoutBlockIndices.push(t);
  }
  const othersScoutCounts = people
    .filter((p) => !PIT_PAIR_NAMES.includes(p.name))
    .map((p) => (p.schedule || []).filter((s) => s === 'Scouting!').length);
  const totalOthersScout = othersScoutCounts.reduce((a, b) => a + b, 0);
  const numOthersWithScout = othersScoutCounts.filter((c) => c > 0).length;
  const averageScoutBlocks = numOthersWithScout > 0 ? totalOthersScout / numOthersWithScout : 0;
  const targetPairScout = Math.max(0, Math.min(validScoutBlockIndices.length, Math.round(averageScoutBlocks)));

  const joseph = people.find((q) => q.name === 'Joseph Cole');
  const aldous = people.find((q) => q.name === 'Aldous Heaf');
  if (joseph && aldous && joseph.schedule && aldous.schedule) {
    const pairScoutBlocks = validScoutBlockIndices.filter((t) => joseph.schedule[t] === 'Scouting!');
    const currentCount = pairScoutBlocks.length;
    if (currentCount > targetPairScout) {
      const toRemove = currentCount - targetPairScout;
      const blocksToClear = pairScoutBlocks.slice(-toRemove);
      blocksToClear.forEach((t) => {
        joseph.schedule[t] = 'Open';
        aldous.schedule[t] = 'Open';
        const openEligible = people.filter((p) => {
          if (PIT_PAIR_NAMES.includes(p.name)) return false;
          if (p.schedule[t] !== 'Open') return false;
          const sub = submissions.find((s) => s.email === p.email);
          if (sub && sub.driveTeam) return false;
          return eligibleForScout(p);
        });
        let added = 0;
        openEligible.forEach((p) => {
          if (added >= 2) return;
          p.schedule[t] = 'Scouting!';
          added++;
        });
      });
    } else if (currentCount < targetPairScout) {
      const toAdd = targetPairScout - currentCount;
      const candidateBlocks = validScoutBlockIndices.filter((t) => joseph.schedule[t] === 'Open');
      let added = 0;
      candidateBlocks.forEach((t) => {
        if (added >= toAdd) return;
        const scoutsHere = people.filter((q) => q.schedule[t] === 'Scouting!');
        if (scoutsHere.length < 8) return;
        const twoToRemove = scoutsHere.slice(0, 2).filter((q) => !PIT_PAIR_NAMES.includes(q.name));
        if (twoToRemove.length < 2) return;
        twoToRemove.forEach((q) => { q.schedule[t] = 'Open'; });
        joseph.schedule[t] = 'Scouting!';
        aldous.schedule[t] = 'Scouting!';
        added++;
      });
    }
  }

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
  const scheduleDay = config.scheduleDay || (config.numberOfDays === 1 ? 'saturday' : null);
  const daysCount = scheduleDay === 'saturday' ? 1 : Math.max(1, Number(numberOfDays) || 1);
  const blocksPerDay = generateTimeBlocks(
    competitionStartTime,
    competitionEndTime,
    blockMins,
    null,
    null
  );
  const numBlocks = blocksPerDay.length;
  const req = loadRequirements(numBlocks);

  let submissions = [];
  try {
    const csv = await fs.readFile(csvPath, 'utf8');
    submissions = parseSubmissions(parseCSV(csv), columnMap);
    submissions = submissions.filter((s) => !EXCLUDED_FROM_SCHEDULE_NAMES.includes(s.name));
    submissions.push({
      name: 'Aldous Heaf',
      email: 'aldous heaf',
      saturday: true,
      friday: false,
      wantsPits: true,
      wantsMechPit: true,
      wantsCtrlsPit: false,
      wantsSwPit: false,
      wantsJournalism: false,
      wantsStrategy: false,
      wantsMedia: false,
      driveTeam: false,
      cannotScout: false,
      unavailableTimes: '',
      conventionTalks: '',
    });
  } catch (e) {
    console.warn('no csv', csvPath, e.message);
  }

  const dayFilters =
    scheduleDay === 'saturday'
      ? [(s) => s.saturday === true]
      : [(s) => s.friday === true, (s) => s.saturday === true];
  const dayLabels = scheduleDay === 'saturday' ? ['Saturday'] : ['Friday', 'Saturday'];

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
      const people = runScheduling(daySubmissions, timeBlocks, req, blockMins, config.lunchStart, config.lunchEnd);
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
