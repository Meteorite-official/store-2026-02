(()=>{
  const KEY = 'counter:value';
  const $count = document.getElementById('countValue');
  const $inc = document.getElementById('incBtn');
  const $reset = document.getElementById('resetBtn');

  const load = () => {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) ? n : 0;
  };
  const save = (n) => localStorage.setItem(KEY, String(n));

  let value = load();
  const render = () => { $count.textContent = String(value); };

  $inc.addEventListener('click', () => {
    value += 1;
    save(value);
    render();
  });

  $reset.addEventListener('click', () => {
    value = 0;
    save(value);
    render();
  });

  render();
})();
