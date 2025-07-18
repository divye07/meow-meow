'use client';

import React from 'react';
import { auth } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, User } from 'firebase/auth';
import { useRouter } from 'next/navigation'; // Import useRouter

interface AuthProps {
  currentUser?: User | null; // Make it optional for the sign-in page
}

export default function Auth({ currentUser }: AuthProps) {
  const router = useRouter(); // Initialize useRouter

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      router.push('/'); // Redirect to home page on successful sign-in
    } catch (error: any) {
      console.error("Error signing in with Google:", error);
      alert(`Error signing in: ${error.message}`);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/signin'); // Redirect to sign-in page on successful sign-out
    } catch (error: any) {
      console.error("Error signing out:", error);
      alert(`Error signing out: ${error.message}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4 mb-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 w-full max-w-md mx-auto transition-colors duration-300">
      {currentUser ? (
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">Welcome, {currentUser.displayName || currentUser.email}!</p>
          <button
            onClick={handleSignOut}
            className="mt-3 px-5 py-2 bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white font-semibold rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 w-full sm:w-auto"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <button
          onClick={signInWithGoogle}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white font-semibold rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 w-full sm:w-auto"
        >
          Sign in with Google
        </button>
      )}
    </div>
  );
} 