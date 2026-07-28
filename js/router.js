// Simple hash-less route switcher.
const routes = new Map();

export function registerRoute(name, onEnter) {
  routes.set(name, onEnter);
}
export function go(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route === name));
  routes.get(name)?.();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function initRouter(defaultRoute = 'scan') {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => go(b.dataset.route));
  });
  document.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => go(el.dataset.goto));
  });
  go(defaultRoute);
}
