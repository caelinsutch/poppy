import type {
  LoopMessageSendRequest,
  LoopMessageSendResponse,
} from "@poppy/schemas";
import wretch from "wretch";

export interface LoopMessageClientConfig {
  authorizationKey: string;
  secretKey: string;
  baseUrl?: string;
}

function createWretchClient(config: LoopMessageClientConfig) {
  const baseUrl = config.baseUrl || "https://server.loopmessage.com";

  return wretch(baseUrl).headers({
    Authorization: config.authorizationKey,
    "Loop-Secret-Key": config.secretKey,
    "Content-Type": "application/json",
  });
}

async function handleError(error: any): Promise<LoopMessageSendResponse> {
  console.log(error);
  if (error.status) {
    const errorData = error.message;

    if (error.status === 402) {
      return {
        success: false,
        error: "No available requests/credits",
      };
    }

    return {
      success: false,
      error: errorData.error || "Failed to send message",
      message: errorData.message,
    };
  }

  throw error;
}

async function sendMessage(
  client: ReturnType<typeof wretch>,
  request: LoopMessageSendRequest,
): Promise<LoopMessageSendResponse> {
  try {
    const response = await client
      .url("/api/v1/message/send/")
      .post(request)
      .json<any>();

    return {
      success: true,
      message: "Message sent successfully",
      message_id: response.message_id,
    };
  } catch (error: any) {
    return handleError(error);
  }
}

export const createLoopMessageClient = (config: LoopMessageClientConfig) => {
  const wretchClient = createWretchClient(config);

  return {
    sendMessage: (request: LoopMessageSendRequest) =>
      sendMessage(wretchClient, request),
  };
};
