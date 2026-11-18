import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ResearchBacklogPanel, { type ResearchBacklogItem } from './ResearchBacklogPanel';
import { filterAndSortResearchBacklog } from './research-backlog-utils';

function item(overrides: Partial<ResearchBacklogItem> = {}): ResearchBacklogItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Review forward sample',
    question: 'Is the forward sample large enough?',
    rationale: 'The last replay had few independent observations.',
    priority: 'medium',
    status: 'open',
    status_note: '',
    evidence: [{ source_type: 'research', source_id: '00000000-0000-4000-8000-000000000002', description: 'Research result reported a small test sample.' }],
    created_by: '00000000-0000-4000-8000-000000000003',
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Research backlog UI', () => {
  it('sorts by human-assigned priority, then most recent update', () => {
    const records = [
      item({ id: 'low', priority: 'low' }),
      item({ id: 'medium-old', priority: 'medium', updated_at: '2026-11-01T00:00:00.000Z' }),
      item({ id: 'critical', priority: 'critical' }),
      item({ id: 'medium-new', priority: 'medium', updated_at: '2026-11-10T00:00:00.000Z' }),
    ];
    expect(filterAndSortResearchBacklog(records, '').map((record) => record.id))
      .toEqual(['critical', 'medium-new', 'medium-old', 'low']);
  });

  it('searches the linked source description as well as the question text', () => {
    expect(filterAndSortResearchBacklog([item()], 'small test sample')).toHaveLength(1);
    expect(filterAndSortResearchBacklog([item()], 'nonexistent source')).toHaveLength(0);
  });

  it('renders required evidence fields and makes its non-automated priority boundary clear', () => {
    const markup = renderToStaticMarkup(<ResearchBacklogPanel items={[item()]} totalItems={1} hasRecords onRefresh={vi.fn(async () => undefined)} />);
    expect(markup).toContain('Record a question against an existing evidence record');
    expect(markup).toContain('Evidence record ID');
    expect(markup).toContain('What does this evidence show?');
    expect(markup).toContain('administrator-set priority');
    expect(markup).toContain('Required when marking blocked');
    expect(markup).toContain('Research result reported a small test sample.');
  });
});
