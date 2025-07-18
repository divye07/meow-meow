"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // On mount, sync with DOM/localStorage
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && systemDark)) {
      document.documentElement.classList.add('dark');
      setTheme('dark');
    } else {
      document.documentElement.classList.remove('dark');
      setTheme('light');
    }
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    console.log('Toggling theme. Current:', theme);
    if (theme === 'dark') {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setTheme('light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setTheme('dark');
    }
  };

  if (!mounted) return null; // Prevent hydration mismatch

  return (
    <button
      aria-label="Toggle dark mode"
      onClick={toggleTheme}
      className="fixed z-50 top-3 right-3 sm:top-6 sm:right-6 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-full shadow-lg p-2 sm:p-3 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {theme === 'dark' ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5m0 15V21m8.485-8.485h-1.5m-15 0H3m15.364-6.364l-1.06 1.06m-12.728 0l-1.06-1.06m12.728 12.728l-1.06-1.06m-12.728 0l-1.06 1.06M16.24 7.76A6.5 6.5 0 117.76 16.24 6.5 6.5 0 0116.24 7.76z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0112 21.75c-5.385 0-9.75-4.365-9.75-9.75 0-4.136 2.652-7.64 6.398-9.093.513-.197 1.073-.02 1.387.43.315.45.213 1.07-.23 1.384A7.501 7.501 0 0012 19.5c2.485 0 4.675-1.21 6.195-3.086.33-.41.96-.482 1.384-.23.424.252.627.8.173 1.182z" />
        </svg>
      )}
    </button>
  );
} 