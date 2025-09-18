
import { convertToModelMessages } from 'ai';
import { dbMessageToUIMessage } from '@poppy/lib';
import { sendLoopMessage } from '../loop/send-loop-message';
import { ProcessMessageOptions } from './types';
import { mainResponse } from './main-response';
import { checkShouldRespond } from './check-should-respond';
import { db, messages } from '@poppy/db';
import { desc, eq } from 'drizzle-orm';


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

  logger?.info('uiMessages generated');

  // Convert UI messages to model messages for the AI SDK
  const modelMessages = convertToModelMessages(uiMessages);

  logger?.info('modelMessages generated');

  try {
    const shouldRespond = await checkShouldRespond(modelMessages, options);

    if (!shouldRespond) {
      logger?.info({
        messageId: currentMessage.id,
        shouldRespond
      }, 'Skipping response');
      return;
    }

    logger?.info({
      messageId: currentMessage.id,
      shouldRespond
    }, 'Should respond to message');

    const { text, usage } = await mainResponse(modelMessages, options);

    

    logger?.info({
      messageId: currentMessage.id,
      response: text,
      usage
    }, 'Generated AI response');

    // Don't send if there's newer messages in the conversation
    const recentMessage = await db.query.messages.findFirst({
      where: eq(messages.conversationId, currentMessage.conversationId),
      orderBy: desc(messages.createdAt),
    });

    if (recentMessage && recentMessage.createdAt > currentMessage.createdAt) {
      logger?.info({
        messageId: currentMessage.id,
        recentMessageId: recentMessage.id,
      }, 'Skipping response because there are newer messages in the conversation');
      return;
    }

    // Send the message via Loop Message and save to database
    const sendResult = await sendLoopMessage({
      text,
      conversationId: currentMessage.conversationId,
      logger,
    });

    logger?.info({
      assistantMessageId: sendResult.message.id,
      loopMessageId: sendResult.loopMessageIds,
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