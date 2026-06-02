
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

let questions=Array.from(document.querySelectorAll('ytd-comment-view-model ytd-expander')).map(node => node.innerText);
navigator.clipboard.writeText(questions.join('\n---\n')).then(() => {
  showToast(`Copied ${questions.length} comments to clipboard`);
}).catch(() => {
  showToast('Failed to copy to clipboard');
});
})();