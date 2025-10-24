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

// Create a mock super admin user for bypass mode
const createMockSuperAdmin = (): { user: User; profile: Profile } => {
  const mockUser = {
    id: "00000000-0000-0000-0000-000000000001",
    phone: "+15555550001",
    email: null,
    app_metadata: {},
    user_metadata: { name: "Super Admin" },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;

  const mockProfile: Profile = {
    id: mockUser.id,
    phone_e164: "+15555550001",
    country_code: "US",
    name: "Super Admin",
    role: "super_admin",
    subscription_tier: "enterprise",
    trigger_limit: 999,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { user: mockUser, profile: mockProfile };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (user) {
      try {
        const profileData = await profileService.getProfile(user.id);
        setProfile(profileData);
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    }
  };

  useEffect(() => {
    // Check for bypass mode first
    const bypassMode = localStorage.getItem("dev_bypass_auth");
    const storedAdminUser = localStorage.getItem("dev_admin_user");
    
    if (bypassMode === "true" && storedAdminUser) {
      try {
        const adminData = JSON.parse(storedAdminUser);
        const mockUser = {
          id: adminData.id,
          phone: adminData.phone,
          email: null,
          app_metadata: {},
          user_metadata: { name: "Super Admin" },
          aud: "authenticated",
          created_at: new Date().toISOString(),
        } as User;

        const mockProfile: Profile = {
          id: adminData.id,
          phone_e164: adminData.phone,
          country_code: "US",
          name: "Super Admin",
          role: "super_admin",
          subscription_tier: "enterprise",
          trigger_limit: 999,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        setUser(mockUser);
        setProfile(mockProfile);
        setLoading(false);
        return;
      } catch (error) {
        console.error("Error parsing stored admin user:", error);
        localStorage.removeItem("dev_bypass_auth");
        localStorage.removeItem("dev_admin_user");
      }
    }

    // Normal auth flow
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        refreshProfile();
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        refreshProfile();
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // Clear bypass mode
    localStorage.removeItem("dev_bypass_auth");
    localStorage.removeItem("dev_admin_user");
    
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
