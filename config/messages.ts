/**
 * Visitor message type configuration. Mirrors the `message_type` CHECK
 * constraint in supabase/migrations/20260829157000_messages.sql.
 */

export const MESSAGE_TYPES = ["condolence", "memory_message", "testimonial"] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];
