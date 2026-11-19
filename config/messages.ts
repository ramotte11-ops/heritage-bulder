/**
 * Visitor message type configuration. Mirrors the `message_type` CHECK
 * constraint in supabase/migrations/20260829157000_messages.sql, widened to
 * `photo` by M8-E1 (supabase/migrations/20261119090000_m8_e1_contributions.sql).
 */

export const MESSAGE_TYPES = ["condolence", "memory_message", "testimonial", "photo"] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];
