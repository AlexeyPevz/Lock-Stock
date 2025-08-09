export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

// Simple Wikipedia text presence check via REST API
export async function verifyWithWikipedia(text: string, sourceUrl?: string): Promise<VerifyResult> {
  try {
    let content = "";
    if (sourceUrl && /wikipedia\.org\//i.test(sourceUrl)) {
      // Try page summary API
      const titleMatch = sourceUrl.match(/wiki\/([^#?]+)/);
      if (titleMatch) {
        const title = decodeURIComponent(titleMatch[1]);
        const resp = await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        if (resp.ok) {
          const data = await resp.json();
          content = `${data.extract || ""}`;
        }
      }
    }
    if (!content) {
      // Fallback: search API
      const q = encodeURIComponent(text.slice(0, 100));
      const sr = await fetch(`https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&format=json&utf8=1&srwhat=text&srlimit=1`);
      if (sr.ok) {
        const data = await sr.json();
        const page = data?.query?.search?.[0];
        if (page) {
          const title = page.title;
          const resp = await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
          if (resp.ok) {
            const sum = await resp.json();
            content = `${sum.extract || ""}`;
          }
        }
      }
    }
    if (!content) return { ok: false, reason: "no_content" };
    // naive containment check (could be improved with fuzzy matching)
    const normalizedContent = content.toLowerCase();
    const tokens = text.toLowerCase().split(/\s+/).filter((t) => t.length >= 4).slice(0, 6);
    const hits = tokens.filter((t) => normalizedContent.includes(t)).length;
    return { ok: hits >= Math.max(2, Math.ceil(tokens.length / 3)) };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "error" };
  }
}