import { z } from 'zod';

export const loopMessageSendRequestSchema = z.object({
  recipient: z.string().min(1, 'Recipient is required'),
  text: z.string().min(1, 'Text is required').max(10000, 'Text must be less than 10,000 characters'),
  sender_name: z.string().min(1, 'Sender name is required'),
  attachments: z.array(z.string().url().startsWith('https://')).max(3).optional(),
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

export type LoopMessageSendRequest = z.infer<typeof loopMessageSendRequestSchema>;
export type LoopMessageSendResponse = z.infer<typeof loopMessageSendResponseSchema>;
export type LoopMessageError = z.infer<typeof loopMessageErrorSchema>;