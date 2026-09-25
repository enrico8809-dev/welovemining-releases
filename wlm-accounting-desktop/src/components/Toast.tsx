import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Tone = "info" | "error" | "warning";

interface Message {
  id: number;
  text: string;
  tone: Tone;
}

interface ToastApi {
  show(text: string, tone?: Tone): void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);

  const show = useCallback((text: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setMessages((current) => [...current, { id, text, tone }]);
    setTimeout(() => {
      setMessages((current) => current.filter((m) => m.id !== id));
    }, 3600);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-host">
        {messages.map((m) => (
          <div key={m.id} className={`toast ${m.tone}`}>
            {m.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
