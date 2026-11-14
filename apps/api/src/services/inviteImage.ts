interface GenerateArgs {
  theme: string;
  style: "festive" | "formal" | "kids" | "minimal";
  eventTitle: string;
  venue?: string | null;
  startsAt: Date;
}

const STYLE_PALETTES: Record<GenerateArgs["style"], { bg: string; accent: string; text: string }> = {
  festive: { bg: "#7A1E2B", accent: "#E2A33D", text: "#FFF8EC" },
  formal: { bg: "#17212B", accent: "#9FB4C7", text: "#F7F5EF" },
  kids: { bg: "#2F6F62", accent: "#F2C14E", text: "#FFFFFF" },
  minimal: { bg: "#F7F5EF", accent: "#17212B", text: "#17212B" },
};

function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/** Deterministic template generator — always available, no external dependency. */
function templateSvg(args: GenerateArgs, variant: number): string {
  const p = STYLE_PALETTES[args.style];
  const dateLabel = args.startsAt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  const timeLabel = args.startsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const ring = 40 + variant * 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
    <rect width="600" height="800" fill="${p.bg}"/>
    <circle cx="${520 - variant * 30}" cy="${100 + variant * 40}" r="${ring}" fill="${p.accent}" opacity="0.25"/>
    <circle cx="80" cy="700" r="${ring + 30}" fill="${p.accent}" opacity="0.18"/>
    <text x="50" y="330" font-family="Georgia, serif" font-size="42" fill="${p.text}">${escapeXml(args.eventTitle)}</text>
    <text x="50" y="380" font-family="Georgia, serif" font-size="20" fill="${p.accent}">${escapeXml(args.theme)}</text>
    <line x1="50" y1="410" x2="200" y2="410" stroke="${p.accent}" stroke-width="2"/>
    <text x="50" y="460" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="${p.text}">${dateLabel} · ${timeLabel}</text>
    ${args.venue ? `<text x="50" y="495" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="${p.text}" opacity="0.85">${escapeXml(args.venue)}</text>` : ""}
    <text x="50" y="750" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="${p.accent}">Mera Nivas · RSVP in the app</text>
  </svg>`;
}

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Generates 2-4 candidate invitation images. If AI_IMAGE_API_KEY/AI_IMAGE_API_URL
 * are configured, this is the place to call that provider instead — keep the same
 * return shape ({ imageUrl, promptUsed, source }) so callers don't need to change.
 */
export async function generateInvitationCandidates(args: GenerateArgs) {
  const aiConfigured = Boolean(process.env.AI_IMAGE_API_KEY && process.env.AI_IMAGE_API_URL);

  if (aiConfigured) {
    try {
      // Placeholder for a real call, e.g.:
      // const res = await fetch(process.env.AI_IMAGE_API_URL!, { ... });
      // return parsed candidates from res.
      throw new Error("AI image provider not implemented — falling back to templates");
    } catch (err) {
      console.warn("AI invitation image generation failed, using template fallback:", (err as Error).message);
    }
  }

  const prompt = `${args.theme} — ${args.style} style invitation for "${args.eventTitle}"`;
  return Array.from({ length: 3 }).map((_, i) => ({
    imageUrl: toDataUrl(templateSvg(args, i)),
    promptUsed: prompt,
    source: "template" as const,
  }));
}
