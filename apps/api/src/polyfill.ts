// Polyfill for process global (must be loaded first)
// This file must be imported before any other modules that might use `process`

globalThis.process = globalThis.process || {
  env: {},
  version: '',
  versions: {},
  platform: 'cloudflare',
  nextTick: (fn: Function) => setTimeout(fn, 0),
  argv: [],
  pid: 1,
  ppid: 0,
  uid: 0,
  gid: 0,
  cwd: () => '/',
  chdir: () => {},
  umask: () => 0,
  hrtime: () => [0, 0],
  uptime: () => 0,
  memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
  cpuUsage: () => ({ user: 0, system: 0 }),
  binding: () => {},
  release: {},
  config: {},
  moduleLoadList: [],
  _linkedBinding: () => {},
  _events: {},
  _eventsCount: 0,
  _maxListeners: undefined,
  emit: () => false,
  on: () => {},
  once: () => {},
  off: () => {},
  removeListener: () => {},
  removeAllListeners: () => {},
  listeners: () => [],
  listenerCount: () => 0,
  prependListener: () => {},
  prependOnceListener: () => {},
  eventNames: () => [],
  rawListeners: () => [],
};

// Also polyfill Buffer if needed
globalThis.Buffer = globalThis.Buffer || class Buffer extends Uint8Array {
  static from(data: any, encoding?: string) {
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      const bytes = encoding === 'base64' 
        ? Uint8Array.from(atob(data), c => c.charCodeAt(0))
        : encoder.encode(data);
      return new Buffer(bytes);
    }
    return new Buffer(data);
  }
  static alloc(size: number) {
    return new Buffer(new Uint8Array(size));
  }
  static allocUnsafe(size: number) {
    return new Buffer(new Uint8Array(size));
  }
  static isBuffer(obj: any) {
    return obj instanceof Uint8Array;
  }
  toString(encoding?: string) {
    if (encoding === 'base64') {
      return btoa(String.fromCharCode(...this));
    }
    return new TextDecoder(encoding).decode(this);
  }
};