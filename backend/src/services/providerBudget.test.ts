import { describe, expect, it } from 'vitest';
import { ProviderBudget, ProviderBudgetExhaustedError } from './providerBudget';

function clockBudget(options: { requestsPerWindow: number; windowMs?: number; maxWaitMs?: number; maxQueue?: number; reservedForPriority?: number; dailyRequests?: number; reservedForPriorityDaily?: number }) {
  let now = 0;
  const budget = new ProviderBudget({
    requestsPerWindow: options.requestsPerWindow,
    windowMs: options.windowMs ?? 60_000,
    maxWaitMs: options.maxWaitMs ?? 1_000,
    maxQueue: options.maxQueue ?? 10,
    reservedForPriority: options.reservedForPriority,
    dailyRequests: options.dailyRequests,
    reservedForPriorityDaily: options.reservedForPriorityDaily,
    now: () => now,
    sleep: async (ms) => { now += ms; },
  });
  return { budget, time: () => now };
}

describe('ProviderBudget', () => {
  it('sends immediately within the window quota', async () => {
    const { budget, time } = clockBudget({ requestsPerWindow: 2 });
    await budget.acquire();
    await budget.acquire();
    expect(time()).toBe(0);
    expect(budget.snapshot().usedInWindow).toBe(2);
  });

  it('waits for the window to roll over when the quota is spent and the wait is within bounds', async () => {
    const { budget, time } = clockBudget({ requestsPerWindow: 2, windowMs: 1_000, maxWaitMs: 5_000 });
    await budget.acquire();
    await budget.acquire();
    await budget.acquire();
    expect(time()).toBe(1_000);
    expect(budget.snapshot().usedInWindow).toBe(1);
  });

  it('rejects with a retry hint when the wait exceeds the maximum', async () => {
    const { budget, time } = clockBudget({ requestsPerWindow: 1, windowMs: 60_000, maxWaitMs: 1_000 });
    await budget.acquire();
    await expect(budget.acquire()).rejects.toMatchObject({ retryAfterSeconds: 60 });
    expect(time()).toBe(0);
  });

  it('rejects immediately when the queue is full', async () => {
    const { budget } = clockBudget({ requestsPerWindow: 1, windowMs: 1_000, maxWaitMs: 5_000, maxQueue: 0 });
    await budget.acquire();
    await expect(budget.acquire()).rejects.toBeInstanceOf(ProviderBudgetExhaustedError);
  });

  it('holds requests until a backoff expires', async () => {
    const { budget, time } = clockBudget({ requestsPerWindow: 5, maxWaitMs: 5_000 });
    budget.backoff(3_000);
    expect(budget.snapshot().backoffUntil).toBe(new Date(3_000).toISOString());
    expect(budget.snapshot().last429At).toBe(new Date(0).toISOString());
    await budget.acquire();
    expect(time()).toBe(3_000);
    expect(budget.snapshot().backoffUntil).toBeNull();
  });

  it('lets priority requests use the reserved share after standard requests are capped', async () => {
    const { budget, time } = clockBudget({ requestsPerWindow: 3, windowMs: 1_000, maxWaitMs: 5_000, reservedForPriority: 1 });
    await budget.acquire();
    await budget.acquire();
    await budget.acquire(true);
    expect(time()).toBe(0);
    expect(budget.snapshot().usedInWindow).toBe(3);
  });

  it('holds a standard request until the window frees a slot when the reserved share is kept', async () => {
    const { budget, time } = clockBudget({ requestsPerWindow: 3, windowMs: 1_000, maxWaitMs: 5_000, reservedForPriority: 1 });
    await budget.acquire();
    await budget.acquire();
    await budget.acquire();
    expect(time()).toBe(1_000);
  });

  it('rejects a reservation that leaves no standard capacity', () => {
    expect(() => new ProviderBudget({ requestsPerWindow: 2, windowMs: 1_000, maxWaitMs: 1_000, maxQueue: 1, reservedForPriority: 2 })).toThrow();
  });

  it('keeps the configured daily reserve for priority management requests', async () => {
    const { budget, time } = clockBudget({ requestsPerWindow: 8, reservedForPriority: 2, dailyRequests: 3, reservedForPriorityDaily: 1, maxWaitMs: 1_000 });
    await budget.acquire();
    await budget.acquire();
    await expect(budget.acquire()).rejects.toBeInstanceOf(ProviderBudgetExhaustedError);
    await budget.acquire(true);
    expect(budget.snapshot()).toMatchObject({ usedToday: 3, dailyRequests: 3, standardRemaining: 3 });
    expect(time()).toBe(0);
  });
});
