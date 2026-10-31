import {defineConfig} from '@playwright/test'
export default defineConfig({
  testDir:'./tests/live',workers:1,timeout:90000,forbidOnly:true,
  use:{baseURL:'https://r2archive.com',browserName:'chromium',launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']},trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[1440,390].map(width=>({name:`live-${width}`,use:{viewport:{width,height:1000}}})),
})
