import { IMPORT_FIELDS } from '@schoolos/contracts';
import { describe, expect, it } from 'vitest';
import { classKey, parseDate, parseGender, parseSpreadsheet, splitClassSection, splitName, suggestMapping } from './parsing.js';

describe('suggestMapping', () => {
  it('maps the headers schools actually use', () => {
    const headers = ['Sr', 'Adm No.', 'Student Name', 'Class-Sec', 'DOB', "Father's Mobile No", 'Mother Name', 'Remarks'];
    expect(suggestMapping(headers, IMPORT_FIELDS.STUDENTS)).toEqual({
      Sr: '',
      'Adm No.': 'admissionNo',
      'Student Name': 'fullName',
      'Class-Sec': 'classSection',
      DOB: 'dateOfBirth',
      "Father's Mobile No": 'fatherPhone',
      'Mother Name': 'motherName',
      Remarks: '',
    });
  });

  it('never maps two columns to one field', () => {
    const mapping = suggestMapping(['Phone', 'Mobile'], IMPORT_FIELDS.TEACHERS);
    expect(Object.values(mapping).filter((v) => v === 'phone')).toHaveLength(1);
  });
});

describe('parseDate (day first)', () => {
  it.each([
    ['2013-03-14', '2013-03-14'],
    ['14/03/2013', '2013-03-14'],
    ['14-3-2013', '2013-03-14'],
    ['01.04.26', '2026-04-01'],
    ['14 Mar 2013', '2013-03-14'],
    ['14-March-2013', '2013-03-14'],
    ['46113', '2026-04-01'],
  ])('%s → %s', (input, expected) => expect(parseDate(input)).toBe(expected));

  it.each(['31/02/2013', '2013/14/03', 'yesterday', '14/03/1820'])('rejects %s', (input) => expect(parseDate(input)).toBeNull());
});

describe('classes and names', () => {
  it.each([
    ['Class 8', '8'],
    ['VIII', '8'],
    ['8th', '8'],
    ['Std. 10', '10'],
    ['L.K.G.', 'lkg'],
    ['Nur', 'nursery'],
  ])('classKey(%s) = %s', (input, expected) => expect(classKey(input)).toBe(expected));

  it.each([
    ['8-A', { cls: '8', section: 'A' }],
    ['VIII B', { cls: 'VIII', section: 'B' }],
    ['Class 10-c', { cls: 'Class 10', section: 'C' }],
    ['8A', { cls: '8', section: 'A' }],
    ['UKG/B', { cls: 'UKG', section: 'B' }],
  ])('splitClassSection(%s)', (input, expected) => expect(splitClassSection(input)).toEqual(expected));

  it('splits names and genders', () => {
    expect(splitName('Rahul Kumar Sharma')).toEqual({ firstName: 'Rahul Kumar', lastName: 'Sharma' });
    expect(splitName('Rahul')).toEqual({ firstName: 'Rahul' });
    expect([parseGender('M'), parseGender('girl'), parseGender('x')]).toEqual(['MALE', 'FEMALE', null]);
  });
});

describe('parseSpreadsheet', () => {
  it('reads CSV with a BOM, blank lines and duplicate headers', async () => {
    const csv = '\uFEFFName,Phone,Phone\n\nRahul,98765,12345\n,,\n';
    const sheet = await parseSpreadsheet(Buffer.from(csv), 'text/csv');
    expect(sheet.headers).toEqual(['Name', 'Phone', 'Phone (2)']);
    expect(sheet.rows).toEqual([{ Name: 'Rahul', Phone: '98765', 'Phone (2)': '12345' }]);
  });
});
