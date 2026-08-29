import type { MessageType } from "@/config/messages";

/**
 * A visitor message (condolence, testimonial, memory message). Mirrors
 * the `messages` table (supabase/migrations/20260829157000_messages.sql).
 * No visitor-facing form or moderation UI is implemented in Mission 002.
 */
export interface Message {
  id: string;
  memorialId: string;
  messageType: MessageType;
  authorName: string;
  content: string;
  visible: boolean;
  createdAt: string; // ISO 8601
}
