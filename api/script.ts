import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
  }

  try {
    // ✅ Robust body parsing
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body ?? {});

    const { business, niche } = body as {
      business?: { name?: string; address?: string; reviews?: string; phone?: string };
      niche?: string;
    };

    console.log("[/api/script] BODY:", body);

    if (!business?.name || !niche) {
      return res.status(400).json({
        error: "Missing required fields",
        details: { businessName: business?.name, niche },
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a Moroccan sales copywriter for MarqGrowth.
Write a short, natural, high-converting cold call script in French (Moroccan business tone).

Business: ${business.name}
City/Address: ${business.address || ""}
Reviews: ${business.reviews || ""}
Phone: ${business.phone || ""}
Offer type: ${niche}

Goal: book a 10–15 minute discovery call.

Rules:
- Sound human, not pushy.
- Under 150 words.
- Mention their reviews/reputation if available.
- End with an easy question (today vs tomorrow / WhatsApp ok?).
- Return ONLY the script text (no title, no bullets).`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return res.status(200).json({ text: response.text || "" });
  } catch (err: any) {
    console.error("[/api/script] ERROR:", err);
    return res.status(500).json({
      error: err?.message || "Script API error",
    });
  }
}