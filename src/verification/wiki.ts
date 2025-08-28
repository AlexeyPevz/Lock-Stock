export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

// Simple Wikipedia text presence check via REST API
export async function verifyWithWikipedia(text: string, sourceUrl?: string): Promise<VerifyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  async function tryFetch(url: string, init?: RequestInit, attempts: number = 3, baseDelayMs: number = 300): Promise<Response> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        const resp = await fetch(url, { ...(init || {}), signal: controller.signal });
        if (resp.ok) return resp;
        lastErr = new Error(`status_${resp.status}`);
      } catch (e: any) {
        lastErr = e;
      }
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
    throw lastErr || new Error("fetch_failed");
  }

  try {
    let content = "";
    if (sourceUrl && /wikipedia\.org\//i.test(sourceUrl)) {
      const titleMatch = sourceUrl.match(/wiki\/([^#?]+)/);
      if (titleMatch) {
        const title = decodeURIComponent(titleMatch[1]);
        const resp = await tryFetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        const data = await resp.json();
        content = `${data.extract || ""}`;
      }
    }
    if (!content) {
      const q = encodeURIComponent(text.slice(0, 100));
      const sr = await tryFetch(`https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&format=json&utf8=1&srwhat=text&srlimit=1`);
      const data = await sr.json();
      const page = data?.query?.search?.[0];
      if (page) {
        const title = page.title;
        const resp = await tryFetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        const sum = await resp.json();
        content = `${sum.extract || ""}`;
      }
    }
    if (!content) return { ok: false, reason: "no_content" };
    const normalizedContent = content.toLowerCase();
    const tokens = text.toLowerCase().split(/\s+/).filter((t) => t.length >= 4).slice(0, 6);
    const hits = tokens.filter((t) => normalizedContent.includes(t)).length;
    return { ok: hits >= Math.max(2, Math.ceil(tokens.length / 3)) };
  } catch (e: any) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'error') };
  } finally {
    clearTimeout(timeout);
  }
}