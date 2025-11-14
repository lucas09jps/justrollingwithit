document.getElementById("generateBtn").addEventListener("click", getWorkout);

// Store current workout data globally
let currentWorkoutData = null;
let saveButtonListener = null;

function pickRandomNoRepeat(arr, k) {
  const copy = arr.slice();
  const picked = [];
  for (let i = 0; i < k && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

// Sanitize HTML to prevent XSS
function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Check if localStorage is available
function isLocalStorageAvailable() {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

// Check for duplicate workouts
function isDuplicateWorkout(workout) {
  if (!workout || !workout.exercises) return false;
  const saved = getSavedWorkouts();
  const workoutSignature = JSON.stringify(workout.exercises.map(e => e.title).sort());
  
  return saved.some(savedWorkout => {
    const savedSignature = JSON.stringify(savedWorkout.exercises.map(e => e.title).sort());
    return savedSignature === workoutSignature;
  });
}

// Get saved workouts with error handling
function getSavedWorkouts() {
  if (!isLocalStorageAvailable()) return [];
  try {
    return JSON.parse(localStorage.getItem('gymroll_saved_workouts') || '[]');
  } catch (e) {
    console.error('Error reading saved workouts:', e);
    return [];
  }
}

// Save workout with error handling
function saveWorkoutToStorage(workout) {
  if (!isLocalStorageAvailable()) {
    showError('Local storage is not available. Please check your browser settings.');
    return false;
  }
  
  try {
    const savedWorkouts = getSavedWorkouts();
    savedWorkouts.push(workout);
    localStorage.setItem('gymroll_saved_workouts', JSON.stringify(savedWorkouts));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      showError('Storage limit reached. Please delete some saved workouts.');
    } else {
      showError('Failed to save workout: ' + e.message);
    }
    return false;
  }
}

// Show error message
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  errorDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #ff4444; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; max-width: 90%;';
  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
}

// Custom prompt modal
function showNamePrompt(defaultName, callback) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;';
  
  const modalContent = document.createElement('div');
  modalContent.style.cssText = 'background: var(--gray); padding: 30px; border-radius: 12px; max-width: 90%; width: 400px;';
  
  const title = document.createElement('h3');
  title.textContent = 'Save Workout';
  title.style.cssText = 'margin: 0 0 15px 0; color: var(--accent);';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = defaultName;
  input.style.cssText = 'width: 100%; padding: 12px; margin-bottom: 15px; background: var(--bg); color: var(--text); border: 2px solid var(--accent); border-radius: 8px; font-size: 1rem; box-sizing: border-box;';
  input.select();
  
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding: 10px 20px; background: transparent; color: var(--text); border: 2px solid var(--gray); border-radius: 8px; cursor: pointer;';
  cancelBtn.onclick = () => modal.remove();
  
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'padding: 10px 20px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;';
  saveBtn.onclick = () => {
    const name = input.value.trim() || defaultName;
    modal.remove();
    callback(name);
  };
  
  input.onkeydown = (e) => {
    if (e.key === 'Enter') saveBtn.click();
    if (e.key === 'Escape') cancelBtn.click();
  };
  
  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);
  modalContent.appendChild(title);
  modalContent.appendChild(input);
  modalContent.appendChild(buttonContainer);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  input.focus();
}

async function getWorkout() {
  const length = document.getElementById('length').value;
  const intensity = document.getElementById('intensity').value;
  const muscle = document.getElementById('muscle').value;
  const materialsSlider = document.getElementById('materialsSlider');
  const materials = materialsSlider && materialsSlider.checked ? 'Yes' : 'No';
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

  // Store workout data for saving
  currentWorkoutData = {
    exercises: plan.map(r => ({
      title: r[colExercise] || 'Exercise',
      intensity: r[colIntensity] || '',
      materials: r[colMaterials] || ''
    })),
    settings: {
      length,
      intensity,
      muscle,
      materials
    },
    date: new Date().toISOString()
  };

  const outEl = document.getElementById('workoutResult');
  const exercisesHtml = plan.map(r => {
    const title = sanitizeHTML(r[colExercise] || 'Exercise');
    const inten = sanitizeHTML(r[colIntensity] || '');
    const mats = sanitizeHTML(r[colMaterials] || '');
    return `<div style="margin-bottom:12px"><strong>${title}</strong> <span style="color:#999;font-size:0.9rem">(${inten}${' Intensity'}${mats?', requires materials: ' + mats:''})</span></div>`;
  }).join('');
  
  const isDup = isDuplicateWorkout(currentWorkoutData);
  
  outEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 1.3rem;">Your Workout</h2>
      <button id="saveWorkoutBtn" class="save-btn" title="${isDup ? 'This workout is already saved' : 'Save workout'}" ${isDup ? 'disabled' : ''}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
      </button>
    </div>
    ${exercisesHtml}
  `;

  // Remove old listener if exists
  const saveBtn = document.getElementById('saveWorkoutBtn');
  if (saveButtonListener) {
    saveBtn.removeEventListener('click', saveButtonListener);
  }
  
  // Add new event listener
  if (!isDup) {
    saveButtonListener = handleSaveWorkout;
    saveBtn.addEventListener('click', saveButtonListener);
  }
}

function handleSaveWorkout() {
  if (!currentWorkoutData) return;

  // Generate default name
  const defaultName = `${currentWorkoutData.settings.length} ${currentWorkoutData.settings.intensity} intensity for ${currentWorkoutData.settings.muscle} Groups`;
  
  // Check for duplicates
  if (isDuplicateWorkout(currentWorkoutData)) {
    showError('This workout is already saved!');
    return;
  }
  
  // Show custom prompt
  showNamePrompt(defaultName, (workoutName) => {
    // Get existing saved workouts
    const savedWorkouts = getSavedWorkouts();
    
    // Add new workout
    const workoutToSave = {
      id: Date.now().toString(),
      name: sanitizeHTML(workoutName.trim() || defaultName),
      ...currentWorkoutData
    };
    
    // Save to localStorage
    if (saveWorkoutToStorage(workoutToSave)) {
      // Show success message
      const successDiv = document.createElement('div');
      successDiv.className = 'success-message';
      successDiv.textContent = `Workout "${workoutName}" saved successfully!`;
      successDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4CAF50; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; max-width: 90%;';
      document.body.appendChild(successDiv);
      setTimeout(() => successDiv.remove(), 3000);
      
      // Update button to show it's saved
      const saveBtn = document.getElementById('saveWorkoutBtn');
      saveBtn.style.opacity = '0.6';
      saveBtn.style.cursor = 'not-allowed';
      saveBtn.disabled = true;
      saveBtn.title = 'Workout saved!';
    }
  });
}

// Function to delete a saved workout
function deleteWorkout(id) {
  if (!isLocalStorageAvailable()) {
    showError('Local storage is not available.');
    return;
  }
  
  try {
    const savedWorkouts = getSavedWorkouts();
    const filtered = savedWorkouts.filter(w => w.id !== id);
    localStorage.setItem('gymroll_saved_workouts', JSON.stringify(filtered));
    return true;
  } catch (e) {
    showError('Failed to delete workout: ' + e.message);
    return false;
  }
}
