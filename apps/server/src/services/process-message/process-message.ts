import type { Message, Part, Conversation, User } from '@poppy/db';
import type { FastifyBaseLogger } from 'fastify';
import { convertToModelMessages } from 'ai';
import { generateText } from 'ai';
import { dbMessageToUIMessage } from '@poppy/lib';
import { openai } from '../../clients/openai';
import { sendLoopMessage } from '../loop/send-loop-message';
import { ProcessMessageOptions } from './types';
import { mainResponse } from './main-response';


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
    dbMessageToUIMessage(message, parts, conversation.isGroup)
  );

  // Convert UI messages to model messages for the AI SDK
  const modelMessages = convertToModelMessages(uiMessages);

  try {
    const { text, usage } = await mainResponse(modelMessages, options);

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