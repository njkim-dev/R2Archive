import test from 'node:test'
import assert from 'node:assert/strict'
import { myHomeId } from '../src/utils/myHomeId.js'

test('public home IDs accept the requested alphabet and enforce UTF8 byte length', () => {
  assert.equal(myHomeId('User[한글]_-12').valid,true)
  assert.equal(myHomeId('가나다라마바12').bytes,20)
  assert.equal(myHomeId('가나다라마바12').valid,true)
  for (const value of ['','가나다라마바사','a/b','a b','😀','a'.repeat(21)]) assert.equal(myHomeId(value).valid,false,value)
})
