const timers = new WeakMap();

// Mostra a mensagem no elemento de toast da página por alguns segundos.
export function showToastOn(element, message, duration = 3200) {
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(timers.get(element));
  timers.set(element, setTimeout(() => element.classList.remove("show"), duration));
}
