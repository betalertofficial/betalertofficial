import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { profileService } from "@/services/profileService";
import { authService } from "@/services/authService";
import type { Profile } from "@/types/database";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const refreshProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      try {
        console.log("[AuthContext] Manually refreshing profile for user:", user.id);
        const profileData = await profileService.getProfile(user.id);
        setProfile(profileData);
        console.log("[AuthContext] Manual refresh complete:", profileData);
      } catch (error) {
        console.error("[AuthContext] Error refreshing profile:", error);
        setProfile(null);
      }
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        setLoading(true);
        console.log("[AuthContext] Starting auth initialization");
        
        // 1. Get Session directly first
        const { data: { session } } = await supabase.auth.getSession();
        console.log("[AuthContext] Session check complete:", session ? "session found" : "no session");
        
        let sessionUser = session?.user ?? null;

        // 2. If no session, try anonymous sign in
        if (!sessionUser) {
          console.log("[AuthContext] No session found, creating anonymous user");
          const { user: anonUser, error } = await authService.signInAnonymously();
          
          if (error) {
            console.error("[AuthContext] Error creating anonymous user:", error);
            
            // Check if anonymous auth is disabled (422 error)
            if (error.code === "422") {
              console.warn("[AuthContext] Anonymous authentication is not enabled");
              if (mounted) {
                toast({
                  title: "Setup Required",
                  description: "Anonymous authentication is not enabled. Please enable it in Supabase Dashboard.",
                  variant: "destructive",
                });
              }
            } else {
              if (mounted) {
                toast({
                  title: "Connection Error",
                  description: "Unable to initialize session. Please refresh the page.",
                  variant: "destructive",
                });
              }
            }
            
            // Don't block the app - user can still use it without auth
            if (mounted) setLoading(false);
            return;
          }
          
          if (anonUser) {
            console.log("[AuthContext] Anonymous user created:", anonUser.id);
            sessionUser = anonUser;
            if (mounted) {
              toast({
                title: "Welcome! 👋",
                description: "Browsing anonymously - create a trigger to save your account",
              });
            }
          }
        } else {
          console.log("[AuthContext] Existing session found:", sessionUser.id);
        }
        
        // 3. Set the user state explicitly BEFORE setting loading=false
        if (mounted) {
          setUser(sessionUser);
          
          // 4. Fetch profile if we have a user
          if (sessionUser) {
            try {
              console.log("[AuthContext] Fetching profile for user:", sessionUser.id);
              const profileData = await profileService.getProfile(sessionUser.id);
              console.log("[AuthContext] Profile fetched successfully:", profileData);
              if (mounted) setProfile(profileData);
            } catch (error) {
              console.error("[AuthContext] Error fetching profile:", error);
              if (mounted) setProfile(null);
            }
          }
        }
        
        console.log("[AuthContext] Auth initialization complete");
      } catch (error) {
        console.error("[AuthContext] Auth init error", error);
      } finally {
        console.log("[AuthContext] Setting loading to false");
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    // 5. Setup listener for FUTURE changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        
        console.log("[AuthContext] Auth state changed:", _event, session?.user?.id || "no user");
        
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          try {
            // Only fetch profile if it's a different user or we don't have one
            // (Simpler to just fetch to ensure freshness)
            const profileData = await profileService.getProfile(currentUser.id);
            if (mounted) setProfile(profileData);
          } catch (error) {
            console.error("[AuthContext] Error fetching profile on auth change:", error);
            if (mounted) setProfile(null);
          }
        } else {
          if (mounted) setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // Empty deps - only run once on mount

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}