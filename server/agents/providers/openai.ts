import { createOpenAICompatibleProvider } from "./openaiCompatible";

export const openaiProvider = createOpenAICompatibleProvider({
  id: "openai",
  defaultBaseUrl: "https://api.openai.com/v1",
  defaultModel: "gpt-5",
  errorBrand: "openai",
});
