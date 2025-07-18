"use client";

import { useState, useRef, useEffect } from "react";
import { model } from "@/lib/gemini";
import { db } from "@/lib/firebase";
import { collection, addDoc, Timestamp, query, orderBy, limit, getDocs } from "firebase/firestore";

interface Message {
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  parsedAiResponse?: GeminiResponseData; // Optional field for parsed AI response in history
}

interface MedicalReport {
  fileName: string;
  description: string;
  downloadURL: string;
  uploadedAt: Date;
}

interface GeminiResponseData {
  possibleReason: string;
  suggestedSolutions: string[];
  disclaimer: string;
}

export default function VoiceAnalyzer() {
  const [userTextInput, setUserTextInput] = useState<string>("");
  const [aiResponse, setAiResponse] = useState<GeminiResponseData | null>(null);
  const [message, setMessage] = useState<string>("");
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [medicalReports, setMedicalReports] = useState<MedicalReport[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const [voicesLoaded, setVoicesLoaded] = useState(false);

  useEffect(() => {
    loadConversationHistory();
    loadMedicalReports();

    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      window.speechSynthesis.onvoiceschanged = () => {
        setVoicesLoaded(true);
        console.log("SpeechSynthesis voices loaded.");
      };
      if (window.speechSynthesis.getVoices().length > 0) {
        setVoicesLoaded(true);
      }
    }
  }, []);

  const speakText = (text: string) => {
    if (!synthRef.current || !text) {
      console.log("speakText: Synth not ready or text is empty.");
      return;
    }

    console.log("Attempting to speak:", text);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "hi-IN";

    if (voicesLoaded) {
      const voices = synthRef.current.getVoices();
      const hindiVoice = voices.find(voice => voice.lang.startsWith('hi'));
      if (hindiVoice) {
        utterance.voice = hindiVoice;
        console.log("Using Hindi voice:", hindiVoice.name);
      } else {
        console.warn("Hindi voice not found, falling back to default.");
      }
    } else {
      console.warn("Voices not yet loaded for speaking, using default.");
    }
    
    utterance.onerror = (event) => {
      console.error("SpeechSynthesisUtterance error:", event);
      setMessage("Sorry, I couldn't speak the response. Text is displayed.");
    };

    synthRef.current.speak(utterance);
  };

  const loadConversationHistory = async () => {
    try {
      const q = query(collection(db, "conversations"), orderBy("timestamp", "asc"), limit(10));
      const querySnapshot = await getDocs(q);
      const history: Message[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        let parsedAiResponse: GeminiResponseData | undefined;
        if (data.sender === 'ai') {
          try {
            // Attempt to parse JSON if it's an AI message
            parsedAiResponse = JSON.parse(data.text) as GeminiResponseData;
          } catch (e) {
            console.warn("Could not parse AI response as JSON in history:", data.text, e);
            // Fallback to raw text if parsing fails
          }
        }

        history.push({
          text: data.text,
          sender: data.sender,
          timestamp: data.timestamp.toDate(),
          parsedAiResponse: parsedAiResponse // Store parsed response if available
        });
      });
      setConversationHistory(history);
    } catch (error) {
      console.error("Error loading conversation history:", error);
    }
  };

  const loadMedicalReports = async () => {
    try {
      const q = query(collection(db, "medicalReports"), orderBy("uploadedAt", "desc"), limit(5));
      const querySnapshot = await getDocs(q);
      const reports: MedicalReport[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        reports.push({
          fileName: data.fileName,
          description: data.description,
          downloadURL: data.downloadURL,
          uploadedAt: data.uploadedAt.toDate(),
        });
      });
      setMedicalReports(reports);
    } catch (error) {
      console.error("Error loading medical reports:", error);
    }
  };

  const sendToGemini = async () => {
    if (!userTextInput.trim()) {
      setMessage("Please type your question or symptom for analysis.");
      return;
    }

    setMessage("Sending to AI for analysis...");
    setAiResponse(null); // Clear previous AI response

    const userMessage = userTextInput.trim();

    try {
      // Store user message in Firestore
      await addDoc(collection(db, "conversations"), {
        text: userMessage,
        sender: "user",
        timestamp: Timestamp.now(),
      });
      setConversationHistory((prev) => [...prev, { text: userMessage, sender: "user", timestamp: new Date() }]);

      // Construct the prompt with context, requesting JSON output
      let prompt = `The user is describing a medical symptom or asking a health-related question in Hindi. Provide a possible reason and suggested solutions in simple Hindi, easy to understand for a non-technical person living in a rural area. Avoid medical jargon where possible, or explain it clearly in Hindi. If you cannot provide medical advice, state in Hindi that you are an AI and cannot replace a doctor, and recommend consulting a healthcare professional. Provide the response strictly in JSON format with the following keys: \"possibleReason\" (string), \"suggestedSolutions\" (array of strings), and \"disclaimer\" (string). Only output the JSON, no other text.\n\nUser Input (Hindi): \"${userMessage}\"\n\n`;

      if (medicalReports.length > 0) {
        prompt += "Medical Reports (most recent first):\n";
        medicalReports.forEach((report) => {
          prompt += `- File: ${report.fileName}, Description: ${report.description}, Uploaded: ${report.uploadedAt.toLocaleDateString()}\n`;
        });
        prompt += "\n";
      }

      if (conversationHistory.length > 0) {
        prompt += "Previous Conversations (most recent first):\n";
        conversationHistory.forEach((msg) => {
          // Translate sender to Hindi for context
          const senderHindi = msg.sender === "user" ? "उपयोगकर्ता" : "एआई";
          prompt += `- ${senderHindi} (${msg.timestamp.toLocaleString()}): ${msg.text}\n`;
        });
        prompt += "\n";
      }

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const geminiText = response.text();

      let parsedResponse: GeminiResponseData | null = null;
      let textToStoreInFirestore = geminiText; // Default to raw text if parsing fails

      try {
        // Improved JSON extraction: find the first { and last } to robustly get the JSON string
        const jsonStartIndex = geminiText.indexOf('{');
        const jsonEndIndex = geminiText.lastIndexOf('}');

        let cleanGeminiText = geminiText; // Default to original if no JSON markers

        if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
          cleanGeminiText = geminiText.substring(jsonStartIndex, jsonEndIndex + 1);
        }

        // Attempt to parse the cleaned text
        parsedResponse = JSON.parse(cleanGeminiText) as GeminiResponseData;
        setAiResponse(parsedResponse);
        textToStoreInFirestore = JSON.stringify(parsedResponse); // Store stringified JSON

        if (parsedResponse) {
          const speechText = `${parsedResponse.possibleReason}. ${parsedResponse.suggestedSolutions.join(". ")}. ${parsedResponse.disclaimer}`;
          speakText(speechText);
        }
      } catch (jsonError) {
        console.error("Error parsing Gemini JSON response:", jsonError);
        setAiResponse({ possibleReason: geminiText, suggestedSolutions: [], disclaimer: "" });
        speakText(geminiText);
        setMessage("AI response received, but could not parse. Displaying raw text. Check console for details.");
      }

      // Store AI response in Firestore (store stringified JSON or raw text fallback)
      await addDoc(collection(db, "conversations"), {
        text: textToStoreInFirestore,
        sender: "ai",
        timestamp: Timestamp.now(),
      });
      // Update local history with the parsed AI response for immediate display
      setConversationHistory((prev) => [...prev, {
        text: textToStoreInFirestore, // This is the stringified JSON or raw text
        sender: "ai",
        timestamp: new Date(),
        parsedAiResponse: parsedResponse || undefined // Store the actual parsed object if available
      }]);

      setMessage("Analysis complete!");
      setUserTextInput(""); // Clear text input after sending
    } catch (error: any) {
      console.error("Error sending to Gemini:", error);
      setAiResponse(null);
      setMessage(`AI Error: ${(error as Error).message}`);
    }
  };

  return (
    <div className="bg-white p-4 sm:p-8 rounded-2xl shadow-xl space-y-8 border border-gray-100 max-w-sm sm:max-w-3xl mx-auto my-5 sm:my-10">
      <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 text-center">AI Medical Analyzer</h2>
      <p className="text-center text-gray-700 text-base sm:text-lg">Type your question or symptom in Hindi to get a possible reason and solutions based on medical history.</p>

      <div>
        <label htmlFor="user-input" className="block text-base sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-3">Your Question/Symptom:</label>
        <textarea
          id="user-input"
          className="w-full p-3 sm:p-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-300 ease-in-out resize-y min-h-[80px] sm:min-h-[100px] text-base sm:text-lg placeholder-gray-400"
          rows={3}
          placeholder="Type in Hindi, e.g., 'मुझे बुखार और खांसी है' (I have fever and cough)"
          value={userTextInput}
          onChange={(e) => setUserTextInput(e.target.value)}
        ></textarea>
      </div>

      <button
        onClick={sendToGemini}
        disabled={!userTextInput.trim()} 
        className="w-full px-4 py-2 sm:px-6 sm:py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-lg shadow-md hover:from-blue-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-base sm:text-lg"
      >
        Send to AI for Analysis
      </button>

      {message && (
        <p className={`mt-4 sm:mt-6 p-3 sm:p-4 rounded-xl text-center text-base sm:text-lg font-semibold ${message.includes("Error") ? "bg-red-100 text-red-700 border border-red-200" : "bg-blue-100 text-blue-700 border border-blue-200"}`}>
          {message}
        </p>
      )}

      {aiResponse && (
        <div className="bg-green-50 p-4 sm:p-6 rounded-xl shadow-md border border-green-200 space-y-4 sm:space-y-5">
          <h3 className="text-xl sm:text-2xl font-bold text-green-800">AI Response:</h3>
          <div>
            <p className="text-base sm:text-lg font-semibold text-gray-700 mb-1 sm:mb-2">Possible Reason:</p>
            <p className="text-sm sm:text-base leading-relaxed">{aiResponse.possibleReason}</p>
          </div>
          <div>
            <p className="text-base sm:text-lg font-semibold text-gray-700 mb-1 sm:mb-2">Suggested Solutions:</p>
            <ul className="list-disc list-inside text-gray-800 leading-relaxed pl-4 sm:pl-6 text-sm sm:text-base space-y-0.5 sm:space-y-1">
              {aiResponse.suggestedSolutions.map((solution, index) => (
                <li key={index}>{solution}</li>
              ))}
            </ul>
          </div>
          <div className="text-xs sm:text-sm text-gray-600 border-t pt-2 sm:pt-3 border-gray-200 italic">
            <p className="font-semibold">Disclaimer:</p>
            <p>{aiResponse.disclaimer}</p>
          </div>
        </div>
      )}

      <button
        onClick={() => { loadConversationHistory(); loadMedicalReports(); }} // Reload history to see changes
        className="w-full px-4 py-2 sm:px-6 sm:py-3 bg-purple-600 text-white font-semibold rounded-xl shadow-md hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-purple-300 transition-all duration-300 ease-in-out text-base sm:text-lg"
      >
        Refresh Conversations & Reports
      </button>

      {conversationHistory.length > 0 && (
        <div className="mt-6 sm:mt-8 bg-gray-50 p-4 sm:p-6 rounded-xl shadow-md border border-gray-200 space-y-4 sm:space-y-5">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-800">Conversation History:</h3>
          <div className="max-h-60 sm:max-h-80 overflow-y-auto pr-2 sm:pr-3 space-y-3 sm:space-y-4">
            {conversationHistory.map((msg, index) => (
              <div key={index} className={`p-3 sm:p-4 rounded-xl shadow-sm ${msg.sender === "user" ? "bg-blue-100 text-blue-800 ml-auto" : "bg-green-100 text-green-800 mr-auto"}`} style={{ maxWidth: '95%' }}>
                <p className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1 font-medium">{msg.sender === "user" ? "You" : "AI"} ({msg.timestamp.toLocaleString()}):</p>
                {msg.parsedAiResponse ? (
                  <div className="space-y-1 sm:space-y-2 text-left">
                    <p className="text-sm sm:text-base font-semibold">Possible Reason:</p>
                    <p className="text-sm sm:text-base leading-relaxed break-words">{msg.parsedAiResponse.possibleReason}</p>
                    <p className="text-sm sm:text-base font-semibold mt-1 sm:mt-2">Suggested Solutions:</p>
                    <ul className="list-disc list-inside text-sm sm:text-base leading-relaxed pl-3 sm:pl-4 space-y-0.5 sm:space-y-1">
                      {msg.parsedAiResponse.suggestedSolutions.map((solution, solIndex) => (
                        <li key={solIndex}>{solution}</li>
                      ))}
                    </ul>
                    <p className="text-xs sm:text-xs text-gray-700 mt-1 sm:mt-2 italic">Disclaimer: {msg.parsedAiResponse.disclaimer}</p>
                  </div>
                ) : (
                  <p className="text-sm sm:text-base leading-relaxed break-words">{msg.text}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {medicalReports.length > 0 && (
        <div className="mt-6 sm:mt-8 bg-yellow-50 p-4 sm:p-6 rounded-xl shadow-md border border-yellow-200 space-y-4 sm:space-y-5">
          <h3 className="text-xl sm:text-2xl font-bold text-yellow-800">Recent Medical Reports:</h3>
          <div className="max-h-48 sm:max-h-60 overflow-y-auto pr-2 sm:pr-3 space-y-3 sm:space-y-4">
            {medicalReports.map((report, index) => (
              <div key={index} className="p-3 sm:p-4 rounded-xl bg-yellow-100 border border-yellow-200 shadow-sm">
                <p className="text-base sm:text-lg font-semibold text-yellow-800 mb-0.5 sm:mb-1">File: {report.fileName}</p>
                <p className="text-sm sm:text-md text-gray-700 mb-0.5 sm:mb-1">Description: {report.description}</p>
                <p className="text-sm sm:text-md text-gray-600 mb-1 sm:mb-2">Uploaded: {report.uploadedAt.toLocaleDateString()}</p>
                <a href={report.downloadURL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm sm:text-base font-medium inline-block transition-colors duration-200">View Report</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 