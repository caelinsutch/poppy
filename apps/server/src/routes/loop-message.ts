import type { FastifyInstance, FastifyRequest } from 'fastify';
import { loopMessageSendRequestSchema, loopMessageWebhookPayloadSchema, type LoopMessageSendResponse, type LoopMessageWebhookPayload } from '@poppy/schemas';
import { loopClient } from '../clients/loop-message';
import { env } from '../env';


export async function loopMessageRoutes(server: FastifyInstance) {


  server.post<{
    Body: unknown;
    Reply: LoopMessageSendResponse;
  }>('/api/messages/send', async (request, reply) => {
    const validation = loopMessageSendRequestSchema.safeParse(request.body);
    
    if (!validation.success) {
      return reply.code(400).send({
        success: false,
        error: 'Validation error',
        message: validation.error.message
      });
    }

    try {
      const response = await loopClient.sendMessage(validation.data);
      return reply.send(response);
    } catch (error) {
      server.log.error(error, 'Error sending message via Loop Message API');
      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  server.post<{
    Body: unknown;
    Headers: {
      authorization?: string;
    };
    Reply: { success: boolean };
  }>('/api/webhooks/loop-message', async (request, reply) => {
    const validation = loopMessageWebhookPayloadSchema.safeParse(request.body);
    
    if (!validation.success) {
      server.log.info(request.body)
      server.log.error({ error: validation.error }, 'Invalid webhook payload');
      return reply.code(400).send({ success: false });
    }

    const payload = validation.data;
    
    try {
      switch (payload.alert_type) {
        case 'message_inbound':
          server.log.info({ 
            recipient: payload.recipient, 
            message_type: payload.message_type,
            text: payload.text.substring(0, 100)
          }, 'Received inbound message');
          break;
          
        case 'message_sent':
          server.log.info({ 
            recipient: payload.recipient, 
            success: payload.success,
            message_id: payload.message_id 
          }, 'Message sent successfully');
          break;
          
        case 'message_failed':
          server.log.error({ 
            recipient: payload.recipient, 
            error_code: payload.error_code,
            message_id: payload.message_id 
          }, 'Message failed to send');
          break;
          
        case 'message_timeout':
          server.log.warn({ 
            recipient: payload.recipient, 
            error_code: payload.error_code,
            message_id: payload.message_id 
          }, 'Message timed out');
          break;
          
        case 'message_reaction':
          server.log.info({ 
            recipient: payload.recipient, 
            reaction: payload.reaction,
            message_id: payload.message_id 
          }, 'Received message reaction');
          break;
          
        case 'message_scheduled':
          server.log.info({ 
            recipient: payload.recipient,
            message_id: payload.message_id 
          }, 'Message scheduled');
          break;
          
        case 'group_created':
          server.log.info({ 
            group_id: payload.group.group_id,
            participants: payload.group.participants 
          }, 'Group created');
          break;
      }
      
      return reply.code(200).send({ success: true });
      
    } catch (error) {
      server.log.error(error, 'Error processing webhook');
      return reply.code(500).send({ success: false });
    }
  });
}