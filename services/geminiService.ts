// services/geminiService.ts
import { SearchResult, GroundingSource, BusinessInfo, MarketingNiche } from "../types";

/**
 * Parses a markdown table like:
 * | Name | Phone Number | Review Count | Address |
 * | --- | --- | --- | --- |
 * | Biz | 06... | 12 | Addr |
 */
const parseMarkdownTable = (markdown: string): BusinessInfo[] => {
  const businesses: BusinessInfo[] = [];
  const lines = markdown.split("\n");

  const rows = lines.filter(
    (line) =>
      line.includes("|") &&
      !line.toLowerCase().includes("name") &&
      !line.includes("---")
  );

  rows.forEach((row) => {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");

    // Expecting: Name, Phone, Reviews, Address (address optional)
    if (cells.length >= 3) {
      businesses.push({
        name: cells[0] || "",
        phone: cells[1] || "",
        reviews: cells[2] || "",
        address: cells[3] || "",
      });
    }
  });

  // Filter out totally empty rows
  return businesses.filter((b) => b.name || b.phone || b.reviews || b.address);
};

export const searchBusinesses = async (
  service: string,
  city: string,
  count: number = 40,
  existingNames: string[] = [],
  location?: { latitude: number; longitude: number }
): Promise<SearchResult> => {
  try {
    const r = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service, city, count, existingNames, location }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      throw new Error(`Search request failed (${r.status}). ${errText}`);
    }

    const response = await r.json();

    // The server returns the raw Gemini response object
    const rawMarkdown: string = response?.text || "";
    const businesses = parseMarkdownTable(rawMarkdown);

    const sources: GroundingSource[] = [];
    const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;

    if (Array.isArray(chunks)) {
      chunks.forEach((chunk: any) => {
        if (chunk?.maps) {
          sources.push({
            title: chunk.maps.title || "Google Maps Link",
            uri: chunk.maps.uri,
          });
        }
      });
    }

    return { businesses, sources, rawMarkdown };
  } catch (error: any) {
    console.error("Search error:", error);
    throw error;
  }
};

export const generateMarketingScript = async (
  business: BusinessInfo,
  niche: MarketingNiche
): Promise<string> => {
  try {
    const r = await fetch("/api/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business, niche }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      throw new Error(`Script request failed (${r.status}). ${errText}`);
    }

    const data = await r.json();
    return data?.text || "Failed to generate script.";
  } catch (error) {
    console.error("Script generation error:", error);
    return "Error generating script. Check your connection.";
  }
};