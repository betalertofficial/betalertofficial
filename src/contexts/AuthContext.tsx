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
    const initializeAuth = async () => {
      setLoading(true);
      
      // Check if we have an existing session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // No session exists, create anonymous user
        console.log("[AuthContext] No session found, creating anonymous user");
        const { user: anonUser, error } = await authService.signInAnonymously();
        
        if (error) {
          console.error("[AuthContext] Error creating anonymous user:", error);
          
          // Check if anonymous auth is disabled (406 or 422 error)
          if (error.code === "422" || error.code === "406") {
            console.warn("[AuthContext] Anonymous authentication is not enabled in Supabase project settings");
            toast({
              title: "Setup Required",
              description: "Anonymous authentication is not enabled. Please enable it in Supabase Dashboard → Authentication → Providers",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Connection Error",
              description: "Unable to initialize session. Please refresh the page.",
              variant: "destructive",
            });
          }
          
          // Don't block the app - user can still use it without auth
          setLoading(false);
          return;
        }
        
        if (anonUser) {
          console.log("[AuthContext] Anonymous user created:", anonUser.id);
          toast({
            title: "Welcome! 👋",
            description: "Browsing anonymously - create a trigger to save your account",
          });
        }
      } else {
        console.log("[AuthContext] Existing session found:", session.user.id);
      }
      
      setLoading(false);
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log("[AuthContext] Auth state changed:", _event, session?.user?.id || "no user");
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          try {
            const profileData = await profileService.getProfile(currentUser.id);
            
            if (!profileData) {
              console.log("[AuthContext] No profile found, creating one for user:", currentUser.id);
              const newProfile = await profileService.createProfile({
                id: currentUser.id,
                phone_e164: null,
                country_code: null,
                role: "user",
              });
              setProfile(newProfile);
              console.log("[AuthContext] Profile created successfully:", newProfile.id);
            } else {
              setProfile(profileData);
            }
          } catch (error) {
            console.error("[AuthContext] Error fetching/creating profile on auth change:", error);
            setProfile(null);
          }
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [toast]);

  const signOut = async () => {
    await supabase.auth.signOut();
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
