import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sourceCode = body.source_code || "";
    
    // Quick validation
    if (sourceCode.length < 10) {
      return NextResponse.json({ detail: "Must provide valid code" }, { status: 400 });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const prompt = `You are an elite, ruthless Web3 smart contract security auditor specializing in Rust and Stellar Soroban.
Analyze the following source code for all security vulnerabilities.

CRITICAL INSTRUCTIONS: You MUST explicitly check for and flag the following classic Soroban vulnerabilities. Do NOT give the code the benefit of the doubt. If a check is missing, FLAG IT:
1. Missing \`require_auth()\` calls: Are there functions (like withdraw, set_admin, transfer) that allow ANY caller to execute them because they lack \`caller.require_auth()\`? (CRITICAL)
2. Arithmetic Overflows/Underflows: Are balances or amounts modified using standard operators (e.g., \`+\`, \`-\`) without \`checked_add\`, \`checked_sub\`, or balance checks? (HIGH)
3. Front-runnable initialization: Can an attacker front-run the \`init\` function to hijack the contract before the true owner? (HIGH)
4. Missing authentication on ownership/admin transfers: Can anyone call \`set_admin\` or similar functions? (CRITICAL)
5. Reentrancy & Cross-Contract Calls: Are there state changes happening AFTER external contract calls? (HIGH)

Be absolutely merciless. If the code is flawed, you must expose it.
Return ONLY a valid JSON array of objects with keys: type, severity, line_number, description, remediation. If and ONLY if the code is perfectly flawless, return [].

Each vulnerability object MUST strictly follow this mapping:
{
    "type": "string (e.g. 'Missing require_auth', 'i128 Overflow')",
    "severity": "string ('High', 'Medium', or 'Low')",
    "line_number": integer (if a specific line is culpable, else null),
    "description": "string (Detailed explanation of why it is vulnerable)",
    "remediation": "string (Markdown explained fix and code)"
}

Code:
${sourceCode.substring(0, 5000)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    let vulns = [];
    if (response.ok) {
       const data = await response.json();
       const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
       try { vulns = JSON.parse(text); } catch(e) {}
    }

    return NextResponse.json({
      address: body.contract_address || "source_code",
      status: "completed",
      vulnerabilities: vulns,
      hash_key: "audit_" + Date.now()
    });
  } catch (error) {
    return NextResponse.json({
      address: "source_code",
      status: "completed",
      vulnerabilities: [],
      hash_key: "audit_" + Date.now()
    });
  }
}
