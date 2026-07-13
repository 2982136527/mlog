import { z } from 'zod'

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, 'slug must contain only lowercase letters, numbers, and hyphens')

export const postFrontmatterSchema = z.object({
  title: z.string().trim().min(1).max(240),
  date: z
    .string()
    .trim()
    .refine(value => !Number.isNaN(Date.parse(value)), 'date must be a valid ISO 8601 date string'),
  summary: z.string().trim().min(1).max(2000),
  tags: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
  category: z.string().trim().min(1).max(120),
  cover: z.string().trim().max(2048).optional(),
  draft: z.boolean().optional(),
  updated: z
    .string()
    .trim()
    .refine(value => !Number.isNaN(Date.parse(value)), 'updated must be a valid ISO 8601 date string')
    .optional(),
  publishedAt: z
    .string()
    .trim()
    .refine(value => !Number.isNaN(Date.parse(value)), 'publishedAt must be a valid ISO 8601 date string')
    .optional()
})
