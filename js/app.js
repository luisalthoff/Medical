const TEST_DOCTOR_UID = "jcpf@jcpf.com"
const TEST_DOCTOR_PWD = "jcpf123"
const TEST_PATIENT_UID = "greice@teste.com"
const TEST_PATIENT_PWD = "greice123"
const SUPABASE_URL = 'https://sezknoecawzvqqpvegwr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iOpyBZUmPY5V88TWZ-s7Rw_NQjqqbqL';
const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let userRole = null;

window.addEventListener('load', async () =>
{
  const { data: { session } } = await dbClient.auth.getSession();
  if (session) setupSession(session.user);
});

function appInit()
{
  openLogin()
}


async function handleLogin()
{
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  if (!email || !password) return alert('Please enter both email and password.');

  const { data, error } = await dbClient.auth.signInWithPassword({ email, password });
  if (error) alert('Login failed: ' + error.message);
  else setupSession(data.user);
}

async function handleLogout()
{
  await dbClient.auth.signOut();
  location.reload();
}

async function setupSession(user)
{
  currentUser = user;
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');

  const { data: profile } = await dbClient.from('profiles').select('*').eq('id', user.id).single();
  userRole = profile ? profile.role : 'patient';

  document.getElementById('userStatus').innerText = `${profile ? profile.full_name : user.email} (${userRole.toUpperCase()})`;

  if (userRole === 'doctor')
  {
    document.getElementById('doctorUI').classList.remove('hidden');
    loadPatientDropdown();
  } else
  {
    document.getElementById('patientUI').classList.remove('hidden');
    loadPatientPrescriptions();
  }
}

    // Populate Doctor's Patient Dropdown
async function loadPatientDropdown()
{
  const { data: patients, error } = await dbClient.from('profiles').select('id, full_name').eq('role', 'patient');
  const select = document.getElementById('patientSelect');
  
  if (error) return alert('Error loading patients: ' + error.message);
  
  select.innerHTML = '<option value="">Select Patient...</option>' + patients.map(p => `
    <option value="${p.id}">${p.full_name}</option>
  `).join('');
}

async function createPrescription()
{
  const pId = document.getElementById('patientSelect').value;
  const med = document.getElementById('medName').value;
  const dosage = document.getElementById('dosage').value;
  const duration = document.getElementById('duration').value;

  if (!pId) return alert('Please select a patient from the dropdown.');

  const { error } = await dbClient.from('prescriptions').insert([
  {
    patient_id: pId,
    doctor_id: currentUser.id,
    medication_name: med,
    dosage: dosage,
    frequency: 'Daily',
    duration_days: parseInt(duration) || 7
  }]);

  if (error) alert('Error: ' + error.message);
  else alert('Prescription issued successfully!');
}

async function loadPatientPrescriptions()
{
  const { data: meds, error } = await dbClient.from('prescriptions').select('*');
  const container = document.getElementById('prescriptionList');
  
  if (error) return container.innerHTML = 'Error: ' + error.message;
  if (!meds || meds.length === 0) return container.innerHTML = 'No active prescriptions.';

  container.innerHTML = meds.map(m => `
    <div class="med-card">
      <div>
        <strong>${m.medication_name}</strong> - ${m.dosage}<br>
        <small>${m.duration_days} Days remaining</small>
      </div>
      <button style="width: auto; margin:0;" onclick="markDoseTaken('${m.id}')">Take Dose</button>
    </div>
  `).join('');
}

async function markDoseTaken(rxId)
{
  const bp = document.getElementById('bpInput').value;
  const temp = document.getElementById('tempInput').value;

  const { error } = await dbClient.from('daily_logs').insert([{
    patient_id: currentUser.id,
    prescription_id: rxId,
    blood_pressure: bp || null,
    temperature: temp ? parseFloat(temp) : null
  }]);

  if (error) alert('RLS Rejected Log: ' + error.message);
  else alert('Dose & Vitals logged securely!');
}
  