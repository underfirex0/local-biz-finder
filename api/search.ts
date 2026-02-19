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
    // ✅ Robust body parsing (Vercel dev sometimes gives string body)
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body ?? {});

    const {
      service,
      city,
      count = 40,
      existingNames = [],
      location,
    } = body as {
      service?: string;
      city?: string;
      count?: number;
      existingNames?: string[];
      location?: { latitude?: number; longitude?: number };
    };

    console.log("[/api/search] BODY:", body);

    // ✅ Validate inputs to avoid "undefined" prompt
    if (!service || !city) {
      return res.status(400).json({
        error: "Missing required fields",
        details: { service, city },
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const exclusionPrompt =
      Array.isArray(existingNames) && existingNames.length > 0
        ? `IMPORTANT: Exclude the following businesses which I already have: ${existingNames
            .slice(-20)
            .join(", ")}.`
        : "";

    const prompt = `Find exactly ${count} unique businesses that provide "${service}" in "${city}".
${exclusionPrompt}
Provide the information in a Markdown table with exactly these columns:
| Name | Phone Number | Review Count | Address |

Rules:
- EXACTLY ${count} rows (no more, no less).
- If phone is missing, write "N/A" (do not invent).
- If review count is missing, write "0".
- Do NOT add extra text outside the table.`;

    const config: any = {
      tools: [{ googleMaps: {} }],
    };

    if (location?.latitude && location?.longitude) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
        },
      };
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config,
    });

    return res.status(200).json(response);
  } catch (err: any) {
    console.error("[/api/search] ERROR:", err);
    return res.status(500).json({
      error: err?.message || "Search API error",
    });
  }
}