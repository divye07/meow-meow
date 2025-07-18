import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY as string);

const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Updated model name

export { genAI, model }; 