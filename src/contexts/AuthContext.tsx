import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
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
    try {
      console.log("[AuthContext] Manually refreshing profile");
      
      // Call session API to get current profile
      const response = await fetch("/api/auth/session");
      
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.profile) {
          setProfile(data.profile);
          console.log("[AuthContext] Manual refresh complete:", data.profile);
          return;
        }
      }
      
      console.warn("[AuthContext] No session found during manual refresh");
      setProfile(null);
    } catch (error) {
      console.error("[AuthContext] Error refreshing profile:", error);
      setProfile(null);
    }
  };

  useEffect(() => {
    console.log("[AuthContext] Starting auth initialization");
    let mounted = true;

    const initAuth = async () => {
      try {
        // Check for dev admin profile in localStorage first (for iframe/dev environments)
        const devAdminProfile = localStorage.getItem("dev_admin_profile");
        if (devAdminProfile) {
          try {
            const profile = JSON.parse(devAdminProfile);
            console.log("[AuthContext] Found dev admin profile in localStorage:", profile.id);
            
            if (mounted) {
              setUser({ id: profile.id } as any);
              setProfile(profile);
              setLoading(false);
            }
            return; // Skip Supabase session check
          } catch (e) {
            console.error("[AuthContext] Invalid dev admin profile in localStorage:", e);
            localStorage.removeItem("dev_admin_profile");
          }
        }

        // Check for Telegram JWT cookie
        const sessionResponse = await fetch("/api/auth/session", {
          credentials: "include"
        });
        
        if (sessionResponse.ok) {
          const data = await sessionResponse.json();
          
          if (data.authenticated && data.profile) {
            console.log(`[AuthContext] Session found via ${data.authMethod}:`, data.userId);
            
            if (mounted) {
              // For Telegram users, create a minimal User object
              if (data.authMethod === 'telegram') {
                setUser({
                  id: data.userId,
                  app_metadata: {},
                  user_metadata: {},
                  aud: 'authenticated',
                  created_at: new Date().toISOString(),
                } as User);
              } else {
                // For Supabase users, get the full user object
                const { data: { user: supabaseUser } } = await supabase.auth.getUser();
                setUser(supabaseUser);
              }
              
              setProfile(data.profile);
              setLoading(false);
              
              console.log("[AuthContext] Auth initialization complete");
              return;
            }
          }
        }
        
        // No session found
        console.log("[AuthContext] No active session");
        if (mounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
        
      } catch (error) {
        console.error("[AuthContext] Auth init error", error);
        if (mounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    };

    initAuth();

    // Setup listener for Supabase auth changes (only affects phone auth users)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        
        console.log("[AuthContext] Supabase auth state changed:", _event, session?.user?.id || "no user");
        
        // Only handle Supabase auth changes (phone users)
        // Telegram users don't trigger this listener
        if (session?.user) {
          setUser(session.user);
          
          try {
            const response = await fetch("/api/auth/session");
            if (response.ok) {
              const data = await response.json();
              if (data.authenticated && data.profile) {
                setProfile(data.profile);
              }
            }
          } catch (error) {
            console.error("[AuthContext] Error fetching profile on auth change:", error);
            setProfile(null);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // Clear Telegram session cookie
    await fetch("/api/auth/session", { method: "DELETE" });
    
    // Sign out from Supabase (for phone users)
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