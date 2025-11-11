document.getElementById("generateBtn").addEventListener("click", getWorkout);

function pickRandomNoRepeat(arr, k) {
  const copy = arr.slice();
  const picked = [];
  for (let i = 0; i < k && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

async function getWorkout() {
  const length = document.getElementById('length').value;
  const intensity = document.getElementById('intensity').value;
  const muscle = document.getElementById('muscle').value;
  const materials = document.getElementById('materials') ? document.getElementById('materials').value : 'Yes';
  // Try local CSV first (served with the app). Fallback to remote Sheets CSV if local not available.
  let data = null;
  try {
    const localResp = await fetch('gymroll_exercises.csv');
    if (localResp.ok) data = await localResp.text();
  } catch (e) {
    // ignore, try remote below
  }

  if (!data) {
    // fallback remote (may have CORS issues depending on how the sheet is published)
    try {
      const resp = await fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vSbwap5CoddTAU_DGfWBvpke_2qAasYAgGmlgWsn6gGe7K2GKX5NOzZjLHQdJknqfwgbPzBAgKUXXBx/pub?output=csv');
      if (resp.ok) data = await resp.text();
    } catch (e) {
      // leave data null
    }
  }

  if (!data) {
    document.getElementById('workoutResult').innerText = "Could not load exercises CSV (check path or CORS).";
    return;
  }

  // Robust CSV parsing (handles quoted fields and commas inside quotes)
  function parseCSV(text) {
    const rows = [];
    let cur = '';
    let field = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i+1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          field.push(cur);
          cur = '';
        } else if (ch === '\r') {
          // ignore
        } else if (ch === '\n') {
          field.push(cur);
          rows.push(field);
          field = [];
          cur = '';
        } else {
          cur += ch;
        }
      }
    }
    // push last
    if (inQuotes) { /* unterminated quotes, still push what we have */ }
    if (cur !== '' || field.length > 0) {
      field.push(cur);
      rows.push(field);
    }
    return rows;
  }

  const parsed = parseCSV(data).map(r => r.map(c => c.trim()));
  if (parsed.length < 2) {
    document.getElementById('workoutResult').innerText = "No data available.";
    return;
  }

  const header = parsed[0].map(h => h.toString().trim().toLowerCase());
  const rows = parsed.slice(1).filter(r => r.some(c => c !== ''));

  const colMuscle = header.indexOf('muscle') >= 0 ? header.indexOf('muscle') : (header.indexOf('musclegroup') >= 0 ? header.indexOf('musclegroup') : -1);
  const colExercise = header.indexOf('exercise') >= 0 ? header.indexOf('exercise') : (header.indexOf('workout') >= 0 ? header.indexOf('workout') : 1);
  const colIntensity = header.indexOf('intensity') >= 0 ? header.indexOf('intensity') : -1;
  const colMaterials = header.indexOf('materials') >= 0 ? header.indexOf('materials') : -1;

  const norm = s => (s || '').toString().trim().toLowerCase();

  let filtered = rows.filter(r => {
    const rMus = norm(r[colMuscle] || '');
    const targetMus = norm(muscle);
    if (targetMus === 'full') return rMus === 'full' || rMus === 'full body' || rMus === 'fullbody';
    return rMus === targetMus;
  });

  if (filtered.length === 0) {
    document.getElementById('workoutResult').innerText = "No workouts found for that muscle group.";
    return;
  }

  if (materials === 'No') {
    if (colMaterials >= 0) {
      filtered = filtered.filter(r => {
        const req = norm(r[colMaterials] || '');
        return req === 'no' || req === 'none' || req === 'bodyweight' || req === 'bw' || req === 'no equipment' || req === 'n';
      });
    } else {
      // infer from exercise name
      filtered = filtered.filter(r => {
        const t = norm(r[colExercise] || '');
        const forbidden = ['dumbbell','barbell','kettlebell','machine','band','bench','plate','pull-up','rower'];
        return !forbidden.some(f => t.includes(f));
      });
    }
  }

  if (filtered.length === 0) {
    document.getElementById('workoutResult').innerText = "No workouts available for the selected materials option.";
    return;
  }

  const easy = filtered.filter(r => norm(r[colIntensity] || '') === 'easy');
  const medium = filtered.filter(r => norm(r[colIntensity] || '') === 'medium');
  const hard = filtered.filter(r => norm(r[colIntensity] || '') === 'hard');

  const ranges = { 'Short': [1,2], 'Medium': [3,4], 'Long': [5,6] };
  const rng = ranges[length] || ranges['Medium'];
  const count = Math.floor(Math.random() * (rng[1] - rng[0] + 1)) + rng[0];

  let plan = [];
  if (intensity === 'Hard') {
    const nHard = Math.round(count * 0.75);
    const nMedium = count - nHard;
    plan = pickRandomNoRepeat(hard, nHard).concat(pickRandomNoRepeat(medium, nMedium));
  } else if (intensity === 'Easy') {
    const nEasy = Math.round(count * 0.75);
    const nMedium = count - nEasy;
    plan = pickRandomNoRepeat(easy, nEasy).concat(pickRandomNoRepeat(medium, nMedium));
  } else {
    const nMedium = Math.round(count * 0.6);
    const rest = count - nMedium;
    const nEasy = Math.floor(rest / 2);
    const nHard = rest - nEasy;
    plan = pickRandomNoRepeat(medium, nMedium).concat(pickRandomNoRepeat(easy, nEasy)).concat(pickRandomNoRepeat(hard, nHard));
  }

  if (plan.length < count) {
    const needed = count - plan.length;
    const already = new Set(plan.map(r => r.join('|')));
    const candidates = filtered.filter(r => !already.has(r.join('|')));
    plan = plan.concat(pickRandomNoRepeat(candidates, needed));
  }

  plan = plan.sort(() => Math.random() - 0.5).slice(0, count);

  const outEl = document.getElementById('workoutResult');
  outEl.innerHTML = plan.map(r => {
    const title = r[colExercise] || 'Exercise';
    const inten = r[colIntensity] || '';
    const mats = r[colMaterials] || '';
    return `<div style="margin-bottom:12px"><strong>${title}</strong> <span style="color:#999;font-size:0.9rem">(${inten}${' Intensity'}${mats?', requires materials: ' + mats:''})</span></div>`;
  }).join('');
}