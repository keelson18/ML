import { describe, expect, it } from 'vitest';
import { ProviderBudget, ProviderBudgetExhaustedError } from './providerBudget';

function clockBudget(options: { requestsPerWindow: number; windowMs?: number; maxWaitMs?: number; maxQueue?: number }) {
  let now = 0;
  const budget = new ProviderBudget({
    requestsPerWindow: options.requestsPerWindow,
    windowMs: options.windowMs ?? 60_000,
    maxWaitMs: options.maxWaitMs ?? 1_000,
    maxQueue: options.maxQueue ?? 10,
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
    await budget.acquire();
    expect(time()).toBe(3_000);
    expect(budget.snapshot().backoffUntil).toBeNull();
  });
});
