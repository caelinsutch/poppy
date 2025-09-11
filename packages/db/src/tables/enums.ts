import { pgEnum } from 'drizzle-orm/pg-core';

export const channelTypeEnum = pgEnum('channel_type', ['sms', 'app']);

export const taskStatusEnum = pgEnum('task_status', [
  'initialized',
  'searching',
  'checking_availability',
  'completed',
  'partial_results',
  'failed',
  'no_results',
  'retrying',
  'expired'
]);

export const taskTypeEnum = pgEnum('task_type', [
  'find_reservations',
  'modify_reservation',
  'cancel_reservation'
]);

export const stepTypeEnum = pgEnum('step_type', [
  'web_search',
  'check_availability',
  'parse_result',
  'llm_decision',
  'filter_options',
  'rank_results',
  'call_restaurant'
]);