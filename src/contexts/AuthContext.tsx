import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { profileService } from "@/services/profileService";
import type { Profile } from "@/types/database";

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
    setLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log("[AuthContext] Auth state changed:", _event, session?.user?.id || "no user");
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          try {
            const profileData = await profileService.getProfile(currentUser.id);
            setProfile(profileData);
          } catch (error) {
            console.error("[AuthContext] Error fetching profile on auth change:", error);
            setProfile(null);
          }
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
