
const SUPABASE_URL = 'https://rmipwhipavlapgpfjaxk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DePCBxQvrPxz0xZd99aITA_lPJFVPU2';
const db = supabase.createClient("SUPABASE_URL", "SUPABASE_KEY");

const frmLogin = document.getElementById("frmLogin");
const appContainer = document.getElementById("appContainer");
const frmAdmin = document.getElementById("frmAdmin");
const patientSelect = document.getElementById("patientSelect");
const medSelectionArea = document.getElementById("medSelectionArea");
const medChecklist = document.getElementById("medChecklist");
const scheduleSection = document.getElementById("scheduleSection");
const grid = document.getElementById("medGrid");
const prevBtn = document.getElementById("prevDay");
const dayDisplay = document.getElementById("currentDayDisplay");

const timeColumns = ["06:00", "10:00", "12:00", "14:00", "18:00", "22:00", "00:00"];
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

let userRole = 'patient';
let activePatientId = null;
let dayOffset = 0;

// 1. Login & Logout Handlers
frmLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("loginError");
  errorEl.hidden = true;

  const { error } = await db.auth.signInWithPassword({
    email: document.getElementById("loginEmail").value.trim(),
    password: document.getElementById("loginPassword").value
  });

  if (error) {
    errorEl.textContent = "Falha no login: " + error.message;
    errorEl.hidden = false;
  }
});

document.getElementById("btnLogout").addEventListener("click", () => db.auth.signOut());

// 2. Auth State Listener
db.auth.onAuthStateChange(async (_event, session) => {
  if (!session?.user) {
    frmLogin.hidden = false;
    appContainer.hidden = true;
    return;
  }

  const user = session.user;
  userRole = user.app_metadata?.role || 'patient';

  frmLogin.hidden = true;
  appContainer.hidden = false;
  document.getElementById("userStatus").textContent = `${user.email} (${userRole.toUpperCase()})`;

  frmAdmin.toggleAttribute('hidden', userRole !== 'admin');

  if (userRole === 'admin') {
    scheduleSection.hidden = true;
    medSelectionArea.hidden = true;
    await loadAdminDropdowns();
  } else {
    activePatientId = user.id;
    dayOffset = 0;
    scheduleSection.hidden = false;
    await loadGridData();
  }
});

// 3. Populate Admin Patient Dropdown & Medication Checklist
async function loadAdminDropdowns() {
  const [{ data: patients }, { data: meds }] = await Promise.all([
    db.from('profile').select('id, full_name').eq('role', 'patient').order('full_name'),
    db.from('medications').select('*').order('name')
  ]);

  patientSelect.innerHTML = '<option value="">-- Escolha um paciente --</option>';
  (patients || []).forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.full_name || p.id;
    patientSelect.appendChild(opt);
  });

  medChecklist.innerHTML = "";
  (meds || []).forEach(med => {
    const item = document.createElement("div");
    item.className = "med-item";
    item.dataset.medId = med.id;

    const timesHtml = timeColumns
      .map(t => `<label><input type="checkbox" class="time-cb" value="${t}"> ${t}</label>`)
      .join("");

    item.innerHTML = `
      <label class="med-item-header">
        <input type="checkbox" class="med-toggle">
        <span>${med.name} (${med.mg}mg)</span>
      </label>
      <div class="med-item-fields" hidden>
        <label>Dosagem (cáps.)
          <input type="number" class="inp-dosage" value="1" min="1">
        </label>
        <label>Duração (dias)
          <input type="number" class="inp-duration" value="${med.default_duration_days}" min="1">
        </label>
        <label>Intervalo (horas)
          <input type="number" class="inp-interval" value="${med.default_interval_hours}" min="1">
        </label>
        <div class="med-times"><strong>Horários:</strong> ${timesHtml}</div>
      </div>
    `;

    // Show/hide editable defaults when the medication checkbox is toggled
    const toggle = item.querySelector(".med-toggle");
    const fields = item.querySelector(".med-item-fields");
    toggle.addEventListener("change", () => {
      fields.hidden = !toggle.checked;
    });

    medChecklist.appendChild(item);
  });
}

// 4. Reveal Medication Dropdown When Patient Is Selected
patientSelect.addEventListener("change", async () => {
  activePatientId = patientSelect.value;
  medSelectionArea.hidden = !activePatientId;
  scheduleSection.hidden = !activePatientId;

  // Reset checklist selections
  medChecklist.querySelectorAll(".med-toggle").forEach(cb => {
    cb.checked = false;
    cb.closest(".med-item").querySelector(".med-item-fields").hidden = true;
  });

  if (activePatientId) {
    dayOffset = 0;
    await loadGridData();
  }
});

// 5. Admin Save: Insert All Checked Medications with Custom/Default Values
frmAdmin.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (userRole !== 'admin' || !activePatientId) return;

  const startDateValue = document.getElementById("treatmentStartDate").value;
  const checkedItems = [...medChecklist.querySelectorAll(".med-item")].filter(
    item => item.querySelector(".med-toggle").checked
  );

  if (checkedItems.length === 0) {
    alert("Marque pelo menos um medicamento na lista.");
    return;
  }

  const rowsToInsert = [];
  for (const item of checkedItems) {
    const times = [...item.querySelectorAll(".time-cb:checked")].map(cb => cb.value);
    if (times.length === 0) {
      alert(`Selecione pelo menos um horário para ${item.querySelector("span").textContent}.`);
      return;
    }

    rowsToInsert.push({
      patient_id: activePatientId,
      medication_id: item.dataset.medId,
      dosage: Number(item.querySelector(".inp-dosage").value),
      duration_days: Number(item.querySelector(".inp-duration").value),
      interval_hours: Number(item.querySelector(".inp-interval").value),
      schedule_times: times
    });
  }

  await db.from('profile')
    .update({ treatment_start_date: startDateValue })
    .eq('id', activePatientId);

  const { error } = await db.from('prescriptions').insert(rowsToInsert);

  if (!error) {
    dayOffset = 0;
    await loadGridData();
  }
});

// 6. Render 12-Column Schedule Grid
async function loadGridData() {
  if (!activePatientId) return;

  const { data: profile } = await db
    .from('profile')
    .select('treatment_start_date')
    .eq('id', activePatientId)
    .single();

  const adminDateInput = document.getElementById("treatmentStartDate");
  if (adminDateInput) {
    adminDateInput.value = profile?.treatment_start_date || "";
  }

  const headers = [...document.querySelectorAll(".grid-header")];
  grid.replaceChildren(...headers);

  if (!profile?.treatment_start_date) {
    dayDisplay.innerHTML = "<strong>--/--</strong>";
    padEmptyRows();
    return;
  }

  const baseStartDate = new Date(profile.treatment_start_date + 'T00:00:00');
  const activeDate = new Date(baseStartDate);
  activeDate.setDate(baseStartDate.getDate() + dayOffset);
  const isoDate = activeDate.toISOString().split('T');

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

  padEmptyRows();
}

function padEmptyRows() {
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

// 7. Day Navigation
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
