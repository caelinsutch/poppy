import type { LoopMessageWebhookPayload } from '@poppy/schemas';
import type { FastifyBaseLogger } from 'fastify';

export interface MessageInboundHandlerOptions {
  payload: LoopMessageWebhookPayload;
  rawPayload: unknown;
  logger?: FastifyBaseLogger;
}

const storeMessage = async (
  payload: LoopMessageWebhookPayload, 
  logger?: FastifyBaseLogger
): Promise<void> => {
  const messageData = {
    recipient: payload.recipient,
    text: payload.text,
  };

  logger?.info({ messageData }, 'Storing inbound message');
  
  // TODO: Implement database storage
};

const processMessage = async (
  payload: LoopMessageWebhookPayload,
  logger?: FastifyBaseLogger
): Promise<void> => {
  // TODO: Implement message processing logic
  // This could include:
  // - Triggering workflows
  // - Sending notifications
  // - Updating conversation state
  // - Auto-responses
  
  logger?.info({ 
    recipient: payload.recipient,
    messageId: payload.message_id 
  }, 'Processing inbound message');
};

export const handleMessageInbound = async (options: MessageInboundHandlerOptions): Promise<void> => {
  const { payload, logger } = options;
  
  if (payload.alert_type !== 'message_inbound') {
    throw new Error(`Invalid alert type for inbound handler: ${payload.alert_type}`);
  }

  try {
    await storeMessage(payload, logger);
    await processMessage(payload, logger);
  } catch (error) {
    logger?.error({ error, payload }, 'Failed to process inbound message');
    throw error;
  }
};