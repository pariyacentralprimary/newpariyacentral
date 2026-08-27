// ============================================================
// TIMETABLE — constraint-based builder
// Detects teacher double-booking: a staff member cannot be placed
// in two different classes at the same day+period.
// ============================================================
const TT_DAYS = [1,2,3,4,5]; // Mon-Fri
const TT_DAY_LABELS = { 1:"Mon", 2:"Tue", 3:"Wed", 4:"Thu", 5:"Fri" };
const TT_PERIODS = [1,2,3,4,5,6,7,8];

async function renderTimetable() {
  const el = document.getElementById("panel-timetable");
  el.innerHTML = `<div class="field"><label>Class</label>
    <select id="ttClassSelect" onchange="loadTimetableGrid()"><option value="">— choose —</option>
    ${state.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}</select></div>
    <div id="ttGrid"></div>`;
}

async function getOrCreateTimetable(classId) {
  const { data: existing } = await sb.from("timetables").select("id").eq("class_id", classId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await sb.from("timetables").insert({ class_id: classId, generated_by: state.staff?.id }).select("id").single();
  if (error) { alert(error.message); return null; }
  return created.id;
}

async function loadTimetableGrid() {
  const classId = document.getElementById("ttClassSelect").value;
  const grid = document.getElementById("ttGrid");
  if (!classId) { grid.innerHTML = ""; return; }
  grid.innerHTML = "Loading…";

  const timetableId = await getOrCreateTimetable(classId);
  if (!timetableId) return;
  state.ttCurrentId = timetableId;
  state.ttCurrentClass = classId;

  const [{ data: slots }, { data: assigns }] = await Promise.all([
    sb.from("timetable_slots").select("*, subjects(name), staff(full_name)").eq("timetable_id", timetableId),
    sb.from("class_teacher_subjects").select("staff_id, subject_id, staff(full_name), subjects(name)").eq("class_id", classId),
  ]);
  state.ttSlots = slots || [];
  state.ttAssigns = assigns || [];

  const slotMap = {};
  (slots||[]).forEach(s => { slotMap[`${s.day_of_week}_${s.period_index}`] = s; });

  let html = `<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>Period</th>${TT_DAYS.map(d => `<th>${TT_DAY_LABELS[d]}</th>`).join("")}</tr></thead><tbody>`;
  TT_PERIODS.forEach(p => {
    html += `<tr><td style="font-weight:800;">${p}</td>`;
    TT_DAYS.forEach(d => {
      const key = `${d}_${p}`;
      const cell = slotMap[key];
      html += `<td style="min-width:120px;">
        <select data-day="${d}" data-period="${p}" onchange="saveTimetableCell(this)" style="width:100%;font-size:11px;">
          <option value="">— empty —</option>
          ${(assigns||[]).map(a => `<option value="${a.staff_id}|${a.subject_id}" ${cell && cell.staff_id===a.staff_id && cell.subject_id===a.subject_id ? "selected" : ""}>${a.subjects.name} (${a.staff.full_name})</option>`).join("")}
        </select>
      </td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>
    <p style="color:var(--dash-muted);font-size:12px;margin-top:10px;">Only teachers already assigned to this class (via Curriculum & Assignments) appear in the dropdowns. Saving a slot automatically checks for double-booking against this teacher's other classes.</p>
    <button class="btn no-print" style="margin-top:8px;" onclick="window.print()"><i class="fa-solid fa-print"></i> Print Timetable</button>`;
  grid.innerHTML = html;
}

async function saveTimetableCell(selectEl) {
  const day = Number(selectEl.dataset.day), period = Number(selectEl.dataset.period);
  const val = selectEl.value;

  // Clear this slot
  if (!val) {
    await sb.from("timetable_slots").delete().eq("timetable_id", state.ttCurrentId).eq("day_of_week", day).eq("period_index", period);
    return;
  }
  const [staff_id, subject_id] = val.split("|");

  // Conflict check: is this staff member already booked elsewhere at this day+period,
  // in ANY class's timetable (not just this one)?
  const { data: conflicts } = await sb.from("timetable_slots")
    .select("id, timetables(class_id, classes(name))")
    .eq("staff_id", staff_id).eq("day_of_week", day).eq("period_index", period)
    .neq("timetable_id", state.ttCurrentId);
  if (conflicts && conflicts.length) {
    const otherClass = conflicts[0].timetables?.classes?.name || "another class";
    alert(`Conflict: this teacher is already scheduled in ${otherClass} at this exact day/period. Choose a different slot or teacher.`);
    selectEl.value = "";
    return;
  }

  const { error } = await sb.from("timetable_slots").delete().eq("timetable_id", state.ttCurrentId).eq("day_of_week", day).eq("period_index", period);
  if (error) { alert(error.message); return; }
  const { error: insErr } = await sb.from("timetable_slots").insert({
    timetable_id: state.ttCurrentId, day_of_week: day, period_index: period, staff_id, subject_id,
  });
  if (insErr) alert(insErr.message);
}
