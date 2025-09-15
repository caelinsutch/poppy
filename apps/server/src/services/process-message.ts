import type { Message, Part } from '@poppy/db';
import type { FastifyBaseLogger } from 'fastify';
import { convertToModelMessages } from 'ai';
import { generateText } from 'ai';
import { dbMessageToUIMessage } from '@poppy/lib';
import { openai } from '../clients/openai';

export interface ProcessMessageOptions {
  message: Message;
  parts: Part[];
  logger?: FastifyBaseLogger;
}

export const processMessage = async (options: ProcessMessageOptions): Promise<void> => {
  const { message, parts, logger } = options;

  logger?.info({
    messageId: message.id,
    conversationId: message.conversationId,
    channelId: message.channelId,
    partsCount: parts.length
  }, 'Processing message');

  // Convert database message to UI message format
  const uiMessage = dbMessageToUIMessage(message, parts);

  // Create messages array for the conversation
  // In a real implementation, you'd fetch conversation history here
  const uiMessages = [uiMessage];

  // Convert UI messages to model messages for the AI SDK
  const modelMessages = convertToModelMessages(uiMessages);

  try {
    // Generate response using Vercel AI SDK
    const { text, usage } = await generateText({
      model: openai('gpt-4o-mini'),
      messages: modelMessages,
      temperature: 0.7,
      maxRetries: 3,
    });

    logger?.info({
      messageId: message.id,
      response: text,
      usage
    }, 'Generated AI response');

    // TODO: Send the response back through the appropriate channel
    // This would involve:
    // - Converting the response to a UIMessage
    // - Using uiMessageToDBFormat to save to database
    // - Sending via Loop Message API or other channel
    // - Updating conversation state

  } catch (error) {
    logger?.error({
      messageId: message.id,
      error
    }, 'Failed to generate AI response');
    throw error;
  }
};