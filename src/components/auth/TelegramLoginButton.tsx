import { useEffect, useRef, useState } from "react";

interface TelegramLoginButtonProps {
  botName?: string;
  buttonSize?: "large" | "medium" | "small";
  cornerRadius?: number;
  requestAccess?: boolean;
  usePic?: boolean;
  authUrl?: string;
  onAuth?: (user: TelegramUser) => void;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    TelegramLoginWidget?: {
      dataOnauth?: (user: TelegramUser) => void;
    };
  }
}

export function TelegramLoginButton({
  botName = "Hammer_notifs_bot",
  buttonSize = "large",
  cornerRadius = 20,
  requestAccess = true,
  usePic = false,
  authUrl,
  onAuth,
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
    const currentHostname = window.location.hostname;
    const currentProtocol = window.location.protocol;
    const currentOrigin = window.location.origin;
    
    console.log("[TelegramLoginButton] Initializing with:", {
      botName,
      authUrl,
      currentHostname,
      currentProtocol,
      currentOrigin,
      fullUrl: window.location.href,
    });

    // Only set up callback if using onAuth mode (not auth-url)
    if (onAuth && !authUrl) {
      window.TelegramLoginWidget = {
        dataOnauth: onAuth,
      };
    }

    // Create script element
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?23";
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", buttonSize);
    script.setAttribute("data-radius", cornerRadius.toString());
    script.setAttribute("data-request-access", requestAccess ? "write" : "read");
    script.setAttribute("data-userpic", usePic.toString());
    
    // Use auth-url if provided, otherwise use onauth callback
    if (authUrl) {
      script.setAttribute("data-auth-url", authUrl);
      console.log("[TelegramLoginButton] Using auth-url redirect:", authUrl);
    } else if (onAuth) {
      script.setAttribute("data-onauth", "TelegramLoginWidget.dataOnauth(user)");
      console.log("[TelegramLoginButton] Using onauth callback");
    }
    
    script.async = true;

    // Add error handler
    script.onerror = (error) => {
      console.error("[TelegramLoginButton] Failed to load widget script:", error);
    };

    script.onload = () => {
      console.log("[TelegramLoginButton] Widget script loaded successfully");
      console.log("[TelegramLoginButton] If you see 'Bot domain invalid', verify in @BotFather:");
      console.log(`  1. /setdomain`);
      console.log(`  2. Select @${botName}`);
      console.log(`  3. Send EXACTLY: ${currentHostname}`);
    };

    // Append script to container
    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }

    // Cleanup
    return () => {
      if (containerRef.current && containerRef.current.contains(script)) {
        containerRef.current.removeChild(script);
      }
      if (!authUrl) {
        delete window.TelegramLoginWidget;
      }
    };
  }, [botName, buttonSize, cornerRadius, requestAccess, usePic, authUrl, onAuth]);

  return (
    <div>
      <div ref={containerRef} />
      {isMounted && (
        <div className="text-xs text-muted-foreground mt-2 text-center space-y-1">
          <div>If you see "Bot domain invalid":</div>
          <div className="font-mono bg-muted/50 px-2 py-1 rounded">
            Current domain: {window.location.hostname}
          </div>
          <div>Set this EXACT value in @BotFather → /setdomain → @{botName}</div>
        </div>
      )}
    </div>
  );
}