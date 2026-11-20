// Cloudflare Pages Function -> /api   (binding: AI = Workers AI)
// Google Gemini is OFF by default. It runs only if you set BOTH secrets GEMINI_API_KEY and ALLOW_GEMINI=true,
// and you should only do that with a PAID (billing-enabled) Gemini key: Google's free tier may use submitted text to improve its products,
// may let humans read it, and is not allowed for apps used in the EEA, Switzerland or the UK.
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
1. Include EVERY job from the CV, in the same order, with the exact employer name, job title and dates as written. Never merge, drop, repeat or invent a job. NEVER omit or delete any job or role from the work history: keep every employer, job title and date range from the CV, and only shorten bullets if the CV is long.
2. "education" holds only degrees and schools with their own dates. Certifications, courses and licences go in "extra" under the heading "Certifications".
3. Keep each school and each employer together with its own dates exactly as in the CV. Do not move a date to another entry.
4. "contact" is the email, phone and city exactly as written.
5. "skills": use skills named in the CV; if there are none, derive 6-10 from the job bullets only.
6. You may improve the wording of the summary and bullets and put the most relevant items first, but every fact must stay the same.
7. Verb tense: start bullets of past roles with past-tense action verbs (Managed, Resolved, Led) and bullets of the current role with present-tense verbs. Never mix tenses inside one job.
8. Summary: write a confident, specific summary for the target job. Never use filler such as "seeking a challenging role", "seeking an opportunity" or "seeking to leverage". If the CV is short (under about 600 characters of details), write a fuller 3-4 sentence summary using ONLY the facts given. Do not add duties, numbers, employers, dates, tools or skills that are not in the CV.
9. "title": use the candidate's real title WITHOUT any city or country (write "Director of Hospital Operations", not "Director of Hospital Operations - London"). You may word it closer to the target job only if it truthfully describes their experience. Never claim a title, qualification or licence they do not have.
10. Keep honorifics and post-nominals in "name" (Dr., Engr., MBBS, ACCA...). Keep licences and statuses (driving licence, iqama, professional registration) in "personal". Keep grades such as CGPA in "education". Keep Publications, Speaking, Grants and Awards, Teaching and Certifications in "extra", each with its own heading; do not drop them. Never put an education item in "experience".
11. Output language: when the target language is Urdu, Arabic or any non-English language you MUST translate EVERY field (summary, title, job titles, experience bullets, skills, degree names, and personal labels and values) into that language. NEVER leave English sentences in the body. 100% of the content must be in the requested language: the summary, job titles, bullets, skills, degree names, and the labels and values of personal details. Keep only proper nouns (people, employers, schools, products), emails and numbers unchanged. Also translate every heading in "labels", every "extra" heading, the label of each personal detail, and open-ended dates such as "Present" (for example "Heute" in German, "حتى الآن" in Arabic). Use natural wording for headings (for example Arabic "المعلومات الشخصية").
13. Read the ENTIRE CV regardless of section order. Certifications, Licenses, Awards, Publications, Speaking and Training must ALWAYS be extracted into "extra", each with its own heading, even when they appear above Skills or Education or in the middle of the document.
12. Skills: do not list near-duplicates back to back (for example "Figma wireframing" and "Wireframing"); keep the more specific one.
Return ONLY valid JSON, no markdown, in this exact shape: ${SCHEMA}`,
  translate: `You translate CVs. Translate every text value of the given CV JSON into the requested language, keeping names, honorifics, emails, phone numbers, numbers and company names unchanged. Also translate EVERY heading in "labels" and in each "extra" heading, the "label" of each personal detail, and open-ended dates such as "Present" (for example "Heute" in German, "حتى الآن" in Arabic). Use natural wording for headings (for example Arabic "المعلومات الشخصية"). Never leave a heading or a job title in English unless the target language is English. Return ONLY valid JSON in the same shape: ${SCHEMA}`,
  ats: `You are an ATS and recruiter expert. Given a CV, an optional job description and automated findings, give practical advice. ${RULES} Return ONLY valid JSON: {"tips":["max 6 short actionable tips"],"rewrites":[{"before":"weak line copied from the CV","after":"stronger version using only facts in the CV"}],"keywords":["up to 10 keywords the CV should include only if the candidate truly has them"]}`,
  interview: `You are an interview coach. Write the 10 most likely interview questions for this job and candidate, each with a short tip on how to answer using the candidate's REAL experience from the CV. Return ONLY valid JSON: {"questions":[{"q":"","tip":""}]}`,
  linkedin: `You write LinkedIn profiles. ${RULES} Return ONLY valid JSON: {"headline":"max 200 characters","about":"150-220 words, first person, friendly and professional"}`,
  suggest: `You help job seekers who wrote very short CVs. For each job listed, suggest 3 or 4 bullet points describing responsibilities that are typical for that job title. They are DRAFTS the candidate must confirm are true. Use past tense for finished jobs and present tense for the current job ("current": true). Some jobs already have bullets in "bullets". Never repeat or rephrase them: every new bullet must cover a clearly different angle (for example tools, stakeholders, quality, reporting, training or compliance). Do not include numbers, employer names, tools or achievements. Return ONLY valid JSON: {"jobs":[{"index":0,"bullets":["..."]}]}`,
  cover: `You are an expert career writer. Write a concise, professional cover letter (250-320 words) for this candidate and job. ${RULES} Address "Hiring Manager" unless a name is given. Plain text only, no markdown, no placeholders.`,
};
const OK = { suggest: o => Array.isArray(o.jobs), tailor: o => o.name !== undefined, translate: o => o.name !== undefined, ats: o => Array.isArray(o.tips), interview: o => Array.isArray(o.questions), linkedin: o => !!o.headline };

function parse(t, check) {
  const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < 0) return null;
  try { const o = JSON.parse(t.slice(a, b + 1)); return o && check(o) ? o : null; } catch { return null; }
}
const norm = t => " " + String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ") + " ";
const SCRIPTS = [[/arab|urdu|persian|farsi|dari|pashto|sindhi|uyghur/i, /[\u0600-\u06FF]/], [/hebrew|yiddish/i, /[\u0590-\u05FF]/], [/russian|ukrain|belarus|bulgarian|macedonian|mongolian/i, /[\u0400-\u04FF]/], [/greek/i, /[\u0370-\u03FF]/], [/chinese|japanese/i, /[\u3040-\u30ff\u4e00-\u9fff]/], [/korean/i, /[\uac00-\ud7af]/], [/hindi|marathi|nepali/i, /[\u0900-\u097F]/], [/bengali/i, /[\u0980-\u09FF]/], [/tamil/i, /[\u0B80-\u0BFF]/], [/telugu/i, /[\u0C00-\u0C7F]/], [/thai/i, /[\u0E00-\u0E7F]/], [/armenian/i, /[\u0530-\u058F]/], [/georgian/i, /[\u10A0-\u10FF]/]];
// Rejects a reply that was left in English when a non-Latin-script language was requested (the next model then retries).
function scriptOk(o, lang) {
  const r = (SCRIPTS.find(x => x[0].test(lang)) || [])[1]; if (!r) return true;
  const bl = (Array.isArray(o.experience) ? o.experience : []).flatMap(j => j.bullets || []);
  return r.test(String(o.summary || "")) && (!bl.length || r.test(String(bl[0])));
}
function grounded(o, src, checkNames = true) {
  const n = norm(src), lines = String(src).split(/\n/).map(norm), seen = new Set();
  for (const j of Array.isArray(o.experience) ? o.experience : []) {
    const key = [j.title, j.company, j.dates].join("|").toLowerCase(); if (seen.has(key)) return false; seen.add(key);
    const w = norm(j.company).trim().split(" ").filter(k => k.length > 2); if (!w.length) continue;
    if (checkNames && w.filter(k => n.includes(k)).length / w.length < 0.6) return false;
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
    if (!(env.ALLOW_GEMINI === "true" && env.GEMINI_API_KEY)) return null;
    for (const gm of [...new Set([env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"].filter(Boolean))]) {
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
  for (const [k, v] of hits) if (!v.some(t => now - t < 3600e3)) hits.delete(k);   // prune expired IPs so warm isolates do not leak memory
  if (hits.size > 5000) hits.clear();
  const recent = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (recent.length >= 40) return json({ error: "Hourly limit reached. Please try again later." }, 429);
  recent.push(now); hits.set(ip, recent);

  let b; try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const mode = SYS[b.mode] ? b.mode : "tailor";
  const rawCv = String(b.cvText || ""), rawJob = String(b.job || "");
  const cv = rawCv.slice(0, 9000), job = rawJob.slice(0, 4000), truncated = rawCv.length > 9000 || rawJob.length > 4000;
  const need = mode === "translate" ? String(b.cvJson || "").length < 20 : cv.length < 50;
  if (need) return json({ error: "Please provide your CV first." }, 400);
  if ((mode === "tailor" || mode === "cover" || mode === "interview") && job.length < 3) return json({ error: "Please enter a job role or description." }, 400);

  const lang = String(b.lang || "English").slice(0, 40), nonEn = !/^english/i.test(lang);
  let system = SYS[mode], user = `CANDIDATE CV:\n${cv}\n\nTARGET JOB (title and/or description):\n${job || "(none given)"}`;
  if (mode === "tailor") { system += (REG[b.region] || "") + ` Write every text value in ${lang} (translate from the CV if needed) and put the section headings translated into ${lang} in "labels".`; }
  if (mode === "translate") user = `LANGUAGE: ${String(b.lang || "English").slice(0, 30)}\n\nCV JSON:\n${String(b.cvJson).slice(0, 12000)}`;
  if (mode === "suggest") user = `JOBS:\n${String(b.jobsJson || "").slice(0, 4000)}\n\nTARGET JOB: ${job || "(none given)"}\nWRITE IN: ${lang}`;
  if (mode === "ats") user += `\n\nAUTOMATED FINDINGS:\n${String(b.findings || "").slice(0, 1500)}`;
  if (mode === "cover") user += `\n\nCOMPANY: ${String(b.company || "").slice(0, 80) || "(not given)"}\nHIRING MANAGER: ${String(b.manager || "").slice(0, 80) || "(not given)"}`;

  // Cheapest model first (about 5x fewer free neurons per CV); escalates to the 70B model only when the reply is invalid or fails the grounding check.
  // Non-English output needs the stronger model first; English starts with the cheaper one.
  const heavy = nonEn && (mode === "tailor" || mode === "translate");
  const strict = mode === "tailor" ? o => grounded(o, cv, !nonEn) && scriptOk(o, lang) : mode === "translate" ? o => scriptOk(o, lang) : null;
  const { v, dbg, unverified } = await ai(env, system, user, OK[mode], strict, { models: heavy ? [M70, M8, M3] : [M8, M70, M3] });
  if (!v) {
    if (/free allocation|4006|neurons/i.test(dbg)) return json({ error: "Today's free AI capacity is used up. It resets daily at 00:00 UTC, so please try again later.", quota: true }, 503);
    return json({ error: "The AI could not finish. " + dbg + "Please try again." }, 503);
  }
  if (mode === "cover") return json({ text: v, truncated });
  if (mode === "tailor" || mode === "translate") return json({ cv: v, unverified: !!unverified, truncated });
  return json({ data: v, truncated });
}
