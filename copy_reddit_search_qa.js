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

let titles = Array.from(document.querySelectorAll('.i18n-search-comment-post-title-a11y')).map(node => node.innerText);
let comments = Array.from(document.querySelectorAll('[data-testid="search-comment-content"] search-telemetry-tracker')).map(node => node.innerText);

let formatted = ``;
comments.forEach((comment, index) => {
  formatted += `Q. ${titles[index]}\n\n`;
  formatted += `A. ${comment}\n\n---\n\n`;
});

navigator.clipboard.writeText(formatted).then(() => {
  showToast(`Copied Q&A format with ${comments.length} answers to clipboard`);
}).catch(() => {
  showToast('Failed to copy to clipboard');
});
})();
