import { z } from 'zod';

// Base fields shared by both individual and group messages
const baseMessageFields = {
  text: z.string().min(1, 'Text is required').max(10000, 'Text must be less than 10,000 characters'),
  sender_name: z.string().min(1, 'Sender name is required'),
  attachments: z.array(z.url().startsWith('https://')).max(3).optional(),
  timeout: z.number().optional(),
  passthrough: z.any().optional(),
  status_callback: z.url().optional(),
  effect: z.string().optional(),
  service: z.enum(['iMessage', 'SMS']).optional(),
};

// Individual message (has recipient, no group_id)
const individualMessageSchema = z.object({
  recipient: z.string().min(1, 'Recipient is required'),
  ...baseMessageFields,
});

// Group message (has group_id, no recipient)
const groupMessageSchema = z.object({
  group: z.string().min(1, 'Group ID is required'),
  ...baseMessageFields,
});

// Union type: either individual or group message
export const loopMessageSendRequestSchema = z.union([
  individualMessageSchema,
  groupMessageSchema,
]);

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

const baseWebhookCommonFields = {
  message_id: z.string(),
  webhook_id: z.string(),
  text: z.string(),
  sender_name: z.string().optional(),
  subject: z.string().optional(),
  thread_id: z.string().optional(),
  sandbox: z.boolean().optional(),
  passthrough: z.string().optional(),
  delivery_type: z.enum(['imessage', 'sms']).optional(),
};

const webhookGroupSchema = z.object({
  name: z.string(),
  group_id: z.string(),
  participants: z.array(z.string()),
});

// Base webhook must have either group or recipient (mutually exclusive)
const baseWebhookWithGroup = z.object({
  ...baseWebhookCommonFields,
  group: webhookGroupSchema,
  // If present, recipient must not be a value (reject strings)
  recipient: z.never().optional(),
});

const baseWebhookWithRecipient = z.object({
  ...baseWebhookCommonFields,
  recipient: z.string(),
  // If present, group must not be a value (reject objects)
  group: z.never().optional(),
});

// Helper to build payloads that satisfy the base union (group XOR recipient)
const buildPayloadWithEitherRecipientOrGroup = <T extends z.ZodRawShape>(
  fields: T,
) =>
  z.union([
    z.object({
      ...baseWebhookCommonFields,
      group: webhookGroupSchema,
      ...fields,
    }),
    z.object({
      ...baseWebhookCommonFields,
      recipient: z.string(),
      ...fields,
    }),
  ]);

// For inbound messages, recipient is the user who's texting us, sender is our bot's phone number
const messageInboundPayloadSchema = buildPayloadWithEitherRecipientOrGroup({
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

const messageScheduledPayloadSchema = buildPayloadWithEitherRecipientOrGroup({
  alert_type: z.literal('message_scheduled'),
});

const messageFailedPayloadSchema = buildPayloadWithEitherRecipientOrGroup({
  alert_type: z.literal('message_failed'),
  error_code: z.number(),
});

const messageSentPayloadSchema = buildPayloadWithEitherRecipientOrGroup({
  alert_type: z.literal('message_sent'),
  success: z.boolean(),
});

const messageReactionPayloadSchema = buildPayloadWithEitherRecipientOrGroup({
  alert_type: z.literal('message_reaction'),
  reaction: z.enum(['love', 'like', 'dislike', 'laugh', 'exclaim', 'question', 'unknown']),
  message_type: z.literal('reaction'),
});

const messageTimeoutPayloadSchema = buildPayloadWithEitherRecipientOrGroup({
  alert_type: z.literal('message_timeout'),
  error_code: z.number(),
});

// group_created events are always groups (no recipient variant)
const groupCreatedPayloadSchema = z.object({
  ...baseWebhookCommonFields,
  alert_type: z.literal('group_created'),
  group: z.object({
    group_id: z.string(),
    name: z.string(),
    participants: z.array(z.string()),
  }),
});

const conversationInitiatedPayloadSchema = buildPayloadWithEitherRecipientOrGroup({
  alert_type: z.literal('conversation_initiated'),
});

export const loopMessageWebhookPayloadSchema = z.union([
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
export type LoopMessageInboundPayload = z.infer<typeof messageInboundPayloadSchema>;