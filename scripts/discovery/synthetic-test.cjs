'use strict';
// Safe CI smoke test: contains only invented records; no game files needed.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { normalize, struct, number } = require('./normalize.cjs');
assert.throws(() => number('NaN', 'fixture'));
assert.equal(number(undefined, 'missing'), null);
assert.throws(() => struct('((X=1)'));
assert.deepEqual(struct('(X=1,Y=2,Z=3)'), { X: 1, Y: 2, Z: 3 });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satispire-synthetic-')),
  p = path.join(dir, 'Docs.json');
try {
  const f = [
    {
      NativeClass: "Class'/Script/FactoryGame.FGItemDescriptor'",
      Classes: [
        { ClassName: 'SyntheticSolid_C', mForm: 'RF_SOLID' },
        { ClassName: 'SyntheticLiquid_C', mForm: 'RF_LIQUID' },
      ],
    },
    {
      NativeClass: "Class'/Script/FactoryGame.FGRecipe'",
      Classes: [
        {
          ClassName: 'SyntheticRecipe_C',
          mManufactoringDuration: '4',
          mIngredients:
            '((ItemClass="/Game/Synthetic.SyntheticSolid_C",Amount=2))',
          mProduct:
            '((ItemClass="/Game/Synthetic.SyntheticLiquid_C",Amount=3000))',
          mProducedIn: '()',
        },
      ],
    },
  ];
  fs.writeFileSync(p, JSON.stringify(f));
  const c = normalize(p, { changelist: 'synthetic' });
  assert.equal(c.recipes[0].products[0].quantity, 3);
  assert.equal(c.recipes[0].products[0].perMinute, 45);
  assert.equal(c.recipes[0].ingredients[0].perMinute, 30);
  assert.deepEqual(c, normalize(p, { changelist: 'synthetic' }));
  f[1].Classes[0].mManufactoringDuration = 'bad';
  fs.writeFileSync(p, JSON.stringify(f));
  assert.throws(
    () => normalize(p, { changelist: 'synthetic' }),
    /Invalid number/,
  );
  console.log('Synthetic CI checks passed (no proprietary input).');
} finally {
  fs.unlinkSync(p);
  fs.rmdirSync(dir);
}
