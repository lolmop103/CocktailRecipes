import { describe, it, expect } from 'vitest';
import { scryptSync } from 'node:crypto';
import { checkNewPassword, hashPassword, verifyPassword } from '../src/lib/password.js';

/** A low-cost hash built by hand, as the test-only admin hash is. */
function lowCostHash(password: string): string {
  const salt = Buffer.from('0123456789abcdef');
  const key = scryptSync(password, salt, 64, { N: 1024, r: 8, p: 1 });
  return `scrypt$1024$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

describe('password hashing', () => {
  it('hashPassword_thenVerify_roundTrips', async () => {
    const hash = await hashPassword('correct horse battery');

    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
  });

  it('verifyPassword_wrongPassword_false', async () => {
    const hash = await hashPassword('correct horse battery');

    expect(await verifyPassword('wrong horse battery', hash)).toBe(false);
  });

  it('hashPassword_format_scryptN32768r8p1', async () => {
    const hash = await hashPassword('correct horse battery');

    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('hashPassword_samePasswordTwice_differentSalts', async () => {
    expect(await hashPassword('correct horse battery')).not.toBe(
      await hashPassword('correct horse battery'),
    );
  });

  it('verifyPassword_lowCostHash_readsParamsFromString', async () => {
    expect(await verifyPassword('test-admin-password', lowCostHash('test-admin-password'))).toBe(
      true,
    );
  });

  it('verifyPassword_malformedHash_falseNotThrow', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$abc$8$1$AA==$AA==')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$10$8$1$AA==$AA==')).toBe(false);
  });

  it('verifyPassword_absurdCost_falseNotThrow', async () => {
    expect(await verifyPassword('x', 'scrypt$1073741824$8$1$AA==$AA==')).toBe(false);
  });
});

describe('checkNewPassword', () => {
  it('checkNewPassword_elevenChars_rejected', () => {
    expect(checkNewPassword('a'.repeat(11), 'a'.repeat(11))).toBe('Use at least 12 characters');
  });

  it('checkNewPassword_mismatch_rejected', () => {
    expect(checkNewPassword('a'.repeat(12), 'b'.repeat(12))).toBe('The passwords do not match');
  });

  it('checkNewPassword_twelveMatching_accepted', () => {
    expect(checkNewPassword('a'.repeat(12), 'a'.repeat(12))).toBeNull();
  });
});

describe('test-only admin hash', () => {
  it('testAdminHash_verifiesTheTestPassword', async () => {
    const { TEST_ADMIN, TEST_ADMIN_PASSWORD_HASH } = await import('./helpers/admin.js');

    expect(await verifyPassword(TEST_ADMIN.password, TEST_ADMIN_PASSWORD_HASH)).toBe(true);
  });
});
