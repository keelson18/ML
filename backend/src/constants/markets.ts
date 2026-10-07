import { autonomySymbols, defaultSymbol } from '../config';

// Canonical fallback market validated against the shared active-market registry at boot.
export const DEFAULT_SYMBOL = defaultSymbol as string;

// Return a fresh scheduler symbol array so callers cannot mutate validated configuration.
export function getDefaultSymbols(): string[] {
  return [...autonomySymbols];
}
