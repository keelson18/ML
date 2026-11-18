import type { BacklogPriority, ResearchBacklogItem } from './ResearchBacklogPanel';

const PRIORITY_ORDER: Record<BacklogPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function filterAndSortResearchBacklog(items: ResearchBacklogItem[], searchTerm: string): ResearchBacklogItem[] {
  const matches = items.filter((item) => !searchTerm || `${item.title} ${item.question} ${item.rationale} ${item.priority} ${item.status} ${item.evidence.map((evidence) => `${evidence.source_type} ${evidence.source_id} ${evidence.description}`).join(' ')}`.toLowerCase().includes(searchTerm));
  return matches.sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
    || (Date.parse(right.updated_at) || 0) - (Date.parse(left.updated_at) || 0));
}
