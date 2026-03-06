let scheduleDays = [];

function showLoadingScreen() {
  const el = document.getElementById('loadingScreen');
  if (el) el.classList.remove('hidden');
}
function hideLoadingScreen() {
  const el = document.getElementById('loadingScreen');
  if (el) el.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  showLoadingScreen();
  loadSchedule();
  const btn = document.getElementById('regenerateBtn');
  if (btn) btn.addEventListener('click', async () => {
    btn.disabled = true;
    showLoadingScreen();
    try {
      const res = await fetch('/api/regenerate');
      if (res.ok) await loadSchedule();
      else hideLoadingScreen();
    } catch (_) {
      hideLoadingScreen();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Regenerate';
    }
  });
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = (searchInput.value || '').trim().toLowerCase();
      document.querySelectorAll('.schedule-row').forEach((tr) => {
        const name = (tr.getAttribute('data-person-name') || '').toLowerCase();
        tr.classList.toggle('tr-row-hidden', q.length > 0 && !name.includes(q));
      });
    });
  }
  document.getElementById('scheduleContainer').addEventListener('click', (e) => {
    const cell = e.target.closest('td[data-role]');
    if (!cell) return;
    const role = cell.getAttribute('data-role');
    const dayIndex = parseInt(cell.getAttribute('data-day-index'), 10);
    if (role && role !== 'Open' && !isNaN(dayIndex) && scheduleDays[dayIndex]) {
      showRolePanel(scheduleDays[dayIndex], role);
    }
  });
  const closeBtn = document.querySelector('.role-panel-close');
  const panel = document.getElementById('rolePanel');
  if (closeBtn && panel) {
    closeBtn.addEventListener('click', () => { panel.classList.add('hidden'); panel.setAttribute('aria-hidden', 'true'); });
    panel.addEventListener('click', (e) => { if (e.target === panel) { panel.classList.add('hidden'); panel.setAttribute('aria-hidden', 'true'); } });
  }
});

function showRolePanel(day, role) {
  const titleEl = document.getElementById('rolePanelTitle');
  const bodyEl = document.getElementById('rolePanelBody');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = role;
  const roleSlug = role.toLowerCase().replace(/[^a-z]/g, '');
  const panel = document.getElementById('rolePanel');
  panel.setAttribute('data-role-slug', roleSlug);
  const blocks = day.timeBlocks || [];
  const people = day.people || [];
  let html = '<p class="role-panel-subtitle">' + escapeHtml(day.label) + ' — who has this role each block</p>';
  html += '<table class="role-panel-table"><thead><tr><th>Time</th><th>People</th></tr></thead><tbody>';
  blocks.forEach((_, i) => {
    const assigned = people.filter((p) => (p.schedule || [])[i] === role);
    const time = escapeHtml(blocks[i]);
    let peopleCell = '';
    if (assigned.length) {
      peopleCell = '<div class="role-panel-chips">' +
        assigned.map((p) => '<span class="role-panel-chip">' + escapeHtml(p.name) + '</span>').join('') +
        '</div>';
    } else {
      peopleCell = '<span class="role-panel-empty">—</span>';
    }
    html += '<tr><td class="role-panel-time">' + time + '</td><td class="role-panel-people">' + peopleCell + '</td></tr>';
  });
  html += '</tbody></table>';
  bodyEl.innerHTML = html;
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function loadSchedule() {
  const container = document.getElementById('scheduleContainer');
  const timeoutMs = 20000;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('/api/schedule', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(res.statusText || 'Failed to load');
    const data = await res.json();
    const days = data.days || (data.schedule && data.schedule.days) || [];
    if (!days.length) {
      hideLoadingScreen();
      container.innerHTML = '<div class="empty">No schedule. Check CSV path in config and regenerate.</div>';
      return;
    }
    scheduleDays = days;
    container.innerHTML = '';
    const daysToShow = days.filter((d) => (d.label || '').toLowerCase() !== 'saturday');
    daysToShow.forEach((day, dayIndex) => {
      const realDayIndex = days.indexOf(day);
      const section = document.createElement('section');
      section.className = 'day-section';
      section.setAttribute('data-day-index', String(realDayIndex));
      const title = document.createElement('h2');
      title.className = 'day-title';
      title.textContent = day.label;
      section.appendChild(title);
      const table = document.createElement('table');
      table.className = 'schedule-table';
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      const thName = document.createElement('th');
      thName.className = 'col-name';
      thName.textContent = 'Name';
      headerRow.appendChild(thName);
      (day.timeBlocks || []).forEach((block) => {
        const th = document.createElement('th');
        th.className = 'col-time';
        th.textContent = block;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      (day.people || []).forEach((person) => {
        const tr = document.createElement('tr');
        tr.className = 'schedule-row';
        tr.setAttribute('data-person-name', person.name || '');
        const tdName = document.createElement('td');
        tdName.className = 'col-name';
        tdName.textContent = person.name;
        tr.appendChild(tdName);
        (person.schedule || []).forEach((status, timeIdx) => {
          const td = document.createElement('td');
          td.textContent = status;
          td.className = 'cell cell--' + (status || 'open').toLowerCase().replace(/[^a-z]/g, '');
          if (status && status !== 'Open') {
            td.setAttribute('data-role', status);
            td.setAttribute('data-day-index', String(realDayIndex));
            td.style.cursor = 'pointer';
            td.title = 'Click to see who has ' + status + ' per time';
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-scroll';
      tableWrap.appendChild(table);
      section.appendChild(tableWrap);

      const blocks = day.timeBlocks || [];
      const countsPerBlock = blocks.map((_, timeIdx) => {
        const counts = {};
        (day.people || []).forEach((p) => {
          const s = (p.schedule || [])[timeIdx] || 'Open';
          counts[s] = (counts[s] || 0) + 1;
        });
        return counts;
      });
      const allRoles = [...new Set(countsPerBlock.flatMap((c) => Object.keys(c)))].sort();
      const summaryTable = document.createElement('table');
      summaryTable.className = 'schedule-table summary-table';
      const summaryThead = document.createElement('thead');
      const summaryHeaderRow = document.createElement('tr');
      const summaryThName = document.createElement('th');
      summaryThName.className = 'col-name';
      summaryThName.textContent = 'Count by role';
      summaryHeaderRow.appendChild(summaryThName);
      blocks.forEach((block) => {
        const th = document.createElement('th');
        th.className = 'col-time';
        th.textContent = block;
        summaryHeaderRow.appendChild(th);
      });
      summaryThead.appendChild(summaryHeaderRow);
      summaryTable.appendChild(summaryThead);
      const summaryTbody = document.createElement('tbody');
      allRoles.forEach((role) => {
        const tr = document.createElement('tr');
        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-name';
        tdLabel.textContent = role;
        tdLabel.setAttribute('data-role', role);
        tdLabel.setAttribute('data-day-index', String(realDayIndex));
        tdLabel.style.cursor = 'pointer';
        tdLabel.title = 'Click to see who has ' + role + ' per time';
        tr.appendChild(tdLabel);
        countsPerBlock.forEach((counts) => {
          const td = document.createElement('td');
          td.textContent = counts[role] || 0;
          td.className = 'cell cell--' + role.toLowerCase().replace(/[^a-z]/g, '');
          tr.appendChild(td);
        });
        summaryTbody.appendChild(tr);
      });
      summaryTable.appendChild(summaryTbody);
      const summaryTitle = document.createElement('h3');
      summaryTitle.className = 'summary-title';
      summaryTitle.textContent = 'Count per half-hour';
      section.appendChild(summaryTitle);
      const summaryWrap = document.createElement('div');
      summaryWrap.className = 'table-scroll';
      summaryWrap.appendChild(summaryTable);
      section.appendChild(summaryWrap);

      if (day.scoutCheck && day.scoutCheck.length > 0) {
        const checkTitle = document.createElement('h3');
        checkTitle.className = 'summary-title';
        checkTitle.textContent = 'Scouting check';
        section.appendChild(checkTitle);
        const checkTable = document.createElement('table');
        checkTable.className = 'schedule-table summary-table scout-check-table';
        const checkThead = document.createElement('thead');
        checkThead.innerHTML = '<tr><th class="col-name">Name</th><th>Scouting hours</th><th>Hours in pits</th><th>Status</th></tr>';
        checkTable.appendChild(checkThead);
        const checkTbody = document.createElement('tbody');
        const pitRoles = ['Mech Pit', 'Ctrls Pit', 'Pit Lead'];
        day.scoutCheck.forEach((row) => {
          const person = (day.people || []).find((p) => p.name === row.name);
          const pitBlocks = person ? (person.schedule || []).filter((s) => pitRoles.includes(s)).length : 0;
          const hoursInPits = (pitBlocks * 0.5).toFixed(1);
          const tr = document.createElement('tr');
          tr.className = 'scout-check--' + row.status;
          tr.innerHTML =
            '<td class="col-name">' +
            escapeHtml(row.name) +
            '</td><td>' +
            (row.scoutingBlocks * 0.5).toFixed(1) + ' hr</td><td>' +
            hoursInPits + ' hr</td><td>' +
            escapeHtml(row.status === 'exempt' ? 'Exempt' : row.status === 'none' ? 'No scouting' : row.status === 'low' ? 'Low' : 'OK') +
            '</td>';
          checkTbody.appendChild(tr);
        });
        checkTable.appendChild(checkTbody);
        const checkWrap = document.createElement('div');
        checkWrap.className = 'table-scroll';
        checkWrap.appendChild(checkTable);
        section.appendChild(checkWrap);
      }

      container.appendChild(section);
    });
    hideLoadingScreen();
  } catch (e) {
    hideLoadingScreen();
    const isTimeout = e.name === 'AbortError';
    const msg = isTimeout
      ? 'Schedule is taking a while. If the server is still building, try refreshing in a moment.'
      : 'Error loading schedule: ' + escapeHtml(e.message);
    container.innerHTML = '<div class="empty">' + msg + '</div>';
  }
}
