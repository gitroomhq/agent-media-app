/**
 * Authentication and identity types for the agent-media platform.
 *
 * Covers user profiles, sessions, API keys, and the CLI device-code
 * OAuth flow.
 */
/** Core user profile stored in the `profiles` table. */
export interface User {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    stripeCustomerId: string | null;
    defaultModel: string | null;
    createdAt: string;
    updatedAt: string;
}
/** Supabase Auth session returned after login / token refresh. */
export interface Session {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    expiresAt: number;
    tokenType: string;
    user: User;
}
/** Raw JWT pair used by the CLI credential store. */
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}
export type DeviceCodeStatus = 'pending' | 'approved' | 'expired';
/**
 * A device-code record created when the CLI runs `agent-media login`.
 * The user opens the verification URL in a browser, authenticates,
 * and approves the device. The CLI polls until the status flips to
 * "approved" and an API key is returned.
 */
export interface DeviceCode {
    code: string;
    userId: string | null;
    apiKeyId: string | null;
    status: DeviceCodeStatus;
    expiresAt: string;
    createdAt: string;
}
/**
 * An API key record. The raw key is returned only once at creation time;
 * after that only the hash and prefix are stored.
 */
export interface ApiKey {
    id: string;
    userId: string;
    keyPrefix: string;
    name: string;
    rateLimitPerMin: number;
    lastUsedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
}
/** Payload returned to the CLI when an API key is first created. */
export interface ApiKeyCreateResult {
    apiKey: ApiKey;
    /** The raw key value -- shown only once, never persisted on the server. */
    rawKey: string;
}
//# sourceMappingURL=auth.d.ts.map