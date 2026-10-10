import { describe, expect, it } from 'vitest';
import { BoundedMap, WindowLimiter } from './limits';

describe('WindowLimiter', () => {
  it('allows the quota per key and recovers after the window', () => {
    const limiter = new WindowLimiter(2, 1000);
    expect(limiter.consume('a', 0)).toBe(true);
    expect(limiter.consume('a', 1)).toBe(true);
    expect(limiter.consume('a', 2)).toBe(false);
    expect(limiter.consume('b', 2)).toBe(true);
    expect(limiter.consume('a', 1001)).toBe(true);
  });
});

describe('BoundedMap', () => {
  it('evicts the oldest entry when full and keeps updates without eviction', () => {
    const map = new BoundedMap<number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.set('b', 3);
    expect(map.get('a')).toBe(1);
    map.set('c', 4);
    expect(map.get('a')).toBeUndefined();
    expect(map.get('b')).toBe(3);
    expect(map.get('c')).toBe(4);
  });
});
