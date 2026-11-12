// Cloudflare Pages Function -> /api   (bindings: AI = Workers AI, optional secret GEMINI_API_KEY)
const hits = new Map();
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const M8 = "@cf/meta/llama-3.1-8b-instruct-fp8-fast", M70 = "@cf/meta/llama-3.3-70b-instruct-fp8-fast", M3 = "@cf/meta/llama-3.2-3b-instruct";
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
  tailor: `You are an expert CV writer. The CV text below may come from a designed PDF, so columns can appear separated by " | " and one line may hold several fields. Rewrite the CV so it suits the target job.
STRICT RULES: ${RULES}
1. Include EVERY job from the CV, in the same order, with the exact employer name, job title and dates as written. Never merge, drop, repeat or invent a job.
2. "education" holds only degrees and schools with their own dates. Certifications, courses and licences go in "extra" under the heading "Certifications".
3. Keep each school and each employer together with its own dates exactly as in the CV. Do not move a date to another entry.
4. "contact" is the email, phone and city exactly as written.
5. "skills": use skills named in the CV; if there are none, derive 6-10 from the job bullets only.
6. You may improve the wording of the summary and bullets and put the most relevant items first, but every fact must stay the same.
Return ONLY valid JSON, no markdown, in this exact shape: ${SCHEMA}`,
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
const norm = t => " " + String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ") + " ";
function grounded(o, src) {
  const n = norm(src), lines = String(src).split(/\n/).map(norm), seen = new Set();
  for (const j of Array.isArray(o.experience) ? o.experience : []) {
    const key = [j.title, j.company, j.dates].join("|").toLowerCase(); if (seen.has(key)) return false; seen.add(key);
    const w = norm(j.company).trim().split(" ").filter(k => k.length > 2); if (!w.length) continue;
    if (w.filter(k => n.includes(k)).length / w.length < 0.6) return false;
    const yrs = String(j.dates || "").match(/(?:19|20)\d{2}/g) || [], tk = norm(j.company).trim().split(" "), phrase = tk.slice(0, 2).join(" ");
    if (yrs.length) {
      let at = lines.map((l, i) => (l.includes(" " + phrase + " ") || l.includes(phrase) ? i : -1)).filter(i => i >= 0);
      if (!at.length) at = lines.map((l, i) => (l.includes(" " + tk[0] + " ") ? i : -1)).filter(i => i >= 0);
      if (at.length && !at.some(i => { const win = lines.slice(Math.max(0, i - 2), i + 4).join(" "); return yrs.every(y => win.includes(y)); })) return false;
    }
  }
  return true;
}
async function ai(env, system, user, loose, strict, o = {}) {
  let dbg = "", fb = null;
  const take = t => { if (!loose) return t.trim() || null; const x = parse(t, loose); if (x && (!strict || strict(x))) return x; if (x && !fb) fb = x; return null; };
  const gem = async () => {
    if (!env.GEMINI_API_KEY) return null;
    for (const gm of [...new Set([env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-2.5-flash"].filter(Boolean))]) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gm}:generateContent?key=${env.GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: loose ? { responseMimeType: "application/json" } : {} }) });
        const d = await r.json(); const t = d?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!t) { dbg += `${gm}: ${String(d?.error?.message || "no reply").slice(0, 100)}. `; continue; }
        const v = take(t); if (v) return v;
      } catch (e) { dbg += gm + " failed. "; }
    }
    return null;
  };
  if (o.geminiFirst) { const v = await gem(); if (v) return { v, dbg }; }
  if (!env.AI) dbg += "AI binding missing (add Workers AI binding named AI, then redeploy). ";
  else for (const m of o.models || [M8, M70, M3]) {
    try {
      const r = await env.AI.run(m, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 4000 });
      let t = r && r.response; if (t && typeof t === "object") t = JSON.stringify(t);
      const v = take(t || ""); if (v) return { v, dbg };
      dbg += m.split("/").pop() + ": reply not usable. ";
    } catch (e) { dbg += m.split("/").pop() + ": " + String((e && e.message) || e).slice(0, 120) + ". "; }
  }
  if (!o.geminiFirst) { const v = await gem(); if (v) return { v, dbg }; }
  return fb ? { v: fb, dbg, unverified: true } : { v: null, dbg };
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

  const heavy = mode === "tailor" || mode === "translate";
  const { v, dbg, unverified } = await ai(env, system, user, OK[mode], mode === "tailor" ? o => grounded(o, cv) : null, { geminiFirst: heavy, models: heavy ? [M70, M8, M3] : [M8, M70, M3] });
  if (!v) return json({ error: "The AI could not finish. " + dbg + "Please try again." }, 503);
  if (mode === "cover") return json({ text: v });
  if (mode === "tailor" || mode === "translate") return json({ cv: v, unverified: !!unverified });
  return json({ data: v });
}
