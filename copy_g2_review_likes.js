javascript: (function () {
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.background = 'rgba(0,0,0,0.8)';
  toast.style.color = 'white';
  toast.style.padding = '10px 20px';
  toast.style.borderRadius = '5px';
  toast.style.zIndex = '9999';
  toast.style.fontSize = '14px';
  toast.style.maxWidth = '300px';
  document.body.appendChild(toast);
  setTimeout(() => {
    if (document.body.contains(toast)) {
      document.body.removeChild(toast);
    }
  }, 3000);
}

let currentUrl = window.location.href;
let storagereview = localStorage.getItem('g2_reviews_likes');
if (!currentUrl.includes('page=')) {
  if (storagereview) {
    localStorage.removeItem('g2_reviews_likes');
    storagereview = null;
    showToast('Cleared previous reviews storage');
  }
}
const xpath = '//div[text()[contains(., "What do you like best about ")]]';

const iterator = document.evaluate(
  xpath,
  document,
  null,
  XPathResult.ORDERED_NODE_ITERATOR_TYPE,
  null
);

let node;
const matches = [];

while ((node = iterator.iterateNext())) {
  matches.push(node);
}

let sections = matches.map(node => node.parentNode);

sections = sections.map(section => section.innerText.split('\n\n'))

// remove first element from each section
sections = sections.map(arr => arr.slice(1));

// remove last element from each section
sections = sections.map(arr => arr.slice(0, -1));

sections = sections.map(arr => arr.join('\n\n'));

let text = sections.join('\n\n');

text = text.trim();

if (storagereview) {
  text = storagereview + '\n\n' + text;
  text = text.trim();
  showToast('Appended reviews to storage');
} else {
  showToast('Stored reviews');
}

localStorage.setItem('g2_reviews_likes', text);

navigator.clipboard.writeText(text).then(() => {
  showToast(`Copied ${text?.split('\n\n').length} reviews to clipboard`);
}).catch(() => {
  showToast('Failed to copy to clipboard');
});
})();