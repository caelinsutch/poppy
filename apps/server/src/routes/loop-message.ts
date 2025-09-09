import type { FastifyInstance } from 'fastify';
import { loopMessageSendRequestSchema, type LoopMessageSendResponse } from '@poppy/schemas';
import { loopClient } from '../clients/loop-message';


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
}