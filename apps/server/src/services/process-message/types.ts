import { Conversation, Message, Part, User } from "@poppy/db";
import { FastifyBaseLogger } from "fastify";

export type ProcessMessageOptions = {
  currentMessage: Message;
  currentParts: Part[];
  conversation: Conversation;
  conversationHistory: { message: Message; parts: Part[] }[];
  participants: User[];
  logger?: FastifyBaseLogger;
}