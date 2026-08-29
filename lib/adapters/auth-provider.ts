/**
 * Authentication contract.
 *
 * The owner-facing access mechanism (Mission 000: magic link email) is not
 * implemented in Mission 001. This only defines the shape application code
 * depends on, so it never calls a specific auth service directly.
 */
export interface AuthSession {
  ownerId: string;
}

export interface AuthProvider {
  getSession(): Promise<AuthSession | null>;
}
