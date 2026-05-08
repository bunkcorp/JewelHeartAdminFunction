/**
 * Paste into: private-server/src/jewelheart/mappers.js
 * Replace the entire exported `mapTaskRow` function with this implementation.
 *
 * Adds jobTitle / slotLabel / slotActivityContext from SQL aliases (see
 * jewelheart-service-listTasks.fragment.js).
 */

export function mapTaskRow(r) {
  return {
    id: r.id,
    retreatId: r.retreat_id,
    jobId: r.job_id,
    slotId: r.slot_id,
    jobTitle: r.job_title ?? undefined,
    slotLabel: r.slot_label ?? undefined,
    slotActivityContext:
      r.slot_activity_context !== null && r.slot_activity_context !== undefined
        ? String(r.slot_activity_context)
        : undefined,
    notes: r.notes,
    assignmentCount: r.assignment_count != null ? Number(r.assignment_count) : undefined,
    volunteersNeeded: r.volunteers_needed != null ? Number(r.volunteers_needed) : undefined,
    isUnderassigned:
      r.volunteers_needed != null && r.assignment_count != null
        ? Number(r.assignment_count) < Number(r.volunteers_needed)
        : undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}
