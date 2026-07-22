// Quantum Intelligence — Kinetic Coach edge function.
// Proxies Google Gemini for a trading-coaching chat. Keeps the API key server-side only.
// Protected by Supabase JWT (authenticated users only).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

const SYSTEM_PROMPT = `You are Kinetic Coach, an AI trading coach integrated into the Quantum Intelligence platform.
You help users understand crypto trading concepts, interpret technical analysis signals (RSI, MACD, Bollinger Bands, Fibonacci, chart patterns), manage risk, and build disciplined trading psychology.
Be concise, practical, and educational. Never give guaranteed-profit advice. Always remind users that trading carries risk.
When users ask about specific signals they're seeing, explain what the indicator measures and how to interpret it.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: "messages array required" }, 400);
    }
    if (!GEMINI_KEY) {
      return jsonResponse({ error: "Gemini API key not configured" }, 503);
    }

    // Convert chat history to Gemini contents format, prepending the system prompt as the first user turn.
    const contents = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "Understood. I'm Kinetic Coach — ready to help you trade smarter." }] },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
    ];

    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[kinetic-coach] Gemini error:", res.status, errText);
      return jsonResponse({ error: "Gemini request failed" }, 502);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response generated.";
    return jsonResponse({ reply: text });
  } catch (err) {
    console.error("[kinetic-coach]", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
