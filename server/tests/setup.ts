import { beforeEach } from 'vitest';
import { loginThrottle } from '../src/lib/loginThrottle.js';

beforeEach(() => {
  loginThrottle.reset();
});
