const fs = require('fs').promises;
const path = require('path');

const OUT = path.join(__dirname, 'responses.csv');

const FIRST = ['Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Reese', 'Alex', 'Sam', 'Jamie', 'Drew', 'Blake', 'Cameron', 'Skyler', 'Parker', 'Finley', 'Emerson', 'Hayden', 'River', 'Phoenix', 'Sage', 'Rowan', 'Kai', 'Nico', 'Jesse', 'Robin', 'Charlie', 'Dakota', 'Remi', 'Frankie', 'Harper', 'Ellis', 'Reign', 'Arlo', 'Marlo', 'Shiloh', 'Winter', 'Lennox', 'Oakley', 'Peyton', 'Sawyer', 'Teagan', 'Wren'];
const LAST = ['Chen', 'Kim', 'Martinez', 'Nguyen', 'Patel', 'Thompson', 'Williams', 'Zhang', 'Anderson', 'Davis', 'Garcia', 'Johnson', 'Lee', 'Miller', 'Wilson', 'Brown', 'Clark', 'Lewis', 'Hall', 'Young', 'King', 'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins'];

const HEADERS = [
  'Name', 'Email Address', 'Do you want to be in the Pits?', 'Drive team?',
  'What times would you prefer?', 'How often would you like to be in the pits?',
  'Cannot Scout?', 'Preferred Roles (comma-separated)', 'Unavailable Times',
  'Hours at convention / talks?',
];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function csv(val) {
  const s = String(val ?? '');
  if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function email(first, last) {
  return first.toLowerCase().replace(/\s+/g, '') + '.' + last.toLowerCase().replace(/\s+/g, '') + '@catlin.edu';
}

async function main() {
  const count = Math.max(1, parseInt(process.argv[2], 10) || 50);
  const seen = new Set();
  const people = [];
  while (people.length < count) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const name = first + ' ' + last;
    const em = email(first, last);
    if (seen.has(em)) continue;
    seen.add(em);
    people.push({ name, email: em });
  }

  const indices = shuffle(people.map((_, i) => i));
  const numFab = Math.round(0.6 * count);
  const fabSet = new Set(indices.slice(0, numFab));
  const driveSet = new Set(indices.slice(0, 4));
  const photoSet = new Set(indices.slice(4, 6));
  const journalSet = new Set(indices.slice(6, 8));

  const rows = people.map((p, i) => {
    const wantsPits = fabSet.has(i) ? 'Yes' : 'No';
    const driveTeam = driveSet.has(i) ? 'Yes' : 'No';
    let preferredRoles = '';
    if (photoSet.has(i)) preferredRoles = 'Photography';
    else if (journalSet.has(i)) preferredRoles = 'Journalist';
    else if (fabSet.has(i)) preferredRoles = 'Pits';
    else preferredRoles = 'Scouting!';
    return [
      csv(p.name), csv(p.email),
      wantsPits,
      driveTeam,
      pick(['Morning', 'Afternoon', 'All day', '']),
      pick(['Once', 'Twice', 'All day', '']),
      pick(['No', 'No', 'No', 'No', 'Yes']),
      preferredRoles,
      pick(['', '', '12:00-13:00', '11:00-12:00']),
      pick(['', '', '9:00-11:00', '10:00-12:00', '14:00-15:00', '9:00-10:00']),
    ].join(',');
  });

  await fs.writeFile(OUT, [HEADERS.join(','), ...rows].join('\n'), 'utf8');
  console.log('wrote', rows.length, 'to', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
