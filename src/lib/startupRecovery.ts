export function showStartupRecovery(retry: () => void): void {
  document.getElementById('ob-boot-shell')?.remove();
  const root = document.getElementById('root');
  if (!root) return;
  const panel = document.createElement('main');
  panel.style.cssText = 'padding:2rem;font-family:system-ui;color:#fff;background:#070504;min-height:100dvh';
  const heading = document.createElement('h1');
  heading.textContent = 'Unable to start OrderBhojan';
  const message = document.createElement('p');
  message.textContent = 'Configuration is unavailable. Check your connection and retry. Your saved cart has not been cleared.';
  const button = document.createElement('button');
  button.textContent = 'Retry startup';
  button.style.cssText = 'padding:1rem;font-size:1rem;min-height:48px';
  button.onclick = () => { button.disabled = true; button.textContent = 'Retrying…'; retry(); };
  panel.append(heading, message, button);
  root.replaceChildren(panel);
  button.focus();
}
