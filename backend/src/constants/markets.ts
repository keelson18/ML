import { autonomySymbols } from '../config';

// Return every eligible registry symbol so scheduling is not tied to one default instrument.
export function getEligibleSymbols(): string[] {
  return [...autonomySymbols];
}
