/**
 * `npm run hash-password --workspace=server`
 *
 * Asks for the admin password twice without echoing it and prints the line to
 * put in `.env`. The password itself is never written anywhere.
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { checkNewPassword, formatEnvLine, hashPassword } from '../lib/password.js';

/** Output that can be silenced while the password is typed. */
class MutableOutput extends Writable {
  muted = false;

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    if (!this.muted) process.stdout.write(chunk);
    done();
  }
}

// One reader, consumed as a buffered line iterator: piped input can deliver
// both lines before the second question is asked, and none may be lost.
const output = new MutableOutput();
const rl = createInterface({ input: process.stdin, output, terminal: true });
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string): Promise<string> {
  output.muted = false;
  output.write(question);
  output.muted = true;
  const next: IteratorResult<string> = await lines.next();
  process.stdout.write('\n');
  return next.done === true ? '' : next.value;
}

const first = await ask('New admin password: ');
const second = await ask('Repeat it: ');
rl.close();
const problem = checkNewPassword(first, second);

if (problem) {
  process.stderr.write(`${problem}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${formatEnvLine(await hashPassword(first))}\n`);
}
