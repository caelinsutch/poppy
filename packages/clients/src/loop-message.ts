import wretch from 'wretch';
import type { LoopMessageSendRequest, LoopMessageSendResponse } from '@poppy/schemas';

export interface LoopMessageClientConfig {
  authorizationKey: string;
  secretKey: string;
  baseUrl?: string;
}

export class LoopMessageClient {
  private client: ReturnType<typeof wretch>;
  
  constructor(private config: LoopMessageClientConfig) {
    const baseUrl = config.baseUrl || 'https://server.loopmessage.com';
    
    this.client = wretch(baseUrl)
      .headers({
        'Authorization': config.authorizationKey,
        'Loop-Secret-Key': config.secretKey,
        'Content-Type': 'application/json'
      });
  }

  async sendMessage(request: LoopMessageSendRequest): Promise<LoopMessageSendResponse> {
    try {
      const response = await this.client
        .url('/api/v1/message/send/')
        .post(request)
        .json<any>();

      return {
        success: true,
        message: 'Message sent successfully',
        message_id: response.message_id
      };
    } catch (error: any) {
      if (error.status) {
        const errorData = await error.json().catch(() => ({}));
        
        if (error.status === 402) {
          return {
            success: false,
            error: 'No available requests/credits'
          };
        }
        
        return {
          success: false,
          error: errorData.error || 'Failed to send message',
          message: errorData.message
        };
      }

      throw error;
    }
  }
}

const authorizationKey = process.env.LOOP_AUTHORIZATION_KEY;
const secretKey = process.env.LOOP_SECRET_KEY;
const baseUrl = process.env.LOOP_BASE_URL;

if (!authorizationKey || !secretKey || !baseUrl) {
  throw new Error('LOOP_AUTHORIZATION_KEY, LOOP_SECRET_KEY, and LOOP_BASE_URL must be set');
}

export const loopClient = new LoopMessageClient({
  authorizationKey,
  secretKey,
  baseUrl,
});
