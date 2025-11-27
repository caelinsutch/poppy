import type { Conversation, Message, Part, User } from "@poppy/db";
import type { WorkerEnv } from "../../context";
import type { Database } from "../../db/client";

export type ProcessMessageOptions = {
  currentMessage: Message;
  conversation: Conversation;
  conversationHistory: { message: Message; parts: Part[] }[];
  participants: User[];
  env: WorkerEnv;
  db: Database;
};
