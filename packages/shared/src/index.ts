import { z } from "zod";
export const categories = [
  "Appuntamenti",
  "Viaggi",
  "Anniversari",
  "Momenti speciali",
  "Quotidianità",
  "Altro",
] as const;
export const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "Data non valida");
export const memoryInput = z.object({
  title: z.string().trim().min(1).max(160),
  eventDate: civilDate,
  description: z.string().max(12000),
  category: z.enum(categories),
  location: z.string().trim().max(200),
});
export const memoryUpdate = memoryInput.extend({
  version: z.number().int().positive(),
});
export const commentInput = z.object({
  body: z.string().trim().min(1).max(3000),
});
export const passwordInput = z.string().min(12).max(128);
export function romeToday(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function daysTogether(start: string, today = romeToday()): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(today + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
        86400000,
    ),
  );
}
export type MemoryInput = z.infer<typeof memoryInput>;
