export default defineNuxtPlugin(() => {
  if (process.server || process.env.NODE_ENV !== 'production') return;

  const safeConsole = (method: 'warn' | 'error') => {
    const original = console[method].bind(console);
    return (...args: any[]) => {
      const first = args[0];
      if (typeof first === 'string') {
        original(first);
      } else {
        original(`[${method}]`);
      }
    };
  };

  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  console.warn = safeConsole('warn') as any;
  console.error = safeConsole('error') as any;
});
