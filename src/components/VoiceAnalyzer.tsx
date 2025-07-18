"use client";

import { useState, useRef, useEffect } from "react";
import { db, auth } from "@/lib/firebase"; // Import auth from firebase
import { model } from "@/lib/gemini"; // Import model from gemini
import { collection, addDoc, query, orderBy, limit, Timestamp, onSnapshot, where } from "firebase/firestore"; // Import where
import { onAuthStateChanged, User } from 'firebase/auth'; // Import auth functions and User type

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
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [medicalReports, setMedicalReports] = useState<MedicalReport[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<GeminiResponseData | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const [user, setUser] = useState<User | null>(null); // State to hold authenticated user

  // Initialize speech synthesis and listen for auth state changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // Reload history and reports when user state changes
      if (currentUser) {
        loadConversationHistory(currentUser.uid);
        loadMedicalReports(currentUser.uid);
      } else {
        setConversationHistory([]);
        setMedicalReports([]);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // speakText function remains unchanged
  const speakText = (text: string) => {
    if (!synthRef.current || !text) {
      console.log("speakText: Synth not ready or text is empty.");
      return;
    }

    console.log("Attempting to speak:", text);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "hi-IN";

    if (user) { // Only use user's voice if logged in
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

  const loadConversationHistory = async (userId: string) => {
    try {
      // Query only the current user's conversations
      const q = query(collection(db, "conversations"), where("userId", "==", userId), orderBy("timestamp", "asc"), limit(10));
      
      // Use onSnapshot for real-time updates
      onSnapshot(q, (querySnapshot) => {
        const history: Message[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          let parsedAiResponse: GeminiResponseData | undefined;
          if (data.sender === 'ai') {
            try {
              // Attempt to parse JSON if it's an AI message
              const cleanGeminiText = data.text.indexOf('{') !== -1 && data.text.lastIndexOf('}') !== -1 
                ? data.text.substring(data.text.indexOf('{'), data.text.lastIndexOf('}') + 1)
                : data.text;
              parsedAiResponse = JSON.parse(cleanGeminiText) as GeminiResponseData;
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
      });

    } catch (error) {
      console.error("Error loading conversation history:", error);
    }
  };

  const loadMedicalReports = async (userId: string) => {
    try {
      // Query only the current user's medical reports
      const q = query(collection(db, "medicalReports"), where("userId", "==", userId), orderBy("uploadedAt", "desc"), limit(5));
      
      // Use onSnapshot for real-time updates
      onSnapshot(q, (querySnapshot) => {
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
      });

    } catch (error) {
      console.error("Error loading medical reports:", error);
    }
  };

  const sendToGemini = async () => {
    if (!userTextInput.trim()) {
      setMessage("Please type your question or symptom for analysis.");
      return;
    }
    if (!user) {
      setMessage("Error: Please sign in to use the AI medical analyzer.");
      return;
    }

    setMessage("Sending to AI for analysis...");
    setAiResponse(null); // Clear previous AI response

    const userMessage = userTextInput.trim();

    try {
      // Store user message in Firestore with userId
      await addDoc(collection(db, "conversations"), {
        userId: user.uid, // Store the user's ID
        text: userMessage,
        sender: "user",
        timestamp: Timestamp.now(),
      });
      // Local state update will be handled by onSnapshot listener
      setUserTextInput(""); // Clear text input immediately

      // Construct the prompt with context, requesting JSON output
      let prompt = `The user is describing a medical symptom or asking a health-related question in Hindi. Provide a possible reason and suggested solutions in simple Hindi, easy to understand for a non-technical person living in a rural area. Avoid medical jargon where possible, or explain it clearly in Hindi. If you cannot provide medical advice, state in Hindi that you are an AI and cannot replace a doctor, and recommend consulting a healthcare professional. Provide the response strictly in JSON format with the following keys: \"possibleReason\" (string), \"suggestedSolutions\" (array of strings), and \"disclaimer\" (string). Only output the JSON, no other text.\n\nUser Input (Hindi): \"${userMessage}\"\n\n`;

      if (medicalReports.length > 0) {
        prompt += "Medical Reports (most recent first):\n";
        medicalReports.forEach((report) => {
          prompt += `- File: ${report.fileName}, Description: ${report.description}, Uploaded: ${report.uploadedAt.toLocaleDateString()}\n`;
        });
        prompt += "\n";
      }

      // Only include conversation history for the current user
      const currentUserConversations = conversationHistory.filter(msg => (msg as any).userId === user.uid); // Assuming userId is on the message object
      if (currentUserConversations.length > 0) {
        prompt += "Previous Conversations (most recent first):\n";
        currentUserConversations.forEach((msg) => {
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

      // Store AI response in Firestore (store stringified JSON or raw text fallback) with userId
      await addDoc(collection(db, "conversations"), {
        userId: user.uid, // Store the user's ID
        text: textToStoreInFirestore,
        sender: "ai",
        timestamp: Timestamp.now(),
      });
      // Local state update will be handled by onSnapshot listener

      setMessage("Analysis complete!");
    } catch (error: any) {
      console.error("Error sending to Gemini:", error);
      setAiResponse(null);
      setMessage(`AI Error: ${(error as Error).message}`);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-2 xs:p-3 sm:p-6 md:p-8 rounded-2xl shadow-xl space-y-6 sm:space-y-8 border border-gray-100 dark:border-gray-800 max-w-xs xs:max-w-sm sm:max-w-2xl md:max-w-3xl w-full mx-auto my-3 sm:my-6 md:my-10 transition-colors duration-300">
      <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 dark:text-white">AI Medical Analyzer</h2>
      <p className="text-center text-gray-600 dark:text-gray-300 text-sm sm:text-base">Type your question or symptom in Hindi to get a possible reason and solutions based on medical history.</p>

      <div>
        <label htmlFor="user-input" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Your Question/Symptom:</label>
        <textarea
          id="user-input"
          className="w-full p-2 sm:p-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-200 resize-y min-h-[60px] sm:min-h-[80px] text-sm sm:text-base"
          rows={3}
          placeholder="Type in Hindi, e.g., 'मुझे बुखार और खांसी है' (I have fever and cough)"
          value={userTextInput}
          onChange={(e) => setUserTextInput(e.target.value)}
          disabled={!user}
        ></textarea>
      </div>

      <button
        onClick={sendToGemini}
        disabled={!userTextInput.trim() || !user}
        className="w-full px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-800 dark:to-indigo-900 text-white font-semibold rounded-xl shadow-md hover:from-blue-600 hover:to-indigo-700 dark:hover:from-blue-900 dark:hover:to-indigo-950 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-base sm:text-lg"
      >
        Send to AI for Analysis
      </button>

      {!user && <p className="mt-4 p-3 rounded-md text-center bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200 font-medium">Please sign in to use the AI medical analyzer.</p>}

      {message && user && (
        <p className={`mt-4 p-3 rounded-md text-center ${message.includes("Error") ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200" : "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200"} font-medium`}>
          {message}
        </p>
      )}

      {aiResponse && (
        <div className="bg-green-50 dark:bg-green-900 p-6 rounded-lg shadow-inner border border-green-200 dark:border-green-800 space-y-4">
          <h3 className="text-xl font-bold text-green-800 dark:text-green-200">AI Response:</h3>
          <div>
            <p className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-1">Possible Reason:</p>
            <p className="text-gray-800 dark:text-gray-100 leading-relaxed">{aiResponse.possibleReason}</p>
          </div>
          <div>
            <p className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-1">Suggested Solutions:</p>
            <ul className="list-disc list-inside text-gray-800 dark:text-gray-100 leading-relaxed pl-4">
              {aiResponse.suggestedSolutions.map((solution, index) => (
                <li key={index}>{solution}</li>
              ))}
            </ul>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 border-t pt-3 border-gray-200 dark:border-gray-700 italic">
            <p className="font-semibold">Disclaimer:</p>
            <p>{aiResponse.disclaimer}</p>
          </div>
        </div>
      )}

      <button
        onClick={() => { if (user) { loadConversationHistory(user.uid); loadMedicalReports(user.uid); } else { setMessage("Please sign in to refresh."); } }}
        className="w-full px-6 py-3 bg-purple-500 dark:bg-purple-800 text-white font-semibold rounded-lg shadow-md hover:bg-purple-600 dark:hover:bg-purple-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        disabled={!user}
      >
        Refresh Conversations & Reports
      </button>

      {user && conversationHistory.length > 0 && (
        <div className="mt-6 bg-gray-50 dark:bg-gray-800 p-6 rounded-lg shadow-inner border border-gray-200 dark:border-gray-700 space-y-4">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Conversation History:</h3>
          <div className="max-h-72 overflow-y-auto pr-2 space-y-3">
            {conversationHistory.map((msg, index) => (
              <div key={index} className={`p-4 rounded-lg ${msg.sender === "user" ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 self-end text-right" : "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 self-start text-left"}`}>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{msg.sender === "user" ? "You" : "AI"} ({msg.timestamp.toLocaleString()}):</p>
                {msg.parsedAiResponse ? (
                  <div className="space-y-2 text-left">
                    <p className="text-sm font-semibold">Possible Reason:</p>
                    <p className="text-base leading-relaxed break-words">{msg.parsedAiResponse.possibleReason}</p>
                    <p className="text-sm font-semibold mt-2">Suggested Solutions:</p>
                    <ul className="list-disc list-inside text-base leading-relaxed pl-4">
                      {msg.parsedAiResponse.suggestedSolutions.map((solution, solIndex) => (
                        <li key={solIndex}>{solution}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 italic">Disclaimer: {msg.parsedAiResponse.disclaimer}</p>
                  </div>
                ) : (
                  <p className="text-base leading-relaxed break-words">{msg.text}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {user && medicalReports.length > 0 && (
        <div className="mt-6 bg-yellow-50 dark:bg-yellow-900 p-6 rounded-lg shadow-inner border border-yellow-200 dark:border-yellow-800 space-y-4">
          <h3 className="text-xl font-bold text-yellow-800 dark:text-yellow-200">Recent Medical Reports:</h3>
          <div className="max-h-48 overflow-y-auto pr-2 space-y-3">
            {medicalReports.map((report, index) => (
              <div key={index} className="p-4 rounded-lg bg-yellow-100 dark:bg-yellow-800 border border-yellow-200 dark:border-yellow-700">
                <p className="text-md font-semibold text-yellow-800 dark:text-yellow-200">File: {report.fileName}</p>
                <p className="text-sm text-gray-700 dark:text-gray-200">Description: {report.description}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Uploaded: {report.uploadedAt.toLocaleDateString()}</p>
                <a href={report.downloadURL} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-300 hover:underline text-sm font-medium mt-1 inline-block">View Report</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 