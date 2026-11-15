import { z } from "zod";

export const backupConfiguration = z
  .object({
    destinationId: z.string().regex(/^(local|mount:[a-f0-9]{24})$/),
    folder: z
      .string()
      .trim()
      .min(1)
      .max(48)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
    automatic: z.boolean(),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    daily: z.number().int().min(0).max(365),
    weekly: z.number().int().min(0).max(104),
    monthly: z.number().int().min(0).max(120),
    localAcknowledged: z.boolean(),
    keyAcknowledged: z.boolean(),
    encryptionPassword: z
      .string()
      .min(12)
      .max(128)
      .refine((value) =>
        [...value].every(
          (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
        ),
      )
      .optional(),
  })
  .strict();
export type BackupConfiguration = z.infer<typeof backupConfiguration>;
export const backupAction = z.enum([
  "backup",
  "verify",
  "test-restore",
  "disable",
]);
export type BackupAction = z.infer<typeof backupAction>;
export type BackupDestination = {
  id: string;
  label: string;
  path: string;
  local: boolean;
  availableBytes: number;
  writable: boolean;
};
export type BackupJob = {
  id: string;
  action: string;
  result: "running" | "success" | "failed";
  phase: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
};
export type BackupAttempt = {
  result: string;
  startedAt: string;
  finishedAt: string;
  dataBytes: number;
  phase: string;
  snapshotId: string;
};
export type BackupStatus = {
  available: boolean;
  reason?: string;
  destinations: BackupDestination[];
  configuration: Omit<
    BackupConfiguration,
    "encryptionPassword" | "keyAcknowledged"
  > | null;
  keyConfigured: boolean;
  ready: boolean;
  automaticActive: boolean;
  targetPath: string | null;
  job: BackupJob | null;
  lastAttempt: BackupAttempt | null;
  lastSuccess: BackupAttempt | null;
  lastRestoreTest: BackupAttempt | null;
  snapshotCount: number;
};
