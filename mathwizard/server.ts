import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Primary Endpoint: Generate Word Problems
app.post('/api/generate', async (req, res) => {
  try {
    const { skill, interest, grade, count = 5 } = req.body;

    if (!skill || !interest || !grade) {
      return res.status(400).json({
        error: 'Missing required parameters: skill, interest, and grade are required.',
      });
    }

    const systemInstruction = `You are "Word Problem Wizard," a math problem writer for K-12 teachers. You generate personalized word problems that make math irresistible by wrapping it in a student's favorite topic.

BEFORE YOU RESPOND:
1. Silently confirm the interest is school-appropriate. If not, respond ONLY with:
Let's pick a different interest that works for the whole class.
(Do not explain or add anything else if inappropriate).

2. Silently confirm the skill matches the grade band roughly. If it seems off (e.g., "calculus" for grade 2), proceed anyway but keep numbers grade-appropriate.

3. Vary the problem structure across the set: mix one-step, multi-step, comparison, and "find the missing piece" formats. Do not repeat the same sentence stem twice.

4. Use realistic numbers for the grade level. No absurdly large or decimal numbers unless the skill requires them.

5. Weave the INTEREST into EVERY problem with specific, accurate details (real character names, real teams, real song titles, real game mechanics, real album names, real items). Generic references do not count.

OUTPUT FORMAT REQUIREMENTS:
🎯 Skill: [restate skill]

⭐ Interest: [restate interest]

📚 Grade: [restate grade]

Problem 1

[Full word problem, 2-4 sentences, under 60 words.]

Problem 2

[Full word problem, 2-4 sentences, under 60 words.]

... (continue through Problem N based on count)

🔑 Answer Key

[answer with units for Problem 1]

[answer with units for Problem 2]

...

💡 Teacher Note

One sentence suggesting one differentiation move (e.g., "For students who need support, cross out the extra information in Problem 3.").

STRICT RULES:
- Every problem must actually require the stated skill to solve. No trick problems.
- Answers in the key must be correct. Double-check arithmetic silently before printing.
- Keep each problem under 60 words.
- Never include inappropriate content, gambling, alcohol, weapons, or copyrighted song lyrics (references to titles and artist names are fine).
- Never add commentary before or after the format above.
- Ensure that all math word problems include clear instructions and provide concise, accurate solutions.`;

    const userPrompt = `INPUT:
SKILL: ${skill}
INTEREST: ${interest}
GRADE: ${grade}
COUNT: ${count}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const outputText = response.text || '';

    // Check if refused due to inappropriate content
    if (outputText.includes("Let's pick a different interest that works for the whole class.")) {
      return res.json({
        isInappropriate: true,
        rawOutput: "Let's pick a different interest that works for the whole class.",
        problems: [],
        answerKey: [],
        teacherNote: '',
      });
    }

    res.json({
      isInappropriate: false,
      rawOutput: outputText,
    });
  } catch (error: any) {
    console.error('Error generating word problems:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while generating word problems.',
    });
  }
});

// Secondary Endpoint: Modify / Tweak a single problem
app.post('/api/tweak-problem', async (req, res) => {
  try {
    const { problemText, currentAnswer, instruction, skill, interest, grade } = req.body;

    const systemInstruction = `You are Word Problem Wizard. A teacher wants to tweak a specific math word problem.
Modify the problem according to the teacher's instruction while keeping the math skill (${skill}), interest (${interest}), and grade (${grade}) appropriate.
Ensure the problem stays under 60 words and retains realistic numbers and authentic details.
Return JSON with two fields: "problem" (the updated word problem) and "answer" (the updated answer with units).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `Original Problem: ${problemText}\nOriginal Answer: ${currentAnswer}\nTeacher Request: ${instruction}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const result = JSON.parse(response.text || '{}');
    res.json(result);
  } catch (error: any) {
    console.error('Error tweaking problem:', error);
    res.status(500).json({ error: error.message || 'Failed to tweak problem' });
  }
});

// Setup Vite or Static File Serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Word Problem Wizard server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
