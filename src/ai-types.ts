export const providers = [
  {
    id: "openai",
    name: "OpenAI",
    model: "gpt-6.2-sol",
    note: "아이디어부터 문장 다듬기까지",
  },
  {
    id: "anthropic",
    name: "Claude",
    model: "claude-sonnet-5-5",
    note: "차분하고 정교한 글쓰기",
  },
  {
    id: "google",
    name: "Gemini",
    model: "gemini-4-hydrogen",
    note: "새로운 관점과 빠른 초안",
  },
] as const;
export type ProviderId = (typeof providers)[number]["id"];
export type ProviderView = {
  id: ProviderId;
  model: string;
  configured: boolean;
  enabled: boolean;
  updatedAt?: string;
};
export type ChatMessage = { role: "user" | "assistant"; content: string };
