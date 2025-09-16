import type { Message, Part } from '@poppy/db';
import type { FastifyBaseLogger } from 'fastify';
import type { UIMessage, TextPart } from 'ai';
import { convertToModelMessages, generateId } from 'ai';
import { generateText } from 'ai';
import { dbMessageToUIMessage } from '@poppy/lib';
import { openai } from '../../clients/openai';
import { sendLoopMessage } from './send-loop-message';
import { saveAssistantMessage } from './save-assistant-message';

export interface ProcessMessageOptions {
  currentMessage: Message;
  currentParts: Part[];
  conversationHistory: { message: Message; parts: Part[] }[];
  logger?: FastifyBaseLogger;
}

export const processMessage = async (options: ProcessMessageOptions): Promise<void> => {
  const { currentMessage, currentParts, conversationHistory, logger } = options;

  logger?.info({
    messageId: currentMessage.id,
    conversationId: currentMessage.conversationId,
    channelId: currentMessage.channelId,
    partsCount: currentParts.length,
    historyCount: conversationHistory.length
  }, 'Processing message with conversation history');

  // Convert all messages to UI message format
  const uiMessages = conversationHistory.map(({ message, parts }) =>
    dbMessageToUIMessage(message, parts)
  );

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
      messageId: currentMessage.id,
      response: text,
      usage
    }, 'Generated AI response');

    // Extract sender and recipient from the incoming message
    // For outbound messages, we swap them (we're sending FROM the recipient TO the sender)
    const sender = currentMessage.recipient || '';
    const recipient = currentMessage.sender || '';


    // First, send the message via Loop Message
    const sendResult = await sendLoopMessage({
      text,
      sender,
      recipient,
    });

    // Only save to database after successful send
    const assistantMessage: UIMessage = {
      id: generateId(),
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: text,
        } as TextPart,
      ],
    };

    await saveAssistantMessage({
      assistantMessage,
      conversationId: currentMessage.conversationId,
      channelId: currentMessage.channelId,
      loopMessageId: sendResult.loopMessageId,
      sender,
      recipient,
      logger,
    });

    logger?.info({
      assistantMessageId: assistantMessage.id,
      loopMessageId: sendResult.loopMessageId,
      recipient: sendResult.recipient,
    }, 'Successfully processed and sent message');

  } catch (error) {
    logger?.error({
      messageId: currentMessage.id,
      error
    }, 'Failed to generate AI response');
    throw error;
  }
};