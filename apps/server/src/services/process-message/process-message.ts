import type { Message, Part, Conversation, User } from '@poppy/db';
import type { FastifyBaseLogger } from 'fastify';
import { convertToModelMessages } from 'ai';
import { generateText } from 'ai';
import { dbMessageToUIMessage } from '@poppy/lib';
import { openai } from '../../clients/openai';
import { sendLoopMessage } from '../loop/send-loop-message';

export interface ProcessMessageOptions {
  currentMessage: Message;
  currentParts: Part[];
  conversation: Conversation;
  conversationHistory: { message: Message; parts: Part[] }[];
  participants: User[];
  logger?: FastifyBaseLogger;
}

export const processMessage = async (options: ProcessMessageOptions): Promise<void> => {
  const { currentMessage, currentParts, conversation, conversationHistory, participants, logger } = options;

  logger?.info({
    messageId: currentMessage.id,
    conversationId: currentMessage.conversationId,
    partsCount: currentParts.length,
    historyCount: conversationHistory.length,
    participantCount: participants.length,
    isGroup: conversation?.isGroup || false
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

    // Send the message via Loop Message and save to database
    const sendResult = await sendLoopMessage({
      text,
      conversationId: currentMessage.conversationId,
      logger,
    });

    logger?.info({
      assistantMessageId: sendResult.message.id,
      loopMessageId: sendResult.loopMessageId,
      conversationId: sendResult.conversationId,
    }, 'Successfully processed and sent message');

  } catch (error) {
    logger?.error({
      messageId: currentMessage.id,
      error
    }, 'Failed to generate AI response');
    throw error;
  }
};