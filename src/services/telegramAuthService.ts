// Telegram Web App authentication service
import { supabase } from "@/integrations/supabase/client";

interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
    auth_date: number;
    hash: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export const telegramAuthService = {
  // Check if running inside Telegram Web App
  isTelegramWebApp(): boolean {
    return typeof window !== "undefined" && !!window.Telegram?.WebApp;
  },

  // Get Telegram user data from Web App
  getTelegramUser(): TelegramWebAppUser | null {
    if (!this.isTelegramWebApp()) return null;
    return window.Telegram?.WebApp.initDataUnsafe.user || null;
  },

  // Initialize Telegram Web App
  initWebApp(): void {
    if (!this.isTelegramWebApp()) return;
    
    const webApp = window.Telegram!.WebApp;
    webApp.ready();
    webApp.expand();
  },

  // Authenticate via telegram_chat_id (find or create profile)
  async authenticateViaTelegram(): Promise<{
    success: boolean;
    userId?: string;
    error?: string;
  }> {
    try {
      const telegramUser = this.getTelegramUser();
      if (!telegramUser) {
        return { success: false, error: "No Telegram user data" };
      }

      // Convert Telegram user ID to string for telegram_chat_id
      const chatId = telegramUser.id.toString();

      // Look up profile by telegram_chat_id
      const { data: profile, error: lookupError } = await supabase
        .from("profiles")
        .select("id")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (lookupError) {
        console.error("Error looking up profile:", lookupError);
        return { success: false, error: lookupError.message };
      }

      if (profile) {
        // Profile exists - sign in anonymously and link session to this profile
        const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
        
        if (authError) {
          console.error("Auth error:", authError);
          return { success: false, error: authError.message };
        }

        // Update the anonymous profile to match the Telegram profile
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            telegram_chat_id: chatId,
            telegram_username: telegramUser.username,
            telegram_first_name: telegramUser.first_name,
          })
          .eq("id", authData.user.id);

        if (updateError) {
          console.error("Profile update error:", updateError);
          return { success: false, error: updateError.message };
        }

        return { success: true, userId: authData.user.id };
      } else {
        // Profile doesn't exist - create new anonymous user + profile
        const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
        
        if (authError) {
          console.error("Auth error:", authError);
          return { success: false, error: authError.message };
        }

        // Profile is auto-created by trigger, update it with Telegram data
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            telegram_chat_id: chatId,
            telegram_username: telegramUser.username,
            telegram_first_name: telegramUser.first_name,
          })
          .eq("id", authData.user.id);

        if (updateError) {
          console.error("Profile update error:", updateError);
          return { success: false, error: updateError.message };
        }

        return { success: true, userId: authData.user.id };
      }
    } catch (error) {
      console.error("Telegram auth exception:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};