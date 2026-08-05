let knownWorkingModel: string | null = null;

export const FREE_TIER_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

export async function getWorkingModelName(): Promise<string> {
  if (knownWorkingModel) return knownWorkingModel;
  return "llama-3.3-70b-versatile";
}

export function setWorkingModelName(model: string) {
  if (knownWorkingModel !== model) {
    knownWorkingModel = model;
    console.log(`[LLM Model Resolver] Locked working model: "${model}"`);
  }
}


