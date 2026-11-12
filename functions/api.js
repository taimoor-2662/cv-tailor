// Cloudflare Pages Function -> /api   (bindings: AI = Workers AI, optional secret GEMINI_API_KEY)
const hits = new Map();
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const MODELS = ["@cf/meta/llama-3.1-8b-instruct-fp8-fast", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.2-3b-instruct"];
const REG = {
  us: " Format for the USA: concise one-page style, no photo, no age/nationality/marital status, quantified bullets, 'Professional Summary'.",
  ca: " Format for Canada: like a US resume with a 'Summary of Qualifications'; no photo or personal details.",
  uk: " Format for the UK: short personal statement, key skills, employment history in reverse order, education; no photo; max 2 pages.",
  au: " Format for Australia/New Zealand: career profile, key skills, employment history, education, referees; no photo.",
  eu: " Format for Europe (Europass style): personal information, work experience, education and training, personal skills, languages with CEFR levels (A1-C2), digital skills.",
  de: " Format for Germany/Austria/Switzerland (Lebenslauf): reverse-chronological, tabular, personal data (date of birth, nationality only if in the CV), languages, qualifications.",
  fr: " Format for France/Belgium: one to two pages, profile line, skills, professional experience, education, languages, interests if present.",
  it: " Format for Italy: Europass-like structure with personal data, work experience, education and training, language skills and digital skills.",
  es: " Format for Spain/Portugal: personal data, professional experience, education, languages and IT skills.",
  nl: " Format for the Netherlands/Nordics: short profile, experience, education, skills, languages; factual and concise.",
  ru: " Format for Russia/Eastern Europe: personal data, objective, experience, education, skills, languages.",
  tr: " Format for Turkey: personal information, education, experience, skills, languages, references if present.",
  br: " Format for Brazil/Latin America: personal data, objective, professional experience, education, courses, languages.",
  gulf: " Format for UAE/Gulf jobs: include nationality, visa status, languages and notice period ONLY if present in the CV; highlight sales targets and local market knowledge.",
  ksa: " Format for Saudi/Qatar/Kuwait: include nationality, visa/iqama status, languages, driving licence and notice period ONLY if present in the CV.",
  af: " Format for Africa (Nigeria, Kenya, South Africa): career profile, work experience, education, skills, referees if present.",
  sa: " Format for South Asia (Pakistan, India, Bangladesh): career objective, professional experience, academic qualifications, skills, personal information only if present in the CV.",
  jp: " Format for Japan (rirekisho-style): education history, work history, licences and certifications, motivation; factual and chronological.",
  cn: " Format for China: basic information, education background, work experience, skills, self-evaluation; concise.",
  kr: " Format for Korea: personal information, education, work experience, certifications, skills.",
  sea: " Format for Southeast Asia: personal particulars (only if in the CV), career objective, work experience, education, skills.",
  acad: " Format for an academic CV: research profile, education, academic and professional experience, then add extra sections for publications, grants, teaching, conferences and awards if present.",
};
const SCHEMA = `{"name":"","title":"","contact":["email","phone","city"],"summary":"2-3 sentences","skills":["..."],"experience":[{"title":"","company":"","dates":"","bullets":["..."]}],"education":[{"degree":"","school":"","dates":""}],"personal":[{"label":"Nationality","value":""}],"languages":[{"name":"","level":""}],"extra":[{"heading":"Projects","items":["..."]}],"labels":{"summary":"","skills":"","experience":"","education":"","personal":"","languages":""}}`;
const RULES = "Use ONLY facts present in the CV. Never invent employers, degrees, dates, skills or numbers. The \"personal\" and \"languages\" lists may only contain facts present in the CV; use empty arrays if there are none.";
const SYS = {
  tailor: `You are an expert CV writer. Rewrite the candidate's CV so it is tailored to the target job. ${RULES} Mirror relevant keywords from the job description, put the most relevant items first, use strong action verbs, keep bullets concise (max 5 per job). Return ONLY valid JSON, no markdown, in this exact shape: ${SCHEMA}`,
  translate: `You translate CVs. Translate every text value of the given CV JSON into the requested language (including the "labels" section headings and the "label" of each personal detail), keeping names, emails, phone numbers, numbers and company names unchanged. Return ONLY valid JSON in the same shape: ${SCHEMA}`,
  ats: `You are an ATS and recruiter expert. Given a CV, an optional job description and automated findings, give practical advice. ${RULES} Return ONLY valid JSON: {"tips":["max 6 short actionable tips"],"rewrites":[{"before":"weak line copied from the CV","after":"stronger version using only facts in the CV"}],"keywords":["up to 10 keywords the CV should include only if the candidate truly has them"]}`,
  interview: `You are an interview coach. Write the 10 most likely interview questions for this job and candidate, each with a short tip on how to answer using the candidate's REAL experience from the CV. Return ONLY valid JSON: {"questions":[{"q":"","tip":""}]}`,
  linkedin: `You write LinkedIn profiles. ${RULES} Return ONLY valid JSON: {"headline":"max 200 characters","about":"150-220 words, first person, friendly and professional"}`,
  cover: `You are an expert career writer. Write a concise, professional cover letter (250-320 words) for this candidate and job. ${RULES} Address "Hiring Manager" unless a name is given. Plain text only, no markdown, no placeholders.`,
};
const OK = { tailor: o => o.name !== undefined, translate: o => o.name !== undefined, ats: o => Array.isArray(o.tips), interview: o => Array.isArray(o.questions), linkedin: o => !!o.headline };

function parse(t, check) {
  const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < 0) return null;
  try { const o = JSON.parse(t.slice(a, b + 1)); return o && check(o) ? o : null; } catch { return null; }
}
async function ai(env, system, user, check) {
  let dbg = "";
  if (!env.AI) dbg += "AI binding missing (add Workers AI binding named AI, then redeploy). ";
  else for (const m of MODELS) {
    try {
      const r = await env.AI.run(m, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 4000 });
      let t = r && r.response; if (t && typeof t === "object") t = JSON.stringify(t); t = t || "";
      const v = check ? parse(t, check) : t.trim(); if (v) return { v, dbg };
      dbg += m.split("/").pop() + ": reply not usable. ";
    } catch (e) { dbg += m.split("/").pop() + ": " + String((e && e.message) || e).slice(0, 120) + ". "; }
  }
  if (env.GEMINI_API_KEY) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: check ? { responseMimeType: "application/json" } : {} }),
      });
      const d = await r.json(); const t = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const v = check ? parse(t, check) : t.trim(); if (v) return { v, dbg };
    } catch (e) {}
  }
  return { v: null, dbg };
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP") || "x", now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (recent.length >= 40) return json({ error: "Hourly limit reached. Please try again later." }, 429);
  recent.push(now); hits.set(ip, recent);

  let b; try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const mode = SYS[b.mode] ? b.mode : "tailor";
  const cv = String(b.cvText || "").slice(0, 9000), job = String(b.job || "").slice(0, 4000);
  const need = mode === "translate" ? String(b.cvJson || "").length < 20 : cv.length < 50;
  if (need) return json({ error: "Please provide your CV first." }, 400);
  if ((mode === "tailor" || mode === "cover" || mode === "interview") && job.length < 3) return json({ error: "Please enter a job role or description." }, 400);

  let system = SYS[mode], user = `CANDIDATE CV:\n${cv}\n\nTARGET JOB (title and/or description):\n${job || "(none given)"}`;
  if (mode === "tailor") { const lang = String(b.lang || "English").slice(0, 40); system += (REG[b.region] || "") + ` Write every text value in ${lang} (translate from the CV if needed) and put the section headings translated into ${lang} in "labels".`; }
  if (mode === "translate") user = `LANGUAGE: ${String(b.lang || "English").slice(0, 30)}\n\nCV JSON:\n${String(b.cvJson).slice(0, 12000)}`;
  if (mode === "ats") user += `\n\nAUTOMATED FINDINGS:\n${String(b.findings || "").slice(0, 1500)}`;
  if (mode === "cover") user += `\n\nCOMPANY: ${String(b.company || "").slice(0, 80) || "(not given)"}\nHIRING MANAGER: ${String(b.manager || "").slice(0, 80) || "(not given)"}`;

  const { v, dbg } = await ai(env, system, user, OK[mode]);
  if (!v) return json({ error: "The AI could not finish. " + dbg + "Please try again." }, 503);
  if (mode === "cover") return json({ text: v });
  if (mode === "tailor" || mode === "translate") return json({ cv: v });
  return json({ data: v });
}
