// Standalone host fixture. No dsh profile, account, model or conversation API.
let demoPlugin;
window.__ModuleLoader__ = { load: ({ factory }) => { demoPlugin = factory(name => {
  if (name === 'react') return window.React;
  throw new Error(`Unknown demo module: ${name}`);
}); } };
window.startDemoPlugin = () => {
  const theme = new URLSearchParams(location.search).get('theme') || 'claude-night';
  localStorage.setItem('dsh-ascii-scenes:v1', JSON.stringify({ scene: theme, previous: 'light', motion: true }));
  let preference = 'light';
  const listeners = new Set(), cleanups = [];
  const ctx = {
    theme: {
      getTheme: () => ({ preference }),
      setTheme: value => { preference = value; for (const listener of listeners) listener({ preference }); },
      overrideTokens: (_, tokens) => {
        for (const [key, value] of Object.entries(tokens)) document.body.style.setProperty(key, value.dark);
        return () => { for (const key of Object.keys(tokens)) document.body.style.removeProperty(key); };
      },
    },
    on: (_, listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    slots: {
      inject: (_, register) => register(),
      register: (entry, Component) => {
        if (entry.name !== 'sidebar.footer.action') return;
        const root = window.createRoot(document.querySelector('#footer'));
        root.render(window.React.createElement(Component)); cleanups.push(() => root.unmount());
      },
    },
    effect: fn => cleanups.push(fn()),
  };
  demoPlugin.apply(ctx);
  window.addEventListener('pagehide', () => cleanups.reverse().forEach(fn => fn?.()), { once: true });
};
