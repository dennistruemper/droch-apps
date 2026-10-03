export function createAppStorage(appId: string, storage: Storage) {
  if (!/^[a-z][a-z0-9-]*$/.test(appId)) throw new Error("Invalid application storage ID");
  const prefix = `droch:${appId}:`;
  return {
    get(key: string) {
      return storage.getItem(prefix + key);
    },
    set(key: string, value: string) {
      storage.setItem(prefix + key, value);
    },
    remove(key: string) {
      storage.removeItem(prefix + key);
    },
    clearAppData() {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      for (const key of keys) {
        if (key?.startsWith(prefix)) storage.removeItem(key);
      }
    },
  };
}
