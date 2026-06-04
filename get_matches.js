#!/usr/bin/env node

/*
Generic Extraction Engine

Examples:

# next word after phrase
node extract.js data.txt \
  --after "i am a" \
  --words 1 \
  --count

# next 3 words
node extract.js data.txt \
  --after "we are" \
  --words 3

# words around a pattern (default 2 words before/after)
node extract.js data.txt \
  --around "workaround" \
  --words 5

# around with multiple patterns
node extract.js data.txt \
  --around "app for|plugin for|better way" \
  --words 3

# regex extraction
node extract.js data.txt \
  --regex "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"

# unique values
node extract.js data.txt \
  --regex "token=([a-zA-Z0-9]+)" \
  --unique

# top results
node extract.js data.txt \
  --after "the" \
  --words 2 \
  --top 20

# json output
node extract.js data.txt \
  --regex "sk_live_[A-Za-z0-9]+" \
  --json
*/

const fs = require('fs');

const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('Usage: node extract.js input.txt [options]');
  process.exit(1);
}

const input = args[0];

if (!fs.existsSync(input)) {
  console.log('Input file not found');
  process.exit(1);
}

function getArg(flag) {
  const index = args.indexOf(flag);

  if (index === -1) return null;

  return args[index + 1];
}

function hasFlag(flag) {
  return args.includes(flag);
}

const afterRaw = getArg('--after');

const afterPhrases = afterRaw
  ? afterRaw.split('|').map(x => x.trim())
  : [];

const beforeRaw = getArg('--before');

const beforePhrases = beforeRaw
  ? beforeRaw
      .split('|')
      .map(x => x.trim())
      .filter(Boolean)
  : [];

const regexInput = getArg('--regex');
const words = parseInt(getArg('--words') || '1', 10);
const top = parseInt(getArg('--top') || '0', 10);

const around = getArg('--around');
const wordsAround = parseInt(
  getArg('--words') || '2',
  10
);

const countMode = hasFlag('--count');
const uniqueMode = hasFlag('--unique');
const jsonMode = hasFlag('--json');

const text = fs.readFileSync(input, 'utf8');

let results = [];

function tokenize(str) {
  return str
    .split(/\s+/)
    .map(x => x.trim())
    .filter(Boolean);
}

if (afterPhrases.length > 0) {

  const tokens = tokenize(text);

  for (const phrase of afterPhrases) {

    const anchor = tokenize(phrase);

    for (let i = 0; i < tokens.length; i++) {

      let matched = true;

      for (let j = 0; j < anchor.length; j++) {

        if (
          !tokens[i + j] ||
          tokens[i + j].toLowerCase() !== anchor[j].toLowerCase()
        ) {
          matched = false;
        }
      }

      if (matched) {

        const start = i + anchor.length;

        const extracted = tokens
          .slice(start, start + words)
          .join(' ');

        if (extracted) {
          results.push(extracted);
        }
      }
    }
  }
}

if (beforePhrases.length > 0) {

  const tokens = tokenize(text);

  for (const phrase of beforePhrases) {

    const anchor = tokenize(phrase);

    for (let i = 0; i < tokens.length; i++) {

      let matched = true;

      for (let j = 0; j < anchor.length; j++) {

        if (
          !tokens[i + j] ||
          tokens[i + j].toLowerCase() !== anchor[j].toLowerCase()
        ) {
          matched = false;
        }
      }

      if (matched) {

        const end = i;

        const start = Math.max(0, end - words);

        const extracted = tokens
          .slice(start, end)
          .join(' ');

        if (extracted) {
          results.push(extracted);
        }
      }
    }
  }
}

if (around) {

  const aroundRegex = new RegExp(around, 'gi');
  
  let match;
  while ((match = aroundRegex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    
    // Extract text before and after the match
    const beforeText = text.substring(0, matchStart);
    const afterText = text.substring(matchEnd);
    
    // Get N words before
    const beforeTokens = tokenize(beforeText);
    const wordsBefore = beforeTokens.slice(-wordsAround).join(' ');
    
    // Get N words after
    const afterTokens = tokenize(afterText);
    const wordsAfter = afterTokens.slice(0, wordsAround).join(' ');
    
    // Combine: before + match + after
    const matchText = match[0];
    const extracted = [wordsBefore, matchText, wordsAfter]
      .filter(Boolean)
      .join(' ');
    
    results.push(extracted);
  }
}

if (regexInput) {

  const regex = new RegExp(regexInput, 'gi');

  let match;

  while ((match = regex.exec(text)) !== null) {

    results.push(
      (match[1] || match[0]).trim()
    );
  }
}

if (uniqueMode) {
  results = [...new Set(results)];
}

if (countMode) {

  const counts = {};

  results.forEach(r => {
    counts[r] = (counts[r] || 0) + 1;
  });

  let output = Object.entries(counts)
    .sort((a, b) => b[1] - a[1]);

  if (top > 0) {
    output = output.slice(0, top);
  }

  if (jsonMode) {

    console.log(
      JSON.stringify(output, null, 2)
    );

  } else {

    output.forEach(([value, count]) => {
      console.log(`${value}: ${count}`);
    });
  }

} else {

  if (top > 0) {
    results = results.slice(0, top);
  }

  if (jsonMode) {

    console.log(
      JSON.stringify(results, null, 2)
    );

  } else {

    results.forEach(r => console.log(r));
  }
}
