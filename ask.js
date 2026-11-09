const { GoogleGenerativeAI } = require("@google/generative-ai");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
const normalize = (s = "") => String(s).toLowerCase().replace(/\s+/g, " ").trim();

const IDENTITY = [
  "tum kon ho", "tum kaun ho", "who are you", "who r you",
  "are you gemini", "are you google", "which model", "what model",
  "kya tum gemini ho", "kya tum google ho", "model ka naam",
];
const isIdentityQuestion = (text) => IDENTITY.some((p) => normalize(text).includes(p));

// Safety net: scrub only identity leaks. The old filter replaced every
// "google"/"language model" with "SSP AI", which broke normal answers.
function providerFilter(reply = "") {
  return String(reply)
    .replace(/\b(trained|made|built|developed|created)\s+by\s+google\b/gi, "built by Saksham Study Point")
    .replace(/\b(i am|i'm)\s+gemini\b/gi, "I am SSP AI")
    .replace(/\bmain\s+gemini\b/gi, "Main SSP AI")
    .trim();
}

// Gemini needs history that starts with "user" and alternates user/model.
function cleanHistory(raw) {
  const out = [];
  for (const m of Array.isArray(raw) ? raw.slice(-16) : []) {
    const role = m && m.role === "model" ? "model" : "user";
    const text = clip(m && m.text, 1500).trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n" + text;
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  // A trailing user turn means an earlier question got no reply; fold it into the new message.
  let pending = "";
  while (out.length && out[out.length - 1].role === "user") {
    pending = out.pop().parts[0].text + "\n" + pending;
  }
  return { history: out, pending: pending.trim() };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { reply: "Method Not Allowed" });

    const body = JSON.parse(event.body || "{}");
    const message = clip(body.message, 4000).trim();
    const grade = clip(body.grade, 30).trim();
    const subject = clip(body.subject, 30).trim();
    const language = clip(body.language || "hinglish", 20);
    const memory = clip(body.memory, 2000).trim();
    const earlierChats = clip(body.crossChatContext, 4000).trim();

    if (message.length < 2) return json(400, { reply: "Question likho bhai 🙂" });

    if (isIdentityQuestion(message)) {
      return json(200, {
        reply: "Main Saksham Study Point AI hoon 🙂\nMain tumhare doubts simple words me solve karta hoon.",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return json(500, {
        reply: "Server me API key set nahi hai. Netlify Environment Variables me GEMINI_API_KEY add karo.",
      });
    }

    const system = [
      'You are "Saksham Study Point AI" (Saksham Sir vibe), a study helper for Indian students.',
      "Rules:",
      '- Never mention Gemini, Google, the model, provider or API. If asked who you are, say: "Main Saksham Study Point AI hoon."',
      "- Explain in very simple words, step by step, short and clear. Add one exam tip only when it helps.",
      "- Keep answers to about 6-12 lines unless the student asks for more. If the question is unclear, ask one short clarifying question.",
      "- You may use short markdown: bullets, numbered steps and **bold** for key terms.",
      "- Use the conversation so far. A follow-up like \"iska example do\" refers to your previous answer. Never ask the student to repeat what they already told you.",
      `Reply language: ${language}. Class: ${grade || "not set"}. Subject: ${subject || "not set"}.`,
      memory ? `Student's saved notes (always respect them):\n${memory}` : "",
      earlierChats
        ? `Student's earlier chats (use only if relevant, and do not say you were given this):\n${earlierChats}`
        : "",
    ].filter(Boolean).join("\n");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: system });

    const { history, pending } = cleanHistory(body.history);
    const chat = model.startChat({ history });
    const finalMessage = pending ? `(Earlier unanswered question: ${pending})\n${message}` : message;

    const result = await chat.sendMessage(finalMessage);
    const raw = result?.response?.text?.() || "Bhai mujhe question clear nahi hua. Thoda aur detail likho 🙂";

    return json(200, { reply: providerFilter(raw) });
  } catch (err) {
    console.error("ask function error:", err);
    return json(500, { reply: "Server side issue aa gaya 😅 Thoda baad me try karo." });
  }
};
