javascript:(function () {
  const store = (window._userScraperStore ||= new Map());

  const UI = (() => {
    const panel = document.createElement('div');
    panel.style = `
      position:fixed;bottom:20px;right:20px;z-index:9999;
      background:#000c;padding:10px 12px;border-radius:6px;
      font:12px sans-serif;color:#fff;
    `;

    const count = document.createElement('div');
    count.textContent = 'users: 0';

    const btn = document.createElement('button');
    btn.textContent = 'Download CSV';
    btn.style = `
      margin-top:6px;background:#1da1f2;color:#fff;
      border:none;padding:6px 10px;border-radius:4px;
      cursor:pointer;
    `;

    btn.onclick = () => {
      if (!store.size) return alert('nothing to download');
      const rows = Array.from(store.values());
      const csv = ['username,display_name,profile_url,bio'].concat(
        rows.map(u =>
          [u.username, u.display_name, u.profile_url, u.bio]
            .map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')
        )
      ).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: 'twitter_users.csv'
      });
      a.click();
    };

    panel.appendChild(count);
    panel.appendChild(btn);
    document.body.appendChild(panel);

    return {
      update: () => (count.textContent = `users: ${store.size}`),
    };
  })();

function extract(el) {
  try {
    const links = [...el.querySelectorAll('a[href^="/"][role="link"]')];
    let username = '', display_name = '', profile_url = '';

    for (const a of links) {
      const text = a.textContent.trim();
      const href = a.getAttribute('href');
      if (!href) continue;

if (/@/.test(text) && href === '/' + text.replace('@', '')) {
  username = text;
  profile_url = 'https://twitter.com' + href;
}
 else if (!display_name && text.length > 0) {
        display_name = text;
      }
    }

    // find bio — last div[dir="auto"] that doesn't contain "click to follow"
    const autoDivs = [...el.querySelectorAll('div[dir="auto"]')];
    let bio = '';
    for (let i = autoDivs.length - 1; i >= 0; i--) {
      const txt = autoDivs[i].textContent.trim();
      if (txt && !/click to follow/i.test(txt)) {
        bio = txt;
        break;
      }
    }

    return { username, display_name, profile_url, bio };
  } catch {
    return null;
  }
}

  function scan() {
    const items = document.querySelectorAll('[data-testid="cellInnerDiv"]:not([data-scraped])');
    items.forEach(el => {
      el.setAttribute('data-scraped', '1');
      const user = extract(el);
      if (user && !store.has(user.username)) {
        store.set(user.username, user);
        UI.update();
      }
    });
  }

  new MutationObserver(scan).observe(document.body, {
    childList: true,
    subtree: true,
  });

  scan();
})();
