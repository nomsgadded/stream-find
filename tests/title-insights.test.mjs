import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../lib/title-insights.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { splitTitleInsight } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
assert.deepEqual(splitTitleInsight('You’ll like this if you prefer realistic, mature relationship dramas; Not for you if you want fast-paced plots.', 'fit'), {
  positive: 'you prefer realistic, mature relationship dramas', negative: 'you want fast-paced plots.', fallback: '',
});
assert.equal(splitTitleInsight("You'll likely enjoy this if you appreciate patient historical dramas; Not for you if you want fast pacing", 'fit').positive, 'you appreciate patient historical dramas');
assert.deepEqual(splitTitleInsight('Pros: emotionally grounded; relatable tension | Cons: slow-paced; difficult themes', 'reviews'), {
  positive: 'emotionally grounded; relatable tension', negative: 'slow-paced; difficult themes', fallback: '',
});
assert.deepEqual(splitTitleInsight('Cons: slow-paced | Pros: compelling performances', 'reviews'), {
  positive: 'compelling performances', negative: 'slow-paced', fallback: '',
});
assert.equal(splitTitleInsight('Cons: difficult themes', 'reviews').positive, '');
assert.equal(splitTitleInsight('Not for you if you dislike long episodes', 'fit').positive, '');
for (const kind of ['fit', 'reviews']) assert.equal(splitTitleInsight('A complex story with mixed reactions.', kind).fallback, 'A complex story with mixed reactions.');
console.log('PASS: labeled positive/negative sections, reversed and missing labels, intact fallback text');
