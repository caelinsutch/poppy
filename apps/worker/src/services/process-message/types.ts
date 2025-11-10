import type { Conversation, Message, Part, User } from "@poppy/db";
import type { Database } from "../../db/client";

export type ProcessMessageOptions = {
  currentMessage: Message;
  currentParts: Part[];
  conversation: Conversation;
  conversationHistory: { message: Message; parts: Part[] }[];
  participants: User[];
  env: Env;
  db: Database;
};
