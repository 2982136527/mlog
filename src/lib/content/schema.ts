import { z } from 'zod'

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, 'slug must contain only lowercase letters, numbers, and hyphens')

export const postFrontmatterSchema = z.object({
  title: z.string().trim().min(1),
  date: z
    .string()
    .trim()
    .refine(value => !Number.isNaN(Date.parse(value)), 'date must be a valid ISO 8601 date string'),
  summary: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).min(1),
  category: z.string().trim().min(1),
  cover: z.string().trim().optional(),
  draft: z.boolean().optional(),
  updated: z
    .string()
    .trim()
    .refine(value => !Number.isNaN(Date.parse(value)), 'updated must be a valid ISO 8601 date string')
    .optional()
})
