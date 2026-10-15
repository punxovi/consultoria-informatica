import type { ActionFields, ActionFilters, ActionsRepository, UpdateActionInput } from '../domain/actions.ts';
import type {
  CreateMeetingMinuteInput,
  MeetingMinuteFilters,
  MeetingMinutesRepository,
  UpdateMeetingMinuteInput,
} from '../domain/meeting-minutes.ts';
import type { PlanFields, PlanFilters, PlansRepository, UpdatePlanInput } from '../domain/plans.ts';
import type { CreateEvidenceInput, EvidenceFilters, EvidencesRepository, UpdateEvidenceInput } from '../domain/evidences.ts';

export function createInterventionsApplication(
  plans: PlansRepository,
  actions: ActionsRepository,
  meetingMinutes: MeetingMinutesRepository,
  evidences: EvidencesRepository,
) {
  return {
    plans: {
      list: (token: string, filters: PlanFilters) => plans.list(token, filters),
      getById: (token: string, id: string) => plans.getById(token, id),
      create: (token: string, fields: PlanFields) => plans.create(token, fields),
      update: (token: string, id: string, input: UpdatePlanInput) => plans.update(token, id, input),
      archive: (token: string, id: string, version: number) => plans.archive(token, id, version),
    },
    actions: {
      list: (token: string, filters: ActionFilters) => actions.list(token, filters),
      getById: (token: string, id: string) => actions.getById(token, id),
      create: (token: string, fields: ActionFields) => actions.create(token, fields),
      update: (token: string, id: string, input: UpdateActionInput) => actions.update(token, id, input),
      archive: (token: string, id: string, version: number) => actions.archive(token, id, version),
    },
    meetingMinutes: {
      catalog: (token: string, organizationId: string) => meetingMinutes.catalog(token, organizationId),
      list: (token: string, filters: MeetingMinuteFilters) => meetingMinutes.list(token, filters),
      getById: (token: string, id: string) => meetingMinutes.getById(token, id),
      create: (token: string, input: CreateMeetingMinuteInput) => meetingMinutes.create(token, input),
      update: (token: string, id: string, input: UpdateMeetingMinuteInput) => meetingMinutes.update(token, id, input),
    },
    evidences: {
      list: (token: string, filters: EvidenceFilters) => evidences.list(token, filters),
      getById: (token: string, id: string) => evidences.getById(token, id),
      create: (token: string, input: CreateEvidenceInput) => evidences.create(token, input),
      update: (token: string, id: string, input: UpdateEvidenceInput) => evidences.update(token, id, input),
      upload: (token: string, id: string, version: number, bytes: Buffer, mimeType: string) => evidences.upload(token, id, version, bytes, mimeType),
      download: (token: string, id: string) => evidences.download(token, id),
    },
  };
}

export type InterventionsApplication = ReturnType<typeof createInterventionsApplication>;
