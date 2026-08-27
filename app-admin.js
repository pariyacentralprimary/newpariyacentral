// ============================================================
// MASTER LIST
// ============================================================
async function renderMasterList() {
  const el = document.getElementById("panel-masterlist");
  const roles = state.allRoles || [state.role];
  let myClasses = state.classes;
  // Admin/headmaster/principal always see everything relevant to
  // their office already, so only narrow the list down for people
  // whose ENTIRE role set is teacher/registrar-only (no elevated
  // position) — union their teacher assignments with their
  // registrar section(s) rather than picking just one.
  const hasBroadAccess = roles.some(r => ["admin","headmaster","principal"].includes(r));
  if (!hasBroadAccess) {
    const idSet = new Set();
    if (roles.includes("teacher")) {
      const { data: assigns } = await sb.from("class_teacher_subjects").select("class_id").eq("staff_id", state.staff.id);
      (assigns || []).forEach(a => idSet.add(a.class_id));
    }
    if (roles.includes("registrar_primary")) {
      state.classes.filter(c => c.category === "nursery" || c.category === "primary").forEach(c => idSet.add(c.id));
    }
    if (roles.includes("registrar_secondary")) {
      state.classes.filter(c => c.category === "jss" || c.category === "ss").forEach(c => idSet.add(c.id));
    }
    if (idSet.size) myClasses = state.classes.filter(c => idSet.has(c.id));
  }
  el.innerHTML = `<div class="field"><label>Select Class</label>
    <select id="mlClassSelect" onchange="loadMasterList(this.value)">
      <option value="">— choose —</option>
      ${myClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
    </select></div>
    <div id="mlBody"></div>`;
}
async function loadMasterList(classId) {
  const body = document.getElementById("mlBody");
  if (!classId) { body.innerHTML = ""; return; }
  body.innerHTML = "Loading…";
  const isRegistrar = (state.allRoles || []).some(r => r === "registrar_primary" || r === "registrar_secondary");
  const className = state.classes.find(c => c.id === classId)?.name || "";
  const { data: students } = await sb.from("students")
    .select("id, admission_no, full_name, gender, date_of_birth, guardian_name, guardian_phone, staff:registered_by(full_name)")
    .eq("class_id", classId).eq("is_active", true).order("full_name");

  body.innerHTML = `<div style="overflow-x:auto;"><table class="data-table" id="masterListTable">
    <thead><tr><th>#</th><th>Adm No</th><th>Name</th><th>Gender</th><th>DOB</th><th>Guardian</th><th>Phone</th>${isRegistrar?"<th>Registered By</th>":""}</tr></thead>
    <tbody>${(students||[]).map((s,i) => `<tr>
      <td>${i+1}</td><td>${s.admission_no}</td><td class="name-cell">${s.full_name}</td>
      <td>${s.gender||"-"}</td><td>${s.date_of_birth||"-"}</td><td>${s.guardian_name||"-"}</td><td>${s.guardian_phone||"-"}</td>
      ${isRegistrar?`<td>${s.staff?.full_name||"—"}</td>`:""}
    </tr>`).join("")}</tbody></table></div>
    <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
      <button class="btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Print</button>
      <button class="btn" onclick="downloadBrandedPdf('Master List','${className.replace(/'/g,"")} — ${(state.schoolSettings.current_session||"").replace(/'/g,"")}',document.getElementById('masterListTable').outerHTML,'MasterList_${className.replace(/\s/g,"_")}.pdf')"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>
      <button class="btn" onclick="downloadBrandedWord('Master List','${className.replace(/'/g,"")} — ${(state.schoolSettings.current_session||"").replace(/'/g,"")}',document.getElementById('masterListTable').outerHTML,'MasterList_${className.replace(/\s/g,"_")}.doc')"><i class="fa-solid fa-file-word"></i> Download Word</button>
      <button class="btn" style="margin-left:auto;" onclick="loadPositionList('${classId}','${className.replace(/'/g,"&apos;")}')"><i class="fa-solid fa-ranking-star"></i> Position List</button>
    </div>
    <div id="positionListHost" style="margin-top:20px;"></div>`;
}

// ============================================================
// POSITION LIST — students in one class+term, ranked by average.
// A dedicated exportable sheet, separate from the roster above.
// ============================================================
async function loadPositionList(classId, className) {
  const host = document.getElementById("positionListHost");
  host.innerHTML = "Loading…";
  const termId = state.currentTermId;
  const term = state.terms.find(t => t.id === termId);
  const { data: rows } = await sb.from("student_term_summary")
    .select("average, total_marks, class_position, class_position_label, students(full_name, admission_no)")
    .eq("class_id", classId).eq("term_id", termId)
    .not("class_position", "is", null)
    .order("class_position", { ascending: true });

  host.innerHTML = `
    <div class="settings-card-title">Position List — ${term?.name || ""}</div>
    <div style="overflow-x:auto;"><table class="data-table" id="positionListTable">
      <thead><tr><th>Position</th><th>Adm No</th><th>Name</th><th>Total</th><th>Average</th></tr></thead>
      <tbody>${(rows||[]).map(r => `<tr>
        <td><strong>${r.class_position_label}</strong></td>
        <td>${r.students.admission_no}</td>
        <td class="name-cell">${r.students.full_name}</td>
        <td>${r.total_marks ?? "—"}</td>
        <td>${r.average != null ? Number(r.average).toFixed(1) : "—"}</td>
      </tr>`).join("") || `<tr><td colspan="5" style="color:var(--dash-muted);">No scores entered yet for this term.</td></tr>`}</tbody>
    </table></div>
    <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
      <button class="btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Print</button>
      <button class="btn" onclick="downloadBrandedPdf('Position List','${className} — ${(term?.name||"").replace(/'/g,"")} — ${(state.schoolSettings.current_session||"").replace(/'/g,"")}',document.getElementById('positionListTable').outerHTML,'PositionList_${className.replace(/\s/g,"_")}.pdf')"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>
      <button class="btn" onclick="downloadBrandedWord('Position List','${className} — ${(term?.name||"").replace(/'/g,"")} — ${(state.schoolSettings.current_session||"").replace(/'/g,"")}',document.getElementById('positionListTable').outerHTML,'PositionList_${className.replace(/\s/g,"_")}.doc')"><i class="fa-solid fa-file-word"></i> Download Word</button>
    </div>`;
}

// ============================================================
// STAFF DIRECTORY (full CRUD — replaces the Teacher Directory sheet)
// ============================================================
async function renderStaffDirectory() {
  if (state.role !== "admin") { document.getElementById("panel-staffDirectory").innerHTML = "Admins only."; return; }
  const el = document.getElementById("panel-staffDirectory");
  el.innerHTML = `
    <div class="settings-card">
      <div class="settings-card-title">Bulk Reset — Teachers Only</div>
      <p style="font-size:12px;color:var(--dash-muted);">Applies only to staff whose sole role is Teacher — never to Admin, Headmaster, Principal, or Bursar accounts, which are always managed individually below.</p>
      <div class="field"><label>New Teacher ID Prefix (e.g. TP000 → generates TP0001, TP0002…)</label><input id="bulkTeacherPrefix" placeholder="TP000"/></div>
      <div class="field"><label>New Shared Password for All Teachers</label><input id="bulkTeacherIdPassword" type="password" placeholder="Required — IDs are changing, so passwords must reset too"/></div>
      <button class="btn btn-green" onclick="bulkRenumberTeachers()">Assign New IDs + Reset Passwords</button>
      <hr style="border-color:var(--dash-border);margin:16px 0;">
      <div class="field"><label>Reset All Teacher Passwords (keep existing IDs)</label><input id="bulkTeacherPasswordOnly" type="password" placeholder="New shared password"/></div>
      <button class="btn" onclick="bulkResetTeacherPasswords()">Reset Passwords Only</button>
      <div id="bulkTeacherResult" style="margin-top:12px;font-size:12px;"></div>
    </div>
    <button class="btn btn-green" onclick="openStaffForm()"><i class="fa-solid fa-plus"></i> Add Staff</button>
    <div id="staffList" style="margin-top:14px;"></div>`;
  await loadStaffList();
}
async function bulkRenumberTeachers() {
  const prefix = document.getElementById("bulkTeacherPrefix").value.trim();
  const new_password = document.getElementById("bulkTeacherIdPassword").value;
  if (!prefix || !new_password) { alert("Both the ID prefix and a new shared password are required."); return; }
  if (!confirm(`This will change the login ID and password for EVERY teacher (not other staff roles). Continue?`)) return;
  const result = await callBulkCredentialReset({ action: "renumber_teachers", prefix, new_password });
  if (!result) return;
  document.getElementById("bulkTeacherResult").innerHTML = `<strong>${result.count} teacher(s) updated.</strong><br/>` +
    result.mapping.map(m => `${m.full_name}: ${m.old_code || "(new)"} → ${m.new_code}`).join("<br/>");
  alert(`Done. ${result.count} teacher(s) now have new IDs and the shared password you set. Share the new IDs with them individually.`);
  loadStaffList();
}
async function bulkResetTeacherPasswords() {
  const new_password = document.getElementById("bulkTeacherPasswordOnly").value;
  if (!new_password) { alert("Enter a new password."); return; }
  if (!confirm("Reset the password for EVERY teacher to this same value?")) return;
  const result = await callBulkCredentialReset({ action: "reset_teacher_passwords", new_password });
  if (!result) return;
  alert(`Password reset for ${result.count} teacher(s).`);
}
async function callBulkCredentialReset(payload) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/bulk-credential-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) { alert("Failed: " + (json.error || res.statusText)); return null; }
  return json;
}
async function loadStaffList() {
  const { data: staff } = await sb.from("staff").select("*").order("full_name");
  document.getElementById("staffList").innerHTML = `<div class="card-grid">${(staff||[]).map(s => `
    <div class="class-card" style="cursor:default;">
      <div class="cc-name">${s.full_name}</div>
      <div class="cc-sub">${s.staff_code} · ${(s.positions||[]).join(", ") || "Teacher"}</div>
      <div class="cc-sub">${s.is_active ? "Active" : "Inactive"}</div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="btn" style="flex:1;" onclick='openStaffForm(${JSON.stringify(s).replace(/'/g,"&apos;")})'>Edit</button>
        <button class="btn btn-danger" onclick="deactivateStaff('${s.id}')">${s.is_active?"Deactivate":"Activate"}</button>
      </div>
    </div>`).join("")}</div>`;
}
function openStaffForm(staff) {
  const positions = ["Admin","Headmaster","Principal","Bursar","Admin Officer","Teacher","Registrar Primary","Registrar Secondary"];
  openModal(`<h3>${staff ? "Edit" : "Add"} Staff</h3>
    <div class="field"><label>Full Name</label><input id="sfName" value="${staff?.full_name||""}"/></div>
    <div class="field"><label>Staff ID (login)</label><input id="sfCode" value="${staff?.staff_code||""}" data-original="${staff?.staff_code||""}"/></div>
    ${staff ? `<p style="font-size:11px;color:var(--dash-muted);margin-top:-8px;">Changing the Staff ID requires setting a new password below too — otherwise their account gets locked out.</p>` : ""}
    <div class="field"><label>Phone</label><input id="sfPhone" value="${staff?.phone||""}"/></div>
    <div class="field"><label>Email</label><input id="sfEmail" value="${staff?.email||""}"/></div>
    <div class="field"><label>Positions</label>
      <div class="pill-list">${positions.map(p => `<label style="display:flex;align-items:center;gap:4px;font-size:11px;">
        <input type="checkbox" value="${p}" ${staff?.positions?.includes(p)?"checked":""} class="sfPosCheck"/> ${p}</label>`).join("")}</div>
    </div>
    <div class="field"><label>${staff ? "Reset Password (leave blank to keep current)" : "Set Password"}</label><input id="sfPassword" type="password" placeholder="${staff?'••••••••':''}"/></div>
    <button class="btn btn-green" style="width:100%;" onclick="saveStaff(${staff?`'${staff.id}'`:'null'})">Save</button>`);
}
async function saveStaff(staffId) {
  const full_name = document.getElementById("sfName").value.trim();
  const staff_code = document.getElementById("sfCode").value.trim();
  const originalCode = document.getElementById("sfCode").dataset.original || "";
  const phone = document.getElementById("sfPhone").value.trim();
  const email = document.getElementById("sfEmail").value.trim();
  const password = document.getElementById("sfPassword").value;
  const positions = [...document.querySelectorAll(".sfPosCheck:checked")].map(c => c.value);
  const is_admin = positions.includes("Admin");
  if (!full_name || !staff_code) { alert("Name and Staff ID are required."); return; }
  if (!staffId && !password) { alert("Please set an initial password for this staff member."); return; }
  const codeChanged = staffId && staff_code !== originalCode;
  if (codeChanged && !password) { alert("You changed the Staff ID — please also set a new password so their login doesn't break."); return; }

  let row;
  if (staffId) {
    const { data, error } = await sb.from("staff").update({ full_name, staff_code, phone, email, positions, is_admin, updated_at: new Date().toISOString() }).eq("id", staffId).select().single();
    if (error) { alert(error.message); return; }
    row = data;
  } else {
    const password_hash_res = await sb.rpc("hash_secret", { p_plain: password });
    const { data, error } = await sb.from("staff").insert({ full_name, staff_code, phone, email, positions, is_admin, password_hash: password_hash_res.data }).select().single();
    if (error) { alert(error.message); return; }
    row = data;
  }
  if (password) {
    if (staffId) {
      const password_hash_res = await sb.rpc("hash_secret", { p_plain: password });
      await sb.from("staff").update({ password_hash: password_hash_res.data }).eq("id", staffId);
    }
    await provisionAuthAccount("staff", row.id, row.staff_code, password);
  }
  closeModal();
  loadStaffList();
}
async function deactivateStaff(id) {
  const { data: cur } = await sb.from("staff").select("is_active").eq("id", id).single();
  await sb.from("staff").update({ is_active: !cur.is_active }).eq("id", id);
  loadStaffList();
}

// Calls the provision-user Edge Function so a real Supabase Auth
// account exists for this staff/student login.
async function provisionAuthAccount(kind, table_id, login_id, password) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/provision-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
    body: JSON.stringify({ kind, table_id, login_id, password }),
  });
  const json = await res.json();
  if (!res.ok) { alert("Account login setup failed: " + (json.error || res.statusText)); }
  return json;
}

// ============================================================
// STUDENTS (full CRUD — replaces manual roster entry in Sheets)
// ============================================================
async function renderStudents() {
  const el = document.getElementById("panel-students");
  el.innerHTML = `
    <div class="settings-card">
      <div class="settings-card-title">Bulk Reset — All Students</div>
      <p style="font-size:12px;color:var(--dash-muted);">Applies to every active student across all classes. Admission numbers are reassigned globally in serial order (sorted by class name, then student name) — never per-class, so two students in different classes never end up with the same number.</p>
      <div class="field"><label>New Admission Number Prefix (e.g. SU2026000 → generates SU20260001, SU20260002…)</label><input id="bulkStudentPrefix" placeholder="SU2026000"/></div>
      <div class="field"><label>New Shared Default Password for All Students</label><input id="bulkStudentIdPassword" type="password" placeholder="Required — IDs are changing, so passwords must reset too"/></div>
      <button class="btn btn-green" onclick="bulkRenumberStudents()">Assign New Admission Numbers + Reset Passwords</button>
      <hr style="border-color:var(--dash-border);margin:16px 0;">
      <div class="field"><label>Reset All Student Passwords (keep existing admission numbers)</label><input id="bulkStudentPasswordOnly" type="password" placeholder="New shared default password"/></div>
      <button class="btn" onclick="bulkResetStudentPasswords()">Reset Passwords Only</button>
      <div id="bulkStudentResult" style="margin-top:12px;font-size:12px;max-height:200px;overflow-y:auto;"></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
      <div class="field" style="flex:1;min-width:180px;"><label>Filter by Class</label>
        <select id="stuFilterClass" onchange="loadStudentsList()"><option value="">All Classes</option>
        ${state.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}</select></div>
      <button class="btn btn-green" onclick="openStudentForm()"><i class="fa-solid fa-plus"></i> Add Student</button>
    </div>
    <div id="studentsList" style="margin-top:14px;"></div>`;
  await loadStudentsList();
}
async function bulkRenumberStudents() {
  const prefix = document.getElementById("bulkStudentPrefix").value.trim();
  const new_default_password = document.getElementById("bulkStudentIdPassword").value;
  if (!prefix || !new_default_password) { alert("Both the admission number prefix and a new shared password are required."); return; }
  if (!confirm("This will change the admission number and password for EVERY active student. Continue?")) return;
  const result = await callBulkCredentialReset({ action: "renumber_students", prefix, new_default_password });
  if (!result) return;
  document.getElementById("bulkStudentResult").innerHTML = `<strong>${result.count} student(s) updated.</strong><br/>` +
    result.mapping.map(m => `${m.full_name} (${m.class||""}): ${m.old_admission_no||"(new)"} → ${m.new_admission_no}`).join("<br/>");
  alert(`Done. ${result.count} student(s) now have new admission numbers and share the new default password. Individual passwords set earlier were cleared.`);
  loadStudentsList();
}
async function bulkResetStudentPasswords() {
  const new_default_password = document.getElementById("bulkStudentPasswordOnly").value;
  if (!new_default_password) { alert("Enter a new password."); return; }
  if (!confirm("Reset EVERY student to this shared password (clearing any individual passwords)?")) return;
  const result = await callBulkCredentialReset({ action: "reset_student_passwords", new_default_password });
  if (!result) return;
  alert(`Password reset for ${result.count} student(s).`);
}
async function loadStudentsList() {
  const classId = document.getElementById("stuFilterClass")?.value;
  let q = sb.from("students").select("*, classes(name)").order("full_name");
  if (classId) q = q.eq("class_id", classId);
  const { data: students } = await q;
  document.getElementById("studentsList").innerHTML = `<div class="card-grid">${(students||[]).map(s => `
    <div class="class-card" style="cursor:default;">
      <div class="cc-name">${s.full_name}</div>
      <div class="cc-sub">${s.admission_no} · ${s.classes?.name || "Unassigned"}</div>
      <div class="cc-sub">${s.is_active ? "Active" : "Inactive"}</div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="btn" style="flex:1;" onclick='openStudentForm(${JSON.stringify(s).replace(/'/g,"&apos;")})'>Edit</button>
        <button class="btn btn-danger" onclick="deactivateStudent('${s.id}')">${s.is_active?"Deactivate":"Activate"}</button>
      </div>
    </div>`).join("")}</div>`;
}
function openStudentForm(stu) {
  openModal(`<h3>${stu ? "Edit" : "Add"} Student</h3>
    <div class="field"><label>Full Name</label><input id="stfName" value="${stu?.full_name||""}"/></div>
    <div class="field"><label>Admission No.</label><input id="stfAdm" value="${stu?.admission_no||""}" data-original="${stu?.admission_no||""}"/></div>
    ${stu ? `<p style="font-size:11px;color:var(--dash-muted);margin-top:-8px;">Changing this resets their password to the current school default — tell them the default password if you change their admission number.</p>` : ""}
    <div class="field"><label>Class</label><select id="stfClass">${state.classes.map(c => `<option value="${c.id}" ${stu?.class_id===c.id?"selected":""}>${c.name}</option>`).join("")}</select></div>
    <div class="field"><label>Gender</label><select id="stfGender">
      <option ${stu?.gender==="Male"?"selected":""}>Male</option><option ${stu?.gender==="Female"?"selected":""}>Female</option></select></div>
    <div class="field"><label>Date of Birth</label><input id="stfDob" type="date" value="${stu?.date_of_birth||""}"/></div>
    <div class="field"><label>Guardian Name</label><input id="stfGuardian" value="${stu?.guardian_name||""}"/></div>
    <div class="field"><label>Guardian Phone</label><input id="stfGuardianPhone" value="${stu?.guardian_phone||""}"/></div>
    <div class="field"><label>${stu?"Reset Password (blank = keep current / school default)":"Password (blank = use school default password)"}</label><input id="stfPassword" type="password"/></div>
    <button class="btn btn-green" style="width:100%;" onclick="saveStudent(${stu?`'${stu.id}'`:'null'})">Save</button>`);
}
async function saveStudent(studentId) {
  const full_name = document.getElementById("stfName").value.trim();
  const admission_no = document.getElementById("stfAdm").value.trim();
  const originalAdm = document.getElementById("stfAdm").dataset.original || "";
  const class_id = document.getElementById("stfClass").value;
  const gender = document.getElementById("stfGender").value;
  const date_of_birth = document.getElementById("stfDob").value || null;
  const guardian_name = document.getElementById("stfGuardian").value.trim();
  const guardian_phone = document.getElementById("stfGuardianPhone").value.trim();
  const password = document.getElementById("stfPassword").value;
  if (!full_name || !admission_no) { alert("Name and Admission Number are required."); return; }
  const admChanged = studentId && admission_no !== originalAdm;

  // Friendly duplicate check before hitting the DB's unique
  // constraint, so admin sees exactly who already has this number
  // instead of a raw constraint-violation error.
  if (!studentId || admChanged) {
    const { data: existing } = await sb.from("students").select("full_name").eq("admission_no", admission_no).maybeSingle();
    if (existing) { alert(`Admission number "${admission_no}" already belongs to ${existing.full_name}. Please choose a different one.`); return; }
  }

  let row;
  const payload = { full_name, class_id, gender, date_of_birth, guardian_name, guardian_phone };
  if (studentId) {
    const updatePayload = { ...payload, admission_no, updated_at: new Date().toISOString() };
    // Changing the admission number breaks their old shadow login,
    // so unless a new password was also given, fall back to the
    // current school-wide default so they can still sign in.
    if (admChanged && !password) updatePayload.password_hash = null;
    const { data, error } = await sb.from("students").update(updatePayload).eq("id", studentId).select().single();
    if (error) { alert(error.message); return; }
    row = data;
  } else {
    const { data, error } = await sb.from("students").insert({ ...payload, admission_no }).select().single();
    if (error) { alert(error.message); return; }
    row = data;
  }
  // Always provision a real login account — previously this only
  // happened if a password was typed, silently leaving students
  // with no auth account (and no way to log in) if admin left the
  // password field blank to use the school default.
  const effectivePassword = password || state.schoolSettings.student_default_password || "student123";
  if (password) {
    const password_hash_res = await sb.rpc("hash_secret", { p_plain: password });
    await sb.from("students").update({ password_hash: password_hash_res.data }).eq("id", row.id);
  }
  await provisionAuthAccount("student", row.id, row.admission_no, effectivePassword);
  closeModal();
  loadStudentsList();
}
async function deactivateStudent(id) {
  const { data: cur } = await sb.from("students").select("is_active").eq("id", id).single();
  await sb.from("students").update({ is_active: !cur.is_active }).eq("id", id);
  loadStudentsList();
}

// ============================================================
// FEES
// ============================================================
async function renderFees() {
  const el = document.getElementById("panel-fees");
  el.innerHTML = `
    <div class="settings-card">
      <div class="settings-card-title">Fees Overview — Whole School</div>
      <div class="field"><label>Term</label><select id="feeOverviewTerm" onchange="loadFeesOverview()">
        ${state.terms.map(t => `<option value="${t.id}" ${t.id===state.currentTermId?"selected":""}>${t.name}</option>`).join("")}</select></div>
      <div id="feeOverviewBody">Loading…</div>
    </div>
    <div class="field"><label>Select Class</label>
      <select id="feeClassSelect" onchange="loadFeesGrid()"><option value="">— choose —</option>
      ${state.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}</select></div>
    <div class="field"><label>Term</label><select id="feeTermSelect" onchange="loadFeesGrid()">
    ${state.terms.map(t => `<option value="${t.id}" ${t.id===state.currentTermId?"selected":""}>${t.name}</option>`).join("")}</select></div>
    <div id="feeGrid"></div>`;
  await loadFeesOverview();
}

async function loadFeesOverview() {
  const termId = document.getElementById("feeOverviewTerm").value;
  const body = document.getElementById("feeOverviewBody");
  body.innerHTML = "Loading…";

  const [{ data: structure }, { data: students }, { data: payments }] = await Promise.all([
    sb.from("fee_structure").select("category, expected_amount"),
    sb.from("students").select("id, class_id, classes(category)").eq("is_active", true),
    sb.from("fee_payments").select("student_id, amount_paid, is_paid_override").eq("term_id", termId),
  ]);
  const expectedByCategory = {}; (structure||[]).forEach(s => expectedByCategory[s.category] = s.expected_amount);
  const payMap = {}; (payments||[]).forEach(p => payMap[p.student_id] = p);

  // Students with no class assigned have no determinable expected
  // fee — counting them as "paid" (because 0 >= 0) was the bug.
  // Exclude them from fee totals entirely and surface the count
  // separately so it's clear why they're missing, not silently wrong.
  const classedStudents = (students||[]).filter(s => s.class_id);
  const unassignedCount = (students||[]).length - classedStudents.length;

  let totalCollected = 0, totalOutstandingAmount = 0, paidCount = 0, unpaidCount = 0;
  classedStudents.forEach(stu => {
    const expected = expectedByCategory[stu.classes?.category] || 0;
    const pay = payMap[stu.id];
    const paidAmt = pay?.amount_paid || 0;
    const isPaid = pay?.is_paid_override === true ? true : pay?.is_paid_override === false ? false : paidAmt >= expected;
    totalCollected += paidAmt;
    if (isPaid) paidCount++;
    else { unpaidCount++; totalOutstandingAmount += Math.max(expected - paidAmt, 0); }
  });

  body.innerHTML = `<div class="card-grid">
    ${statCard("fa-money-bill-trend-up", "₦" + totalCollected.toLocaleString(), "Total Collected")}
    ${statCard("fa-triangle-exclamation", "₦" + totalOutstandingAmount.toLocaleString(), "Total Outstanding")}
    ${statCard("fa-circle-check", paidCount, "Students Fully Paid")}
    ${statCard("fa-circle-xmark", unpaidCount, "Students Owing")}
  </div>
  ${unassignedCount > 0 ? `<p style="font-size:12px;color:var(--dash-muted);margin-top:10px;">
    <i class="fa-solid fa-triangle-exclamation"></i> ${unassignedCount} active student(s) have no class assigned and are excluded from these totals —
    see <a href="#" onclick="switchTab('unassignedStudents');return false;" style="color:var(--dash-accent);">Unassigned Students</a> to fix.</p>` : ""}`;
}

async function loadFeesGrid() {
  const classId = document.getElementById("feeClassSelect").value;
  const termId = document.getElementById("feeTermSelect").value;
  const grid = document.getElementById("feeGrid");
  if (!classId) { grid.innerHTML = ""; return; }
  grid.innerHTML = "Loading…";
  const cls = state.classes.find(c => c.id === classId);
  const { data: fs } = await sb.from("fee_structure").select("expected_amount").eq("category", cls.category).single();
  const [{ data: students }, { data: payments }] = await Promise.all([
    sb.from("students").select("id, full_name").eq("class_id", classId).eq("is_active", true).order("full_name"),
    sb.from("fee_payments").select("*").eq("class_id", classId).eq("term_id", termId),
  ]);
  const payMap = {}; (payments||[]).forEach(p => payMap[p.student_id] = p);
  grid.innerHTML = `<p style="color:var(--dash-muted);">Expected: ₦${fs?.expected_amount ?? "—"} per student</p>
    <div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>Student</th><th>Amount Paid (₦)</th><th>Status Override</th><th></th></tr></thead>
    <tbody>${(students||[]).map(s => { const p = payMap[s.id] || {};
      return `<tr>
        <td class="name-cell">${s.full_name}</td>
        <td><input type="number" id="fp_amt_${s.id}" value="${p.amount_paid||0}" style="width:90px;"/></td>
        <td><select id="fp_ovr_${s.id}">
          <option value="" ${p.is_paid_override===null||p.is_paid_override===undefined?"selected":""}>Auto</option>
          <option value="true" ${p.is_paid_override===true?"selected":""}>Force Paid</option>
          <option value="false" ${p.is_paid_override===false?"selected":""}>Force Unpaid</option>
        </select></td>
        <td><button class="btn btn-green" onclick="saveFeeRow('${s.id}','${classId}','${termId}')">Save</button></td>
      </tr>`;}).join("")}</tbody></table></div>`;
}
async function saveFeeRow(studentId, classId, termId) {
  const amount_paid = Number(document.getElementById(`fp_amt_${studentId}`).value) || 0;
  const ovrRaw = document.getElementById(`fp_ovr_${studentId}`).value;
  const is_paid_override = ovrRaw === "" ? null : ovrRaw === "true";
  const { error } = await sb.from("fee_payments").upsert({
    student_id: studentId, class_id: classId, term_id: termId, amount_paid, is_paid_override,
    updated_by: state.staff ? state.staff.id : null,
  }, { onConflict: "student_id,term_id" });
  if (error) alert(error.message); else { alert("Saved."); loadFeesOverview(); }
}

// ============================================================
// SETTINGS
// ============================================================
async function renderSettings() {
  const el = document.getElementById("panel-settings");
  const s = state.schoolSettings;
  let html = "";
  if (state.role === "admin") {
    html += `<div class="settings-card">
      <div class="settings-card-title">School Profile</div>
      <div class="field"><label>School Name</label><input id="setSchoolName" value="${s.school_name||""}"/></div>
      <div class="field"><label>Motto</label><input id="setMotto" value="${s.motto||""}"/></div>
      <div class="field"><label>Address</label><input id="setAddress" value="${s.address||""}"/></div>
      <div class="field"><label>Current Session</label><input id="setSession" value="${s.current_session||""}"/></div>
      <div class="field"><label>Primary Website</label><input id="setPrimaryWebsite" value="${s.primary_website||""}" placeholder="https://..."/></div>
      <div class="field"><label>Secondary Website</label><input id="setSecondaryWebsite" value="${s.secondary_website||""}" placeholder="https://..."/></div>
      <div class="field"><label>School Logo — paste direct image link (e.g. from postimages.org)</label>
        <input id="setSchoolLogo" value="${s.school_logo_url||""}" placeholder="https://i.postimg.cc/..."/>
        ${s.school_logo_url ? `<img src="${s.school_logo_url}" style="height:50px;margin-top:6px;border-radius:6px;" onerror="this.style.display='none'"/>` : ""}
      </div>
      <div class="field"><label>Jibwis / Secondary Logo — paste direct image link</label>
        <input id="setSecondaryLogo" value="${s.secondary_logo_url||""}" placeholder="https://i.postimg.cc/..."/>
        ${s.secondary_logo_url ? `<img src="${s.secondary_logo_url}" style="height:50px;margin-top:6px;border-radius:6px;" onerror="this.style.display='none'"/>` : ""}
      </div>
      <p style="font-size:11px;color:var(--dash-muted);margin-top:-6px;">On postimages.org, use the "Direct link" URL (ends in .jpg/.png), not the page link.</p>
      <button class="btn btn-green" onclick="saveSchoolSettings()">Save</button>
    </div>
    <div class="settings-card">
      <div class="settings-card-title">Report Card Signatures (fallback)</div>
      <p style="font-size:12px;color:var(--dash-muted);">These print on report cards only when no staff member currently holds that position in Staff Directory — if a Headmaster/Principal/Admin Officer exists there, their own name and signature (set on their staff profile) are used instead of these.</p>
      <div class="field"><label>Headmaster Name</label><input id="setHeadmasterName" value="${s.headmaster_fallback_name||""}"/></div>
      <div class="field"><label>Headmaster Signature — paste direct image link</label>
        <input id="setHeadmasterSig" value="${s.headmaster_fallback_sig_url||""}" placeholder="https://i.postimg.cc/..."/>
        ${s.headmaster_fallback_sig_url ? `<img src="${s.headmaster_fallback_sig_url}" style="height:36px;margin-top:6px;" onerror="this.style.display='none'"/>` : ""}
      </div>
      <div class="field"><label>Principal Name</label><input id="setPrincipalName" value="${s.principal_fallback_name||""}"/></div>
      <div class="field"><label>Principal Signature — paste direct image link</label>
        <input id="setPrincipalSig" value="${s.principal_fallback_sig_url||""}" placeholder="https://i.postimg.cc/..."/>
        ${s.principal_fallback_sig_url ? `<img src="${s.principal_fallback_sig_url}" style="height:36px;margin-top:6px;" onerror="this.style.display='none'"/>` : ""}
      </div>
      <div class="field"><label>Admin Officer Name</label><input id="setAdminOfficerName" value="${s.admin_officer_fallback_name||""}"/></div>
      <div class="field"><label>Admin Officer Signature — paste direct image link</label>
        <input id="setAdminOfficerSig" value="${s.admin_officer_fallback_sig_url||""}" placeholder="https://i.postimg.cc/..."/>
        ${s.admin_officer_fallback_sig_url ? `<img src="${s.admin_officer_fallback_sig_url}" style="height:36px;margin-top:6px;" onerror="this.style.display='none'"/>` : ""}
      </div>
      <button class="btn btn-green" onclick="saveSignatureSettings()">Save Signatures</button>
    </div>
    <div class="settings-card">
      <div class="settings-card-title">Registrar Admission Number Scheme</div>
      <p style="font-size:12px;color:var(--dash-muted);">Controls the automatic admission number registrars get when registering a new student (e.g. prefix "SU2026" + next number "27" → next registration gets SU20260027). After a bulk ID reset, update the next number here so new registrations don't collide with existing ones.</p>
      <div class="field"><label>Prefix</label><input id="setAdmPrefix" value="${s.student_admission_prefix||"SU"}"/></div>
      <div class="field"><label>Next Number</label><input id="setAdmNext" type="number" value="${s.student_admission_next_number||1}"/></div>
      <button class="btn btn-green" onclick="saveAdmissionScheme()">Save</button>
      <button class="btn" onclick="syncAdmissionScheme()" style="margin-left:8px;">Sync to Match Existing Numbers</button>
      <div id="admSchemeInfo" style="margin-top:10px;font-size:12px;color:var(--dash-muted);"></div>
    </div>
    <div class="settings-card">
      <div class="settings-card-title">Check an Admission Number</div>
      <p style="font-size:12px;color:var(--dash-muted);">Type a number to check if it's already taken before assigning it manually.</p>
      <div class="field" style="display:flex;gap:8px;">
        <input id="admCheckInput" placeholder="e.g. SU20260012" style="flex:1;"/>
        <button class="btn" onclick="checkAdmissionNumber()">Check</button>
      </div>
      <div id="admCheckResult" style="margin-top:8px;font-size:13px;font-weight:800;"></div>
    </div>
    <div class="settings-card">
      <div class="settings-card-title">Term Dates</div>
      <p style="font-size:12px;color:var(--dash-muted);">These dates print on every report card (Resumption Date, Closing Date, and the auto-calculated Holidays Duration).</p>
      <div class="field"><label>Term</label><select id="setDatesTerm" onchange="loadTermDatesForm()">
        ${state.terms.map(t => `<option value="${t.id}">${t.name}</option>`).join("")}</select></div>
      <div id="termDatesFormBody"></div>
    </div>
    <div class="settings-card">
      <div class="settings-card-title">Security PINs</div>
      <div class="field"><label>PIN Type</label><select id="pinType">
        <option value="fees">Fees</option><option value="teachers">Teachers</option>
        <option value="report_card_first_term">Report Card - First Term</option>
        <option value="report_card_second_term">Report Card - Second Term</option>
        <option value="report_card_third_term">Report Card - Third Term</option></select></div>
      <div class="field"><label>New PIN (4 digits)</label><input id="pinValue" maxlength="4"/></div>
      <button class="btn btn-green" onclick="savePin()">Set PIN</button>
    </div>
    <div class="settings-card">
      <div class="settings-card-title">Active Term</div>
      <div class="field"><select id="setActiveTerm">${state.terms.map(t => `<option value="${t.id}" ${t.is_active?"selected":""}>${t.name}</option>`).join("")}</select></div>
      <button class="btn btn-green" onclick="setActiveTermFn()">Set Active Term</button>
    </div>`;
  }
  html += `<div class="settings-card">
    <div class="settings-card-title">My Account</div>
    <div class="settings-row"><span>Name</span><span>${state.staff?.full_name || state.student?.full_name || "—"}</span></div>
    ${state.staff ? `<div class="settings-row"><span>My Salary Status (${state.terms.find(t=>t.id===state.currentTermId)?.name||"This Term"})</span><span id="mySalaryStatus">Loading…</span></div>` : ""}
    <div class="field"><label>New Password</label><input id="myNewPassword" type="password"/></div>
    <button class="btn btn-green" onclick="changeMyPassword()">Update Password</button>
  </div>`;
  el.innerHTML = html;
  if (state.role === "admin") { loadTermDatesForm(); loadAdmSchemeInfo(); }
  if (state.staff) loadMySalaryStatus();
}
async function loadMySalaryStatus() {
  const { data } = await sb.from("staff").select("salary_status").eq("id", state.staff.id).single();
  const status = (data?.salary_status || {})[state.currentTermId] || null;
  const el = document.getElementById("mySalaryStatus");
  if (!el) return;
  el.innerHTML = status === "Paid" ? `<span style="color:#22c55e;font-weight:800;">✔ Paid</span>`
    : status === "Unpaid" ? `<span style="color:#ef4444;font-weight:800;">✘ Unpaid</span>`
    : `<span style="color:var(--dash-muted);">Not recorded yet</span>`;
}
async function saveAdmissionScheme() {
  const student_admission_prefix = document.getElementById("setAdmPrefix").value.trim();
  const student_admission_next_number = Number(document.getElementById("setAdmNext").value) || 1;
  if (!student_admission_prefix) { alert("Prefix is required."); return; }
  const { error } = await sb.from("school_settings").update({ student_admission_prefix, student_admission_next_number }).eq("id", true);
  if (error) alert(error.message); else { alert("Saved."); Object.assign(state.schoolSettings, { student_admission_prefix, student_admission_next_number }); loadAdmSchemeInfo(); }
}
async function loadAdmSchemeInfo() {
  const s = state.schoolSettings;
  const prefix = s.student_admission_prefix || "SU";
  const next = s.student_admission_next_number || 1;
  const lastIssued = next > 1 ? prefix + String(next - 1).padStart(4, "0") : "none yet";
  const nextNumber = prefix + String(next).padStart(4, "0");
  const { count } = await sb.from("students").select("*", { count: "exact", head: true }).eq("is_active", true);
  document.getElementById("admSchemeInfo").innerHTML =
    `Last number issued by this scheme: <strong>${lastIssued}</strong> · Next will be: <strong>${nextNumber}</strong> · Total active students in school: <strong>${count ?? "—"}</strong>`;
}
async function syncAdmissionScheme() {
  const prefix = document.getElementById("setAdmPrefix").value.trim() || state.schoolSettings.student_admission_prefix || "SU";
  const { data: students } = await sb.from("students").select("admission_no").ilike("admission_no", prefix + "%");
  let maxNum = 0;
  (students || []).forEach(s => {
    const suffix = s.admission_no.slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  const nextNumber = maxNum + 1;
  document.getElementById("setAdmNext").value = nextNumber;
  const { error } = await sb.from("school_settings").update({ student_admission_prefix: prefix, student_admission_next_number: nextNumber }).eq("id", true);
  if (error) { alert(error.message); return; }
  Object.assign(state.schoolSettings, { student_admission_prefix: prefix, student_admission_next_number: nextNumber });
  alert(`Synced. Found highest existing number matching "${prefix}" is ${maxNum > 0 ? prefix + String(maxNum).padStart(4,"0") : "none"} — next registration will be ${prefix}${String(nextNumber).padStart(4,"0")}.`);
  loadAdmSchemeInfo();
}
async function checkAdmissionNumber() {
  const val = document.getElementById("admCheckInput").value.trim();
  const result = document.getElementById("admCheckResult");
  if (!val) { result.textContent = ""; return; }
  const { data } = await sb.from("students").select("full_name, classes(name)").eq("admission_no", val).maybeSingle();
  if (data) {
    result.innerHTML = `<span style="color:var(--dash-danger);">Already taken — belongs to ${data.full_name} (${data.classes?.name||"no class"}).</span>`;
  } else {
    result.innerHTML = `<span style="color:var(--dash-green);">Available.</span>`;
  }
}
async function loadTermDatesForm() {
  const termId = document.getElementById("setDatesTerm").value;
  const term = state.terms.find(t => t.id === termId);
  document.getElementById("termDatesFormBody").innerHTML = `
    <div class="field"><label>Resumption Date</label><input id="setResumptionDate" type="date" value="${term?.resumption_date||""}"/></div>
    <div class="field"><label>Closing Date</label><input id="setClosingDate" type="date" value="${term?.closing_date||""}"/></div>
    <button class="btn btn-green" onclick="saveTermDates('${termId}')">Save Term Dates</button>`;
}
async function saveTermDates(termId) {
  const resumption_date = document.getElementById("setResumptionDate").value || null;
  const closing_date = document.getElementById("setClosingDate").value || null;
  if (resumption_date && closing_date && new Date(resumption_date) < new Date(closing_date)) {
    alert("Resumption Date is before Closing Date. Resumption Date here means when students resume AFTER this term's holiday, so it should come after the Closing Date. Please double-check before saving — this is why Holidays Duration would show blank otherwise.");
    return;
  }
  const { error } = await sb.from("terms").update({ resumption_date, closing_date }).eq("id", termId);
  if (error) { alert(error.message); return; }
  alert("Term dates saved.");
  await loadReferenceData();
}
async function saveSchoolSettings() {
  const payload = {
    school_name: document.getElementById("setSchoolName").value,
    motto: document.getElementById("setMotto").value,
    address: document.getElementById("setAddress").value,
    current_session: document.getElementById("setSession").value,
    primary_website: document.getElementById("setPrimaryWebsite").value,
    secondary_website: document.getElementById("setSecondaryWebsite").value,
    school_logo_url: document.getElementById("setSchoolLogo").value,
    secondary_logo_url: document.getElementById("setSecondaryLogo").value,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("school_settings").update(payload).eq("id", true);
  if (error) alert(error.message); else { alert("Saved."); Object.assign(state.schoolSettings, payload); }
}
async function saveSignatureSettings() {
  const payload = {
    headmaster_fallback_name: document.getElementById("setHeadmasterName").value,
    headmaster_fallback_sig_url: document.getElementById("setHeadmasterSig").value,
    principal_fallback_name: document.getElementById("setPrincipalName").value,
    principal_fallback_sig_url: document.getElementById("setPrincipalSig").value,
    admin_officer_fallback_name: document.getElementById("setAdminOfficerName").value,
    admin_officer_fallback_sig_url: document.getElementById("setAdminOfficerSig").value,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("school_settings").update(payload).eq("id", true);
  if (error) alert(error.message); else { alert("Saved."); Object.assign(state.schoolSettings, payload); }
}
async function savePin() {
  const pin_type = document.getElementById("pinType").value;
  const pin = document.getElementById("pinValue").value.trim();
  if (!/^\d{4}$/.test(pin)) { alert("PIN must be exactly 4 digits."); return; }
  const { data: hash } = await sb.rpc("hash_secret", { p_plain: pin });
  const { error } = await sb.from("security_pins").upsert({ pin_type, pin_hash: hash, updated_by: state.staff.id, updated_at: new Date().toISOString() }, { onConflict: "pin_type" });
  if (error) alert(error.message); else alert("PIN updated.");
}
async function setActiveTermFn() {
  const termId = document.getElementById("setActiveTerm").value;
  await sb.from("terms").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await sb.from("terms").update({ is_active: true }).eq("id", termId);
  if (error) alert(error.message); else { alert("Active term updated."); await loadReferenceData(); }
}
async function changeMyPassword() {
  const password = document.getElementById("myNewPassword").value;
  if (!password || password.length < 4) { alert("Password must be at least 4 characters."); return; }
  const { data: hash } = await sb.rpc("hash_secret", { p_plain: password });
  if (state.staff) {
    await sb.from("staff").update({ password_hash: hash }).eq("id", state.staff.id);
    await provisionAuthAccount("staff", state.staff.id, state.staff.staff_code, password);
  } else if (state.student) {
    await sb.from("students").update({ password_hash: hash }).eq("id", state.student.id);
    await provisionAuthAccount("student", state.student.id, state.student.admission_no, password);
  }
  alert("Password updated. Use your new password next time you sign in.");
}
