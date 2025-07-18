'use client';

import Auth from '@/components/Auth';
import React, { useEffect, useState } from 'react'; // Import useEffect and useState
import { useRouter } from 'next/navigation'; // Import useRouter
import { auth } from '@/lib/firebase'; // Import auth
import { onAuthStateChanged } from 'firebase/auth'; // Import onAuthStateChanged

export default function SignInPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // If user is logged in, redirect to home page
        router.push('/');
      } else {
        setLoading(false); // Only set loading to false if no user is found
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <p className="text-xl text-gray-700 dark:text-gray-200">Checking authentication status...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Sign in to My Health Companion
        </h2>
        <Auth />
      </div>
    </div>
  );
} 