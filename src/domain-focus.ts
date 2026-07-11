import type { DomainSummary } from "./types";

export function resolveFocusedDomain(
  domains: DomainSummary[],
  preferredPath?: string
): DomainSummary | null {
  return domains.find((domain) => domain.path === preferredPath) ?? domains[0] ?? null;
}

export function domainShortLabel(name: string): string {
  const characters = Array.from(name.trim());
  return (characters.length <= 3 ? characters.join("") : characters[0] ?? "?").toUpperCase();
}
