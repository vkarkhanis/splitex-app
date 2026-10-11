import { z } from 'zod';

const minor = z.number().int().nonnegative();
const positiveMinor = z.number().int().positive();
const percent = z.number().min(0).max(100);
const entityType = z.enum(['user', 'group']);

export const presetSchema = z.enum(['trip_kitty', 'household', 'club_treasury', 'sponsor_budget', 'target_collection']);

/** Pool settings an admin may change after creation (funder/cycle mode are fixed). */
export const poolConfigPatchSchema = z
  .object({
    custodianUserId: z.string().min(1),
    recurrence: z.enum(['monthly', 'quarterly', 'custom']),
    targetAmountMinor: positiveMinor.nullable(),
    defaultContributionMinor: minor.nullable(),
    authorizedSpenders: z.array(z.string().min(1)).max(200),
    authorizedSpenderGroups: z.array(z.string().min(1)).max(100),
    spenderCapsMinor: z.record(z.string(), minor),
    surplusPolicy: z.enum(['refund_pro_rata', 'refund_equal', 'carry_forward', 'retain']),
    deficitPolicy: z.enum(['collect_pro_rata', 'collect_equal', 'collect_by_consumption', 'custodian_absorbs']),
    overdraftPolicy: z.enum(['block', 'graduated', 'allow']),
    overdraftTolerancePercent: percent,
    overdraftBaseline: z.enum(['confirmed_funding', 'expected_funding', 'target_amount']),
    overdraftClearancePercent: percent,
    requireFullFundingBeforeSpend: z.boolean(),
    receiptRequiredAboveMinor: minor.nullable(),
    claimReceiptRequired: z.boolean(),
    expenseApproval: z.enum(['none', 'above_threshold', 'always']),
    approvalThresholdMinor: minor.nullable(),
    membershipChangeClosesCycle: z.boolean(),
  })
  .partial()
  .strict();

export const poolCreateSchema = z
  .object({
    preset: presetSchema,
    targetAmountMinor: positiveMinor.nullable().optional(),
    defaultContributionMinor: minor.nullable().optional(),
    allowPeerExpenses: z.boolean().optional(),
    overrides: poolConfigPatchSchema.optional(),
  })
  .strict();

const coverSchema = z
  .array(z.object({ entityId: z.string().min(1), entityType, amountMinor: positiveMinor }).strict())
  .max(50)
  .optional();

export const setContributionsSchema = z.object({
  contributions: z
    .array(
      z.object({
        entityId: z.string().min(1),
        entityType,
        expectedMinor: minor,
        dueDate: z.string().datetime().nullable().optional(),
      }).strict(),
    )
    .min(1)
    .max(200),
}).strict();

export const topUpSchema = z.object({
  amountMinor: positiveMinor,
  note: z.string().max(500).optional(),
  entityId: z.string().min(1).optional(),
  entityType: entityType.optional(),
}).strict();

export const markPaidSchema = z.object({
  amountMinor: positiveMinor.optional(),
  reference: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  proofUrl: z.string().max(2000).optional(),
}).strict();

export const confirmSchema = z.object({ receivedMinor: positiveMinor.optional() }).strict();
export const reasonSchema = z.object({ reason: z.string().max(500).optional() }).strict();

export const closePreviewSchema = z.object({ forDissolution: z.boolean().optional(), cover: coverSchema }).strict();
export const closeSchema = z.object({ cover: coverSchema, openNext: z.boolean().optional() }).strict();
export const dissolveSchema = z.object({ cover: coverSchema }).strict();
