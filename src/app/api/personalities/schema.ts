import { z } from "zod";
import { TRAIT_KEYS } from "@/lib/types";

const trait = z.number().int().min(0).max(100);
export const TraitsSchema = z.object(Object.fromEntries(TRAIT_KEYS.map((k) => [k, trait])) as Record<(typeof TRAIT_KEYS)[number], typeof trait>);

export const DraftSchema = z.object({
  preset: z.string().max(30).default("personalizado"),
  ai_name: z.string().trim().min(1).max(30),
  avatar_emoji: z.string().min(1).max(16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().max(1000).default(""),
  speaking_style: z.string().max(500).default(""),
  debate_behavior: z.string().max(500).default(""),
  custom_instructions: z.string().max(4000).default(""),
  traits: TraitsSchema,
});
