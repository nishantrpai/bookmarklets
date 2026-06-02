javascript: (function () {
  let suggestions = Array.from(document.querySelectorAll('li[data-attrid="AutocompletePrediction"]')).map(e => e.querySelector('span').innerText);
  suggestions = [...new Set(suggestions)].filter(item => item && item.length > 0);
  if (!suggestions.length) return console.log('No autocomplete suggestions found. Make sure you have typed something in the Google search box and suggestions are visible.');
  const text = suggestions.join('\n');
  let textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  console.log(`copied suggestions`);
})();
