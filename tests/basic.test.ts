/**
 * Basic test to verify test framework is working
 */

import {describe, expect, it} from 'vitest';

describe('Basic test suite', () => {
    it('should verify that 2 + 2 equals 4', () => {
        expect(2 + 2).toBe(4);
    });

    it('should verify string operations', () => {
        expect('hello'.toUpperCase()).toBe('HELLO');
    });

    it('should verify array operations', () => {
        const arr = [1, 2, 3];
        expect(arr.length).toBe(3);
        expect(arr.includes(2)).toBe(true);
    });

    it('should verify object operations', () => {
        const obj = {name: 'test', value: 42};
        expect(obj.name).toBe('test');
        expect(obj.value).toBe(42);
    });
});