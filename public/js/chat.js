// Chat log + input line.

import { on, sendMsg } from './net.js';

const MAX_LINES = 9;

export function initChat() {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const log = document.getElementById('chatLog');

  on('chat', (m) => {
    const line = document.createElement('div');
    line.className = 'line';
    if (m.from) {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = m.from + ': ';
      line.append(who, document.createTextNode(m.text));
    } else {
      const sys = document.createElement('span');
      sys.className = 'sys';
      sys.textContent = m.text;
      line.append(sys);
    }
    log.append(line);
    while (log.children.length > MAX_LINES) log.firstChild.remove();
    [...log.children].forEach((c, i) => {
      c.classList.toggle('old', i < log.children.length - 5);
    });
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (text) sendMsg({ t: 'chat', text });
    input.value = '';
    hideChat();
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape') { input.value = ''; hideChat(); }
    ev.stopPropagation();
  });
}

export function focusChat() {
  document.getElementById('chatForm').classList.remove('hidden');
  document.getElementById('chatInput').focus();
}

function hideChat() {
  document.getElementById('chatForm').classList.add('hidden');
  document.getElementById('chatInput').blur();
}
