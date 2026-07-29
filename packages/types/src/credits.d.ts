/**
 * Credit and billing types for the agent-media platform.
 *
 * Credits are the platform currency (1 credit = $0.01). Users receive
 * monthly credits from their subscription plan and can purchase
 * additional credits via pay-as-you-go packs.
 */
/**
 * Snapshot of a user's credit balance.
 * Plan credits reset each billing cycle; purchased credits never expire.
 */
export interface CreditBalance {
    userId: string;
    planCredits: number;
    purchasedCredits: number;
    totalCredits: number;
    autoTopupEnabled: boolean;
    autoTopupThreshold: number;
    autoTopupPack: string | null;
    updatedAt: string;
}
export type CreditTransactionType = 'subscription_usage' | 'purchased_usage' | 'purchase' | 'refund' | 'subscription_reset';
/**
 * Immutable ledger entry for every credit movement.
 * Running balances (`planCreditsAfter`, `purchasedCreditsAfter`) make
 * reconciliation possible without scanning earlier rows.
 */
export interface CreditTransaction {
    id: string;
    userId: string;
    type: CreditTransactionType;
    amount: number;
    planCreditsAfter: number;
    purchasedCreditsAfter: number;
    jobId: string | null;
    stripePaymentIntentId: string | null;
    description: string;
    createdAt: string;
}
/**
 * Result of an atomic credit deduction (plan credits first, then purchased).
 * Returned by the `deduct_credits` stored procedure.
 */
export interface DeductionResult {
    success: boolean;
    planCreditsUsed: number;
    purchasedCreditsUsed: number;
    planCreditsRemaining: number;
    purchasedCreditsRemaining: number;
    /** Non-null when `success` is false. */
    error: string | null;
}
//# sourceMappingURL=credits.d.ts.map