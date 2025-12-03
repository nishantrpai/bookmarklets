javascript: (function () {
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

let sections = matches.map(node => node.parentNode);a

sections = sections.map(section => section.innerText.split('\n\n'))

// remove first element from each section
sections = sections.map(arr => arr.slice(1));

// remove last element from each section
sections = sections.map(arr => arr.slice(0, -1));

sections = sections.map(arr => arr.join('\n\n'));

let text = sections.join('\n\n');

navigator.clipboard.writeText(text);
})();