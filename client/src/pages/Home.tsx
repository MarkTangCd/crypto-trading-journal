import { useEffect } from "react";
import { useLocation } from "wouter";

// Home redirects to Dashboard - keeping this file for compatibility
export default function Home() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    setLocation("/");
  }, [setLocation]);

  return null;
}
