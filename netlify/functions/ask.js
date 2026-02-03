const { GoogleGenerativeAI } = require("@google/generative-ai");

function normalize(s = "") {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function isIdentityQuestion(text) {
  const t = normalize(text);
  const patterns = [
    "tum kon ho", "tum kaun ho", "who are you", "who r you",
    "are you gemini", "are you google", "which model", "what model",
    "kya tum gemini ho", "kya tum google ho", "model ka naam", "provider"
  ];
  return patterns.some(p => t.includes(p));
}

function providerFilter(reply = "") {
  // Remove/replace provider mentions (safety net)
  let r = String(reply);

  // Common provider words
  const badWords = [
    /gemini/gi,
    /google/gi,
    /generative ai/gi,
    /language model/gi,
    /model name/gi
  ];

  badWords.forEach(rx => {
    r = r.replace(rx, "SSP AI");
  });

  // Extra cleanup if it becomes weird
  r = r.replace(/SSP AI\s+SSP AI/gi, "SSP AI").trim();
  return r;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").toString().slice(0, 4000);
    const grade = (body.grade || "").toString().slice(0, 30);
    const subject = (body.subject || "").toString().slice(0, 30);
    const language = (body.language || "hinglish").toString().slice(0, 20);

    if (!message || message.length < 2) {
      return {
        statusCode: 400,
        body: JSON.stringify({ reply: "Question likho bhai 🙂" })
      };
    }

    // ✅ Identity questions: direct fixed answer (no API call)
    if (isIdentityQuestion(message)) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          reply: "Main Saksham Study Point AI hoon 🙂\nMain tumhare doubts simple words me solve karta hoon."
        })
      };
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          reply: "Server me API key set nahi hai. Netlify Environment Variables me GEMINI_API_KEY add karo."
        })
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Cost-friendly + fast model (as per Gemini docs/models list) :contentReference[oaicite:2]{index=2}
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const systemStyle = `
You are "Saksham Study Point AI" (Saksham Sir vibe).
Hard rules:
- Never mention Gemini, Google, provider, model name, or API.
- If user asks "who are you" or "which model", say: "Main Saksham Study Point AI hoon."
Teaching style:
- Explain in very simple words (no heavy jargon).
- Step-by-step, short and clear.
- If needed, give 1 exam tip.
Language preference: ${language}
Context: Grade=${grade}, Subject=${subject}
`;

    const prompt = `
${systemStyle}

Student question:
${message}

Answer rules:
- 6 to 12 lines max
- Simple words
- If question is unclear, ask 1 short clarifying question
`;

    const result = await model.generateContent(prompt);
    const raw = result?.response?.text?.() || "Bhai mujhe question clear nahi hua. Thoda aur detail likho 🙂";

    const filtered = providerFilter(raw);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: filtered })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        reply: "Server side issue aa gaya 😅 Thoda baad me try karo.",
        error: String(err?.message || err)
      })
    };
  }
};
