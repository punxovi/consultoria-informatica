import type { ActionFields, ActionFilters, ActionsRepository, UpdateActionInput } from '../domain/actions.ts';
import type {
  CreateMeetingMinuteInput,
  MeetingMinuteFilters,
  MeetingMinutesRepository,
  UpdateMeetingMinuteInput,
} from '../domain/meeting-minutes.ts';
import type { PlanFields, PlanFilters, PlansRepository, UpdatePlanInput } from '../domain/plans.ts';

export function createInterventionsApplication(
  plans: PlansRepository,
  actions: ActionsRepository,
  meetingMinutes: MeetingMinutesRepository,
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
      list: (token: string, filters: MeetingMinuteFilters) => meetingMinutes.list(token, filters),
      getById: (token: string, id: string) => meetingMinutes.getById(token, id),
      create: (token: string, input: CreateMeetingMinuteInput) => meetingMinutes.create(token, input),
      update: (token: string, id: string, input: UpdateMeetingMinuteInput) => meetingMinutes.update(token, id, input),
    },
  };
}

export type InterventionsApplication = ReturnType<typeof createInterventionsApplication>;
