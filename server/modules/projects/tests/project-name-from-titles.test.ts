import assert from 'node:assert/strict';
import test from 'node:test';

import { getMostUsedTitlePrefix, isDefaultProjectName } from '@/modules/projects/services/project-name-from-titles.js';

test('the project takes the prefix most of its session titles use', () => {
  assert.equal(
    getMostUsedTitlePrefix(['HT \\ CLOUDCLI', 'LICENSEPLANET \\ GRAPHICS', 'HT \\ COMMON', 'Fattura primi 6 mesi', null]),
    'HT',
  );
});

test('titles without a "PREFIX \\ topic" shape name nothing', () => {
  assert.equal(getMostUsedTitlePrefix(['Fattura primi 6 mesi', 'C:\\dev\\ht\\ht_odoo', 'Untitled Claude Session']), null);
  assert.equal(getMostUsedTitlePrefix([]), null);
});

test('a tie goes to the first prefix seen', () => {
  assert.equal(getMostUsedTitlePrefix(['TMC \\ DMS', 'GYM \\ PWA']), 'TMC');
});

test('only a folder-name or empty project name counts as the default', () => {
  assert.equal(isDefaultProjectName('ht_odoo', 'C:\\dev\\ht\\ht_odoo'), true);
  assert.equal(isDefaultProjectName(null, 'C:\\dev\\ht\\ht_odoo'), true);
  assert.equal(isDefaultProjectName('  ', 'C:\\dev\\ht\\ht_odoo'), true);
  assert.equal(isDefaultProjectName('Histonium Tech', 'C:\\dev\\ht\\ht_odoo'), false);
});
