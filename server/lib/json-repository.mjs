import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';

function clone(value) {
  return structuredClone(value);
}

async function writeJsonAtomically(filePath, value) {
  const directory = dirname(filePath);
  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const json = `${JSON.stringify(value, null, 2)}\n`;

  try {
    await writeFile(temporaryPath, json, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

/**
 * A tiny JSON repository with serialized, atomic writes.
 *
 * The in-memory snapshot makes reads cheap while the promise queue prevents two
 * overlapping HTTP requests from losing each other's changes. A rename in the
 * same directory is atomic on the filesystems supported by Node.js.
 */
export class JsonRepository {
  #value;
  #writeQueue = Promise.resolve();

  constructor(filePath, defaultValue = []) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
  }

  async initialize() {
    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const source = await readFile(this.filePath, 'utf8');
      this.#value = JSON.parse(source);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        const wrapped = new Error(`Unable to load JSON data from ${this.filePath}`);
        wrapped.cause = error;
        throw wrapped;
      }

      this.#value = clone(this.defaultValue);
      try {
        await writeFile(
          this.filePath,
          `${JSON.stringify(this.#value, null, 2)}\n`,
          { encoding: 'utf8', flag: 'wx' },
        );
      } catch (writeError) {
        // Another process may have created the store between readFile and
        // writeFile. In that case, use the newly-created file.
        if (writeError?.code !== 'EEXIST') throw writeError;
        this.#value = JSON.parse(await readFile(this.filePath, 'utf8'));
      }
    }

    if (!Array.isArray(this.#value)) {
      throw new TypeError(`JSON store must contain an array: ${this.filePath}`);
    }
  }

  async all() {
    await this.#writeQueue;
    return clone(this.#value);
  }

  async mutate(mutator) {
    const run = async () => {
      const draft = clone(this.#value);
      const result = await mutator(draft);
      await writeJsonAtomically(this.filePath, draft);
      this.#value = draft;
      return clone(result);
    };

    const operation = this.#writeQueue.then(run, run);
    this.#writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}

