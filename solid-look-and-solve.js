const switcher = document.querySelector('.solve-switch');
if (switcher) {
  const list = switcher.closest('.solve-problem-list');
  const buttons = [...switcher.querySelectorAll('button')];
  function showGroup(selected) {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button === selected));
      document.getElementById(button.getAttribute('aria-controls')).hidden = button !== selected;
    }
    list.scrollTop = 0;
  }
  for (const button of buttons) button.addEventListener('click', () => showGroup(button));
  showGroup(buttons[0]);
  switcher.hidden = false;
}
