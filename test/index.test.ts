import { heyThere } from '../src/index';
import { test, expect } from 'vitest';

const greet = `***************************************************************
************** Hey there! You're up and running! **************
***************************************************************`;

test('prints greeting', () => {
  expect(heyThere()).toBe(greet);
});