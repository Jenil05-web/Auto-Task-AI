import OpenAI from "openai";

class NLPService {
  constructor() {
    // Do NOT instantiate OpenAI here!
    this.openai = null;
  }

  getOpenAI() {
    if (!this.openai) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is missing");
      }
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  async parseNaturalLanguageIntent(input) {
    const openai = this.getOpenAI();
    const prompt = `
    Parse the following natural language input for call automation:
    "${input}"
    Extract and return JSON with:
    {
      "action": "call type (reminder, followup, appointment, etc)",
      "frequency": "once/daily/weekly/monthly",
      "time": "preferred time",
      "clients": ["client identifiers"],
      "purpose": "main purpose of call",
      "script": "suggested call script"
    }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    return JSON.parse(response.choices[0].message.content);
  }

  async generateCallScript(purpose, clientInfo) {
    const openai = this.getOpenAI();
    const prompt = `Generate a natural, conversational call script for: ${purpose}
    Client info: ${JSON.stringify(clientInfo)}
    Create greeting, main message, potential questions, and closing.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  }
}

const nlpService = new NLPService();
export default nlpService;
