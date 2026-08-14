import { describe, it, expect } from 'vitest';
import {
  hashPassword, verifyPassword, generateOtp, generateTicket,
  normalizePhone, signSession, verifySession
} from './crypto.js';

describe('hashPassword / verifyPassword', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('never stores the password in plaintext', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toContain('correct-horse-battery-staple');
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });
});

describe('generateOtp', () => {
  it('returns a 6-digit numeric string', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });
});

describe('generateTicket', () => {
  it('returns a PL-prefixed 6-character code', () => {
    const ticket = generateTicket();
    expect(ticket).toMatch(/^PL-[A-Z0-9]{6}$/);
  });

  it('excludes ambiguous characters 0/O/1/I', () => {
    for (let i = 0; i < 20; i++) {
      const ticket = generateTicket();
      expect(ticket).not.toMatch(/[0O1I]/);
    }
  });
});

describe('normalizePhone', () => {
  it('normalizes a plain 10-digit number', () => {
    expect(normalizePhone('5615550123')).toBe('+15615550123');
  });

  it('normalizes a formatted number', () => {
    expect(normalizePhone('(561) 555-0123')).toBe('+15615550123');
  });

  it('normalizes an 11-digit number with leading 1', () => {
    expect(normalizePhone('15615550123')).toBe('+15615550123');
  });

  it('returns null for an invalid number', () => {
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('signSession / verifySession', () => {
  it('round-trips a payload', async () => {
    const cookie = await signSession({ phone: '+15615550123', role: 'member', exp: Date.now() + 10000 }, 'test-secret');
    const payload = await verifySession(cookie, 'test-secret');
    expect(payload.phone).toBe('+15615550123');
    expect(payload.role).toBe('member');
  });

  it('rejects a tampered cookie', async () => {
    const cookie = await signSession({ phone: '+15615550123', role: 'member', exp: Date.now() + 10000 }, 'test-secret');
    const tampered = cookie.slice(0, -1) + (cookie.slice(-1) === 'a' ? 'b' : 'a');
    expect(await verifySession(tampered, 'test-secret')).toBeNull();
  });

  it('rejects a cookie signed with the wrong secret', async () => {
    const cookie = await signSession({ phone: '+15615550123', role: 'member', exp: Date.now() + 10000 }, 'test-secret');
    expect(await verifySession(cookie, 'wrong-secret')).toBeNull();
  });

  it('rejects an expired session', async () => {
    const cookie = await signSession({ phone: '+15615550123', role: 'member', exp: Date.now() - 1000 }, 'test-secret');
    expect(await verifySession(cookie, 'test-secret')).toBeNull();
  });
});
