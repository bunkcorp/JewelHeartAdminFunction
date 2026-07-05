/**
 * SDUI HTTP handlers — kept separate from service.js to avoid circular imports with sduiScreens.
 */

import * as api from './service.js';
import { buildSduiResponse } from './sduiScreens.js';
import { HttpError } from './errors.js';
import * as acl from './acl.js';

const { assertUuid } = api;

export async function sduiScreen(req) {
  return buildSduiResponse(req.uid, req.body, api, req.authToken, req.keycloakPayload);
}

/**
 * Server-side mutations from SDUI (optional). Clients may call REST directly instead.
 */
export async function sduiAction(req) {
  const firebaseUid = req.uid;
  const authToken = req.authToken;
  const keycloakPayload = req.keycloakPayload;
  const body = req.body;
  const { actionId, retreatId, payload = {} } = body || {};
  if (!actionId) throw new HttpError(400, 'actionId required');
  if (retreatId) {
    assertUuid(retreatId, 'retreatId');
    await acl.assertRetreatReadAccess(firebaseUid, retreatId, authToken);
  }

  switch (actionId) {
    case 'refresh':
      return { ok: true, message: 'Refresh' };
    case 'mutations.createRetreat': {
      const r = await api.createRetreat(firebaseUid, payload, authToken);
      return {
        ok: true,
        message: 'Retreat created',
        nextScreen: await buildSduiResponse(
          firebaseUid,
          { screenId: 'jewelheart.retreat.detail', retreatId: r.id, params: { retreatId: r.id } },
          api,
          authToken,
          keycloakPayload,
        ),
      };
    }
    case 'mutations.createJob': {
      if (!retreatId) throw new HttpError(400, 'retreatId required');
      const j = await api.createJob(firebaseUid, retreatId, payload, authToken);
      return { ok: true, message: 'Job created', result: { jobId: j.id } };
    }
    case 'mutations.createSlot': {
      if (!retreatId) throw new HttpError(400, 'retreatId required');
      const s = await api.createSlot(firebaseUid, retreatId, payload, authToken);
      return { ok: true, message: 'Slot created', result: { slotId: s.id } };
    }
    case 'mutations.createTask': {
      if (!retreatId) throw new HttpError(400, 'retreatId required');
      const t = await api.createTask(firebaseUid, retreatId, payload, authToken);
      return { ok: true, message: 'Task created', result: { taskId: t.id } };
    }
    case 'mutations.assignVolunteer': {
      if (!retreatId) throw new HttpError(400, 'retreatId required');
      const { taskId, volunteerId } = payload;
      assertUuid(taskId, 'taskId');
      assertUuid(volunteerId, 'volunteerId');
      const a = await api.createAssignment(firebaseUid, retreatId, taskId, volunteerId, authToken);
      return { ok: true, message: 'Assigned', result: { assignmentId: a.id } };
    }
    default:
      return { ok: true, message: `Action ${actionId} acknowledged (no server mutation).` };
  }
}
