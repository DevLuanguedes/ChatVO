const prefix = 'chatapp:';

window.storage = {
  async set(key, value) {
    localStorage.setItem(prefix + key, JSON.stringify({ value }));
  },
  async get(key) {
    const raw = localStorage.getItem(prefix + key);
    return raw ? JSON.parse(raw) : null;
  },
  async list(prefixKey) {
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(prefix + prefixKey))
      .map(k => k.replace(prefix, ''));
    return { keys };
  },
  async remove(key) {
    localStorage.removeItem(prefix + key);
  }
};
