"use client";

import { useState, useRef, useEffect } from "react";
import { db, auth } from "@/lib/firebase"; // Import auth
import { collection, addDoc, Timestamp, query, where, getDocs } from "firebase/firestore"; // Add query, where, getDocs
import { onAuthStateChanged, User } from "firebase/auth"; // Import auth functions and User type

export default function ReportUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState<string>("");
  const [uploading, setUploading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null); // State to hold authenticated user

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage("");
    } else {
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage("Please select a file to upload.");
      return;
    }

    setUploading(true);
    setMessage("Uploading...");

    if (!user) {
      setMessage("Error: You must be logged in to upload reports.");
      setUploading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload file to Cloudinary');
      }

      const result = await response.json();
      const downloadURL = result.url;

      // Save report metadata to Firestore with userId
      await addDoc(collection(db, "medicalReports"), {
        userId: user.uid, // Store the user's ID
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        downloadURL: downloadURL,
        description: description,
        uploadedAt: Timestamp.now(),
      });
      setMessage("File uploaded successfully and data saved!");
      setUploading(false);
      setFile(null);
      setDescription("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      console.error("Error during upload or save:", error);
      setMessage(`Upload failed: ${(error as Error).message}`);
      setUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-lg space-y-6 border border-gray-200 dark:border-gray-700 max-w-lg w-full mx-auto transition-colors duration-300">
      <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 dark:text-gray-100">Upload Medical Report</h2>
      <p className="text-center text-gray-600 dark:text-gray-300">Upload your medical reports for a comprehensive AI analysis.</p>

      <div>
        <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Select Report File (PDF, Image, etc.)
        </label>
        <input
          id="file-upload"
          name="file-upload"
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="block w-full text-md text-gray-700 dark:text-gray-200
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-md file:font-semibold
            file:bg-blue-100 dark:file:bg-blue-900 file:text-blue-700 dark:file:text-blue-200
            hover:file:bg-blue-200 dark:hover:file:bg-blue-800 transition-colors duration-200
            cursor-pointer"
        />
        {file && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Selected file: <span className="font-semibold">{file.name}</span></p>}
      </div>
      
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Description (e.g., &quot;Lab results from Oct 2023&quot;)
        </label>
        <input
          id="description"
          name="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a brief description for the report"
          className="mt-1 block w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200"
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={uploading || !file}
        className="w-full flex justify-center py-3 px-6 border border-transparent rounded-xl shadow-md text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {uploading ? (
          <span className="flex items-center justify-center"><svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4.75V6.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M17.127 6.873L16.066 7.934" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M19.25 12H17.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M17.127 17.127L16.066 16.066" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 19.25V17.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6.87305 17.127L7.93405 16.066" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M4.75 12H6.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6.87305 6.873L7.93405 7.934" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Uploading...</span>
        ) : (
          "Upload Report"
        )}
      </button>
      {!user && <p className="mt-4 p-3 rounded-md text-center bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200 font-medium">Please sign in to upload medical reports.</p>}
      {message && user && (
        <p className={`mt-4 p-3 rounded-md text-center ${message.includes("success") ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200" : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200"} font-medium`}>
          {message}
        </p>
      )}
    </div>
  );
} 