const SUPABASE_URL = 'https://rmipwhipavlapgpfjaxk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DePCBxQvrPxz0xZd99aITA_lPJFVPU2';
//const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const db = supabase.createClient("YOUR_SUPABASE_URL", "YOUR_SUPABASE_ANON_KEY");

const frmAdmin = document.getElementById("frmAdmin");
const medSearchInput = document.getElementById("medSearchInput");
const medDurationInput = document.getElementById("medDuration");
const medIntervalInput = document.getElementById("medInterval");
const grid = document.getElementById("medGrid");
const prevBtn = document.getElementById("prevDay");
const dayDisplay = document.getElementById("currentDayDisplay");

const timeColumns = ["06:00", "10:00", "12:00", "14:00", "18:00", "22:00", "00:00"];
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

let userRole = 'patient';
let activePatientId = null;
let dayOffset = 0;
let catalogMap = new Map();

// 1. Initialize Session & Role Permissions
async function setupSession(user) {
  userRole = user.app_metadata?.role || 'patient';
  frmAdmin.toggleAttribute('hidden', userRole !== 'admin');

  if (userRole === 'admin') {
    await loadMedicationCatalog();
  } else {
    activePatientId = user.id;
    dayOffset = 0;
    await loadGridData();
  }
}

// 2. Load Master Medication Catalog into Datalist (Admin Only)
async function loadMedicationCatalog() {
  const { data: meds } = await db
    .from('medications')
    .select('id, name, mg, default_duration_days, default_interval_hours')
    .order('name', { ascending: true });

  const datalist = document.getElementById("medCatalogList");
  datalist.innerHTML = "";
  catalogMap.clear();

  (meds || []).forEach(med => {
    const label = `${med.name} (${med.mg}mg)`;
    catalogMap.set(label, med);

    const option = document.createElement("option");
    option.value = label;
    datalist.appendChild(option);
  });
}

// 3. Auto-Fill Default Duration & Interval on Medication Selection
medSearchInput.addEventListener("input", () => {
  const selectedMed = catalogMap.get(medSearchInput.value);
  if (!selectedMed) return;

  medDurationInput.value = selectedMed.default_duration_days;
  medIntervalInput.value = selectedMed.default_interval_hours;
});

// 4. Admin Form Submission: Set Treatment Date & Add Prescription
frmAdmin.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (userRole !== 'admin') return;

  const selectedMed = catalogMap.get(medSearchInput.value);
  if (!selectedMed) {
    alert("Selecione um medicamento válido da lista.");
    return;
  }

  activePatientId = document.getElementById("patientIdInput").value.trim();
  const startDateValue = document.getElementById("treatmentStartDate").value;
  const selectedTimes = [...frmAdmin.querySelectorAll('.time-selector input:checked')].map(cb => cb.value);

  if (selectedTimes.length === 0) {
    alert("Selecione pelo menos um horário.");
    return;
  }

  await db.from('profile')
    .update({ treatment_start_date: startDateValue })
    .eq('id', activePatientId);

  const { error } = await db.from('prescriptions').insert({
    patient_id: activePatientId,
    medication_id: selectedMed.id,
    dosage: Number(document.getElementById("medDosage").value),
    duration_days: Number(medDurationInput.value),
    interval_hours: Number(medIntervalInput.value),
    schedule_times: selectedTimes
  });

  if (!error) {
    medSearchInput.value = "";
    document.getElementById("medDosage").value = "";
    medDurationInput.value = "";
    medIntervalInput.value = "";
    frmAdmin.querySelectorAll('.time-selector input:checked').forEach(cb => cb.checked = false);
    dayOffset = 0;
    await loadGridData();
  }
});

// 5. Render 12x12 Schedule Grid
async function loadGridData() {
  if (!activePatientId) return;

  const { data: profile } = await db
    .from('profile')
    .select('treatment_start_date')
    .eq('id', activePatientId)
    .single();

  if (!profile?.treatment_start_date) return;

  const adminDateInput = document.getElementById("treatmentStartDate");
  if (adminDateInput && !adminDateInput.value) {
    adminDateInput.value = profile.treatment_start_date;
  }

  const baseStartDate = new Date(profile.treatment_start_date + 'T00:00:00');
  const activeDate = new Date(baseStartDate);
  activeDate.setDate(baseStartDate.getDate() + dayOffset);
  const isoDate = activeDate.toISOString().split('T')[0];

  prevBtn.disabled = (dayOffset <= 0);
  dayDisplay.innerHTML = `<strong>${dateFormatter.format(activeDate)}</strong>`;

  const [{ data: prescriptions }, { data: logs }] = await Promise.all([
    db.from('prescriptions')
      .select('id, dosage, duration_days, interval_hours, schedule_times, medications(name, mg)')
      .eq('patient_id', activePatientId),
    db.from('medication_logs')
      .select('prescription_id, log_time, is_checked')
      .eq('patient_id', activePatientId)
      .eq('log_date', isoDate)
  ]);

  const logMap = Object.fromEntries((logs || []).map(l => [`${l.prescription_id}-${l.log_time}`, l.is_checked]));

  const headers = [...document.querySelectorAll(".grid-header")];
  grid.replaceChildren(...headers);

  (prescriptions || []).forEach(rx => {
    if (dayOffset >= rx.duration_days) return;

    const daysLeft = rx.duration_days - dayOffset;
    const medInfo = rx.medications;

    const nameCell = document.createElement("div");
    nameCell.className = "grid-cell med-name";
    nameCell.innerHTML = `<span>${medInfo.name}</span><span class="badge">${daysLeft}d restando</span>`;
    grid.appendChild(nameCell);

    [medInfo.mg, rx.dosage, rx.duration_days, rx.interval_hours].forEach(val => appendCell(val));

    timeColumns.forEach(time => {
      const cell = document.createElement("div");
      cell.className = "grid-cell";

      if (rx.schedule_times.includes(time)) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!logMap[`${rx.id}-${time}`];
        cb.disabled = (userRole !== 'patient');

        cb.addEventListener("change", async () => {
          await db.from('medication_logs').upsert({
            prescription_id: rx.id,
            patient_id: activePatientId,
            log_date: isoDate,
            log_time: time,
            is_checked: cb.checked
          }, { onConflict: 'prescription_id,log_date,log_time' });
        });

        cell.appendChild(cb);
      }
      grid.appendChild(cell);
    });
  });

  // Pad remaining rows to maintain at least a 12-row grid structure
  const currentRows = grid.children.length / 12;
  for (let i = currentRows; i < 12; i++) {
    for (let j = 0; j < 12; j++) appendCell("");
  }
}

function appendCell(text) {
  const cell = document.createElement("div");
  cell.className = "grid-cell";
  cell.textContent = text;
  grid.appendChild(cell);
}

// 6. Day Navigation Listeners
document.getElementById("nextDay").addEventListener("click", () => {
  dayOffset++;
  loadGridData();
});

document.getElementById("prevDay").addEventListener("click", () => {
  if (dayOffset > 0) {
    dayOffset--;
    loadGridData();
  }
});

// Listen for Supabase Auth changes automatically
db.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    setupSession(session.user);
  }
});





/*const initialMedications = [
  { id: 1, name: "Cefadroxila", mg: 500, dosage: 1, duration: 7, interval: 12, hours: ["10:00", "22:00"] },
  { id: 2, name: "Dipirona", mg: 1000, dosage: 1, duration: 10, interval: 6, hours: ["06:00", "12:00", "18:00", "00:00"] }
];

const timeColumns = ["06:00", "10:00", "12:00", "14:00", "18:00", "22:00", "00:00"];
let dayOffset = 0; 

const grid = document.getElementById("medGrid");
const startDateInput = document.getElementById("startDate");
const dayDisplay = document.getElementById("currentDayDisplay");
const prevBtn = document.getElementById("prevDay");

// Baseline native date formatter for dd/mm localization layout configurations
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

function renderGrid() {
  const headers = document.querySelectorAll(".grid-header");
  grid.innerHTML = "";
  headers.forEach(h => grid.appendChild(h));

  // Use 'T00:00:00' to accurately parse local browser timezone parameters instead of UTC
  const baseDate = new Date(startDateInput.value + 'T00:00:00');
  
  // Calculate active day parameter by reference manipulation
  const activeDate = new Date(baseDate);
  activeDate.setDate(baseDate.getDate() + dayOffset);

  // Lock the backward navigation layout button securely if timeline sits at the starting mark
  prevBtn.disabled = (dayOffset <= 0);

  initialMedications.forEach(med => {
    // Exclude item if dynamic offset step bypasses allocated duration boundaries
    if (dayOffset >= med.duration) {
      return; 
    }

    appendCell(med.name, "med-name");
    appendCell(med.mg);
    appendCell(med.dosage);
    appendCell(med.duration);
    appendCell(med.interval);

    timeColumns.forEach(time => {
      const cell = document.createElement("div");
      cell.className = "grid-cell";

      if (med.hours.includes(time)) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        
        // Build storage strings specific to absolute localized date strings
        const dateStringKey = activeDate.toISOString().split('T')[0];
        const storageKey = `med-${med.id}-${dateStringKey}-${time}`;
        
        cb.checked = localStorage.getItem(storageKey) === "true";
        cb.addEventListener("change", () => {
          localStorage.setItem(storageKey, cb.checked);
        });
        cell.appendChild(cb);
      }
      grid.appendChild(cell);
    });
  });

  // Maintain structure balancing for exactly 12 columns across empty padding cells
  const currentRows = grid.children.length / 12;
  for (let i = currentRows; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      appendCell("");
    }
  }

  dayDisplay.innerHTML = `<strong>${dateFormatter.format(activeDate)}</strong>`;
}

function appendCell(text, extraClass = "") {
  const cell = document.createElement("div");
  cell.className = `grid-cell ${extraClass}`;
  cell.textContent = text;
  grid.appendChild(cell);
}

document.getElementById("nextDay").addEventListener("click", () => {
  dayOffset++;
  renderGrid();
});

document.getElementById("prevDay").addEventListener("click", () => {
  if (dayOffset > 0) {
    dayOffset--;
    renderGrid();
  }
});

startDateInput.addEventListener("change", () => {
  dayOffset = 0; 
  renderGrid();
});

renderGrid();

*/