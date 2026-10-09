import { describe, it, expect } from 'vitest';
import { redirectFor, tabFromHash, withHashParam, hashParam } from './routes';

describe('redirectFor', () => {
  it('sends folded-in destinations to their new home', () => {
    expect(redirectFor('#dashboard')).toBe('today');
    expect(redirectFor('#tasks')).toBe('today');
    expect(redirectFor('#productivity')).toBe('insights?tab=tasks');
    expect(redirectFor('#analytics')).toBe('insights?tab=life');
    expect(redirectFor('#dailylog')).toBe('journal?tab=log');
    expect(redirectFor('#rant')).toBe('journal?tab=rants');
    expect(redirectFor('#reviewer')).toBe('applications?tab=reviewer');
  });

  it('leaves current routes alone', () => {
    for (const h of ['#today', '#insights?tab=life', '#journal', '#project/abc', '#notes/x', '#mindmap', '#applications', '']) {
      expect(redirectFor(h)).toBeNull();
    }
  });

  it('carries extra query params over without overriding the target tab', () => {
    expect(redirectFor('#dashboard?task=t1')).toBe('today?task=t1');
    expect(redirectFor('#analytics?tab=tasks&x=1')).toBe('insights?tab=life&x=1');
  });

  it('works without the leading #', () => {
    expect(redirectFor('rant')).toBe('journal?tab=rants');
  });
});

describe('hash params', () => {
  it('reads the tab, falling back for unknown values', () => {
    expect(tabFromHash('#insights?tab=life', ['tasks', 'life'] as const, 'tasks')).toBe('life');
    expect(tabFromHash('#insights?tab=nope', ['tasks', 'life'] as const, 'tasks')).toBe('tasks');
    expect(tabFromHash('#insights', ['tasks', 'life'] as const, 'tasks')).toBe('tasks');
    expect(hashParam('#project/p1?tab=plan', 'tab')).toBe('plan');
  });

  it('sets and clears a param while keeping the path and other params', () => {
    expect(withHashParam('#journal', 'tab', 'rants')).toBe('journal?tab=rants');
    expect(withHashParam('#project/p1?tab=plan&x=1', 'tab', null)).toBe('project/p1?x=1');
    expect(withHashParam('project/p1?tab=plan', 'tab', 'tasks')).toBe('project/p1?tab=tasks');
  });
});
