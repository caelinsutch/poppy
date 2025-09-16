import { loopClient } from '../../clients/loop-message';

export interface SendLoopMessageOptions {
  text: string;
  sender: string;
  recipient: string;
}

export const sendLoopMessage = async (options: SendLoopMessageOptions) => {
  const { text, sender, recipient } = options;

  const sendResponse = await loopClient.sendMessage({
    recipient,
    text,
    sender_name: sender,
  });

  if (!sendResponse.success) {
    throw new Error(`Failed to send message: ${sendResponse.error}`);
  }

  return {
    success: true,
    loopMessageId: sendResponse.message_id,
    recipient,
  };
};