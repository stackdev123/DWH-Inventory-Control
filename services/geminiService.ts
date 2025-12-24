
import { GoogleGenAI, Type } from "@google/genai";
import { Product, StockItem, LogEntry } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const geminiService = {
  analyzeStock: async (products: Product[], stock: StockItem[], logs: LogEntry[]) => {
    const prompt = `
      As a warehouse expert, analyze the current inventory data and provide 3 key insights or recommendations.
      Data Summary:
      - Total SKUs: ${products.length}
      - Products with Low Stock: ${products.filter(p => (p.stockToday || 0) <= (p.safetyStock || 0)).length}
      - Total Units in Stock: ${stock.reduce((acc, s) => acc + s.quantity, 0)}
      - Recent Movements: ${logs.length} transactions recorded.
      
      Format the response as JSON with an array of objects called 'insights', each having 'title', 'description', and 'priority' (High, Medium, Low).
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    priority: { type: Type.STRING }
                  },
                  required: ["title", "description", "priority"]
                }
              }
            },
            required: ["insights"]
          }
        }
      });

      return JSON.parse(response.text || '{"insights": []}');
    } catch (error) {
      console.error("AI Analysis failed:", error);
      return { insights: [] };
    }
  }
};
