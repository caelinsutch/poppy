import { z } from 'zod';

export const loopMessageSendRequestSchema = z.object({
  recipient: z.string().min(1, 'Recipient is required'),
  text: z.string().min(1, 'Text is required').max(10000, 'Text must be less than 10,000 characters'),
  sender_name: z.string().min(1, 'Sender name is required'),
  attachments: z.array(z.url().startsWith('https://')).max(3).optional(),
  timeout: z.number().optional(),
  passthrough: z.any().optional(),
  status_callback: z.url().optional(),
  effect: z.string().optional(),
  service: z.enum(['iMessage', 'SMS']).optional(),
});

export const loopMessageSendResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  message_id: z.string().optional(),
  error: z.string().optional(),
});

export const loopMessageErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  status_code: z.number(),
});

const baseWebhookPayloadSchema = z.object({
  message_id: z.string(),
  webhook_id: z.string(),
  recipient: z.string(),
  text: z.string(),
  sender_name: z.string().optional(),
  subject: z.string().optional(),
  thread_id: z.string().optional(),
  sandbox: z.boolean().optional(),
  passthrough: z.string().optional(),
  delivery_type: z.enum(['imessage', 'sms']).optional(),
});

const messageInboundPayloadSchema = baseWebhookPayloadSchema.extend({
  alert_type: z.literal('message_inbound'),
  message_type: z.enum(['text', 'reaction', 'audio', 'attachments', 'sticker', 'location']).optional(),
  attachments: z.array(z.string()).optional(),
  language: z.object({
    code: z.string(),
    name: z.string(),
  }).optional(),
  speech: z.object({
    text: z.string(),
    confidence: z.number(),
  }).optional(),
});

const messageScheduledPayloadSchema = baseWebhookPayloadSchema.extend({
  alert_type: z.literal('message_scheduled'),
});

const messageFailedPayloadSchema = baseWebhookPayloadSchema.extend({
  alert_type: z.literal('message_failed'),
  error_code: z.number(),
});

const messageSentPayloadSchema = baseWebhookPayloadSchema.extend({
  alert_type: z.literal('message_sent'),
  success: z.boolean(),
});

const messageReactionPayloadSchema = baseWebhookPayloadSchema.extend({
  alert_type: z.literal('message_reaction'),
  reaction: z.enum(['love', 'like', 'dislike', 'laugh', 'exclaim', 'question', 'unknown']),
  message_type: z.literal('reaction'),
});

const messageTimeoutPayloadSchema = baseWebhookPayloadSchema.extend({
  alert_type: z.literal('message_timeout'),
  error_code: z.number(),
});

const groupCreatedPayloadSchema = baseWebhookPayloadSchema.extend({
  alert_type: z.literal('group_created'),
  group: z.object({
    group_id: z.string(),
    name: z.string(),
    participants: z.array(z.string()),
  }),
});

const conversationInitiatedPayloadSchema = baseWebhookPayloadSchema.extend({
  alert_type: z.literal('conversation_initiated'),
});

export const loopMessageWebhookPayloadSchema = z.discriminatedUnion('alert_type', [
  messageInboundPayloadSchema,
  messageScheduledPayloadSchema,
  messageFailedPayloadSchema,
  messageSentPayloadSchema,
  messageReactionPayloadSchema,
  messageTimeoutPayloadSchema,
  groupCreatedPayloadSchema,
]);

export type LoopMessageSendRequest = z.infer<typeof loopMessageSendRequestSchema>;
export type LoopMessageSendResponse = z.infer<typeof loopMessageSendResponseSchema>;
export type LoopMessageError = z.infer<typeof loopMessageErrorSchema>;
export type LoopMessageWebhookPayload = z.infer<typeof loopMessageWebhookPayloadSchema>;