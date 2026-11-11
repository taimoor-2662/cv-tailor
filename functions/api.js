// Cloudflare Pages Function -> served at /api
// Bindings (Pages > Settings > Functions): AI (Workers AI). Optional secret: GEMINI_API_KEY
const hits = new Map();
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const SYSTEM = `You are an expert CV writer. Rewrite the candidate's CV so it is tailored to the target job.
RULES: Use ONLY facts present in the CV. Never invent employers, degrees, dates, skills or numbers. Mirror relevant keywords from the job description, put the most relevant items first, use strong action verbs, keep bullets concise (max 5 per job).
Return ONLY valid JSON, no markdown, in this exact shape:
{"name":"","title":"","contact":["email","phone","city"],"summary":"2-3 sentences","skills":["..."],"experience":[{"title":"","company":"","dates":"","bullets":["..."]}],"education":[{"degree":"","school":"","dates":""}],"extra":[{"heading":"Projects","items":["..."]}]}`;

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP") || "x";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= 8) return json({ error: "Hourly limit reached. Please try again later." }, 429);
  recent.push(now);
  hits.set(ip, recent);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const cvText = String(body.cvText || "").slice(0, 9000);
  const job = String(body.job || "").slice(0, 4000);
  if (cvText.length < 50 || job.length < 3) return json({ error: "Please provide your CV and a job role or description." }, 400);

  const user = `CANDIDATE CV:\n${cvText}\n\nTARGET JOB (title and/or description):\n${job}`;
  let out = "";
  let dbg = "";

  try {
    if (!env.AI) dbg = "AI binding missing (add Workers AI binding named AI, then redeploy). ";
    if (env.AI) {
      const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        max_tokens: 3500,
      });
      out = r.response || "";
    }
  } catch (e) { out = ""; dbg += "AI error: " + String(e && e.message || e).slice(0, 200) + ". "; }

  if (out && !parse(out)) dbg += "AI replied but not valid JSON. ";

  if (!parse(out) && env.GEMINI_API_KEY) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );
      const d = await r.json();
      out = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (e) { out = ""; }
  }

  const cv = parse(out);
  if (!cv) return json({ error: "The AI could not finish. " + dbg + "Please try again." }, 503);
  return json({ cv });
}

function parse(t) {
  if (!t) return null;
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < 0) return null;
  try { const o = JSON.parse(t.slice(a, b + 1)); return o && o.name !== undefined ? o : null; } catch { return null; }
}
