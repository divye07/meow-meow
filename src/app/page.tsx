'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import ReportUpload from "@/components/ReportUpload";
import VoiceAnalyzer from "@/components/VoiceAnalyzer";
import Auth from "@/components/Auth";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (!currentUser) {
        router.push('/signin');
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <p className="text-xl text-gray-700 dark:text-gray-200">Loading user session...</p>
      </div>
    );
  }

  if (!user) {
    return null; 
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full space-y-12 bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800">
        <div className="text-center mb-8">
          <h1 className="text-5xl sm:text-6xl font-extrabold text-gray-900 dark:text-white leading-tight tracking-tight">
            <span className="block text-blue-600 dark:text-blue-400">My Health</span>
            <span className="block text-indigo-700 dark:text-indigo-400">Companion</span>
          </h1>
          <p className="text-lg sm:text-xl font-medium text-gray-600 dark:text-gray-300 mt-4">Your AI-powered medical assistant</p>
        </div>
        <Auth currentUser={user} /> 
        <ReportUpload />
        <VoiceAnalyzer />
      </div>
    </div>
  );
}
