import test from 'node:test'
import assert from 'node:assert/strict'
import { cropPixels } from '../src/utils/shopSearchImage.js'

test('image crop uses the chosen source pixels and contains fractional edge pixels', () => {
  assert.deepEqual(cropPixels([250,250,750,750],600,400), { x:150,y:100,width:300,height:200 })
  assert.deepEqual(cropPixels([101,103,902,901],101,101), { x:10,y:10,width:82,height:82 })
})
test('invalid or too small crops never reach image upload', () => {
  for (const area of [null, [], [0,0,Infinity,1000], [-1,0,1000,1000], [0,0,1001,1000], [500,0,200,1000], [0,0,10,10]]) assert.throws(() => cropPixels(area,600,400))
})
