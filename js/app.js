const SUPABASE_URL = 'https://rmipwhipavlapgpfjaxk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DePCBxQvrPxz0xZd99aITA_lPJFVPU2';
const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const frmAdmin = document.getElementById("frmAdmin");
const frmPatient = document.getElementById("frmPatient");
let currentUser = null;
let userRole = null;

async function appInit(event)
{
  event.preventDefault(); 
  const formData = new FormData(event.target);
  const credentials = Object.fromEntries(formData.entries());

  if (!credentials.email || !credentials.password) return;
  
  const { data, error } = await dbClient.auth.signInWithPassword(credentials);
  
  if (error)
  {
    alert(`Login failed: ${error.message}`);
  }
  else
  {
    setupSession(data.user);
    event.target.closest('dialog').close(); 
  }
}

async function setupSession(user)
{
  currentUser = user;
  userRole = user.app_metadata?.role || user.user_metadata?.role || 'nada';

  //const { data: profile } = await dbClient.from('profile').select('*').eq('id', user.id).single();
  //userRole = profile ? profile.role : 'patient';

  //document.getElementById('userStatus').innerText = `${profile ? profile.full_name : user.email} (${userRole.toUpperCase()})`;

  applyRoleVisibility(userRole);
  //if (userRole === 'admin')
  //{
    //admin = true;
    //document.getElementById('admin').classList.toggle('esconde');
    //loadPatientDropdown();
  //}
  //else {
  //  document.getElementById('patient').classList.toggle('esconde');
    //loadPatientPrescriptions();
  //}
}


function applyRoleVisibility(role)
{
  frmAdmin.toggleAttribute('hidden', role !== 'admin');
  frmPatient.toggleAttribute('hidden', role !== 'patient');
}

/*
async function loadPatientDropdown() {
  const { data: patients, error } = await dbClient.from('profiles').select('id, full_name').eq('role', 'patient');
  const select = document.getElementById('patientSelect');
  
  if (error) return alert(`Error loading patients: ${error.message}`);
  
  // Using structural arrays maps options smoothly
  select.innerHTML = '<option value="">Select Patient...</option>' + 
    patients.map(p => `<option value="${p.id}">${p.full_name}</option>`).join('');
}

async function handleLogout()
{
  await dbClient.auth.signOut();
  location.reload();
}

async function createPrescription() {
  const pId = document.getElementById('patientSelect').value;
  const med = document.getElementById('medName').value;
  const dosage = document.getElementById('dosage').value;
  const duration = document.getElementById('duration').value;

  if (!pId) return alert('Please select a patient from the dropdown.');

  const { error } = await dbClient.from('prescriptions').insert([{
    patient_id: pId,
    doctor_id: currentUser.id,
    medication_name: med,
    dosage: dosage,
    frequency: 'Daily',
    duration_days: parseInt(duration, 10) || 7 // Always provide a base radix for integer casting
  }]);

  if (error) alert(`Error: ${error.message}`);
  else alert('Prescription issued successfully!');
}

async function loadPatientPrescriptions()
{
  // Explicitly filtering by patient_id protects user session separation cleanly
  const { data: meds, error } = await dbClient.from('prescriptions').select('*').eq('patient_id', currentUser.id);
  const container = document.getElementById('prescriptionList');
  
  if (error) return container.innerHTML = `Error: ${error.message}`;
  if (!meds || meds.length === 0) return container.innerHTML = 'No active prescriptions.';
}

async function markDoseTaken(rxId) {
  const bp = document.getElementById('bpInput').value;
  const temp = document.getElementById('tempInput').value;

  const { error } = await dbClient.from('daily_logs').insert([{
    patient_id: currentUser.id,
    prescription_id: rxId,
    blood_pressure: bp || null,
    temperature: temp ? parseFloat(temp) : null
  }]);

  if (error) alert(`RLS Rejected Log: ${error.message}`);
  else alert('Dose & Vitals logged securely!');
}
*/

  