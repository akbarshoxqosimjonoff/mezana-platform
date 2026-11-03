import "./env.js";
import OpenAI from "openai";
import { OPENAI_API_KEY } from "./env.js";

export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Arzon/tez modellar — hisobotlar/savol-javob uchun yetarli, qimmat emas.
export const TEXT_MODEL = "gpt-4o-mini";
export const VISION_MODEL = "gpt-4o-mini";
