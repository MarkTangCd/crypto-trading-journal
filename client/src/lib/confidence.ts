export function getConfidenceColor(score: number): string {
  if (score >= 5) return "text-green-600";
  if (score >= 4) return "text-emerald-500";
  if (score >= 3) return "text-yellow-500";
  if (score >= 2) return "text-orange-500";
  return "text-red-500";
}

export function getConfidenceLabel(score: number): string {
  const rounded = Math.round(score);
  if (rounded >= 5) return "Very High";
  if (rounded >= 4) return "High";
  if (rounded >= 3) return "Medium";
  if (rounded >= 2) return "Low";
  return "Very Low";
}

export function getConfidenceBgColor(score: number): string {
  if (score >= 5) return "bg-green-100";
  if (score >= 4) return "bg-emerald-100";
  if (score >= 3) return "bg-yellow-100";
  if (score >= 2) return "bg-orange-100";
  return "bg-red-100";
}
