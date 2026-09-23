import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LedgerStore } from "../store";

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "wlm-store-"));
}

describe("the ledger file", () => {
  it("reads back what it wrote", async () => {
    const store = new LedgerStore(await tempDir());
    await store.write({ txns: [{ id: "a" }], openingBank: 1200.5 });

    expect(await store.read()).toEqual({ txns: [{ id: "a" }], openingBank: 1200.5 });
  });

  it("says so when there are no books yet", async () => {
    const store = new LedgerStore(await tempDir());
    expect(await store.read()).toBeNull();
  });

  it("creates the folder if it isn't there", async () => {
    const directory = path.join(await tempDir(), "nested", "deeper");
    const store = new LedgerStore(directory);

    await store.write({ txns: [] });

    expect(await store.read()).toEqual({ txns: [] });
  });

  it("keeps the previous version alongside", async () => {
    const directory = await tempDir();
    const store = new LedgerStore(directory);

    await store.write({ version: 1 });
    await store.write({ version: 2 });

    const backup = JSON.parse(
      await fs.readFile(path.join(directory, "ledger.bak.json"), "utf8")
    );
    expect(backup).toEqual({ version: 1 });
  });

  it("falls back to the backup when the main file is corrupt", async () => {
    const directory = await tempDir();
    const store = new LedgerStore(directory);

    await store.write({ version: 1 });
    await store.write({ version: 2 });
    // A truncated file is what a power cut used to leave behind; the point of
    // the backup is that it is still a real set of books.
    await fs.writeFile(path.join(directory, "ledger.json"), '{"version": 2', "utf8");

    expect(await store.read()).toEqual({ version: 1 });
  });

  it("leaves a corrupt file in place rather than replacing it", async () => {
    const directory = await tempDir();
    const store = new LedgerStore(directory);
    const file = path.join(directory, "ledger.json");

    await fs.writeFile(file, "not json at all", "utf8");
    await store.read();

    expect(await fs.readFile(file, "utf8")).toBe("not json at all");
  });

  it("does not leave a temporary file behind", async () => {
    const directory = await tempDir();
    const store = new LedgerStore(directory);

    await store.write({ txns: [] });

    const files = await fs.readdir(directory);
    expect(files.filter((f) => f.includes(".tmp"))).toHaveLength(0);
  });

  it("applies overlapping saves in order", async () => {
    // The renderer saves on every keystroke-sized change, so two writes can be
    // in flight at once. The last one started must be the one left on disk.
    const store = new LedgerStore(await tempDir());

    await Promise.all([
      store.write({ version: 1 }),
      store.write({ version: 2 }),
      store.write({ version: 3 }),
    ]);

    expect(await store.read()).toEqual({ version: 3 });
  });

  it("keeps going after a failed save", async () => {
    const store = new LedgerStore(await tempDir());

    await expect(store.write({ bad: 1n as unknown as number })).rejects.toThrow();
    await store.write({ good: true });

    expect(await store.read()).toEqual({ good: true });
  });
});
