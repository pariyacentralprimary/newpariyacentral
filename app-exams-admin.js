// ============================================================
// EXAMS & TESTS — TEACHER / ADMIN MANAGEMENT
// Tab-bar: Create & Manage | Question Bank | Results.
// RLS already scopes everything to "broad staff sees all, teacher
// sees only their own assigned class+subject" — this file just
// renders whatever the query legitimately returns.
// ============================================================

async function renderAssessmentsAdmin() {
  const el = document.getElementById("panel-assessments");
  el.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <h1>Exams &amp; Tests</h1>
        <p>Create and schedule tests/exams, manage questions, and review results.</p>
      </div>
    </div>
    <div class="tab-bar">
      <button class="tab-bar-item" id="eatab-manage" onclick="switchExAdminTab('manage')">📝 Create &amp; Manage</button>
      <button class="tab-bar-item" id="eatab-questions" onclick="switchExAdminTab('questions')">❓ Question Bank</button>
      <button class="tab-bar-item" id="eatab-results" onclick="switchExAdminTab('results')">📊 Results</button>
    </div>
    <div id="eapanel-manage" class="ea-panel"></div>
    <div id="eapanel-questions" class="ea-panel" style="display:none;"></div>
    <div id="eapanel-results" class="ea-panel" style="display:none;"></div>`;
  switchExAdminTab("manage");
}
function switchExAdminTab(tab) {
  ["manage","questions","results"].forEach(t => {
    document.getElementById(`eapanel-${t}`).style.display = t === tab ? "block" : "none";
    document.getElementById(`eatab-${t}`).classList.toggle("active", t === tab);
  });
  if (tab === "manage") loadAssessmentsManageTab();
  if (tab === "questions") loadQuestionBankTab();
  if (tab === "results") loadResultsTab();
}

async function getMyAssessableClassSubjects() {
  if ((state.allRoles||[state.role]).some(r => ["admin","headmaster","principal"].includes(r))) {
    const pairs = [];
    for (const cls of state.classes) {
      const { data: cs } = await sb.from("class_subjects").select("subject_id, subjects(name)").eq("class_id", cls.id);
      (cs||[]).forEach(row => pairs.push({ class_id: cls.id, class_name: cls.name, subject_id: row.subject_id, subject_name: row.subjects.name }));
    }
    return pairs;
  }
  const { data } = await sb.from("class_teacher_subjects").select("class_id, subject_id, classes(name), subjects(name)").eq("staff_id", state.staff.id);
  return (data||[]).map(r => ({ class_id: r.class_id, class_name: r.classes.name, subject_id: r.subject_id, subject_name: r.subjects.name }));
}

// ============================================================
// TAB 1 — CREATE & MANAGE
// ============================================================
async function loadAssessmentsManageTab() {
  const panel = document.getElementById("eapanel-manage");
  panel.innerHTML = "Loading…";
  const pairs = await getMyAssessableClassSubjects();
  if (!pairs.length) {
    panel.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>You have no class/subject assignments yet — ask an admin to assign you in Curriculum first.</p></div>`;
    return;
  }
  panel.innerHTML = `
    <div class="settings-card">
      <div class="settings-card-title">Create Test / Exam</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div class="field" style="flex:1;min-width:180px;"><label>Class + Subject</label>
          <select id="caClassSubject">${pairs.map(p => `<option value="${p.class_id}|${p.subject_id}">${p.class_name} — ${p.subject_name}</option>`).join("")}</select></div>
        <div class="field" style="flex:1;min-width:150px;"><label>Assessment Type</label>
          <select id="caType"><option value="ca1">CA1</option><option value="ca2">CA2</option><option value="ca3">CA3</option><option value="exam">Exam</option></select></div>
      </div>
      <div class="field"><label>Title</label><input id="caTitle" placeholder="e.g. First Term CA1 — Mathematics"/></div>
      <div class="field"><label>Instructions (shown to students before they start)</label><textarea id="caInstructions" rows="2" style="width:100%;background:var(--dash-surface);color:var(--dash-text);border:1px solid var(--dash-border);border-radius:8px;padding:8px;"></textarea></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div class="field" style="flex:1;min-width:140px;"><label>Duration (minutes, blank = untimed)</label><input id="caDuration" type="number" min="1"/></div>
        <div class="field" style="flex:1;min-width:140px;"><label>Shuffle Questions</label>
          <select id="caShuffle"><option value="true">Yes</option><option value="false">No</option></select></div>
      </div>
      <div class="field"><label>Availability</label>
        <select id="caAvailability" onchange="toggleScheduleFields()"><option value="ready">Ready Now</option><option value="scheduled">Schedule For Later</option></select></div>
      <div id="caScheduleFields" style="display:none;">
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <div class="field" style="flex:1;min-width:160px;"><label>Start</label><input id="caStartAt" type="datetime-local"/></div>
          <div class="field" style="flex:1;min-width:160px;"><label>End (optional)</label><input id="caEndAt" type="datetime-local"/></div>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dash-muted);margin-bottom:14px;">
        <input type="checkbox" id="caAutoSync" checked style="width:auto;"/> Automatically fill the matching CA/Exam column on the report card once submitted (only if that field is still empty — never overwrites a manually entered score)
      </label>
      <button class="btn btn-green" onclick="createAssessment()"><i class="fa-solid fa-plus"></i> Create</button>
    </div>
    <div class="settings-card-title" style="margin:18px 0 10px;">Existing Tests &amp; Exams</div>
    <div id="assessmentsListHost"></div>`;
  await loadAssessmentsList();
}
function toggleScheduleFields() {
  document.getElementById("caScheduleFields").style.display = document.getElementById("caAvailability").value === "scheduled" ? "block" : "none";
}
async function createAssessment() {
  const [class_id, subject_id] = document.getElementById("caClassSubject").value.split("|");
  const assessment_type = document.getElementById("caType").value;
  const title = document.getElementById("caTitle").value.trim();
  if (!title) { alert("Title is required."); return; }
  const instructions = document.getElementById("caInstructions").value.trim() || null;
  const duration_minutes = document.getElementById("caDuration").value ? Number(document.getElementById("caDuration").value) : null;
  const shuffle_questions = document.getElementById("caShuffle").value === "true";
  const availability = document.getElementById("caAvailability").value;
  const status = availability === "scheduled" ? "scheduled" : "ready";
  const start_at = document.getElementById("caStartAt").value ? new Date(document.getElementById("caStartAt").value).toISOString() : null;
  const end_at = document.getElementById("caEndAt").value ? new Date(document.getElementById("caEndAt").value).toISOString() : null;
  if (availability === "scheduled" && !start_at) { alert("A start date/time is required when scheduling for later."); return; }
  const auto_sync_to_report_card = document.getElementById("caAutoSync").checked;

  const { error } = await sb.from("assessments").insert({
    class_id, subject_id, term_id: state.currentTermId, assessment_type, title, instructions,
    duration_minutes, shuffle_questions, status, start_at, end_at, auto_sync_to_report_card,
  });
  if (error) { alert(error.message); return; }
  alert("Created. Add questions from the Question Bank tab before publishing to students.");
  document.getElementById("caTitle").value = "";
  await loadAssessmentsList();
}
async function loadAssessmentsList() {
  const host = document.getElementById("assessmentsListHost");
  const { data: rows } = await sb.from("assessments").select("*, classes(name), subjects(name)").eq("term_id", state.currentTermId).order("created_at", { ascending: false });
  if (!rows || !rows.length) { host.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-circle-question"></i><p>No tests or exams created yet this term.</p></div>`; return; }
  host.innerHTML = `<div style="overflow-x:auto;"><table class="data-table">
    <thead><tr><th>Class</th><th>Subject</th><th>Type</th><th>Title</th><th>Status</th><th>Questions</th><th></th></tr></thead>
    <tbody>${rows.map(r => {
      const eff = assessmentEffLabel(r.status, r.start_at, r.end_at);
      return `<tr>
        <td>${r.classes.name}</td><td>${r.subjects.name}</td><td>${r.assessment_type.toUpperCase()}</td>
        <td class="name-cell">${r.title}</td>
        <td><span class="badge ${eff.cls}">${eff.label}</span></td>
        <td><span id="qcount-${r.id}">…</span></td>
        <td style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="btn" style="font-size:11px;padding:5px 9px;" onclick="openQuestionBankFor('${r.id}')">Questions</button>
          ${r.status !== "closed" ? `<button class="btn btn-danger" style="font-size:11px;padding:5px 9px;" onclick="closeAssessment('${r.id}')">Close</button>` : ""}
          <button class="btn btn-danger" style="font-size:11px;padding:5px 9px;" onclick="deleteAssessment('${r.id}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join("")}</tbody></table></div>`;
  rows.forEach(async r => {
    const { count } = await sb.from("assessment_questions").select("id", { count: "exact", head: true }).eq("assessment_id", r.id);
    const cell = document.getElementById(`qcount-${r.id}`);
    if (cell) cell.textContent = count || 0;
  });
}
function assessmentEffLabel(status, start_at, end_at) {
  const now = new Date();
  if (status === "draft") return { label: "Draft", cls: "badge-neutral" };
  if (status === "closed") return { label: "Closed", cls: "badge-neutral" };
  if (end_at && now > new Date(end_at)) return { label: "Closed (expired)", cls: "badge-neutral" };
  if (start_at && now < new Date(start_at)) return { label: "Scheduled", cls: "badge-warning" };
  return { label: "● Ready", cls: "badge-success" };
}
async function closeAssessment(id) {
  if (!confirm("Close this assessment? Students will no longer be able to start or continue it.")) return;
  const { error } = await sb.from("assessments").update({ status: "closed" }).eq("id", id);
  if (error) alert(error.message); else loadAssessmentsList();
}
async function deleteAssessment(id) {
  if (!confirm("Delete this assessment and all its questions/attempts? This cannot be undone.")) return;
  const { error } = await sb.from("assessments").delete().eq("id", id);
  if (error) alert(error.message); else loadAssessmentsList();
}

// ============================================================
// TAB 2 — QUESTION BANK
// ============================================================
async function loadQuestionBankTab() {
  const panel = document.getElementById("eapanel-questions");
  const { data: rows } = await sb.from("assessments").select("id, title, classes(name), subjects(name), assessment_type, marking_mode, uniform_mark_per_question, shuffle_questions").eq("term_id", state.currentTermId).order("created_at", { ascending: false });
  panel.innerHTML = `
    <div class="field" style="max-width:400px;"><label>Select Assessment</label>
      <select id="qbAssessmentSelect" onchange="loadQuestionBankFor(this.value)">
        <option value="">— choose —</option>
        ${(rows||[]).map(r => `<option value="${r.id}">${r.classes.name} — ${r.subjects.name} — ${r.assessment_type.toUpperCase()} (${r.title})</option>`).join("")}
      </select></div>
    <div id="qbBody"></div>`;
}
function openQuestionBankFor(assessmentId) {
  switchExAdminTab("questions");
  setTimeout(() => {
    document.getElementById("qbAssessmentSelect").value = assessmentId;
    loadQuestionBankFor(assessmentId);
  }, 0);
}
async function loadQuestionBankFor(assessmentId) {
  const body = document.getElementById("qbBody");
  if (!assessmentId) { body.innerHTML = ""; return; }
  body.innerHTML = "Loading…";
  const { data: a } = await sb.from("assessments").select("*").eq("id", assessmentId).single();
  const { data: questions } = await sb.from("assessment_questions").select("*").eq("assessment_id", assessmentId).order("order_index");
  const totalMarks = (questions||[]).reduce((s,q) => s + Number(q.marks), 0);

  body.innerHTML = `
    <div class="settings-card">
      <div class="settings-card-title">Marking</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
        <div class="field" style="flex:1;min-width:160px;"><label>Marking Mode</label>
          <select id="qbMarkingMode" onchange="setMarkingMode('${assessmentId}', this.value)">
            <option value="uniform" ${a.marking_mode==="uniform"?"selected":""}>Same mark for all questions</option>
            <option value="individual" ${a.marking_mode==="individual"?"selected":""}>Individual marks per question</option>
          </select></div>
        ${a.marking_mode === "uniform" ? `
        <div class="field" style="flex:1;min-width:140px;"><label>Mark per Question</label><input id="qbUniformMark" type="number" min="0" value="${a.uniform_mark_per_question||1}"/></div>
        <button class="btn btn-green" onclick="applyUniformMarks('${assessmentId}')">Apply to All</button>` : ""}
      </div>
      <div style="font-size:12px;color:var(--dash-muted);">${(questions||[]).length} question${(questions||[]).length===1?"":"s"} · ${totalMarks} total marks</div>
    </div>
    <div class="settings-card">
      <div class="settings-card-title">Add Question</div>
      <div class="field"><label>Question</label><textarea id="qNewText" rows="2" style="width:100%;background:var(--dash-surface);color:var(--dash-text);border:1px solid var(--dash-border);border-radius:8px;padding:8px;"></textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="field"><label>Option A</label><input id="qNewA"/></div>
        <div class="field"><label>Option B</label><input id="qNewB"/></div>
        <div class="field"><label>Option C</label><input id="qNewC"/></div>
        <div class="field"><label>Option D</label><input id="qNewD"/></div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div class="field" style="flex:1;min-width:140px;"><label>Correct Answer</label>
          <select id="qNewCorrect"><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></div>
        <div class="field" style="flex:1;min-width:120px;"><label>Marks</label><input id="qNewMarks" type="number" min="0" value="${a.marking_mode==="uniform"?(a.uniform_mark_per_question||1):1}"/></div>
      </div>
      <button class="btn btn-green" onclick="addQuestion('${assessmentId}')"><i class="fa-solid fa-plus"></i> ADD QUESTION</button>
    </div>
    <div id="qListHost"></div>`;
  renderQuestionList(questions || [], assessmentId);
}
function renderQuestionList(questions, assessmentId) {
  document.getElementById("qListHost").innerHTML = questions.length ? questions.map((q, i) => `
    <div class="settings-card">
      <div style="display:flex;justify-content:space-between;gap:10px;">
        <div style="font-weight:800;">Q${i+1}. ${q.question_text}</div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button class="btn" style="padding:4px 8px;font-size:11px;" ${i===0?"disabled":""} onclick="moveQuestion('${assessmentId}','${q.id}',-1)"><i class="fa-solid fa-arrow-up"></i></button>
          <button class="btn" style="padding:4px 8px;font-size:11px;" ${i===questions.length-1?"disabled":""} onclick="moveQuestion('${assessmentId}','${q.id}',1)"><i class="fa-solid fa-arrow-down"></i></button>
          <button class="btn" style="padding:4px 8px;font-size:11px;" onclick='openEditQuestion(${JSON.stringify(q).replace(/'/g,"&apos;")},"${assessmentId}")'><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger" style="padding:4px 8px;font-size:11px;" onclick="deleteQuestion('${q.id}','${assessmentId}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--dash-muted);margin-top:6px;">
        A. ${q.option_a} &nbsp; B. ${q.option_b} &nbsp; C. ${q.option_c} &nbsp; D. ${q.option_d}
      </div>
      <div style="font-size:12px;margin-top:4px;"><span class="badge badge-success">Correct: ${q.correct_option}</span> <span class="badge badge-info">${q.marks} mark${q.marks==1?"":"s"}</span></div>
    </div>`).join("") : `<div class="empty-state"><i class="fa-solid fa-list-ol"></i><p>No questions yet — add the first one above.</p></div>`;
}
async function setMarkingMode(assessmentId, mode) {
  await sb.from("assessments").update({ marking_mode: mode }).eq("id", assessmentId);
  loadQuestionBankFor(assessmentId);
}
async function applyUniformMarks(assessmentId) {
  const mark = Number(document.getElementById("qbUniformMark").value) || 1;
  await sb.from("assessments").update({ uniform_mark_per_question: mark }).eq("id", assessmentId);
  await sb.from("assessment_questions").update({ marks: mark }).eq("assessment_id", assessmentId);
  loadQuestionBankFor(assessmentId);
}
async function addQuestion(assessmentId) {
  const question_text = document.getElementById("qNewText").value.trim();
  const option_a = document.getElementById("qNewA").value.trim();
  const option_b = document.getElementById("qNewB").value.trim();
  const option_c = document.getElementById("qNewC").value.trim();
  const option_d = document.getElementById("qNewD").value.trim();
  const correct_option = document.getElementById("qNewCorrect").value;
  const marks = Number(document.getElementById("qNewMarks").value) || 1;
  if (!question_text || !option_a || !option_b || !option_c || !option_d) { alert("Question text and all four options are required."); return; }
  const { count } = await sb.from("assessment_questions").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId);
  const { error } = await sb.from("assessment_questions").insert({
    assessment_id: assessmentId, question_text, option_a, option_b, option_c, option_d, correct_option, marks, order_index: count || 0,
  });
  if (error) { alert(error.message); return; }
  loadQuestionBankFor(assessmentId);
}
function openEditQuestion(q, assessmentId) {
  openModal(`<h3>Edit Question</h3>
    <div class="field"><label>Question</label><textarea id="eqText" rows="2" style="width:100%;background:var(--dash-surface);color:var(--dash-text);border:1px solid var(--dash-border);border-radius:8px;padding:8px;">${q.question_text}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div class="field"><label>Option A</label><input id="eqA" value="${q.option_a}"/></div>
      <div class="field"><label>Option B</label><input id="eqB" value="${q.option_b}"/></div>
      <div class="field"><label>Option C</label><input id="eqC" value="${q.option_c}"/></div>
      <div class="field"><label>Option D</label><input id="eqD" value="${q.option_d}"/></div>
    </div>
    <div style="display:flex;gap:12px;">
      <div class="field" style="flex:1;"><label>Correct</label><select id="eqCorrect">${["A","B","C","D"].map(o=>`<option value="${o}" ${q.correct_option===o?"selected":""}>${o}</option>`).join("")}</select></div>
      <div class="field" style="flex:1;"><label>Marks</label><input id="eqMarks" type="number" value="${q.marks}"/></div>
    </div>
    <button class="btn btn-green" style="width:100%;" onclick="saveEditedQuestion('${q.id}','${assessmentId}')">Save</button>`);
}
async function saveEditedQuestion(questionId, assessmentId) {
  const { error } = await sb.from("assessment_questions").update({
    question_text: document.getElementById("eqText").value.trim(),
    option_a: document.getElementById("eqA").value.trim(), option_b: document.getElementById("eqB").value.trim(),
    option_c: document.getElementById("eqC").value.trim(), option_d: document.getElementById("eqD").value.trim(),
    correct_option: document.getElementById("eqCorrect").value, marks: Number(document.getElementById("eqMarks").value) || 1,
  }).eq("id", questionId);
  if (error) { alert(error.message); return; }
  closeModal();
  loadQuestionBankFor(assessmentId);
}
async function deleteQuestion(questionId, assessmentId) {
  if (!confirm("Delete this question?")) return;
  await sb.from("assessment_questions").delete().eq("id", questionId);
  loadQuestionBankFor(assessmentId);
}
async function moveQuestion(assessmentId, questionId, direction) {
  const { data: questions } = await sb.from("assessment_questions").select("id, order_index").eq("assessment_id", assessmentId).order("order_index");
  const idx = questions.findIndex(q => q.id === questionId);
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= questions.length) return;
  await sb.from("assessment_questions").update({ order_index: questions[swapIdx].order_index }).eq("id", questions[idx].id);
  await sb.from("assessment_questions").update({ order_index: questions[idx].order_index }).eq("id", questions[swapIdx].id);
  loadQuestionBankFor(assessmentId);
}

// ============================================================
// TAB 3 — RESULTS
// ============================================================
async function loadResultsTab() {
  const panel = document.getElementById("eapanel-results");
  const pairs = await getMyAssessableClassSubjects();
  const classIds = [...new Set(pairs.map(p => p.class_id))];
  const classes = state.classes.filter(c => classIds.includes(c.id));
  panel.innerHTML = `
    <div class="field" style="max-width:400px;"><label>Class</label>
      <select id="resClassSelect" onchange="loadResultsAssessmentOptions()"><option value="">— choose —</option>
      ${classes.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}</select></div>
    <div class="field" style="max-width:400px;"><label>Test / Exam</label><select id="resAssessmentSelect" onchange="loadResultsTable()"><option value="">— choose a class first —</option></select></div>
    <div id="resBody"></div>`;
}
async function loadResultsAssessmentOptions() {
  const classId = document.getElementById("resClassSelect").value;
  const sel = document.getElementById("resAssessmentSelect");
  if (!classId) { sel.innerHTML = `<option value="">— choose a class first —</option>`; return; }
  const { data: rows } = await sb.from("assessments").select("id, title, assessment_type, subjects(name)").eq("class_id", classId).eq("term_id", state.currentTermId);
  sel.innerHTML = `<option value="">— choose —</option>` + (rows||[]).map(r => `<option value="${r.id}">${r.subjects.name} — ${r.assessment_type.toUpperCase()} — ${r.title}</option>`).join("");
  document.getElementById("resBody").innerHTML = "";
}
async function loadResultsTable() {
  const assessmentId = document.getElementById("resAssessmentSelect").value;
  const body = document.getElementById("resBody");
  if (!assessmentId) { body.innerHTML = ""; return; }
  body.innerHTML = "Loading…";
  const { data: attempts } = await sb.from("assessment_attempts").select("*, students(full_name, admission_no)").eq("assessment_id", assessmentId).order("score", { ascending: false });
  if (!attempts || !attempts.length) { body.innerHTML = `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No submissions yet.</p></div>`; return; }
  body.innerHTML = `<div style="overflow-x:auto;"><table class="data-table">
    <thead><tr><th>Student</th><th>Adm No</th><th>Score</th><th>Total</th><th>Status</th><th>Submitted</th></tr></thead>
    <tbody>${attempts.map(a => `<tr>
      <td class="name-cell">${a.students.full_name}</td><td>${a.students.admission_no}</td>
      <td>${a.score ?? "—"}</td><td>${a.total_marks ?? "—"}</td>
      <td><span class="badge ${a.status==='submitted'?'badge-success':'badge-warning'}">${a.status === "submitted" ? "Submitted" : "In Progress"}</span></td>
      <td>${a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}</td>
    </tr>`).join("")}</tbody></table></div>`;
}
