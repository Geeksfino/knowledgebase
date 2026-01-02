/**
 * Simple token counter utility
 * Uses character-based estimation (4 chars ≈ 1 token)
 */

export function countTokens(text: string): number {
  // Simple estimation: ~4 characters per token for English
  // For Chinese/CJK: ~1.5 characters per token
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
  const cjkMatches = text.match(cjkPattern);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkLength = text.length - cjkCount;
  
  // CJK characters: ~1.5 chars per token
  // Non-CJK: ~4 chars per token
  const cjkTokens = Math.ceil(cjkCount / 1.5);
  const nonCjkTokens = Math.ceil(nonCjkLength / 4);
  
  return cjkTokens + nonCjkTokens;
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const currentTokens = countTokens(text);
  if (currentTokens <= maxTokens) {
    return text;
  }
  
  // Estimate character limit based on token ratio
  const ratio = maxTokens / currentTokens;
  const charLimit = Math.floor(text.length * ratio * 0.95); // 5% safety margin
  
  return text.substring(0, charLimit) + '...';
}

