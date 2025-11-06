// src/services/aiExplanationService.ts

export interface AIDecisionExplanation {
}

export const getAIExplanation = async (data: {
  totalPagu?: number;
  totalRealisasi?: number;
  avgPersentase?: number;
  healthyItems?: number;
  warningItems?: number;
  criticalItems?: number;
  largeSisa?: number;
  query?: string;
  response?: string;
  queryType?: string;
}): Promise<AIDecisionExplanation> => {
  return {};
};