/* MERGE-BLOCK: toast.js */
const Toast = (() => {
  let el;
  let textEl;
  let timer = null;

  function init() {
    el = document.getElementById('toast');
    textEl = document.getElementById('toast-text');
  }

  function show(message, duration = 2200) {
    if (!el || !textEl) return;
    textEl.textContent = message;
    el.classList.add('active');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('active'), duration);
  }

  return { init, show };
})();
/* END-MERGE-BLOCK */
