import { useEffect, useRef } from "react";

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any previous widget content (script + Telegram-injected iframe)
    // Without this, the stale iframe causes the widget to skip re-rendering on remount
    container.innerHTML = "";

    if (onAuth && !authUrl) {
      window.TelegramLoginWidget = {
        dataOnauth: onAuth,
      };
    }

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?23";
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", buttonSize);
    script.setAttribute("data-radius", cornerRadius.toString());
    script.setAttribute("data-request-access", requestAccess ? "write" : "read");
    script.setAttribute("data-userpic", usePic.toString());

    if (authUrl) {
      script.setAttribute("data-auth-url", authUrl);
    } else if (onAuth) {
      script.setAttribute("data-onauth", "TelegramLoginWidget.dataOnauth(user)");
    }

    container.appendChild(script);

    return () => {
      // Clear the whole container so the injected iframe doesn't linger
      container.innerHTML = "";
      if (!authUrl) {
        delete window.TelegramLoginWidget;
      }
    };
  }, [botName, buttonSize, cornerRadius, requestAccess, usePic, authUrl, onAuth]);

  return <div ref={containerRef} />;
}